"use strict";

const crypto = require("node:crypto");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { spawn } = require("node:child_process");
const { WebSocketServer, WebSocket } = require("ws");
const { automaticFullAccessApproval } = require("./approval-policy");

const APP_VERSION = "0.14.2";
const HOST = process.env.HOST || "127.0.0.1";
const requestedPort = Number.parseInt(process.env.PORT || "0", 10);
const PORT = Number.isFinite(requestedPort) ? requestedPort : 0;
const CODEX_BIN = process.env.CODEX_BIN || "codex";
const publicRoot = path.join(__dirname, "public");
const dataRoot = process.env.HUB_DATA_DIR ? path.resolve(process.env.HUB_DATA_DIR) : path.join(__dirname, "data");
const auditRoot = path.join(dataRoot, "audit");
const configPath = path.join(dataRoot, "config.json");
const SESSION_COOKIE = "codex_hub_session";
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const RPC_TIMEOUT_MS = 120000;
const MAX_PENDING_PER_CLIENT = 32;
const MAX_CLIENT_MESSAGES_PER_MINUTE = 180;
const MAX_WS_PAYLOAD = 1024 * 1024;
const MAX_TURN_INPUT_BYTES = 256 * 1024;
const MAX_CODEX_OUTPUT_BUFFER_BYTES = 64 * 1024 * 1024;
const COMPUTER_CONTROL_SESSION_MS = 8 * 60 * 60 * 1000;
const FULL_ACCESS_SESSION_MS = 8 * 60 * 60 * 1000;
const FULL_ACCESS_MAX_FAILURES = 5;
const FULL_ACCESS_LOCK_MS = 15 * 60 * 1000;
const CONTROL_MODES = new Set(["code", "browser", "computer"]);
const PERMISSION_MODES = new Set(["read-only", "workspace", "full"]);
const codexHome = process.env.CODEX_HOME || path.join(os.homedir(), ".codex");

const allowedRpcMethods = new Set([
  "thread/list",
  "thread/read",
  "thread/turns/list",
  "thread/start",
  "thread/resume",
  "thread/fork",
  "thread/compact/start",
  "thread/name/set",
  "turn/start",
  "turn/steer",
  "turn/interrupt",
  "review/start",
  "skills/list",
  "fuzzyFileSearch",
  "model/list",
  "collaborationMode/list"
]);

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon"
};

let codexProcess = null;
let codexOutputBuffer = "";
let codexReady = false;
let codexRestartTimer = null;
let nextRpcId = 1000;
let initializeRpcId = null;
let lastCodexError = null;
let config = loadConfig();

const sessions = new Map();
const clients = new Map();
const pendingClientRequests = new Map();
const pendingServerRequests = new Map();
const threadOwners = new Map();
const threadMetadata = new Map();
const activeTurns = new Map();

function normalizeFullAccessCredential(value) {
  if (!value || value.algorithm !== "scrypt") return null;
  const salt = String(value.salt || "");
  const hash = String(value.hash || "");
  const keyLength = Math.min(64, Math.max(16, Number(value.keyLength) || 32));
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(salt) || !/^[A-Za-z0-9_-]{20,256}$/.test(hash)) return null;
  return { algorithm: "scrypt", salt, hash, keyLength };
}

function defaultConfig() {
  return { schemaVersion: 1, workspaces: [], security: { auditRetentionDays: 30, fullAccessCredential: null } };
}

function loadConfig() {
  try {
    const value = JSON.parse(fs.readFileSync(configPath, "utf8"));
    return {
      schemaVersion: 1,
      workspaces: Array.isArray(value.workspaces) ? value.workspaces : [],
      security: {
        auditRetentionDays: Math.min(365, Math.max(1, Number(value.security?.auditRetentionDays) || 30)),
        fullAccessCredential: normalizeFullAccessCredential(value.security?.fullAccessCredential)
      }
    };
  } catch {
    return defaultConfig();
  }
}

function saveConfig() {
  fs.mkdirSync(dataRoot, { recursive: true });
  const temporaryPath = `${configPath}.${process.pid}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(config, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  fs.renameSync(temporaryPath, configPath);
}

function audit(event, details = {}) {
  try {
    fs.mkdirSync(auditRoot, { recursive: true });
    const day = new Date().toISOString().slice(0, 10);
    const record = { timestamp: new Date().toISOString(), event, ...details };
    fs.appendFile(path.join(auditRoot, `${day}.jsonl`), `${JSON.stringify(record)}\n`, { encoding: "utf8", mode: 0o600 }, () => {});
  } catch {
    // Audit failures must not interrupt the local client.
  }
}

function pruneAuditLogs() {
  try {
    const cutoff = Date.now() - config.security.auditRetentionDays * 24 * 60 * 60 * 1000;
    for (const entry of fs.readdirSync(auditRoot, { withFileTypes: true })) {
      if (!entry.isFile() || !/^\d{4}-\d{2}-\d{2}\.jsonl$/.test(entry.name)) continue;
      const date = Date.parse(entry.name.slice(0, 10));
      if (Number.isFinite(date) && date < cutoff) fs.unlinkSync(path.join(auditRoot, entry.name));
    }
  } catch {
    // The audit folder may not exist on first run.
  }
}

function pathFingerprint(value) {
  if (!value) return null;
  return crypto.createHash("sha256").update(path.resolve(value).toLowerCase()).digest("hex").slice(0, 12);
}

function pluginEnabled(pluginId) {
  try {
    const source = fs.readFileSync(path.join(codexHome, "config.toml"), "utf8");
    const escaped = pluginId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = source.match(new RegExp(`\\[plugins\\."${escaped}"\\]([\\s\\S]*?)(?=\\n\\[|$)`));
    return Boolean(match && /(?:^|\n)enabled\s*=\s*true\s*(?:\n|$)/.test(match[1]));
  } catch {
    return false;
  }
}

function configuredComputerNativePipe() {
  try {
    const source = fs.readFileSync(path.join(codexHome, "config.toml"), "utf8");
    const match = source.match(/^\s*SKY_CUA_NATIVE_PIPE_DIRECTORY\s*=\s*(['"])(.*?)\1\s*$/m);
    return match?.[2] || null;
  } catch {
    return null;
  }
}

function computerNativeConnected(pipePath = configuredComputerNativePipe()) {
  if (process.platform !== "win32" || !pipePath) return false;
  const pipeName = String(pipePath).split("\\").filter(Boolean).pop();
  if (!pipeName) return false;
  try {
    return fs.readdirSync("\\\\.\\pipe\\").some((entry) => entry.toLowerCase() === pipeName.toLowerCase());
  } catch {
    return false;
  }
}

function controlCapabilities() {
  const browserSkill = installedSkillPath("brave-playwright", "brave-playwright", "personal");
  const bravePlaywrightInstalled = pluginEnabled("brave-playwright@personal") && Boolean(browserSkill);
  const computerInstalled = pluginEnabled("computer-use@openai-bundled");
  const computerPipe = configuredComputerNativePipe();
  const computerNativeConnectedNow = computerNativeConnected(computerPipe);
  return {
    browser: bravePlaywrightInstalled,
    browserProvider: bravePlaywrightInstalled ? "brave-playwright" : null,
    browserName: bravePlaywrightInstalled ? "Brave" : null,
    browserExtensionRequired: false,
    browserProfile: bravePlaywrightInstalled ? "dedicated" : null,
    computer: computerInstalled && computerNativeConnectedNow,
    computerInstalled,
    computerNativeConfigured: Boolean(computerPipe),
    computerNativeConnected: computerNativeConnectedNow,
    computerSessionMinutes: COMPUTER_CONTROL_SESSION_MS / 60000
  };
}

function installedSkillPath(pluginName, skillName, marketplace = "openai-bundled") {
  try {
    const root = path.join(codexHome, "plugins", "cache", marketplace, pluginName);
    const versions = fs.readdirSync(root, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort((left, right) => right.localeCompare(left, undefined, { numeric: true }));
    for (const version of versions) {
      const candidate = path.join(root, version, "skills", skillName, "SKILL.md");
      if (fs.existsSync(candidate)) return candidate;
    }
  } catch {
    // Missing plugins are reported through the control capability state.
  }
  return null;
}

function sendControlState(socket) {
  const context = clients.get(socket);
  if (!context) return;
  sendSocket(socket, {
    type: "controlState",
    capabilities: controlCapabilities(),
    computerEnabledUntil: context.computerEnabledUntil || 0
  });
}

function handleControlMessage(socket, message) {
  const context = clients.get(socket);
  if (!context) return;
  if (message.action === "enableComputer") {
    const capabilities = controlCapabilities();
    if (!capabilities.computerInstalled) {
      sendSocket(socket, { type: "clientError", message: "O componente oficial Computer Use não está instalado." });
      return;
    }
    context.computerEnabledUntil = Date.now() + COMPUTER_CONTROL_SESSION_MS;
    audit("control.computer.enabled", {
      clientId: context.id,
      durationMinutes: COMPUTER_CONTROL_SESSION_MS / 60000,
      nativeConnected: capabilities.computerNativeConnected
    });
    sendControlState(socket);
    return;
  }
  if (message.action === "disableComputer") {
    context.computerEnabledUntil = 0;
    audit("control.computer.disabled", { clientId: context.id });
    sendControlState(socket);
    return;
  }
  sendSocket(socket, { type: "clientError", message: "Ação de controle inválida." });
}

function emergencyStop(socket) {
  const context = clients.get(socket);
  if (!context) return;
  context.computerEnabledUntil = 0;
  let interrupted = 0;
  for (const threadId of context.ownedThreads) {
    const turnId = activeTurns.get(threadId);
    if (!turnId || turnId === true) continue;
    if (sendCodex({ id: ++nextRpcId, method: "turn/interrupt", params: { threadId, turnId } })) interrupted += 1;
  }
  audit("control.emergency_stop", { clientId: context.id, interrupted });
  sendControlState(socket);
  sendSocket(socket, { type: "controlStopped", interrupted });
}

function resolveDirectory(value) {
  if (typeof value !== "string" || !value.trim() || !path.isAbsolute(value.trim())) return null;
  try {
    const resolved = fs.realpathSync.native(path.resolve(value.trim()));
    return fs.statSync(resolved).isDirectory() ? resolved : null;
  } catch {
    return null;
  }
}

function pathKey(value) {
  const resolved = path.resolve(value);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

function pathIsWithin(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

function managedWorkspaces() {
  const candidates = [{ id: "codex-hub", name: "Codex Hub", path: path.resolve(__dirname, ".."), accent: "mint", managed: true }];
  const centralPath = process.env.CENTRAL_2RB_PATH || (process.platform === "win32" ? "F:\\Bot_HLL2.0" : "");
  if (centralPath) candidates.push({ id: "central-2rb", name: "Central 2RB", path: centralPath, accent: "amber", managed: true });

  const environmentPaths = String(process.env.HUB_WORKSPACE_PATHS || "")
    .split(path.delimiter)
    .map((value) => value.trim())
    .filter(Boolean);
  for (const value of environmentPaths) {
    candidates.push({
      id: `managed-${pathFingerprint(value)}`,
      name: path.basename(value) || "Workspace gerenciado",
      path: value,
      accent: "blue",
      managed: true
    });
  }
  return candidates;
}

function getApprovedWorkspaces() {
  const workspaces = [];
  const seen = new Set();
  for (const candidate of [...managedWorkspaces(), ...config.workspaces]) {
    const resolved = resolveDirectory(candidate.path);
    if (!resolved) continue;
    const key = pathKey(resolved);
    if (seen.has(key)) continue;
    seen.add(key);
    workspaces.push({
      id: String(candidate.id || crypto.randomUUID()),
      name: String(candidate.name || path.basename(resolved) || "Workspace").slice(0, 80),
      path: resolved,
      accent: candidate.accent || "blue",
      managed: Boolean(candidate.managed)
    });
  }
  return workspaces;
}

function approvedWorkspaceForPath(value) {
  const resolved = resolveDirectory(value);
  if (!resolved) return null;
  return getApprovedWorkspaces()
    .sort((a, b) => b.path.length - a.path.length)
    .find((workspace) => pathIsWithin(workspace.path, resolved)) || null;
}

function addWorkspace(name, inputPath) {
  const cleanName = String(name || "").trim().slice(0, 80);
  if (!cleanName) throw new Error("Informe um nome para o workspace.");
  const resolved = resolveDirectory(inputPath);
  if (!resolved) throw new Error("Informe uma pasta absoluta que exista.");
  if (pathKey(resolved) === pathKey(path.parse(resolved).root)) throw new Error("A raiz inteira do disco não pode ser aprovada como workspace.");

  const existing = getApprovedWorkspaces().find((workspace) => pathKey(workspace.path) === pathKey(resolved));
  if (existing) return existing;

  const workspace = {
    id: `workspace-${crypto.randomUUID()}`,
    name: cleanName,
    path: resolved,
    accent: "blue",
    managed: false,
    createdAt: new Date().toISOString()
  };
  config.workspaces.push(workspace);
  saveConfig();
  audit("workspace.added", { workspaceId: workspace.id, pathFingerprint: pathFingerprint(resolved) });
  return workspace;
}

function removeWorkspace(workspaceId) {
  const existing = config.workspaces.find((workspace) => workspace.id === workspaceId);
  if (!existing) return false;
  config.workspaces = config.workspaces.filter((workspace) => workspace.id !== workspaceId);
  saveConfig();
  audit("workspace.removed", { workspaceId, pathFingerprint: pathFingerprint(existing.path) });
  return true;
}

function securityHeaders(contentType) {
  return {
    ...(contentType ? { "Content-Type": contentType } : {}),
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "X-Frame-Options": "SAMEORIGIN",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
    "Content-Security-Policy": "default-src 'self'; connect-src 'self'; img-src 'self' data:; style-src 'self'; style-src-attr 'unsafe-inline'; script-src 'self'; font-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'self'"
  };
}

function jsonResponse(response, statusCode, value, extraHeaders = {}) {
  response.writeHead(statusCode, {
    ...securityHeaders("application/json; charset=utf-8"),
    "Cache-Control": "no-store",
    ...extraHeaders
  });
  response.end(JSON.stringify(value));
}

function parseRequestBody(request, limit = 32 * 1024) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
      if (Buffer.byteLength(body, "utf8") > limit) {
        reject(new Error("Request body is too large"));
        request.destroy();
      }
    });
    request.on("end", () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error("Invalid JSON body"));
      }
    });
    request.on("error", reject);
  });
}

function safeStaticPath(urlPath) {
  try {
    const decoded = decodeURIComponent(urlPath.split("?")[0]);
    const relative = decoded === "/" ? "index.html" : decoded.replace(/^\/+/, "");
    const candidate = path.resolve(publicRoot, relative);
    if (candidate !== publicRoot && !candidate.startsWith(`${publicRoot}${path.sep}`)) return null;
    return candidate;
  } catch {
    return null;
  }
}

function parseCookies(request) {
  const cookies = {};
  for (const part of String(request.headers.cookie || "").split(";")) {
    const separator = part.indexOf("=");
    if (separator < 1) continue;
    try {
      cookies[part.slice(0, separator).trim()] = decodeURIComponent(part.slice(separator + 1).trim());
    } catch {
      // Ignore a malformed cookie instead of failing the entire local request.
    }
  }
  return cookies;
}

function isLoopbackHostname(hostname) {
  const value = String(hostname || "").toLowerCase().replace(/^\[|\]$/g, "");
  return value === "127.0.0.1" || value === "localhost" || value === "::1" || value.endsWith(".localhost");
}

function requestHasSafeHost(request) {
  try {
    return isLoopbackHostname(new URL(`http://${request.headers.host || ""}`).hostname);
  } catch {
    return false;
  }
}

function requestHasSafeOrigin(request) {
  const origin = request.headers.origin;
  if (!origin) return true;
  try {
    const parsed = new URL(origin);
    return (parsed.protocol === "http:" || parsed.protocol === "https:") && isLoopbackHostname(parsed.hostname);
  } catch {
    return false;
  }
}

function createSession() {
  const token = crypto.randomBytes(32).toString("base64url");
  const session = {
    token,
    csrf: crypto.randomBytes(24).toString("base64url"),
    createdAt: Date.now(),
    lastSeenAt: Date.now(),
    fullAccessUntil: 0,
    fullAccessFailures: 0,
    fullAccessLockedUntil: 0
  };
  sessions.set(token, session);
  return session;
}

function sessionForRequest(request) {
  const token = parseCookies(request)[SESSION_COOKIE];
  const cookieSession = token ? sessions.get(token) : null;
  if (cookieSession && Date.now() - cookieSession.lastSeenAt <= SESSION_TTL_MS) {
    cookieSession.lastSeenAt = Date.now();
    return cookieSession;
  }
  if (token) sessions.delete(token);
  return sessionFromCsrf(request.headers["x-codex-hub-session"]);
}

function sessionCookie(session) {
  return `${SESSION_COOKIE}=${encodeURIComponent(session.token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`;
}

function csrfMatches(session, value) {
  if (!session || typeof value !== "string") return false;
  const expected = Buffer.from(session.csrf);
  const received = Buffer.from(value);
  return expected.length === received.length && crypto.timingSafeEqual(expected, received);
}

function configuredFullAccessCredential() {
  const environmentCode = String(process.env.HUB_FULL_ACCESS_CODE || "").trim();
  if (environmentCode) return { algorithm: "environment", value: environmentCode };
  return config.security.fullAccessCredential;
}

function verifyFullAccessCode(value) {
  const code = String(value || "").trim();
  const credential = configuredFullAccessCredential();
  if (!credential || !/^\d{6,12}$/.test(code)) return false;
  if (credential.algorithm === "environment") {
    const expected = crypto.createHash("sha256").update(credential.value).digest();
    const received = crypto.createHash("sha256").update(code).digest();
    return crypto.timingSafeEqual(expected, received);
  }
  try {
    const expected = Buffer.from(credential.hash, "base64url");
    const received = crypto.scryptSync(code, credential.salt, credential.keyLength);
    return expected.length === received.length && crypto.timingSafeEqual(expected, received);
  } catch {
    return false;
  }
}

function createFullAccessCredential(value) {
  const code = String(value || "").trim();
  if (!/^\d{6,12}$/.test(code)) throw new Error("O código precisa ter entre 6 e 12 números.");
  const salt = crypto.randomBytes(16).toString("base64url");
  const keyLength = 32;
  const hash = crypto.scryptSync(code, salt, keyLength).toString("base64url");
  return { algorithm: "scrypt", salt, hash, keyLength };
}

function fullAccessState(session) {
  const now = Date.now();
  if (session && Number(session.fullAccessUntil) <= now) session.fullAccessUntil = 0;
  if (session && session.fullAccessLockedUntil && Number(session.fullAccessLockedUntil) <= now) {
    session.fullAccessLockedUntil = 0;
    session.fullAccessFailures = 0;
  }
  const failures = Math.max(0, Number(session?.fullAccessFailures) || 0);
  return {
    configured: Boolean(configuredFullAccessCredential()),
    active: Boolean(session && Number(session.fullAccessUntil) > now),
    expiresAt: session && Number(session.fullAccessUntil) > now ? Number(session.fullAccessUntil) : 0,
    lockedUntil: session && Number(session.fullAccessLockedUntil) > now ? Number(session.fullAccessLockedUntil) : 0,
    remainingAttempts: Math.max(0, FULL_ACCESS_MAX_FAILURES - failures),
    durationMinutes: FULL_ACCESS_SESSION_MS / 60000
  };
}

function fullAccessActiveForContext(context) {
  const session = context?.sessionToken ? sessions.get(context.sessionToken) : null;
  return fullAccessState(session).active;
}

function sendPermissionStateForSession(session) {
  if (!session) return;
  const permission = fullAccessState(session);
  for (const [socket, context] of clients.entries()) {
    if (context.sessionToken === session.token) sendSocket(socket, { type: "permissionState", permission });
  }
}

function sessionFromCsrf(value) {
  if (typeof value !== "string" || !value) return null;
  for (const session of sessions.values()) {
    if (!csrfMatches(session, value)) continue;
    if (Date.now() - session.lastSeenAt > SESSION_TTL_MS) {
      sessions.delete(session.token);
      return null;
    }
    session.lastSeenAt = Date.now();
    return session;
  }
  return null;
}

function sessionForWebSocketRequest(request) {
  const cookieSession = sessionForRequest(request);
  if (cookieSession) return cookieSession;
  const protocols = String(request.headers["sec-websocket-protocol"] || "")
    .split(",")
    .map((value) => value.trim());
  const credential = protocols.find((value) => value.startsWith("codex-hub-auth."));
  return credential ? sessionFromCsrf(credential.slice("codex-hub-auth.".length)) : null;
}

function requireSession(request, response, { csrf = false } = {}) {
  const session = sessionForRequest(request);
  if (!session) {
    jsonResponse(response, 401, { ok: false, error: "Sessão local inválida. Reabra o Codex Hub." });
    return null;
  }
  if (!requestHasSafeOrigin(request)) {
    jsonResponse(response, 403, { ok: false, error: "Origem não autorizada." });
    return null;
  }
  if (csrf && !csrfMatches(session, request.headers["x-codex-hub-csrf"])) {
    jsonResponse(response, 403, { ok: false, error: "Proteção CSRF inválida." });
    return null;
  }
  return session;
}

function readAuditRecords(limit) {
  const records = [];
  try {
    const files = fs.readdirSync(auditRoot)
      .filter((name) => /^\d{4}-\d{2}-\d{2}\.jsonl$/.test(name))
      .sort()
      .reverse();
    for (const name of files) {
      const lines = fs.readFileSync(path.join(auditRoot, name), "utf8").trim().split(/\r?\n/).reverse();
      for (const line of lines) {
        if (!line) continue;
        try {
          records.push(JSON.parse(line));
        } catch {
          // Ignore an incomplete trailing record.
        }
        if (records.length >= limit) return records;
      }
    }
  } catch {
    return records;
  }
  return records;
}

const server = http.createServer(async (request, response) => {
  if (!requestHasSafeHost(request)) {
    jsonResponse(response, 421, { ok: false, error: "Host local inválido." });
    return;
  }
  const requestUrl = new URL(request.url, `http://${request.headers.host}`);

  if (request.method === "GET" && requestUrl.pathname === "/api/health") {
    jsonResponse(response, 200, {
      ok: true,
      version: APP_VERSION,
      codexReady,
      clients: clients.size,
      activeTurns: activeTurns.size,
      uptimeSeconds: Math.floor(process.uptime()),
      control: controlCapabilities(),
      security: {
        localhostOnly: true,
        authenticatedSessions: true,
        originValidation: true,
        workspaceAllowlist: true,
        explicitApprovals: true,
        fullAccessProtected: Boolean(configuredFullAccessCredential()),
        audit: true
      }
    });
    return;
  }

  if (request.method === "GET" && requestUrl.pathname === "/api/session") {
    if (!requestHasSafeOrigin(request)) {
      jsonResponse(response, 403, { ok: false, error: "Origem não autorizada." });
      return;
    }
    const session = sessionForRequest(request) || createSession();
    jsonResponse(response, 200, {
      ok: true,
      csrf: session.csrf,
      expiresInSeconds: Math.floor(SESSION_TTL_MS / 1000),
      security: { localhostOnly: true, originValidation: true, explicitApprovals: true }
    }, { "Set-Cookie": sessionCookie(session) });
    return;
  }

  if (request.method === "GET" && requestUrl.pathname === "/api/permissions") {
    const session = requireSession(request, response);
    if (!session) return;
    jsonResponse(response, 200, { ok: true, permission: fullAccessState(session) });
    return;
  }

  if (request.method === "POST" && requestUrl.pathname === "/api/permissions/full-access/setup") {
    const session = requireSession(request, response, { csrf: true });
    if (!session) return;
    if (configuredFullAccessCredential()) {
      jsonResponse(response, 409, { ok: false, error: "O código de Full access já foi configurado neste computador.", permission: fullAccessState(session) });
      return;
    }
    try {
      const body = await parseRequestBody(request, 2048);
      const code = String(body.code || "").trim();
      const confirmation = String(body.confirmation || "").trim();
      if (code !== confirmation) throw new Error("A confirmação do código não corresponde.");
      if (configuredFullAccessCredential()) {
        jsonResponse(response, 409, { ok: false, error: "O código acabou de ser configurado em outra sessão.", permission: fullAccessState(session) });
        return;
      }
      config.security.fullAccessCredential = createFullAccessCredential(code);
      saveConfig();
      session.fullAccessFailures = 0;
      session.fullAccessLockedUntil = 0;
      session.fullAccessUntil = Date.now() + FULL_ACCESS_SESSION_MS;
      const permission = fullAccessState(session);
      audit("security.full_access.configured", { durationMinutes: FULL_ACCESS_SESSION_MS / 60000 });
      sendPermissionStateForSession(session);
      jsonResponse(response, 201, { ok: true, permission });
    } catch (error) {
      audit("security.full_access.setup_denied", { reason: "validation" });
      jsonResponse(response, 400, { ok: false, error: error.message, permission: fullAccessState(session) });
    }
    return;
  }

  if (request.method === "POST" && requestUrl.pathname === "/api/permissions/full-access") {
    const session = requireSession(request, response, { csrf: true });
    if (!session) return;
    const state = fullAccessState(session);
    if (!state.configured) {
      jsonResponse(response, 503, { ok: false, error: "O código de Full access ainda não foi configurado no servidor.", permission: state });
      return;
    }
    if (state.lockedUntil > Date.now()) {
      audit("security.full_access.denied", { reason: "rate-limit" });
      jsonResponse(response, 429, { ok: false, error: "Muitas tentativas. Aguarde antes de tentar novamente.", permission: state });
      return;
    }
    try {
      const body = await parseRequestBody(request, 2048);
      if (!verifyFullAccessCode(body.code)) {
        session.fullAccessFailures = Math.min(FULL_ACCESS_MAX_FAILURES, (Number(session.fullAccessFailures) || 0) + 1);
        if (session.fullAccessFailures >= FULL_ACCESS_MAX_FAILURES) session.fullAccessLockedUntil = Date.now() + FULL_ACCESS_LOCK_MS;
        await new Promise((resolve) => setTimeout(resolve, 350 + crypto.randomInt(0, 180)));
        const permission = fullAccessState(session);
        audit("security.full_access.denied", { reason: permission.lockedUntil ? "locked" : "invalid-code" });
        jsonResponse(response, permission.lockedUntil ? 429 : 403, {
          ok: false,
          error: permission.lockedUntil ? "Muitas tentativas. O acesso foi temporariamente bloqueado." : "Código de autorização inválido.",
          permission
        });
        return;
      }
      session.fullAccessFailures = 0;
      session.fullAccessLockedUntil = 0;
      session.fullAccessUntil = Date.now() + FULL_ACCESS_SESSION_MS;
      const permission = fullAccessState(session);
      audit("security.full_access.enabled", { durationMinutes: FULL_ACCESS_SESSION_MS / 60000 });
      sendPermissionStateForSession(session);
      jsonResponse(response, 200, { ok: true, permission });
    } catch (error) {
      jsonResponse(response, 400, { ok: false, error: error.message, permission: fullAccessState(session) });
    }
    return;
  }

  if (request.method === "DELETE" && requestUrl.pathname === "/api/permissions/full-access") {
    const session = requireSession(request, response, { csrf: true });
    if (!session) return;
    session.fullAccessUntil = 0;
    session.fullAccessFailures = 0;
    session.fullAccessLockedUntil = 0;
    audit("security.full_access.revoked");
    sendPermissionStateForSession(session);
    jsonResponse(response, 200, { ok: true, permission: fullAccessState(session) });
    return;
  }

  if (request.method === "GET" && requestUrl.pathname === "/api/workspaces") {
    if (!requireSession(request, response)) return;
    jsonResponse(response, 200, { workspaces: getApprovedWorkspaces() });
    return;
  }

  if (request.method === "POST" && requestUrl.pathname === "/api/workspaces") {
    if (!requireSession(request, response, { csrf: true })) return;
    try {
      const body = await parseRequestBody(request);
      const workspace = addWorkspace(body.name, body.path);
      jsonResponse(response, 201, { ok: true, workspace, workspaces: getApprovedWorkspaces() });
    } catch (error) {
      jsonResponse(response, 400, { ok: false, error: error.message });
    }
    return;
  }

  if (request.method === "DELETE" && requestUrl.pathname.startsWith("/api/workspaces/")) {
    if (!requireSession(request, response, { csrf: true })) return;
    const workspaceId = decodeURIComponent(requestUrl.pathname.slice("/api/workspaces/".length));
    if (!removeWorkspace(workspaceId)) {
      jsonResponse(response, 404, { ok: false, error: "Workspace não encontrado ou gerenciado pelo sistema." });
      return;
    }
    jsonResponse(response, 200, { ok: true, workspaces: getApprovedWorkspaces() });
    return;
  }

  if (request.method === "POST" && requestUrl.pathname === "/api/path/validate") {
    if (!requireSession(request, response, { csrf: true })) return;
    try {
      const body = await parseRequestBody(request);
      const resolved = resolveDirectory(body.path);
      if (!resolved) throw new Error("Pasta não encontrada ou caminho inválido.");
      if (pathKey(resolved) === pathKey(path.parse(resolved).root)) throw new Error("A raiz inteira do disco não pode ser aprovada.");
      jsonResponse(response, 200, { ok: true, path: resolved, isDirectory: true });
    } catch (error) {
      jsonResponse(response, 404, { ok: false, error: error.message });
    }
    return;
  }

  if (request.method === "GET" && requestUrl.pathname === "/api/audit") {
    if (!requireSession(request, response)) return;
    const limit = Math.min(1000, Math.max(1, Number(requestUrl.searchParams.get("limit")) || 200));
    jsonResponse(response, 200, { records: readAuditRecords(limit), retentionDays: config.security.auditRetentionDays });
    return;
  }

  if (request.method !== "GET" && request.method !== "HEAD") {
    jsonResponse(response, 405, { error: "Method not allowed" });
    return;
  }
  const staticPath = safeStaticPath(requestUrl.pathname);
  if (!staticPath) {
    jsonResponse(response, 400, { error: "Invalid path" });
    return;
  }
  fs.stat(staticPath, (error, stats) => {
    if (error || !stats.isFile()) {
      jsonResponse(response, 404, { error: "Not found" });
      return;
    }
    response.writeHead(200, {
      ...securityHeaders(mimeTypes[path.extname(staticPath).toLowerCase()] || "application/octet-stream"),
      "Cache-Control": "no-store"
    });
    if (request.method === "HEAD") return response.end();
    fs.createReadStream(staticPath).pipe(response);
  });
});

const websocketServer = new WebSocketServer({ noServer: true, maxPayload: MAX_WS_PAYLOAD, perMessageDeflate: false });

function rejectUpgrade(socket, statusCode, message) {
  const reason = http.STATUS_CODES[statusCode] || "Rejected";
  const body = `${message}\n`;
  socket.write(`HTTP/1.1 ${statusCode} ${reason}\r\nConnection: close\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`);
  socket.destroy();
}

server.on("upgrade", (request, socket, head) => {
  if (!requestHasSafeHost(request)) return rejectUpgrade(socket, 421, "Host local inválido.");
  const requestUrl = new URL(request.url, `http://${request.headers.host}`);
  if (requestUrl.pathname !== "/ws") return rejectUpgrade(socket, 404, "Not found");
  if (!requestHasSafeOrigin(request)) {
    audit("websocket.denied", { reason: "origin" });
    return rejectUpgrade(socket, 403, "Origem não autorizada.");
  }
  const session = sessionForWebSocketRequest(request);
  if (!session) {
    audit("websocket.denied", { reason: "session" });
    return rejectUpgrade(socket, 401, "Sessão local necessária.");
  }
  websocketServer.handleUpgrade(request, socket, head, (websocket) => {
    websocket.sessionToken = session.token;
    websocketServer.emit("connection", websocket, request);
  });
});

function sendSocket(socket, payload) {
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(payload));
}

function broadcast(payload) {
  for (const socket of clients.keys()) sendSocket(socket, payload);
}

function sendCodex(payload) {
  if (!codexProcess || !codexProcess.stdin.writable) return false;
  codexProcess.stdin.write(`${JSON.stringify(payload)}\n`);
  return true;
}

function extractThreadId(message) {
  const params = message?.params || {};
  return params.threadId || params.conversationId || params.thread?.id || params.turn?.threadId || null;
}

function addThreadOwner(threadId, socket, cwd, permissionMode) {
  if (!threadId || !clients.has(socket)) return;
  const context = clients.get(socket);
  context.ownedThreads.add(threadId);
  if (!threadOwners.has(threadId)) threadOwners.set(threadId, new Set());
  threadOwners.get(threadId).add(socket);
  if (cwd) {
    const previous = threadMetadata.get(threadId) || {};
    threadMetadata.set(threadId, {
      ...previous,
      cwd,
      pathFingerprint: pathFingerprint(cwd),
      permissionMode: PERMISSION_MODES.has(permissionMode) ? permissionMode : previous.permissionMode || "workspace"
    });
  }
  for (const pending of pendingServerRequests.values()) {
    if (pending.threadId !== threadId || pending.recipients.has(socket)) continue;
    pending.recipients.add(socket);
    sendSocket(socket, pending.payload);
  }
}

function removeSocketOwnership(socket) {
  const context = clients.get(socket);
  if (!context) return;
  for (const threadId of context.ownedThreads) {
    const owners = threadOwners.get(threadId);
    owners?.delete(socket);
    if (owners && owners.size === 0) threadOwners.delete(threadId);
  }
}

function recipientsForThread(threadId) {
  if (!threadId) return new Set(clients.keys());
  return new Set(threadOwners.get(threadId) || []);
}

function routeNotification(message) {
  const threadId = extractThreadId(message);
  if (message.method === "turn/started" && threadId) activeTurns.set(threadId, message.params?.turn?.id || true);
  if (message.method === "turn/completed" && threadId) activeTurns.delete(threadId);
  const payload = { type: "notification", method: message.method, params: message.params || {} };
  for (const socket of recipientsForThread(threadId)) sendSocket(socket, payload);
}

function filterThreadList(result, context) {
  if (!result || !Array.isArray(result.data)) return result;
  const data = result.data.filter((thread) => {
    const allowed = Boolean(approvedWorkspaceForPath(thread.cwd));
    if (allowed && thread.id) context.visibleThreads.add(thread.id);
    return allowed;
  });
  return { ...result, data };
}

function routeClientResult(message, route) {
  clearTimeout(route.timeout);
  pendingClientRequests.delete(message.id);
  const context = clients.get(route.socket);
  if (!context) return;
  context.pendingCount = Math.max(0, context.pendingCount - 1);
  if (message.error) {
    sendSocket(route.socket, { type: "rpcResult", requestId: route.requestId, error: message.error });
    return;
  }

  let result = message.result;
  if (route.method === "thread/list") result = filterThreadList(result, context);
  if (route.method === "skills/list") {
    const data = Array.isArray(result?.data) ? result.data.map((entry) => {
      const cwd = resolveDirectory(entry?.cwd);
      if (!cwd || !approvedWorkspaceForPath(cwd)) return null;
      const catalog = new Map();
      const skills = (Array.isArray(entry.skills) ? entry.skills : []).flatMap((skill) => {
        const skillPath = resolveExistingPath(skill?.path);
        if (!skillPath || path.basename(skillPath).toLowerCase() !== "skill.md") return [];
        const safeSkill = {
          name: String(skill.name || path.basename(path.dirname(skillPath))).slice(0, 120),
          description: String(skill.description || "").slice(0, 1200),
          shortDescription: String(skill.shortDescription || skill.interface?.shortDescription || "").slice(0, 240),
          path: skillPath,
          scope: ["user", "repo", "system", "admin"].includes(skill.scope) ? skill.scope : "user",
          enabled: skill.enabled !== false,
          pluginId: skill.pluginId ? String(skill.pluginId).slice(0, 180) : null,
          displayName: skill.interface?.displayName ? String(skill.interface.displayName).slice(0, 120) : null,
          brandColor: /^#[0-9a-f]{6}$/i.test(String(skill.interface?.brandColor || "")) ? skill.interface.brandColor : null
        };
        if (safeSkill.enabled) catalog.set(pathKey(skillPath), safeSkill);
        return safeSkill.enabled ? [safeSkill] : [];
      });
      context.skillCatalogByCwd.set(pathKey(cwd), catalog);
      return { cwd, skills, errors: [] };
    }).filter(Boolean) : [];
    result = { data };
  }
  if (["thread/start", "thread/resume", "thread/read", "thread/fork"].includes(route.method)) {
    const thread = result?.thread;
    const workspace = approvedWorkspaceForPath(thread?.cwd || route.params.cwd);
    if (!thread?.id || !workspace) {
      sendSocket(route.socket, {
        type: "rpcResult",
        requestId: route.requestId,
        error: { code: -32003, message: "A conversa usa uma pasta que ainda não foi aprovada no Hub." }
      });
      audit("rpc.denied", { method: route.method, reason: "workspace-not-approved" });
      return;
    }
    context.visibleThreads.add(thread.id);
    const permissionMode = route.params.sandbox === "danger-full-access"
      ? "full"
      : route.params.sandbox === "read-only" ? "read-only" : "workspace";
    addThreadOwner(thread.id, route.socket, thread.cwd || route.params.cwd, permissionMode);
  }
  sendSocket(route.socket, { type: "rpcResult", requestId: route.requestId, result });
}

function threadHasAuthorizedFullAccess(threadId) {
  if (!threadId || threadMetadata.get(threadId)?.permissionMode !== "full") return false;
  for (const socket of threadOwners.get(threadId) || []) {
    const context = clients.get(socket);
    if (context && fullAccessActiveForContext(context)) return true;
  }
  return false;
}

function routeServerRequest(message) {
  const threadId = extractThreadId(message);
  if (message.method === "currentTime/read") {
    sendCodex({ id: message.id, result: { currentTimeAt: Math.floor(Date.now() / 1000) } });
    return;
  }
  const automaticResponse = automaticFullAccessApproval(message, threadHasAuthorizedFullAccess(threadId));
  if (automaticResponse) {
    sendCodex({ id: message.id, result: automaticResponse });
    audit("approval.auto_approved", { method: message.method, threadId, mode: "full", decision: automaticResponse.decision });
    return;
  }
  const recipients = recipientsForThread(threadId);
  const payload = { type: "serverRequest", requestId: message.id, method: message.method, params: message.params || {} };
  pendingServerRequests.set(String(message.id), { message, threadId, recipients, payload });
  for (const socket of recipients) sendSocket(socket, payload);
  audit("approval.requested", { method: message.method, threadId: threadId || null });
}

function routeCodexMessage(message) {
  if (message.id === initializeRpcId && (Object.hasOwn(message, "result") || Object.hasOwn(message, "error"))) {
    if (message.error) {
      lastCodexError = message.error.message || "Codex initialization failed";
      broadcast({ type: "bridgeStatus", ready: false, error: lastCodexError });
      audit("codex.initialize.failed");
      return;
    }
    codexReady = true;
    lastCodexError = null;
    sendCodex({ method: "initialized" });
    broadcast({ type: "bridgeStatus", ready: true, version: APP_VERSION });
    audit("codex.ready");
    return;
  }
  if (Object.hasOwn(message, "id") && (Object.hasOwn(message, "result") || Object.hasOwn(message, "error"))) {
    const route = pendingClientRequests.get(message.id);
    if (route) return routeClientResult(message, route);
  }
  if (Object.hasOwn(message, "id") && message.method) return routeServerRequest(message);
  if (message.method) routeNotification(message);
}

function parseCodexOutput(chunk) {
  codexOutputBuffer += chunk;
  let lineBreakIndex = codexOutputBuffer.indexOf("\n");
  while (true) {
    const rawLine = lineBreakIndex >= 0 ? codexOutputBuffer.slice(0, lineBreakIndex) : codexOutputBuffer;
    if (Buffer.byteLength(rawLine, "utf8") > MAX_CODEX_OUTPUT_BUFFER_BYTES) {
      lastCodexError = "O Codex enviou uma resposta histórica grande demais. Use o carregamento paginado.";
      codexOutputBuffer = "";
      failPendingRequests(lastCodexError);
      audit("codex.output.rejected", { reason: "oversized-line" });
      codexProcess?.kill();
      return;
    }
    if (lineBreakIndex < 0) break;
    const line = rawLine.trim();
    codexOutputBuffer = codexOutputBuffer.slice(lineBreakIndex + 1);
    if (line) {
      try {
        routeCodexMessage(JSON.parse(line));
      } catch {
        broadcast({ type: "bridgeLog", level: "warning", message: "Codex enviou uma linha não reconhecida." });
      }
    }
    lineBreakIndex = codexOutputBuffer.indexOf("\n");
  }
}

function failPendingRequests(message) {
  for (const route of pendingClientRequests.values()) {
    clearTimeout(route.timeout);
    sendSocket(route.socket, { type: "rpcResult", requestId: route.requestId, error: { message } });
  }
  pendingClientRequests.clear();
  for (const pending of pendingServerRequests.values()) {
    for (const socket of pending.recipients) sendSocket(socket, { type: "serverRequestResolved", requestId: pending.message.id });
  }
  pendingServerRequests.clear();
  activeTurns.clear();
  for (const context of clients.values()) context.pendingCount = 0;
}

function startCodex() {
  if (codexProcess) return;
  codexReady = false;
  codexOutputBuffer = "";
  initializeRpcId = ++nextRpcId;
  codexProcess = spawn(CODEX_BIN, ["app-server", "--stdio"], {
    cwd: os.homedir(),
    env: process.env,
    windowsHide: true,
    stdio: ["pipe", "pipe", "pipe"]
  });
  codexProcess.stdout.setEncoding("utf8");
  codexProcess.stdout.on("data", parseCodexOutput);
  codexProcess.stderr.setEncoding("utf8");
  codexProcess.stderr.on("data", (chunk) => {
    const message = chunk.replace(/\x1b\[[0-9;]*m/g, "").trim();
    if (message) {
      broadcast({ type: "bridgeLog", level: "warning", message: message.slice(-500) });
    }
  });
  codexProcess.on("error", (error) => {
    lastCodexError = error.message;
    broadcast({ type: "bridgeStatus", ready: false, error: error.message });
    audit("codex.process.error");
  });
  codexProcess.on("exit", (code, signal) => {
    codexProcess = null;
    codexReady = false;
    const reason = `Codex App Server encerrou (${signal || code || "desconhecido"}).`;
    lastCodexError = reason;
    failPendingRequests(reason);
    broadcast({ type: "bridgeStatus", ready: false, error: reason });
    audit("codex.process.exit", { code: code ?? null, signal: signal || null });
    if (!codexRestartTimer) {
      codexRestartTimer = setTimeout(() => {
        codexRestartTimer = null;
        startCodex();
      }, 2000);
    }
  });
  sendCodex({
    id: initializeRpcId,
    method: "initialize",
    params: {
      clientInfo: { name: "codex-hub", title: "Codex Hub", version: APP_VERSION },
      capabilities: {
        experimentalApi: true,
        requestAttestation: false,
        mcpServerOpenaiFormElicitation: true,
        extensions: { "openai/form": {} }
      }
    }
  });
}

function socketOwnsThread(socket, threadId) {
  return Boolean(threadId && clients.get(socket)?.ownedThreads.has(threadId));
}

function clientRateAllowed(context) {
  const now = Date.now();
  if (now - context.rateWindowStartedAt >= 60000) {
    context.rateWindowStartedAt = now;
    context.rateCount = 0;
  }
  context.rateCount += 1;
  return context.rateCount <= MAX_CLIENT_MESSAGES_PER_MINUTE;
}

function resolveExistingPath(value) {
  if (typeof value !== "string" || !value.trim() || !path.isAbsolute(value.trim())) return null;
  try {
    return fs.realpathSync.native(path.resolve(value.trim()));
  } catch {
    return null;
  }
}

function permissionSettingsForContext(context, requestedMode) {
  const permissionMode = PERMISSION_MODES.has(requestedMode) ? requestedMode : "workspace";
  if (permissionMode === "full") {
    if (!fullAccessActiveForContext(context)) {
      throw new Error("Full access não está autorizado nesta sessão. Use /permission e informe o código.");
    }
    return { permissionMode, approvalPolicy: "never", sandbox: "danger-full-access" };
  }
  if (permissionMode === "read-only") {
    return { permissionMode, approvalPolicy: "on-request", sandbox: "read-only" };
  }
  return { permissionMode: "workspace", approvalPolicy: "on-request", sandbox: "workspace-write" };
}

function normalizeTurnInput(context, threadId, input) {
  const cwd = threadMetadata.get(threadId)?.cwd;
  const skillCatalog = cwd ? context?.skillCatalogByCwd.get(pathKey(cwd)) : null;
  return input.map((part) => {
    if (!part || typeof part !== "object" || Array.isArray(part)) throw new Error("Item de contexto inválido.");
    if (part.type === "text") {
      const text = String(part.text || "");
      if (!text.trim() || Buffer.byteLength(text, "utf8") > MAX_TURN_INPUT_BYTES) throw new Error("Texto da mensagem inválido.");
      return { type: "text", text, text_elements: [] };
    }
    if (part.type === "skill") {
      const resolved = resolveExistingPath(part.path);
      const metadata = resolved && skillCatalog?.get(pathKey(resolved));
      if (!resolved || path.basename(resolved).toLowerCase() !== "skill.md" || !metadata) {
        throw new Error("Essa skill não pertence ao catálogo autorizado deste workspace.");
      }
      return { type: "skill", name: metadata.name, path: resolved };
    }
    if (part.type === "mention") {
      const resolved = resolveExistingPath(part.path);
      let mentionRoot = null;
      if (resolved) {
        try {
          mentionRoot = fs.statSync(resolved).isDirectory() ? resolved : path.dirname(resolved);
        } catch {
          mentionRoot = null;
        }
      }
      const workspace = mentionRoot ? approvedWorkspaceForPath(mentionRoot) : null;
      if (!resolved || !workspace || !cwd || !pathIsWithin(workspace.path, resolved) || !pathIsWithin(workspace.path, cwd)) {
        throw new Error("O arquivo de contexto precisa estar dentro do workspace aprovado.");
      }
      return { type: "mention", name: String(part.name || path.basename(resolved)).slice(0, 160), path: resolved };
    }
    throw new Error("Tipo de contexto não permitido pelo Hub.");
  });
}

function normalizeRpcParams(socket, method, incoming) {
  let params = incoming && typeof incoming === "object" && !Array.isArray(incoming) ? { ...incoming } : {};
  const context = clients.get(socket);
  if (method === "thread/list") return { ...params, limit: Math.min(100, Math.max(1, Number(params.limit) || 40)) };
  if (method === "model/list") return { limit: Math.min(100, Math.max(1, Number(params.limit) || 100)), includeHidden: false };
  if (method === "collaborationMode/list") return {};
  if (method === "skills/list") {
    const requestedCwds = Array.isArray(params.cwds) ? params.cwds.slice(0, 8) : [];
    const cwds = requestedCwds.map((value) => {
      const cwd = resolveDirectory(value);
      if (!cwd || !approvedWorkspaceForPath(cwd)) throw new Error("Uma pasta solicitada para skills não está aprovada.");
      return cwd;
    });
    return { cwds, forceReload: params.forceReload === true };
  }
  if (method === "fuzzyFileSearch") {
    const query = String(params.query || "").trim().slice(0, 180);
    const roots = (Array.isArray(params.roots) ? params.roots : []).slice(0, 4).map((value) => {
      const root = resolveDirectory(value);
      if (!root || !approvedWorkspaceForPath(root)) throw new Error("A busca de arquivos está fora dos workspaces aprovados.");
      return root;
    });
    if (!roots.length) throw new Error("Informe um workspace aprovado para pesquisar arquivos.");
    return { query, roots };
  }
  if (method === "thread/start" || method === "thread/resume") {
    if (method === "thread/resume" && typeof params.threadId !== "string") throw new Error("threadId inválido.");
    const cwd = resolveDirectory(params.cwd);
    const workspace = cwd ? approvedWorkspaceForPath(cwd) : null;
    if (!cwd || !workspace) throw new Error("A pasta não está aprovada. Adicione-a como workspace antes de continuar.");
    const permission = permissionSettingsForContext(context, params.permissionMode);
    return {
      ...params,
      cwd,
      runtimeWorkspaceRoots: [workspace.path],
      approvalPolicy: permission.approvalPolicy,
      sandbox: permission.sandbox
    };
  }
  if (method === "thread/fork") {
    if (!socketOwnsThread(socket, params.threadId)) throw new Error("Este cliente não controla essa conversa.");
    const cwd = resolveDirectory(threadMetadata.get(params.threadId)?.cwd);
    const workspace = cwd ? approvedWorkspaceForPath(cwd) : null;
    if (!cwd || !workspace) throw new Error("O workspace da conversa não está aprovado.");
    const permission = permissionSettingsForContext(context, params.permissionMode);
    return {
      threadId: params.threadId,
      cwd,
      runtimeWorkspaceRoots: [workspace.path],
      approvalPolicy: permission.approvalPolicy,
      sandbox: permission.sandbox,
      excludeTurns: true
    };
  }
  if (method === "thread/read") {
    if (typeof params.threadId !== "string") throw new Error("threadId inválido.");
    return { threadId: params.threadId, includeTurns: false };
  }
  if (method === "thread/turns/list") {
    if (!socketOwnsThread(socket, params.threadId)) throw new Error("Este cliente não controla essa conversa.");
    const normalized = {
      threadId: params.threadId,
      limit: Math.min(20, Math.max(1, Number(params.limit) || 20)),
      sortDirection: params.sortDirection === "asc" ? "asc" : "desc",
      itemsView: "full"
    };
    if (typeof params.cursor === "string" && params.cursor.length <= 1024) normalized.cursor = params.cursor;
    return normalized;
  }
  if (method === "thread/name/set") {
    if (!socketOwnsThread(socket, params.threadId)) throw new Error("Este cliente não controla essa conversa.");
    return { threadId: params.threadId, name: String(params.name || "").trim().slice(0, 120) };
  }
  if (method === "thread/compact/start") {
    if (!socketOwnsThread(socket, params.threadId)) throw new Error("Este cliente não controla essa conversa.");
    return { threadId: params.threadId };
  }
  if (method === "review/start") {
    if (!socketOwnsThread(socket, params.threadId)) throw new Error("Este cliente não controla essa conversa.");
    return { threadId: params.threadId, delivery: "inline", target: { type: "uncommittedChanges" } };
  }
  if (method === "turn/start") {
    if (!socketOwnsThread(socket, params.threadId)) throw new Error("Este cliente não controla essa conversa.");
    if (threadMetadata.get(params.threadId)?.permissionMode === "full" && !fullAccessActiveForContext(context)) {
      throw new Error("A autorização de Full access expirou. Use /permission para autorizar novamente.");
    }
    if (!Array.isArray(params.input) || Buffer.byteLength(JSON.stringify(params.input), "utf8") > MAX_TURN_INPUT_BYTES) {
      throw new Error("A mensagem excede o limite seguro do Hub.");
    }
    const normalizedInput = normalizeTurnInput(context, params.threadId, params.input);
    const controlMode = String(params.controlMode || "code");
    const planMode = params.planMode === true;
    if (!CONTROL_MODES.has(controlMode)) throw new Error("Modo de controle inválido.");
    params = {
      threadId: params.threadId,
      clientUserMessageId: typeof params.clientUserMessageId === "string" ? params.clientUserMessageId.slice(0, 160) : null,
      input: normalizedInput
    };
    if (planMode) {
      params.additionalContext = {
        "codex-hub-plan": {
          kind: "application",
          value: "Para esta tarefa, apresente primeiro um plano claro e verificável. Só implemente depois que o plano estiver suficientemente definido e dentro do escopo pedido pelo usuário."
        }
      };
    }
    if (controlMode === "browser") {
      const skillPath = installedSkillPath("brave-playwright", "brave-playwright", "personal");
      if (!controlCapabilities().browser || !skillPath) throw new Error("O Brave Playwright não está instalado ou habilitado neste computador.");
      params.input = [...params.input, { type: "skill", name: "brave-playwright", path: skillPath }];
    }
    if (controlMode === "computer") {
      if (!context || Number(context.computerEnabledUntil) <= Date.now()) {
        throw new Error("Ative uma sessão temporária de controle do computador antes de enviar.");
      }
      const skillPath = installedSkillPath("computer-use", "computer-use");
      const capabilities = controlCapabilities();
      if (!capabilities.computerInstalled || !skillPath) throw new Error("O Computer Use oficial não está disponível neste computador.");
      if (!capabilities.computerNativeConnected) {
        throw new Error("As 8 horas estão autorizadas, mas o serviço nativo do Computer Use está desconectado. Ative o servidor do Computer Use no Codex Desktop e tente novamente.");
      }
      params.input = [...params.input, { type: "skill", name: "computer-use", path: skillPath }];
    }
    audit("control.turn", { mode: controlMode, threadId: params.threadId });
    return params;
  }
  if (method === "turn/steer") {
    if (!socketOwnsThread(socket, params.threadId)) throw new Error("Este cliente não controla essa conversa.");
    if (threadMetadata.get(params.threadId)?.permissionMode === "full" && !fullAccessActiveForContext(context)) {
      throw new Error("A autorização de Full access expirou. Use /permission para autorizar novamente.");
    }
    const activeTurnId = activeTurns.get(params.threadId);
    if (!activeTurnId) throw new Error("Não existe um turno ativo para receber a mensagem.");
    if (typeof params.expectedTurnId !== "string" || params.expectedTurnId !== activeTurnId) {
      throw new Error("O turno ativo mudou antes de receber a mensagem. Ela continuará na fila.");
    }
    if (!Array.isArray(params.input) || Buffer.byteLength(JSON.stringify(params.input), "utf8") > MAX_TURN_INPUT_BYTES) {
      throw new Error("A mensagem excede o limite seguro do Hub.");
    }
    return {
      threadId: params.threadId,
      expectedTurnId: params.expectedTurnId,
      input: normalizeTurnInput(context, params.threadId, params.input)
    };
  }
  if (method === "turn/interrupt") {
    if (!socketOwnsThread(socket, params.threadId)) throw new Error("Este cliente não controla essa conversa.");
    if (typeof params.turnId !== "string") throw new Error("turnId inválido.");
    return { threadId: params.threadId, turnId: params.turnId };
  }
  if (!context) throw new Error("Cliente desconectado.");
  return params;
}

function handleClientRpc(socket, message) {
  const context = clients.get(socket);
  if (!context) return;
  if (!codexReady) {
    sendSocket(socket, { type: "rpcResult", requestId: message.requestId, error: { message: "O Codex App Server ainda não está pronto." } });
    return;
  }
  if (typeof message.requestId !== "string" || message.requestId.length > 160) {
    sendSocket(socket, { type: "clientError", message: "requestId inválido." });
    return;
  }
  if (!allowedRpcMethods.has(message.method)) {
    sendSocket(socket, { type: "rpcResult", requestId: message.requestId, error: { message: "Método não permitido pelo Hub." } });
    audit("rpc.denied", { method: String(message.method || "unknown"), reason: "method-not-allowed" });
    return;
  }
  if (context.pendingCount >= MAX_PENDING_PER_CLIENT) {
    sendSocket(socket, { type: "rpcResult", requestId: message.requestId, error: { message: "Muitas operações pendentes. Aguarde e tente novamente." } });
    return;
  }

  let params;
  try {
    params = normalizeRpcParams(socket, message.method, message.params);
  } catch (error) {
    sendSocket(socket, { type: "rpcResult", requestId: message.requestId, error: { code: -32003, message: error.message } });
    audit("rpc.denied", { method: message.method, reason: "validation" });
    return;
  }

  const rpcId = ++nextRpcId;
  context.pendingCount += 1;
  const timeout = setTimeout(() => {
    const route = pendingClientRequests.get(rpcId);
    if (!route) return;
    pendingClientRequests.delete(rpcId);
    const activeContext = clients.get(socket);
    if (activeContext) activeContext.pendingCount = Math.max(0, activeContext.pendingCount - 1);
    sendSocket(socket, { type: "rpcResult", requestId: message.requestId, error: { message: `Tempo esgotado ao executar ${message.method}.` } });
  }, RPC_TIMEOUT_MS);
  pendingClientRequests.set(rpcId, { socket, requestId: message.requestId, method: message.method, params, timeout });
  if (!sendCodex({ id: rpcId, method: message.method, params })) {
    clearTimeout(timeout);
    pendingClientRequests.delete(rpcId);
    context.pendingCount = Math.max(0, context.pendingCount - 1);
    sendSocket(socket, { type: "rpcResult", requestId: message.requestId, error: { message: "Falha ao enviar a operação ao Codex." } });
    return;
  }
  if (["thread/start", "thread/resume", "thread/fork", "thread/read", "thread/turns/list", "thread/compact/start", "turn/start", "turn/steer", "turn/interrupt", "review/start"].includes(message.method)) {
    audit("rpc.sent", {
      method: message.method,
      threadId: params.threadId || null,
      pathFingerprint: pathFingerprint(params.cwd || threadMetadata.get(params.threadId)?.cwd)
    });
  }
}

function handleServerResponse(socket, message) {
  const key = String(message.requestId);
  const pending = pendingServerRequests.get(key);
  if (!pending) {
    sendSocket(socket, { type: "clientError", message: "Essa solicitação já foi respondida." });
    return;
  }
  const authorized = pending.recipients.has(socket) || (pending.threadId && socketOwnsThread(socket, pending.threadId));
  if (!authorized) {
    sendSocket(socket, { type: "clientError", message: "Este cliente não pode responder a essa aprovação." });
    audit("approval.denied", { method: pending.message.method, reason: "wrong-client" });
    return;
  }
  pendingServerRequests.delete(key);
  const response = { id: message.requestId };
  if (message.error) response.error = message.error;
  else response.result = message.result;
  sendCodex(response);
  for (const recipient of pending.recipients) sendSocket(recipient, { type: "serverRequestResolved", requestId: message.requestId });
  audit("approval.resolved", {
    method: pending.message.method,
    threadId: pending.threadId || null,
    decision: message.error ? "error" : String(message.result?.decision || message.result?.action || "answered")
  });
}

websocketServer.on("connection", (socket) => {
  const context = {
    id: crypto.randomUUID(),
    sessionToken: socket.sessionToken,
    ownedThreads: new Set(),
    visibleThreads: new Set(),
    pendingCount: 0,
    rateCount: 0,
    rateWindowStartedAt: Date.now(),
    computerEnabledUntil: 0,
    skillCatalogByCwd: new Map()
  };
  clients.set(socket, context);
  sendSocket(socket, {
    type: "hello",
    clientId: context.id,
    version: APP_VERSION,
    codexReady,
    workspaces: getApprovedWorkspaces(),
    security: { authenticated: true, originValidated: true, explicitApprovals: true, workspaceAllowlist: true },
    permission: fullAccessState(sessions.get(socket.sessionToken)),
    control: { capabilities: controlCapabilities(), computerEnabledUntil: 0 }
  });
  audit("client.connected", { clientId: context.id });

  socket.on("message", (raw) => {
    if (!clientRateAllowed(context)) {
      sendSocket(socket, { type: "clientError", message: "Limite local de mensagens excedido." });
      socket.close(1008, "Rate limit");
      return;
    }
    let message;
    try {
      message = JSON.parse(raw.toString("utf8"));
    } catch {
      sendSocket(socket, { type: "clientError", message: "Mensagem WebSocket inválida." });
      return;
    }
    if (message.type === "rpc") return handleClientRpc(socket, message);
    if (message.type === "serverResponse") return handleServerResponse(socket, message);
    if (message.type === "controlSession") return handleControlMessage(socket, message);
    if (message.type === "emergencyStop") return emergencyStop(socket);
    sendSocket(socket, { type: "clientError", message: "Tipo de mensagem não permitido." });
  });

  socket.on("close", () => {
    removeSocketOwnership(socket);
    clients.delete(socket);
    for (const [rpcId, route] of pendingClientRequests.entries()) {
      if (route.socket !== socket) continue;
      clearTimeout(route.timeout);
      pendingClientRequests.delete(rpcId);
    }
    audit("client.disconnected", { clientId: context.id });
  });
});

function shutdown() {
  if (codexRestartTimer) clearTimeout(codexRestartTimer);
  audit("hub.stopping");
  for (const socket of clients.keys()) socket.close(1001, "Codex Hub encerrado");
  if (codexProcess) codexProcess.kill();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 2000).unref();
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

const sessionCleanupTimer = setInterval(() => {
  const cutoff = Date.now() - SESSION_TTL_MS;
  for (const [token, session] of sessions.entries()) {
    if (session.lastSeenAt < cutoff) sessions.delete(token);
  }
}, 30 * 60 * 1000);
sessionCleanupTimer.unref();

let lastComputerNativeConnected = controlCapabilities().computerNativeConnected;
const controlCapabilityTimer = setInterval(() => {
  const connected = controlCapabilities().computerNativeConnected;
  if (connected === lastComputerNativeConnected) return;
  lastComputerNativeConnected = connected;
  audit("control.computer.native_state", { connected });
  for (const socket of clients.keys()) sendControlState(socket);
}, 2000);
controlCapabilityTimer.unref();

pruneAuditLogs();
server.listen(PORT, HOST, () => {
  const address = server.address();
  const actualPort = typeof address === "object" && address ? address.port : PORT;
  console.log(`Codex Hub listening on http://${HOST}:${actualPort}`);
  audit("hub.started", { version: APP_VERSION });
  startCodex();
});
