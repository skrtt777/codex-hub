"use strict";

const path = require("node:path");
const { WebSocket } = require("ws");

const hubUrl = process.env.HUB_WS_URL || "ws://127.0.0.1:53849/ws";
const parsedHubUrl = new URL(hubUrl);
const baseUrl = `${parsedHubUrl.protocol === "wss:" ? "https:" : "http:"}//${parsedHubUrl.host}`;
const fullAccessTestCode = String(process.env.HUB_TEST_FULL_ACCESS_CODE || "").trim();
const firstRunTestCode = String(process.env.HUB_TEST_FIRST_RUN_CODE || "").trim();

async function createSession() {
  const response = await fetch(`${baseUrl}/api/session`, { headers: { Origin: baseUrl } });
  const result = await response.json();
  const cookie = String(response.headers.get("set-cookie") || "").split(";")[0];
  if (!response.ok || !result.csrf || !cookie) throw new Error("Could not establish an authenticated local session");
  return { cookie, csrf: result.csrf };
}

async function apiRequest(session, pathname, options = {}) {
  const method = String(options.method || "GET").toUpperCase();
  const headers = new Headers(options.headers || {});
  headers.set("Cookie", session.cookie);
  headers.set("Origin", baseUrl);
  if (method !== "GET" && method !== "HEAD") headers.set("X-Codex-Hub-CSRF", session.csrf);
  return fetch(`${baseUrl}${pathname}`, { ...options, method, headers });
}

function expectUpgradeRejected(headers, expectedStatus) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(hubUrl, { headers });
    const timeout = setTimeout(() => {
      socket.terminate();
      reject(new Error(`Expected WebSocket rejection ${expectedStatus}`));
    }, 5000);
    socket.once("open", () => {
      clearTimeout(timeout);
      socket.close();
      reject(new Error(`WebSocket unexpectedly accepted; expected ${expectedStatus}`));
    });
    socket.once("unexpected-response", (_request, response) => {
      clearTimeout(timeout);
      if (response.statusCode === expectedStatus) resolve();
      else reject(new Error(`Expected ${expectedStatus}, received ${response.statusCode}`));
    });
    socket.once("error", () => {});
  });
}

function expectEmbeddedSessionAccepted(session) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(
      hubUrl,
      ["codex-hub-v1", `codex-hub-auth.${session.csrf}`],
      { headers: { Origin: baseUrl } }
    );
    const timeout = setTimeout(() => {
      socket.terminate();
      reject(new Error("Embedded-session WebSocket connection timeout"));
    }, 10000);
    socket.once("message", (raw) => {
      const message = JSON.parse(raw.toString("utf8"));
      if (message.type !== "hello") return;
      clearTimeout(timeout);
      socket.close();
      resolve();
    });
    socket.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
}

class HubClient {
  constructor(name, session) {
    this.name = name;
    this.session = session;
    this.socket = null;
    this.requestSequence = 0;
    this.pending = new Map();
    this.ownedThreads = new Set();
    this.completed = new Set();
    this.answers = new Map();
    this.foreignNotifications = [];
    this.deferredThreadNotifications = [];
    this.pendingThreadStarts = 0;
    this.controlStates = [];
    this.hello = null;
  }

  connect() {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(hubUrl, {
        headers: { Cookie: this.session.cookie, Origin: baseUrl }
      });
      this.socket = socket;
      const timeout = setTimeout(() => reject(new Error(`${this.name}: connection timeout`)), 15000);
      let opened = false;

      socket.on("open", () => {
        opened = true;
      });
      socket.on("message", (raw) => {
        const message = JSON.parse(raw.toString("utf8"));
        this.handleMessage(message);
        if (message.type === "hello") this.hello = message;
        if ((message.type === "hello" && message.codexReady) || (message.type === "bridgeStatus" && message.ready && this.hello)) {
          clearTimeout(timeout);
          resolve({ ...this.hello, codexReady: true });
        }
      });
      socket.on("error", (error) => {
        if (!opened) {
          clearTimeout(timeout);
          reject(error);
        }
      });
    });
  }

  handleMessage(message) {
    if (message.type === "controlState") {
      this.controlStates.push(message);
      return;
    }
    if (message.type === "rpcResult") {
      const pending = this.pending.get(message.requestId);
      if (!pending) return;
      this.pending.delete(message.requestId);
      clearTimeout(pending.timeout);
      if (message.error) pending.reject(new Error(message.error.message));
      else pending.resolve(message.result);
      return;
    }
    if (message.type !== "notification") return;
    const threadId = message.params?.threadId || message.params?.thread?.id || null;
    if (threadId && !this.ownedThreads.has(threadId)) {
      const target = this.pendingThreadStarts > 0 ? this.deferredThreadNotifications : this.foreignNotifications;
      target.push({ method: message.method, threadId });
    }
    if (message.method === "item/agentMessage/delta" && threadId) {
      this.answers.set(threadId, `${this.answers.get(threadId) || ""}${message.params.delta || ""}`);
    }
    if (message.method === "turn/completed" && threadId) this.completed.add(threadId);
  }

  rpc(method, params = {}) {
    return new Promise((resolve, reject) => {
      const requestId = `${this.name}-${++this.requestSequence}`;
      const timeout = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new Error(`${this.name}: timeout on ${method}`));
      }, 120000);
      this.pending.set(requestId, { resolve, reject, timeout });
      this.socket.send(JSON.stringify({ type: "rpc", requestId, method, params }));
    });
  }

  sendAndWait(type, payload, timeoutMs = 10000) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.socket.off("message", listener);
        reject(new Error(`${this.name}: timeout waiting for ${type}`));
      }, timeoutMs);
      const listener = (raw) => {
        const message = JSON.parse(raw.toString("utf8"));
        if (message.type !== type) return;
        clearTimeout(timeout);
        this.socket.off("message", listener);
        resolve(message);
      };
      this.socket.on("message", listener);
      this.socket.send(JSON.stringify(payload));
    });
  }

  async startThread(cwd, permissionMode = "workspace") {
    this.pendingThreadStarts += 1;
    try {
      const result = await this.rpc("thread/start", {
        cwd,
        runtimeWorkspaceRoots: [cwd],
        permissionMode,
        ephemeral: true,
        experimentalRawEvents: false
      });
      this.ownedThreads.add(result.thread.id);
      return result.thread.id;
    } finally {
      this.pendingThreadStarts -= 1;
      if (this.pendingThreadStarts === 0 && this.deferredThreadNotifications.length) {
        this.foreignNotifications.push(...this.deferredThreadNotifications.filter((entry) => !this.ownedThreads.has(entry.threadId)));
        this.deferredThreadNotifications = [];
      }
    }
  }

  waitForCompletion(threadId) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error(`${this.name}: turn completion timeout`)), 120000);
      const interval = setInterval(() => {
        if (!this.completed.has(threadId)) return;
        clearTimeout(timeout);
        clearInterval(interval);
        resolve();
      }, 100);
    });
  }

  close() {
    this.socket?.close();
  }
}

async function main() {
  const homeResponse = await fetch(`${baseUrl}/`);
  const homeMarkup = await homeResponse.text();
  if (!homeResponse.ok || !homeMarkup.includes('data-shell="claude-code"') || !homeMarkup.includes('/claude-code-shell.css?v=0.21.0') || !homeMarkup.includes('id="mission-deck"') || !homeMarkup.includes('id="theme-preset-grid"') || !homeMarkup.includes('id="open-chat-list"') || !homeMarkup.includes("workspace-board focus-layout") || !homeMarkup.includes("composer-command-center") || !homeMarkup.includes('id="permission-modal"') || !homeMarkup.includes('id="full-access-confirm"') || !homeMarkup.includes('class="message-queue"') || !homeMarkup.includes('class="conversation-layout"') || !homeMarkup.includes('class="session-inspector"') || !homeMarkup.includes('class="conversation-main"') || !homeMarkup.includes('class="ai-companion-dock"') || !homeMarkup.includes('<ai-companion state="idle"') || !homeMarkup.includes('/components/ai-companion-events.js?v=0.21.0') || !homeMarkup.includes('/components/ai-companion.js?v=0.21.0') || !homeMarkup.includes('/nexo.svg') || homeMarkup.includes('class="chat-mascot"') || homeMarkup.includes('class="ai-core-stage"') || homeMarkup.includes('components/hud-controller.js')) {
    throw new Error("Customizable layout markup is unavailable");
  }
  if (!homeMarkup.includes('id="intelligence-modal"') || !homeMarkup.includes('id="memory-form"') || !homeMarkup.includes('id="knowledge-list"') || !homeMarkup.includes('id="mcp-list"') || !homeMarkup.includes('id="enterprise-form"')) {
    throw new Error("Enterprise intelligence markup is unavailable");
  }
  const styleResponse = await fetch(`${baseUrl}/styles.css`);
  const styleSource = await styleResponse.text();
  if (!styleResponse.ok || !styleSource.includes("Codex Hub 0.21.0") || !styleSource.includes("AI Companion 0.19") || !styleSource.includes('ai-companion[data-state="coding"]') || !styleSource.includes('ai-companion[data-state="memoryAccess"]') || !styleSource.includes('body[data-texture="scanlines"]') || !styleSource.includes(".conversation-layout") || !styleSource.includes(".ai-companion-dock") || !styleSource.includes(".permission-mode-grid") || !styleSource.includes(".queued-message") || !styleSource.includes("prefers-reduced-motion")) {
    throw new Error("Customizable layout styles are unavailable");
  }
  const shellResponse = await fetch(`${baseUrl}/claude-code-shell.css`);
  const shellSource = await shellResponse.text();
  if (!shellResponse.ok || !shellSource.includes("Codex Hub 0.21.0") || !shellSource.includes("Claude Code's terminal composition") || !shellSource.includes('body[data-shell="claude-code"] .chat-head') || !shellSource.includes('body[data-shell="claude-code"] .timeline-item.user') || !shellSource.includes('body[data-shell="claude-code"] .composer-wrap') || !shellSource.includes('body[data-shell="claude-code"] .ai-companion-dock') || !shellSource.includes("--cc-width: 1680px") || !shellSource.includes("position: fixed") || !shellSource.includes("@media (max-width: 660px)") || !shellSource.includes("@media (max-height: 700px)")) {
    throw new Error("Claude Code terminal shell is unavailable");
  }
  if (!shellSource.includes(".intelligence-modal") || !shellSource.includes(".memory-workbench") || !shellSource.includes(".mcp-card")) throw new Error("Enterprise intelligence styles are unavailable");
  const mascotResponse = await fetch(`${baseUrl}/nexo.svg`);
  const mascotSource = await mascotResponse.text();
  if (!mascotResponse.ok || !mascotSource.includes("<title id=\"title\">Nexo</title>") || !mascotSource.includes('id="head"') || !mascotSource.includes('id="eye-left"') || !mascotSource.includes('id="code-symbol"') || mascotSource.includes("Claude")) {
    throw new Error("Original Nexo mascot is unavailable");
  }
  const companionBusResponse = await fetch(`${baseUrl}/components/ai-companion-events.js`);
  const companionBusSource = await companionBusResponse.text();
  const companionResponse = await fetch(`${baseUrl}/components/ai-companion.js`);
  const companionSource = await companionResponse.text();
  const requiredCompanionStates = ["idle", "typing", "thinking", "processing", "coding", "searching", "reading", "toolCall", "memoryAccess", "waitingApproval", "success", "error", "sleep", "wakeUp"];
  const requiredCompanionEvents = ["ai:thinking", "ai:processing", "ai:coding", "ai:searching", "ai:reading", "ai:tool", "ai:memory", "ai:success", "ai:error", "ai:approval", "user:typing", "user:message", "ui:look"];
  if (!companionBusResponse.ok || !companionResponse.ok || !companionBusSource.includes("window.AICompanionBus") || !requiredCompanionEvents.every((event) => companionBusSource.includes(`"${event}"`)) || !companionSource.includes("class AICompanionMachine") || !companionSource.includes('customElements.define("ai-companion"') || !requiredCompanionStates.every((companionState) => companionSource.includes(`"${companionState}"`) && styleSource.includes(`data-state="${companionState}"`)) || !companionSource.includes("visibilitychange") || !companionSource.includes("requestAnimationFrame")) {
    throw new Error("AI Companion state machine is unavailable");
  }
  const clientResponse = await fetch(`${baseUrl}/app.js`);
  const clientSource = await clientResponse.text();
  const documentedAliasesVisible = ["/subagents", "/btw", "/quit", "/pet", "/ide-context"]
    .every((command) => clientSource.includes(`name: "${command}"`));
  const operationalShortcutsVisible = ["/explicar", "/refatorar", "/testar", "/documentar", "/segurança", "/deploy"]
    .every((command) => clientSource.includes(`name: "${command}"`));
  if (!clientResponse.ok || !documentedAliasesVisible || !operationalShortcutsVisible || !clientSource.includes('name: "/permission"') || !clientSource.includes('/api/permissions/full-access/setup') || !clientSource.includes('rpc("turn/steer"') || !clientSource.includes("function drainMessageQueue") || !clientSource.includes("function patchTimeline") || !clientSource.includes("const THEME_PRESETS") || !clientSource.includes("const SLASH_COMMANDS") || !clientSource.includes("function loadSkillsForChat") || !clientSource.includes("function compactChat") || !clientSource.includes("thread/tokenUsage/updated") || !clientSource.includes("function applyAppearance") || !clientSource.includes("function syncAppearanceControls") || !clientSource.includes("thread/turns/list") || !clientSource.includes("function loadOlderTurns") || !clientSource.includes("function appendMcpElicitation") || !clientSource.includes("function renderGlobalCommandList") || !clientSource.includes("function companionStateForChat") || !clientSource.includes("function startCompanionItem") || !clientSource.includes("function syncCompanion") || !clientSource.includes('key.toLowerCase() === "k"') || !clientSource.includes('action: "accept"') || !clientSource.includes('request.method === "execCommandApproval"') || !clientSource.includes('request.method === "applyPatchApproval"') || !clientSource.includes("function reloadForServerVersion") || !clientSource.includes('label: "Aprovar uma vez"') || !clientSource.includes('label: "Aprovar nesta sessão"') || clientSource.includes("Cancelar solicitação")) {
    throw new Error("Incremental timeline renderer is unavailable");
  }
  if (!clientSource.includes('action: "remember"') || !clientSource.includes("function openIntelligenceCenter") || !clientSource.includes("/api/mcp/connectors/")) throw new Error("Enterprise intelligence client is unavailable");
  const session = await createSession();
  await expectUpgradeRejected({ Origin: baseUrl }, 401);
  await expectUpgradeRejected({ Origin: "https://evil.example", Cookie: session.cookie }, 403);
  await expectEmbeddedSessionAccepted(session);

  const embeddedApiResponse = await fetch(`${baseUrl}/api/workspaces`, {
    headers: { Origin: baseUrl, "X-Codex-Hub-Session": session.csrf }
  });
  if (!embeddedApiResponse.ok) throw new Error("Embedded-session HTTP authentication failed");

  const missingCsrf = await fetch(`${baseUrl}/api/workspaces`, {
    method: "POST",
    headers: { Cookie: session.cookie, Origin: baseUrl, "Content-Type": "application/json" },
    body: JSON.stringify({ name: "blocked", path: __dirname })
  });
  if (missingCsrf.status !== 403) throw new Error("CSRF protection did not reject a mutating request");

  const workspaceResponse = await apiRequest(session, "/api/workspaces");
  const workspaceResult = await workspaceResponse.json();
  const workspace = workspaceResult.workspaces.find((item) => item.id === "codex-hub") || workspaceResult.workspaces[0];
  if (!workspace) throw new Error("No approved workspace available for smoke test");

  const summaryResponse = await apiRequest(session, `/api/intelligence/summary?workspaceId=${encodeURIComponent(workspace.id)}`);
  const summary = await summaryResponse.json();
  if (!summaryResponse.ok || !summary.memory || summary.knowledge.length < 4 || summary.connectors.length < 4 || summary.policy.data.localOnly !== true) throw new Error("Enterprise intelligence summary failed");

  const memoryResponse = await apiRequest(session, "/api/memories", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ workspaceId: workspace.id, title: "Smoke DAX", content: "A medida usa CALCULATE para contexto de filtro.", tags: ["dax"], scope: "workspace" })
  });
  const memoryResult = await memoryResponse.json();
  if (memoryResponse.status !== 201 || !memoryResult.memory?.id) throw new Error("Memory creation failed");
  const memorySearchResponse = await apiRequest(session, `/api/memories?workspaceId=${encodeURIComponent(workspace.id)}&query=CALCULATE`);
  const memorySearch = await memorySearchResponse.json();
  if (!memorySearchResponse.ok || memorySearch.memories[0]?.id !== memoryResult.memory.id) throw new Error("Memory retrieval failed");
  const secretResponse = await apiRequest(session, "/api/memories", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ workspaceId: workspace.id, title: "Segredo", content: "client_secret=supersecret123" })
  });
  if (secretResponse.status !== 400) throw new Error("Memory secret guard failed");
  const deleteMemoryResponse = await apiRequest(session, `/api/memories/${encodeURIComponent(memoryResult.memory.id)}?workspaceId=${encodeURIComponent(workspace.id)}`, { method: "DELETE" });
  if (!deleteMemoryResponse.ok) throw new Error("Memory deletion failed");

  const connectorResponse = await apiRequest(session, "/api/mcp/connectors");
  const connectors = await connectorResponse.json();
  if (!connectorResponse.ok || !connectors.connectors.every((connector) => connector.access === "read")) throw new Error("MCP read-only default failed");
  const elevatedConnectorResponse = await apiRequest(session, "/api/mcp/connectors/azure", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ enabled: true, access: "write" })
  });
  if (elevatedConnectorResponse.status !== 400) throw new Error("MCP elevation guard failed");

  const clientA = new HubClient("client-a", session);
  const clientB = new HubClient("client-b", session);
  const [helloA, helloB] = await Promise.all([clientA.connect(), clientB.connect()]);
  if (!helloA.permission || typeof helloA.permission.configured !== "boolean") throw new Error("Permission state was not advertised during WebSocket hello");
  const capabilitiesA = helloA.control?.capabilities || {};
  const capabilitiesB = helloB.control?.capabilities || {};
  const browserInstalled = Boolean(capabilitiesA.browser);
  const computerInstalled = Boolean(capabilitiesA.computerInstalled);
  const computerNativeConnected = Boolean(capabilitiesA.computerNativeConnected);
  const controlCapabilities = Boolean(
    typeof capabilitiesA.browser === "boolean"
    && capabilitiesA.browserExtensionRequired === false
    && (!browserInstalled || capabilitiesA.browserProvider === "brave-playwright")
    && typeof capabilitiesA.computerInstalled === "boolean"
    && typeof capabilitiesA.computerNativeConfigured === "boolean"
    && typeof capabilitiesA.computerNativeConnected === "boolean"
    && typeof capabilitiesB.computerInstalled === "boolean"
  );
  if (!controlCapabilities) throw new Error("Control capability state is incomplete");

  let enabledDurationHours = null;
  if (computerInstalled) {
    const enabledControl = await clientA.sendAndWait("controlState", { type: "controlSession", action: "enableComputer" });
    if (!(enabledControl.computerEnabledUntil > Date.now())) throw new Error("Computer control session was not enabled");
    enabledDurationHours = (enabledControl.computerEnabledUntil - Date.now()) / 3600000;
    if (enabledDurationHours < 7.9 || enabledDurationHours > 8.1) {
      throw new Error(`Computer control session duration is ${enabledDurationHours.toFixed(2)}h instead of 8h`);
    }
  }
  const stoppedControl = await clientA.sendAndWait("controlStopped", { type: "emergencyStop" });
  if (typeof stoppedControl.interrupted !== "number") throw new Error("Emergency stop did not respond");

  let disallowedMethodBlocked = false;
  try {
    await clientA.rpc("account/read", {});
  } catch (error) {
    disallowedMethodBlocked = /não permitido/i.test(error.message);
  }
  if (!disallowedMethodBlocked) throw new Error("RPC allowlist did not block an unknown method");

  let unapprovedPathBlocked = false;
  try {
    await clientA.startThread(path.parse(workspace.path).root);
  } catch (error) {
    unapprovedPathBlocked = /não está aprovada/i.test(error.message);
  }
  if (!unapprovedPathBlocked) throw new Error("Workspace allowlist did not block a disk root");

  let unauthorizedFullAccessBlocked = false;
  try {
    await clientA.startThread(workspace.path, "full");
  } catch (error) {
    unauthorizedFullAccessBlocked = /full access não está autorizado/i.test(error.message);
  }
  if (!unauthorizedFullAccessBlocked) throw new Error("Full access was accepted without local authorization");

  let fullAccessAuthorization = false;
  let revokedFullThreadBlocked = false;
  let firstRunSetup = false;
  if (firstRunTestCode) {
    const mismatchResponse = await apiRequest(session, "/api/permissions/full-access/setup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: firstRunTestCode, confirmation: "000000" })
    });
    if (mismatchResponse.status !== 400) throw new Error("First-run setup accepted a mismatched confirmation");
    const setupResponse = await apiRequest(session, "/api/permissions/full-access/setup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: firstRunTestCode, confirmation: firstRunTestCode })
    });
    const setupResult = await setupResponse.json();
    firstRunSetup = Boolean(setupResponse.status === 201 && setupResult.permission?.configured && setupResult.permission?.active);
    fullAccessAuthorization = firstRunSetup;
    if (!firstRunSetup) throw new Error("First-run Full access setup failed");
  } else if (fullAccessTestCode) {
    const invalidPermissionResponse = await apiRequest(session, "/api/permissions/full-access", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: "000000" })
    });
    if (invalidPermissionResponse.status !== 403) throw new Error("Invalid Full access code was not rejected");
    const authorizationResponse = await apiRequest(session, "/api/permissions/full-access", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: fullAccessTestCode })
    });
    const authorizationResult = await authorizationResponse.json();
    fullAccessAuthorization = Boolean(authorizationResponse.ok && authorizationResult.permission?.active);
    if (!fullAccessAuthorization) throw new Error("Valid Full access test authorization failed");
  }
  if (fullAccessAuthorization) {
    const fullThread = await clientA.startThread(workspace.path, "full");
    const revokeResponse = await apiRequest(session, "/api/permissions/full-access", { method: "DELETE" });
    if (!revokeResponse.ok) throw new Error("Full access revocation failed");
    try {
      await clientA.rpc("turn/start", {
      threadId: fullThread,
      clientUserMessageId: crypto.randomUUID(),
      permissionMode: "full",
      input: [{ type: "text", text: "Não executar", text_elements: [] }]
      });
    } catch (error) {
      revokedFullThreadBlocked = /autorização de Full access expirou/i.test(error.message);
    }
    if (!revokedFullThreadBlocked) throw new Error("A revoked Full access thread could still execute");
  }

  const [threadA, threadB] = await Promise.all([
    clientA.startThread(workspace.path),
    clientB.startThread(workspace.path)
  ]);
  let steerWithoutTurnBlocked = false;
  try {
    await clientA.rpc("turn/steer", {
      threadId: threadA,
      expectedTurnId: "turn-not-active",
      input: [{ type: "text", text: "Manter na fila", text_elements: [] }]
    });
  } catch (error) {
    steerWithoutTurnBlocked = /não existe um turno ativo/i.test(error.message);
  }
  if (!steerWithoutTurnBlocked) throw new Error("turn/steer did not enforce an active turn");
  const queueThread = await clientA.startThread(workspace.path);
  const queueTurn = await clientA.rpc("turn/start", {
    threadId: queueThread,
    clientUserMessageId: crypto.randomUUID(),
    controlMode: "code",
    input: [{ type: "text", text: "Leia package.json e README.md deste workspace antes de responder somente QUEUE-BASE.", text_elements: [] }]
  });
  await clientA.rpc("turn/steer", {
    threadId: queueThread,
    expectedTurnId: queueTurn.turn.id,
    input: [{ type: "text", text: "Acrescente QUEUE-STEER na mesma resposta final.", text_elements: [] }]
  });
  await clientA.waitForCompletion(queueThread);
  const liveTurnSteering = /QUEUE-STEER/i.test(clientA.answers.get(queueThread) || "");
  if (!liveTurnSteering) throw new Error("The active turn did not incorporate the steered queue message");
  const skillCatalog = await clientA.rpc("skills/list", { cwds: [workspace.path], forceReload: false });
  const skillCatalogReady = Array.isArray(skillCatalog?.data)
    && skillCatalog.data.some((entry) => Array.isArray(entry.skills));
  if (!skillCatalogReady) throw new Error("Codex skill catalog was not returned for the approved workspace");
  const fileSearch = await clientA.rpc("fuzzyFileSearch", { query: "package", roots: [workspace.path] });
  const workspaceFileSearch = Array.isArray(fileSearch?.files);
  if (!workspaceFileSearch) throw new Error("Workspace file search did not return a file array");
  let forgedSkillBlocked = false;
  try {
    await clientA.rpc("turn/start", {
      threadId: threadA,
      clientUserMessageId: crypto.randomUUID(),
      input: [
        { type: "text", text: "Não executar", text_elements: [] },
        { type: "skill", name: "forged", path: __filename }
      ]
    });
  } catch (error) {
    forgedSkillBlocked = /catálogo autorizado/i.test(error.message);
  }
  if (!forgedSkillBlocked) throw new Error("Turn validation accepted a skill outside the returned catalog");
  let contextRootBlocked = false;
  try {
    await clientA.rpc("fuzzyFileSearch", { query: "Windows", roots: [path.parse(workspace.path).root] });
  } catch (error) {
    contextRootBlocked = /fora dos workspaces aprovados/i.test(error.message);
  }
  if (!contextRootBlocked) throw new Error("Context file search accepted an unapproved disk root");
  let computerGateBlocked = false;
  try {
    await clientB.rpc("turn/start", {
      threadId: threadB,
      clientUserMessageId: crypto.randomUUID(),
      controlMode: "computer",
      input: [{ type: "text", text: "Não executar", text_elements: [] }]
    });
  } catch (error) {
    computerGateBlocked = /sessão temporária/i.test(error.message);
  }
  if (!computerGateBlocked) throw new Error("Computer control gate did not block an inactive session");
  if (computerInstalled) {
    const activeComputerRoute = await clientA.sendAndWait("controlState", { type: "controlSession", action: "enableComputer" });
    if (!(activeComputerRoute.computerEnabledUntil > Date.now())) throw new Error("Computer control route could not be activated");
  }
  let computerNativeGateBlocked = false;
  if (computerInstalled && !computerNativeConnected) {
    try {
      await clientA.rpc("turn/start", {
        threadId: threadA,
        clientUserMessageId: crypto.randomUUID(),
        controlMode: "computer",
        input: [{ type: "text", text: "Não executar", text_elements: [] }]
      });
    } catch (error) {
      computerNativeGateBlocked = /serviço nativo.+desconectado/i.test(error.message);
    }
    if (!computerNativeGateBlocked) throw new Error("Computer route did not report the disconnected native service");
  }
  await Promise.all([
    clientA.rpc("turn/start", {
      threadId: threadA,
      clientUserMessageId: crypto.randomUUID(),
      controlMode: computerInstalled && computerNativeConnected ? "computer" : "code",
      input: [{ type: "text", text: "Sem controlar nenhum aplicativo, responda somente HUB-A", text_elements: [] }]
    }),
    clientB.rpc("turn/start", {
      threadId: threadB,
      clientUserMessageId: crypto.randomUUID(),
      controlMode: browserInstalled ? "browser" : "code",
      input: [{ type: "text", text: "Sem abrir o navegador, responda somente HUB-B", text_elements: [] }]
    })
  ]);
  await Promise.all([clientA.waitForCompletion(threadA), clientB.waitForCompletion(threadB)]);
  await clientA.sendAndWait("controlStopped", { type: "emergencyStop" });
  const storedThreads = await clientA.rpc("thread/list", { limit: 1, sortKey: "recency_at", sortDirection: "desc", archived: false });
  let paginatedHistory = true;
  const storedThread = storedThreads.data?.[0];
  if (storedThread?.id) {
    // Reading an existing thread intentionally subscribes this client to it.
    // Mark ownership before the RPC so notifications racing the RPC result are
    // not misclassified as a cross-client leak by the test harness.
    clientA.ownedThreads.add(storedThread.id);
    await clientA.rpc("thread/read", { threadId: storedThread.id, includeTurns: false });
    const paginatedTurns = await clientA.rpc("thread/turns/list", {
      threadId: storedThread.id,
      limit: 20,
      sortDirection: "desc",
      itemsView: "full"
    });
    paginatedHistory = Array.isArray(paginatedTurns.data);
    if (!paginatedHistory) throw new Error("Paginated thread history did not return a data array");
  }

  const auditResponse = await apiRequest(session, "/api/audit?limit=20");
  const auditResult = await auditResponse.json();
  const result = {
    ok: threadA !== threadB
      && clientA.completed.has(threadA)
      && clientB.completed.has(threadB)
      && unauthorizedFullAccessBlocked
      && (!(fullAccessTestCode || firstRunTestCode) || (fullAccessAuthorization && revokedFullThreadBlocked))
      && steerWithoutTurnBlocked
      && liveTurnSteering
      && clientA.foreignNotifications.length === 0
      && clientB.foreignNotifications.length === 0
      && Array.isArray(auditResult.records),
    authenticatedWebSocket: true,
    originValidation: true,
    csrfProtection: true,
    embeddedSessionFallback: true,
    customizableLayout: true,
    permissionCenter: true,
    unauthorizedFullAccessBlocked,
    fullAccessAuthorization: (fullAccessTestCode || firstRunTestCode) ? fullAccessAuthorization : "skipped",
    firstRunSetup: firstRunTestCode ? firstRunSetup : "skipped",
    revokedFullThreadBlocked: (fullAccessTestCode || firstRunTestCode) ? revokedFullThreadBlocked : "skipped",
    queuedTurnSteering: liveTurnSteering,
    slashCommandCenter: true,
    skillCatalog: skillCatalogReady,
    forgedSkillBlocked,
    adaptiveContext: true,
    workspaceFileSearch,
    contextRootBlocked,
    missionDeck: true,
    claudeCodeTerminalShell: true,
    claudeCodeShellV2: true,
    originalNexoMascot: true,
    interactiveNexoMascot: true,
    aiCompanionStateMachine: true,
    memoryEngine: true,
    memorySecretGuard: true,
    knowledgePacks: summary.knowledge.length,
    mcpControlCenter: summary.connectors.length,
    mcpElevationGuard: true,
    enterprisePolicy: summary.policy.data.localOnly === true,
    incrementalTimeline: true,
    paginatedHistory,
    controlCapabilities,
    computerNativeConnected,
    computerNativeGate: !computerInstalled || computerNativeConnected || computerNativeGateBlocked,
    temporaryComputerGate: computerGateBlocked,
    computerSessionHours: enabledDurationHours === null ? "skipped" : Number(enabledDurationHours.toFixed(2)),
    emergencyStop: typeof stoppedControl.interrupted === "number",
    browserSkillRoute: browserInstalled ? clientB.completed.has(threadB) : "skipped",
    computerSkillRoute: computerInstalled && computerNativeConnected ? clientA.completed.has(threadA) : "skipped",
    rpcAllowlist: disallowedMethodBlocked,
    workspaceAllowlist: unapprovedPathBlocked,
    distinctThreads: threadA !== threadB,
    isolatedClients: clientA.foreignNotifications.length === 0 && clientB.foreignNotifications.length === 0,
    answerA: (clientA.answers.get(threadA) || "").trim(),
    answerB: (clientB.answers.get(threadB) || "").trim(),
    auditRecords: auditResult.records?.length || 0
  };
  console.log(JSON.stringify(result, null, 2));
  clientA.close();
  clientB.close();
  process.exit(result.ok ? 0 : 1);
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
