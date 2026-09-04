"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { automaticFullAccessApproval } = require("./approval-policy");

test("Full access auto-approves current and legacy permission requests", () => {
  assert.deepEqual(automaticFullAccessApproval({ method: "item/commandExecution/requestApproval", params: { command: "pnpm run check", availableDecisions: ["accept", "decline"] } }, true), { decision: "accept" });
  assert.deepEqual(automaticFullAccessApproval({ method: "item/commandExecution/requestApproval", params: { command: "pnpm run check", availableDecisions: ["acceptForSession", "decline"] } }, true), { decision: "acceptForSession" });
  assert.deepEqual(automaticFullAccessApproval({ method: "item/fileChange/requestApproval", params: {} }, true), { decision: "accept" });
  assert.deepEqual(automaticFullAccessApproval({ method: "item/permissions/requestApproval", params: { permissions: { network: { enabled: true } } } }, true), { permissions: { network: { enabled: true } }, scope: "session" });
  assert.deepEqual(automaticFullAccessApproval({ method: "execCommandApproval", params: { command: ["node", "--version"] } }, true), { decision: "approved" });
  assert.deepEqual(automaticFullAccessApproval({ method: "applyPatchApproval", params: {} }, true), { decision: "approved" });
});

test("Full access also covers elevated commands after the local code gate", () => {
  assert.deepEqual(automaticFullAccessApproval({ method: "item/commandExecution/requestApproval", params: { command: "curl https://example.com" } }, true), { decision: "accept" });
  assert.deepEqual(automaticFullAccessApproval({ method: "item/fileChange/requestApproval", params: { grantRoot: "C:\\" } }, true), { decision: "accept" });
});

test("Automatic approval requires an active authorized Full access thread", () => {
  assert.equal(automaticFullAccessApproval({ method: "item/fileChange/requestApproval", params: {} }, false), null);
  assert.equal(automaticFullAccessApproval({ method: "mcpServer/elicitation/request", params: {} }, true), null);
});
