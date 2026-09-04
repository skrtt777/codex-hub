"use strict";

const PERMISSION_MODES = new Set(["read-only", "workspace", "full"]);

function permissionWireSettings(requestedMode, workspaceRoot = null) {
  const permissionMode = PERMISSION_MODES.has(requestedMode) ? requestedMode : "workspace";
  if (permissionMode === "full") {
    return {
      permissionMode,
      approvalPolicy: "never",
      sandbox: "danger-full-access",
      sandboxPolicy: { type: "dangerFullAccess" }
    };
  }
  if (permissionMode === "read-only") {
    return {
      permissionMode,
      approvalPolicy: "on-request",
      sandbox: "read-only",
      sandboxPolicy: { type: "readOnly", networkAccess: false }
    };
  }
  return {
    permissionMode: "workspace",
    approvalPolicy: "on-request",
    sandbox: "workspace-write",
    sandboxPolicy: {
      type: "workspaceWrite",
      writableRoots: workspaceRoot ? [workspaceRoot] : [],
      networkAccess: false
    }
  };
}

function permissionModeFromWire(params = {}) {
  if (params.sandboxPolicy?.type === "dangerFullAccess" || params.sandbox === "danger-full-access") return "full";
  if (params.sandboxPolicy?.type === "readOnly" || params.sandbox === "read-only") return "read-only";
  return "workspace";
}

module.exports = { PERMISSION_MODES, permissionModeFromWire, permissionWireSettings };
