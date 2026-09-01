"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

const appRoot = __dirname;
const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "codex-hub-smoke-"));
const testCode = String(crypto.randomInt(100000, 1000000));
let serverProcess = null;
let suiteProcess = null;
let finished = false;

function waitForExit(child) {
  return new Promise((resolve) => child.once("exit", (code, signal) => resolve({ code, signal })));
}

function startIsolatedServer() {
  return new Promise((resolve, reject) => {
    serverProcess = spawn(process.execPath, [path.join(appRoot, "server.js")], {
      cwd: appRoot,
      env: {
        ...process.env,
        HOST: "127.0.0.1",
        PORT: "0",
        HUB_DATA_DIR: temporaryRoot
      },
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"]
    });

    let settled = false;
    let diagnostics = "";
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error(`O servidor isolado não iniciou a tempo.\n${diagnostics.slice(-4000)}`));
    }, 30000);

    const inspectOutput = (chunk) => {
      const text = chunk.toString("utf8");
      diagnostics = `${diagnostics}${text}`.slice(-8000);
      const match = text.match(/Codex Hub listening on (http:\/\/127\.0\.0\.1:\d+)/);
      if (!match || settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve(match[1]);
    };

    serverProcess.stdout.on("data", inspectOutput);
    serverProcess.stderr.on("data", inspectOutput);
    serverProcess.once("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      reject(error);
    });
    serverProcess.once("exit", (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      reject(new Error(`O servidor isolado encerrou antes de ficar pronto (${signal || code || "desconhecido"}).\n${diagnostics.slice(-4000)}`));
    });
  });
}

async function stopChild(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  child.kill("SIGTERM");
  const stopped = await Promise.race([
    waitForExit(child).then(() => true),
    new Promise((resolve) => setTimeout(() => resolve(false), 4000))
  ]);
  if (!stopped && child.exitCode === null) child.kill("SIGKILL");
}

async function cleanup() {
  await stopChild(suiteProcess);
  await stopChild(serverProcess);
  const safeTemporaryRoot = path.resolve(temporaryRoot);
  const systemTemporaryRoot = `${path.resolve(os.tmpdir())}${path.sep}`;
  if (safeTemporaryRoot.startsWith(systemTemporaryRoot) && path.basename(safeTemporaryRoot).startsWith("codex-hub-smoke-")) {
    fs.rmSync(safeTemporaryRoot, { recursive: true, force: true });
  }
}

async function main() {
  const serverUrl = await startIsolatedServer();
  const websocketUrl = serverUrl.replace(/^http:/, "ws:") + "/ws";
  suiteProcess = spawn(process.execPath, [path.join(appRoot, "smoke-test.js")], {
    cwd: appRoot,
    env: {
      ...process.env,
      HUB_WS_URL: websocketUrl,
      HUB_TEST_FIRST_RUN_CODE: testCode
    },
    windowsHide: true,
    stdio: "inherit"
  });
  const result = await waitForExit(suiteProcess);
  finished = true;
  await cleanup();
  process.exit(result.code ?? 1);
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, async () => {
    if (finished) return;
    finished = true;
    await cleanup();
    process.exit(130);
  });
}

main().catch(async (error) => {
  console.error(error.stack || error.message);
  await cleanup();
  process.exit(1);
});
