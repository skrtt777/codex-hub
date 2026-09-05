"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const CATALOG = Object.freeze([
  {
    id: "microsoft-fabric",
    name: "Microsoft Fabric Core",
    publisher: "Microsoft",
    source: "https://github.com/microsoft/skills-for-fabric",
    license: "MIT",
    category: "knowledge",
    repository: "https://github.com/microsoft/skills-for-fabric.git",
    subpath: "plugins/fabric-skills",
    description: "Fabric, lakehouses, warehouses, notebooks, SQL, KQL e Dataflows Gen2."
  },
  {
    id: "powerbi-authoring",
    name: "Power BI Authoring",
    publisher: "Microsoft",
    source: "https://github.com/microsoft/skills-for-fabric",
    license: "MIT",
    category: "knowledge",
    repository: "https://github.com/microsoft/skills-for-fabric.git",
    subpath: "plugins/powerbi-authoring",
    description: "Modelagem semântica, DAX, PBIP, TMDL, RLS, relatórios e performance."
  },
  {
    id: "power-platform",
    name: "Power Platform",
    publisher: "Microsoft",
    source: "https://learn.microsoft.com/power-platform/developer/cli/introduction",
    license: "Microsoft documentation",
    category: "knowledge",
    description: "Power Apps, Power Automate, Dataverse, soluções, ambientes e ALM."
  }
]);

function atomicJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  fs.renameSync(temporary, filePath);
}

function within(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function terms(value, limit = 24) {
  return String(value || "").toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .split(/[^a-z0-9]+/).filter((item) => item.length > 1).slice(0, limit);
}

class KnowledgePackManager {
  constructor(root, options = {}) {
    this.root = path.resolve(root);
    this.statePath = path.join(this.root, "state.json");
    this.audit = typeof options.audit === "function" ? options.audit : () => {};
    this.git = typeof options.git === "function" ? options.git : spawnSync;
    this.state = this.load();
    this.indexCache = new Map();
  }

  load() {
    try {
      const value = JSON.parse(fs.readFileSync(this.statePath, "utf8"));
      return value && typeof value === "object" ? value : {};
    } catch { return {}; }
  }

  list() {
    return CATALOG.map((pack) => ({
      ...pack,
      enabled: this.state[pack.id]?.enabled === true,
      sourcePath: this.state[pack.id]?.sourcePath || null,
      pinnedRevision: this.state[pack.id]?.pinnedRevision || null,
      connected: Boolean(this.state[pack.id]?.sourcePath && this.sourceExists(this.state[pack.id].sourcePath)),
      installable: Boolean(pack.repository && pack.subpath),
      updatedAt: this.state[pack.id]?.updatedAt || null
    }));
  }

  get(id) {
    return CATALOG.find((pack) => pack.id === id) || null;
  }

  sourceExists(value) {
    try { return fs.statSync(fs.realpathSync.native(value)).isDirectory(); } catch { return false; }
  }

  configure(id, input = {}) {
    const pack = this.get(id);
    if (!pack) throw new Error("Pacote de conhecimento desconhecido.");
    const current = this.state[id] || {};
    let sourcePath = current.sourcePath || null;
    if (input.sourcePath !== undefined) {
      if (!input.sourcePath) sourcePath = null;
      else {
        sourcePath = fs.realpathSync.native(path.resolve(String(input.sourcePath)));
        if (!fs.statSync(sourcePath).isDirectory()) throw new Error("A fonte local precisa ser uma pasta.");
      }
    }
    this.state[id] = {
      enabled: input.enabled === undefined ? current.enabled === true : input.enabled === true,
      sourcePath,
      pinnedRevision: String(input.pinnedRevision || current.pinnedRevision || "").trim().slice(0, 80) || null,
      updatedAt: new Date().toISOString()
    };
    atomicJson(this.statePath, this.state);
    this.indexCache.delete(id);
    this.audit("knowledge_pack.configured", { packId: id, enabled: this.state[id].enabled, connected: Boolean(sourcePath) });
    return this.list().find((item) => item.id === id);
  }

  install(id) {
    const pack = this.get(id);
    if (!pack?.repository || !pack.subpath) throw new Error("Este pacote não possui instalação automática oficial.");
    const sourcesRoot = path.join(this.root, "sources");
    fs.mkdirSync(sourcesRoot, { recursive: true });
    const target = path.join(sourcesRoot, `${id}-${Date.now()}-${process.pid}`);
    const environment = { ...process.env, GIT_TERMINAL_PROMPT: "0", GCM_INTERACTIVE: "Never" };
    const common = { encoding: "utf8", windowsHide: true, timeout: 120000, env: environment };
    const clone = this.git("git", ["-c", "core.hooksPath=", "-c", "filter.lfs.smudge=", "clone", "--depth", "1", "--filter=blob:none", "--sparse", pack.repository, target], common);
    if (clone.status !== 0) throw new Error(`Não foi possível obter a fonte oficial: ${String(clone.stderr || clone.error?.message || "git clone falhou").trim().slice(0, 500)}`);
    const sparse = this.git("git", ["-C", target, "sparse-checkout", "set", pack.subpath], common);
    if (sparse.status !== 0) throw new Error(`A fonte foi baixada, mas o pacote não pôde ser selecionado: ${String(sparse.stderr || "sparse-checkout falhou").trim().slice(0, 500)}`);
    const revisionResult = this.git("git", ["-C", target, "rev-parse", "HEAD"], common);
    const revision = String(revisionResult.stdout || "").trim();
    if (revisionResult.status !== 0 || !/^[a-f0-9]{40}$/i.test(revision)) throw new Error("Não foi possível fixar a revisão do pacote.");
    const sourcePath = fs.realpathSync.native(path.join(target, pack.subpath));
    const configured = this.configure(id, { enabled: true, sourcePath, pinnedRevision: revision });
    this.audit("knowledge_pack.installed", { packId: id, revision });
    return configured;
  }

  markdownFiles(root, limit = 500) {
    const resolvedRoot = fs.realpathSync.native(root);
    const result = [];
    const queue = [resolvedRoot];
    while (queue.length && result.length < limit) {
      const directory = queue.shift();
      let entries = [];
      try { entries = fs.readdirSync(directory, { withFileTypes: true }); } catch { continue; }
      for (const entry of entries) {
        if (result.length >= limit) break;
        if ([".git", "node_modules", ".venv", "dist", "build"].includes(entry.name)) continue;
        const candidate = path.join(directory, entry.name);
        let real;
        try { real = fs.realpathSync.native(candidate); } catch { continue; }
        if (!within(resolvedRoot, real)) continue;
        if (entry.isDirectory()) queue.push(real);
        else if (entry.isFile() && /\.(?:md|mdx|txt)$/i.test(entry.name)) result.push(real);
      }
    }
    return result;
  }

  search(query, options = {}) {
    const queryTerms = terms(query);
    if (!queryTerms.length) return [];
    const limit = Math.min(20, Math.max(1, Number(options.limit) || 8));
    const matches = [];
    for (const pack of this.list().filter((item) => item.enabled && item.connected)) {
      let documents = this.indexCache.get(pack.id);
      if (!documents) {
        documents = [];
        let indexedBytes = 0;
        for (const filePath of this.markdownFiles(pack.sourcePath)) {
          try {
            const stats = fs.statSync(filePath);
            if (stats.size > 512 * 1024 || indexedBytes + stats.size > 16 * 1024 * 1024) continue;
            const source = fs.readFileSync(filePath, "utf8");
            indexedBytes += stats.size;
            documents.push({ filePath, source, normalized: terms(source, 200_000) });
          } catch { /* Ignore unreadable knowledge documents. */ }
        }
        this.indexCache.set(pack.id, documents);
      }
      for (const { filePath, source, normalized } of documents) {
        const score = queryTerms.reduce((sum, term) => sum + normalized.filter((token) => token === term).length * 2 + normalized.filter((token) => token.startsWith(term)).length, 0);
        if (!score) continue;
        const lowered = source.toLocaleLowerCase("pt-BR");
        const firstIndex = Math.max(0, queryTerms.reduce((best, term) => {
          const found = lowered.indexOf(term);
          return found >= 0 && (best < 0 || found < best) ? found : best;
        }, -1));
        const start = Math.max(0, firstIndex - 180);
        matches.push({ packId: pack.id, packName: pack.name, file: path.relative(pack.sourcePath, filePath), score, snippet: source.slice(start, start + 700).trim() });
      }
    }
    return matches.sort((a, b) => b.score - a.score).slice(0, limit);
  }
}

module.exports = { KnowledgePackManager, KNOWLEDGE_PACK_CATALOG: CATALOG };
