"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { KnowledgePackManager } = require("./knowledge-packs");
const { EnterprisePolicyStore } = require("./enterprise-policy");

function root() { return fs.mkdtempSync(path.join(os.tmpdir(), "codex-hub-platform-")); }

test("pacote de conhecimento conecta fonte local e pesquisa Markdown", () => {
  const temporary = root();
  const source = path.join(temporary, "fabric");
  fs.mkdirSync(source);
  fs.writeFileSync(path.join(source, "dax.md"), "# DAX\nUse CALCULATE para modificar o contexto de filtro.");
  const manager = new KnowledgePackManager(path.join(temporary, "state"));
  manager.configure("powerbi-authoring", { enabled: true, sourcePath: source, pinnedRevision: "abc123" });
  const found = manager.search("contexto filtro");
  assert.equal(found[0].packId, "powerbi-authoring");
  assert.equal(manager.list().find((item) => item.id === "powerbi-authoring").connected, true);
  fs.rmSync(temporary, { recursive: true, force: true });
});

test("instala pacote somente do catálogo oficial e fixa a revisão", () => {
  const temporary = root();
  const revision = "a".repeat(40);
  const fakeGit = (_command, args) => {
    if (args.includes("clone")) {
      const target = args.at(-1);
      const source = path.join(target, "plugins", "powerbi-authoring");
      fs.mkdirSync(source, { recursive: true });
      fs.writeFileSync(path.join(source, "SKILL.md"), "# Power BI\nDAX e modelo semântico.");
    }
    if (args.includes("rev-parse")) return { status: 0, stdout: `${revision}\n`, stderr: "" };
    return { status: 0, stdout: "", stderr: "" };
  };
  const manager = new KnowledgePackManager(path.join(temporary, "state"), { git: fakeGit });
  const installed = manager.install("powerbi-authoring");
  assert.equal(installed.connected, true);
  assert.equal(installed.pinnedRevision, revision);
  assert.throws(() => manager.install("power-platform"), /instalação automática/);
  fs.rmSync(temporary, { recursive: true, force: true });
});

test("política enterprise persiste controles locais", () => {
  const temporary = root();
  const filePath = path.join(temporary, "policy.json");
  const policy = new EnterprisePolicyStore(filePath);
  const updated = policy.update({ organization: { name: "Acme" }, data: { telemetry: true, retentionDays: 90 } });
  assert.equal(updated.organization.name, "Acme");
  assert.equal(new EnterprisePolicyStore(filePath).get().data.retentionDays, 90);
  assert.equal(policy.can("viewer", "policy:write"), false);
  assert.equal(policy.can("operator", "desktop:control"), true);
  fs.rmSync(temporary, { recursive: true, force: true });
});
