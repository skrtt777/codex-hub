"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { MemoryStore, containsSecret } = require("./memory-store");

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "codex-hub-memory-"));
  return { root, store: new MemoryStore(root), actor: { tenantId: "acme", userId: "lucas", workspaceId: "hub" } };
}

test("persiste, busca e recarrega memórias", () => {
  const { root, store, actor } = fixture();
  const created = store.create({ title: "Medida de receita", content: "Usar SUM da coluna SalesAmount.", kind: "fact", tags: ["Power BI", "DAX"] }, actor);
  assert.equal(store.list({ query: "dax" }, actor)[0].id, created.id);
  const restored = new MemoryStore(root);
  assert.equal(restored.list({}, actor).length, 1);
  fs.rmSync(root, { recursive: true, force: true });
});

test("isola usuário, workspace e organização", () => {
  const { root, store, actor } = fixture();
  store.create({ title: "Preferência", content: "Respostas curtas.", scope: "user" }, actor);
  store.create({ title: "Decisão", content: "Modelo estrela.", scope: "workspace" }, actor);
  store.create({ title: "Glossário", content: "MRR é receita recorrente.", scope: "organization" }, actor);
  assert.equal(store.list({}, actor).length, 3);
  assert.equal(store.list({}, { ...actor, userId: "maria" }).length, 2);
  assert.equal(store.list({}, { ...actor, workspaceId: "outro" }).length, 2);
  assert.equal(store.list({}, { ...actor, tenantId: "other" }).length, 0);
  fs.rmSync(root, { recursive: true, force: true });
});

test("atualiza com versão e exclui por evento", () => {
  const { root, store, actor } = fixture();
  const created = store.create({ title: "Decisão", content: "Versão inicial." }, actor);
  const updated = store.update(created.id, { content: "Versão revisada." }, actor);
  assert.equal(updated.version, 2);
  assert.equal(store.remove(created.id, actor), true);
  assert.equal(new MemoryStore(root).list({}, actor).length, 0);
  fs.rmSync(root, { recursive: true, force: true });
});

test("recusa credenciais reconhecíveis", () => {
  const { root, store, actor } = fixture();
  assert.equal(containsSecret("client_secret=supersecret123"), true);
  assert.throws(() => store.create({ title: "Chave", content: "password=supersecret123" }, actor), /segredo/);
  fs.rmSync(root, { recursive: true, force: true });
});
