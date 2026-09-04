"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const SCOPES = new Set(["user", "workspace", "organization"]);
const KINDS = new Set(["preference", "decision", "fact", "runbook", "glossary", "lesson"]);
const SENSITIVITIES = new Set(["public", "internal", "confidential", "restricted"]);
const MAX_CONTENT = 20_000;
const MAX_RECORDS = 5_000;
const STOP_WORDS = new Set(["a", "ao", "aos", "as", "com", "como", "da", "das", "de", "do", "dos", "e", "em", "esse", "esta", "isso", "na", "nas", "no", "nos", "o", "os", "ou", "para", "por", "que", "se", "um", "uma"]);

function cleanText(value, maximum, field) {
  const result = String(value || "").trim();
  if (!result || result.length > maximum) throw new Error(`${field} deve ter entre 1 e ${maximum} caracteres.`);
  return result;
}

function cleanSlug(value, fallback) {
  const result = String(value || fallback || "").trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9._-]{0,79}$/.test(result)) throw new Error("Identificador de escopo inválido.");
  return result;
}

function containsSecret(value) {
  const source = String(value || "");
  return [
    /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/i,
    /\b(?:sk|pk)-(?:proj-)?[A-Za-z0-9_-]{20,}\b/,
    /\bgithub_pat_[A-Za-z0-9_]{20,}\b/i,
    /\bgh[pousr]_[A-Za-z0-9]{20,}\b/,
    /\bAKIA[0-9A-Z]{16}\b/,
    /\b(?:password|passwd|senha|secret|client_secret|access_token|refresh_token)\s*[:=]\s*[^\s]{8,}/i
  ].some((pattern) => pattern.test(source));
}

function tokenize(value) {
  return String(value || "").toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .split(/[^a-z0-9]+/).filter((item) => item.length > 1 && !STOP_WORDS.has(item)).slice(0, 32);
}

function normalizeTags(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => String(item || "").trim().toLocaleLowerCase("pt-BR")).filter(Boolean))]
    .slice(0, 12).map((item) => item.slice(0, 40));
}

function normalizeSource(value = {}) {
  const type = ["user", "file", "chat", "import", "system"].includes(value.type) ? value.type : "user";
  return {
    type,
    label: String(value.label || "Entrada manual").trim().slice(0, 160),
    reference: String(value.reference || "").trim().slice(0, 500),
    hash: String(value.hash || "").trim().slice(0, 128)
  };
}

class MemoryStore {
  constructor(root, options = {}) {
    this.root = path.resolve(root);
    this.eventsPath = path.join(this.root, "events.jsonl");
    this.audit = typeof options.audit === "function" ? options.audit : () => {};
    this.clock = typeof options.clock === "function" ? options.clock : () => new Date();
    this.records = new Map();
    fs.mkdirSync(this.root, { recursive: true });
    this.load();
  }

  load() {
    this.records.clear();
    let source = "";
    try { source = fs.readFileSync(this.eventsPath, "utf8"); } catch { return; }
    for (const line of source.split(/\r?\n/)) {
      if (!line.trim()) continue;
      try {
        const event = JSON.parse(line);
        if (event.type === "upsert" && event.record?.id) this.records.set(event.record.id, event.record);
        if (event.type === "delete" && event.id) this.records.delete(event.id);
      } catch {
        // Ignore an incomplete trailing event; previous records remain recoverable.
      }
    }
  }

  append(event) {
    fs.mkdirSync(this.root, { recursive: true });
    fs.appendFileSync(this.eventsPath, `${JSON.stringify(event)}\n`, { encoding: "utf8", mode: 0o600 });
  }

  create(input, actor = {}) {
    if (this.records.size >= MAX_RECORDS) throw new Error("O limite local de memórias foi atingido. Exporte ou remova registros antigos.");
    const title = cleanText(input.title, 160, "Título");
    const content = cleanText(input.content, MAX_CONTENT, "Conteúdo");
    if (containsSecret(`${title}\n${content}`)) throw new Error("A memória parece conter uma credencial ou segredo e foi recusada.");
    const now = this.clock().toISOString();
    const scope = SCOPES.has(input.scope) ? input.scope : "workspace";
    const kind = KINDS.has(input.kind) ? input.kind : "fact";
    const sensitivity = SENSITIVITIES.has(input.sensitivity) ? input.sensitivity : "internal";
    const retentionDays = Math.min(3650, Math.max(1, Number(input.retentionDays) || 365));
    const record = {
      id: crypto.randomUUID(),
      tenantId: cleanSlug(actor.tenantId, "local"),
      userId: cleanSlug(actor.userId, "local-user"),
      workspaceId: scope === "workspace" ? cleanSlug(actor.workspaceId, "default") : null,
      scope,
      kind,
      title,
      content,
      tags: normalizeTags(input.tags),
      sensitivity,
      confidence: Math.min(1, Math.max(0, Number(input.confidence) || 0.8)),
      source: normalizeSource(input.source),
      createdAt: now,
      updatedAt: now,
      expiresAt: new Date(this.clock().getTime() + retentionDays * 86400000).toISOString(),
      version: 1
    };
    this.append({ type: "upsert", timestamp: now, record });
    this.records.set(record.id, record);
    this.audit("memory.created", { memoryId: record.id, scope, kind, sensitivity });
    return structuredClone(record);
  }

  update(id, input, actor = {}) {
    const current = this.records.get(String(id));
    if (!current || !this.canAccess(current, actor)) throw new Error("Memória não encontrada.");
    const title = input.title === undefined ? current.title : cleanText(input.title, 160, "Título");
    const content = input.content === undefined ? current.content : cleanText(input.content, MAX_CONTENT, "Conteúdo");
    if (containsSecret(`${title}\n${content}`)) throw new Error("A memória parece conter uma credencial ou segredo e foi recusada.");
    const record = {
      ...current,
      title,
      content,
      kind: KINDS.has(input.kind) ? input.kind : current.kind,
      tags: input.tags === undefined ? current.tags : normalizeTags(input.tags),
      sensitivity: SENSITIVITIES.has(input.sensitivity) ? input.sensitivity : current.sensitivity,
      confidence: input.confidence === undefined ? current.confidence : Math.min(1, Math.max(0, Number(input.confidence) || 0)),
      source: input.source === undefined ? current.source : normalizeSource(input.source),
      updatedAt: this.clock().toISOString(),
      version: current.version + 1
    };
    this.append({ type: "upsert", timestamp: record.updatedAt, record });
    this.records.set(record.id, record);
    this.audit("memory.updated", { memoryId: record.id, version: record.version });
    return structuredClone(record);
  }

  canAccess(record, actor = {}) {
    const tenantId = cleanSlug(actor.tenantId, "local");
    const userId = cleanSlug(actor.userId, "local-user");
    if (record.tenantId !== tenantId) return false;
    if (record.scope === "user") return record.userId === userId;
    if (record.scope === "workspace") return record.workspaceId === cleanSlug(actor.workspaceId, "default");
    return true;
  }

  purgeExpired() {
    const now = this.clock().getTime();
    for (const record of [...this.records.values()]) {
      if (Date.parse(record.expiresAt) > now) continue;
      this.append({ type: "delete", id: record.id, timestamp: this.clock().toISOString(), reason: "retention" });
      this.records.delete(record.id);
      this.audit("memory.expired", { memoryId: record.id });
    }
  }

  list(filters = {}, actor = {}) {
    this.purgeExpired();
    const query = String(filters.query || "").trim();
    const terms = tokenize(query);
    const scope = SCOPES.has(filters.scope) ? filters.scope : null;
    const kind = KINDS.has(filters.kind) ? filters.kind : null;
    const limit = Math.min(100, Math.max(1, Number(filters.limit) || 30));
    return [...this.records.values()]
      .filter((record) => this.canAccess(record, actor))
      .filter((record) => !scope || record.scope === scope)
      .filter((record) => !kind || record.kind === kind)
      .map((record) => {
        const haystack = tokenize(`${record.title} ${record.tags.join(" ")} ${record.content}`);
        const exact = query && `${record.title} ${record.content}`.toLocaleLowerCase("pt-BR").includes(query.toLocaleLowerCase("pt-BR")) ? 5 : 0;
        const matches = terms.reduce((score, term) => score + haystack.filter((token) => token === term).length * 2 + haystack.filter((token) => token.startsWith(term)).length, 0);
        return { record, score: exact + matches };
      })
      .filter((item) => !query || item.score > 0)
      .sort((a, b) => b.score - a.score || Date.parse(b.record.updatedAt) - Date.parse(a.record.updatedAt))
      .slice(0, limit)
      .map(({ record, score }) => ({ ...structuredClone(record), relevance: score || undefined }));
  }

  all(actor = {}) {
    this.purgeExpired();
    return [...this.records.values()].filter((record) => this.canAccess(record, actor))
      .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
      .map((record) => structuredClone(record));
  }

  remove(id, actor = {}) {
    const record = this.records.get(String(id));
    if (!record || !this.canAccess(record, actor)) return false;
    const timestamp = this.clock().toISOString();
    this.append({ type: "delete", id: record.id, timestamp, reason: "user" });
    this.records.delete(record.id);
    this.audit("memory.deleted", { memoryId: record.id, scope: record.scope });
    return true;
  }

  stats(actor = {}) {
    const records = this.list({ limit: 100 }, actor);
    const all = this.all(actor);
    return {
      total: all.length,
      visibleSample: records.length,
      byScope: Object.fromEntries([...SCOPES].map((scope) => [scope, all.filter((record) => record.scope === scope).length])),
      bySensitivity: Object.fromEntries([...SENSITIVITIES].map((level) => [level, all.filter((record) => record.sensitivity === level).length]))
    };
  }
}

module.exports = { MemoryStore, containsSecret, SCOPES, KINDS, SENSITIVITIES };
