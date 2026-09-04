"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { permissionModeFromWire, permissionWireSettings } = require("./permission-mode");

test("Full access uses sticky turn overrides supported by Codex App Server", () => {
  const settings = permissionWireSettings("full", "C:\\workspace");
  assert.deepEqual(settings, {
    permissionMode: "full",
    approvalPolicy: "never",
    sandbox: "danger-full-access",
    sandboxPolicy: { type: "dangerFullAccess" }
  });
  assert.equal(permissionModeFromWire(settings), "full");
});

test("Workspace and read-only use their matching thread and turn policies", () => {
  const workspace = permissionWireSettings("workspace", "C:\\workspace");
  assert.equal(workspace.approvalPolicy, "on-request");
  assert.equal(workspace.sandbox, "workspace-write");
  assert.deepEqual(workspace.sandboxPolicy, {
    type: "workspaceWrite",
    writableRoots: ["C:\\workspace"],
    networkAccess: false
  });
  assert.equal(permissionModeFromWire(workspace), "workspace");

  const readOnly = permissionWireSettings("read-only");
  assert.equal(readOnly.sandbox, "read-only");
  assert.deepEqual(readOnly.sandboxPolicy, { type: "readOnly", networkAccess: false });
  assert.equal(permissionModeFromWire(readOnly), "read-only");
});

test("Unknown modes fail closed to Workspace", () => {
  assert.equal(permissionWireSettings("unknown").permissionMode, "workspace");
  assert.equal(permissionModeFromWire({}), "workspace");
});
