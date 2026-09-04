"use strict";

function automaticFullAccessApproval(message, authorized) {
  if (!authorized) return null;
  const params = message?.params || {};
  if (message?.method === "item/commandExecution/requestApproval") {
    const decisions = Array.isArray(params.availableDecisions) ? params.availableDecisions : [];
    if (!decisions.length || decisions.includes("accept")) return { decision: "accept" };
    if (decisions.includes("acceptForSession")) return { decision: "acceptForSession" };
  }
  if (message?.method === "item/fileChange/requestApproval") return { decision: "accept" };
  if (message?.method === "item/permissions/requestApproval") {
    return { permissions: params.permissions || {}, scope: "session" };
  }
  if (message?.method === "execCommandApproval") return { decision: "approved" };
  if (message?.method === "applyPatchApproval") return { decision: "approved" };
  return null;
}

module.exports = { automaticFullAccessApproval };
