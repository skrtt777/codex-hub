"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { automaticFullAccessApproval, commandApprovalLooksSensitive } = require("./approval-policy");

test("Full access auto-approves routine current and legacy requests", () => {
  assert.deepEqual(automaticFullAccessApproval({ method: "item/commandExecution/requestApproval", params: { command: "pnpm run check", availableDecisions: ["accept", "decline"] } }, true), { decision: "accept" });
  assert.deepEqual(automaticFullAccessApproval({ method: "item/fileChange/requestApproval", params: {} }, true), { decision: "accept" });
  assert.deepEqual(automaticFullAccessApproval({ method: "execCommandApproval", params: { command: ["node", "--version"] } }, true), { decision: "approved" });
  assert.deepEqual(automaticFullAccessApproval({ method: "applyPatchApproval", params: {} }, true), { decision: "approved" });
});

test("Full access never bypasses explicit risk signals", () => {
  assert.equal(automaticFullAccessApproval({ method: "item/commandExecution/requestApproval", params: { command: "curl https://example.com" } }, true), null);
  assert.equal(automaticFullAccessApproval({ method: "item/commandExecution/requestApproval", params: { command: "node tool.js", networkApprovalContext: {} } }, true), null);
  assert.equal(automaticFullAccessApproval({ method: "item/commandExecution/requestApproval", params: { command: "node tool.js", additionalPermissions: { network: { enabled: true } } } }, true), null);
  assert.equal(automaticFullAccessApproval({ method: "item/fileChange/requestApproval", params: { grantRoot: "C:\\" } }, true), null);
  assert.equal(automaticFullAccessApproval({ method: "item/permissions/requestApproval", params: {} }, true), null);
  assert.equal(commandApprovalLooksSensitive({ command: "git push origin main" }), true);
});

test("Automatic approval requires an active authorized Full access thread", () => {
  assert.equal(automaticFullAccessApproval({ method: "item/fileChange/requestApproval", params: {} }, false), null);
  assert.equal(automaticFullAccessApproval({ method: "mcpServer/elicitation/request", params: {} }, true), null);
});
