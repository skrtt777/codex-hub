"use strict";

const fs = require("node:fs");
const path = require("node:path");

const ROLES = Object.freeze({
  admin: ["policy:read", "policy:write", "memory:read", "memory:write", "connector:read", "connector:write", "audit:read"],
  connector_admin: ["policy:read", "memory:read", "connector:read", "connector:write", "audit:read"],
  operator: ["policy:read", "memory:read", "memory:write", "connector:read"],
  viewer: ["policy:read", "memory:read", "connector:read"]
});

function defaults() {
  return {
    schemaVersion: 1,
    organization: { id: "local", name: "Organização local" },
    identity: { provider: "local", entraTenantId: null },
    defaultRole: "admin",
    data: { localOnly: true, telemetry: false, retentionDays: 365, allowCloudKnowledge: false },
    connectors: { defaultAccess: "read", requireApprovalForWrites: true, allowed: [] },
    updatedAt: null
  };
}

class EnterprisePolicyStore {
  constructor(filePath, options = {}) {
    this.filePath = path.resolve(filePath);
    this.audit = typeof options.audit === "function" ? options.audit : () => {};
    this.value = this.load();
  }

  load() {
    let value;
    try { value = JSON.parse(fs.readFileSync(this.filePath, "utf8")); } catch { value = {}; }
    const base = defaults();
    return {
      ...base,
      ...value,
      organization: { ...base.organization, ...(value.organization || {}) },
      identity: { ...base.identity, ...(value.identity || {}) },
      data: { ...base.data, ...(value.data || {}) },
      connectors: { ...base.connectors, ...(value.connectors || {}) }
    };
  }

  get() { return structuredClone(this.value); }

  permissions(role) { return [...(ROLES[role] || ROLES.viewer)]; }

  can(role, permission) { return this.permissions(role).includes(permission); }

  update(input = {}) {
    const next = this.get();
    if (input.organization?.name !== undefined) {
      const name = String(input.organization.name || "").trim();
      if (!name || name.length > 120) throw new Error("Nome da organização inválido.");
      next.organization.name = name;
    }
    if (input.defaultRole !== undefined) {
      if (!ROLES[input.defaultRole]) throw new Error("Papel padrão inválido.");
      next.defaultRole = input.defaultRole;
    }
    if (input.data) {
      if (input.data.localOnly !== undefined) next.data.localOnly = input.data.localOnly === true;
      if (input.data.telemetry !== undefined) next.data.telemetry = input.data.telemetry === true;
      if (input.data.allowCloudKnowledge !== undefined) next.data.allowCloudKnowledge = input.data.allowCloudKnowledge === true;
      if (input.data.retentionDays !== undefined) next.data.retentionDays = Math.min(3650, Math.max(1, Number(input.data.retentionDays) || 365));
    }
    if (input.connectors) {
      if (["read", "query", "write", "admin"].includes(input.connectors.defaultAccess)) next.connectors.defaultAccess = input.connectors.defaultAccess;
      if (input.connectors.requireApprovalForWrites !== undefined) next.connectors.requireApprovalForWrites = input.connectors.requireApprovalForWrites === true;
      if (Array.isArray(input.connectors.allowed)) next.connectors.allowed = [...new Set(input.connectors.allowed.map(String))].slice(0, 50);
    }
    next.updatedAt = new Date().toISOString();
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const temporary = `${this.filePath}.${process.pid}.tmp`;
    fs.writeFileSync(temporary, `${JSON.stringify(next, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
    fs.renameSync(temporary, this.filePath);
    this.value = next;
    this.audit("enterprise.policy_updated", { localOnly: next.data.localOnly, telemetry: next.data.telemetry, defaultRole: next.defaultRole });
    return this.get();
  }
}

module.exports = { EnterprisePolicyStore, ENTERPRISE_ROLES: ROLES };
