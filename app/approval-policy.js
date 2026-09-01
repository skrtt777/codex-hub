"use strict";

function commandApprovalLooksSensitive(params = {}) {
  if (params.networkApprovalContext || params.proposedExecpolicyAmendment || params.proposedNetworkPolicyAmendments?.length) return true;
  if (params.additionalPermissions?.network?.enabled === true) return true;
  const command = Array.isArray(params.command) ? params.command.join(" ") : String(params.command || "");
  return /(?:\brm\b|remove-item|\bdel\b|\brmdir\b|format(?:\.com)?\b|diskpart|shutdown|restart-computer|stop-computer|stop-process|taskkill|git\s+push|gh\s+pr\s+create|npm\s+publish|pnpm\s+publish|curl\b|wget\b|invoke-webrequest|send-mailmessage|discord|slack|outlook|cmdkey|credential|password|secret|token|winget\s+install|choco\s+install)/i.test(command);
}

function automaticFullAccessApproval(message, authorized) {
  if (!authorized) return null;
  const params = message?.params || {};
  if (message?.method === "item/commandExecution/requestApproval") {
    const decisions = Array.isArray(params.availableDecisions) ? params.availableDecisions : [];
    const acceptAvailable = !decisions.length || decisions.includes("accept");
    if (acceptAvailable && !commandApprovalLooksSensitive(params)) return { decision: "accept" };
  }
  if (message?.method === "item/fileChange/requestApproval" && !params.grantRoot) return { decision: "accept" };
  if (message?.method === "execCommandApproval" && !commandApprovalLooksSensitive(params)) return { decision: "approved" };
  if (message?.method === "applyPatchApproval" && !params.grantRoot) return { decision: "approved" };
  return null;
}

module.exports = { automaticFullAccessApproval, commandApprovalLooksSensitive };
