"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const ACCESS_LEVELS = ["read", "query", "write", "admin"];
const CATALOG = Object.freeze([
  {
    id: "fabric-knowledge",
    name: "Microsoft Fabric Knowledge",
    publisher: "Microsoft",
    maturity: "reference",
    license: "MIT",
    runtime: "dotnet",
    source: "https://github.com/microsoft/mcp/tree/main/servers/Fabric.Mcp.Server",
    description: "Schemas, OpenAPI e conhecimento local do Fabric. Não acessa o tenant.",
    template: { command: "dotnet", args: ["run", "--project", "<CAMINHO_FABRIC_MCP>"] }
  },
  {
    id: "powerbi-modeling",
    name: "Power BI Modeling MCP",
    publisher: "Microsoft",
    maturity: "preview-restricted",
    license: "Microsoft pre-release EULA",
    runtime: "npx",
    source: "https://github.com/microsoft/powerbi-modeling-mcp",
    description: "DAX, TMDL, modelos semânticos, RLS e Power BI Desktop. Instalação pelo cliente.",
    template: { command: "npx", args: ["-y", "@microsoft/powerbi-modeling-mcp@0.5.0-beta.13", "--start", "--readonly"] }
  },
  {
    id: "power-platform-cli",
    name: "Power Platform CLI MCP",
    publisher: "Microsoft",
    maturity: "preview",
    license: "Microsoft tools terms",
    runtime: "dnx",
    source: "https://learn.microsoft.com/power-platform/developer/howto/use-mcp",
    description: "Power Apps, Power Automate, Dataverse e comandos PAC.",
    template: { command: "dnx", args: ["Microsoft.PowerApps.CLI.Tool", "--yes", "copilot", "mcp", "--run"] }
  },
  {
    id: "azure",
    name: "Azure MCP Server",
    publisher: "Microsoft",
    maturity: "preview",
    license: "MIT",
    runtime: "npx",
    source: "https://github.com/microsoft/mcp/tree/main/servers/Azure.Mcp.Server",
    description: "Operações governadas em serviços Azure com autenticação do cliente.",
    template: { command: "npx", args: ["-y", "@azure/mcp@3.0.0-beta.41", "server", "start"] }
  }
]);

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  fs.renameSync(temporary, filePath);
}

function toml(value) {
  return `"${String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function executableAvailable(command) {
  const lookup = process.platform === "win32" ? "where.exe" : "which";
  const result = spawnSync(lookup, [command], { encoding: "utf8", windowsHide: true, timeout: 3000 });
  return result.status === 0 && Boolean(String(result.stdout || "").trim());
}

class McpControlCenter {
  constructor(root, options = {}) {
    this.root = path.resolve(root);
    this.statePath = path.join(this.root, "state.json");
    this.audit = typeof options.audit === "function" ? options.audit : () => {};
    this.runner = typeof options.runner === "function" ? options.runner : spawnSync;
    this.codexBin = String(options.codexBin || "codex");
    this.state = this.load();
  }

  load() {
    try { return JSON.parse(fs.readFileSync(this.statePath, "utf8")); } catch { return {}; }
  }

  get(id) { return CATALOG.find((item) => item.id === id) || null; }

  list() {
    return CATALOG.map((connector) => {
      const configured = this.state[connector.id] || {};
      return {
        ...connector,
        enabled: configured.enabled === true,
        access: ACCESS_LEVELS.includes(configured.access) ? configured.access : "read",
        localPath: configured.localPath || null,
        runtimeAvailable: executableAvailable(connector.runtime),
        updatedAt: configured.updatedAt || null,
        registered: configured.registered === true,
        termsAcceptedAt: configured.termsAcceptedAt || null,
        requiresCustomerInstall: connector.maturity !== "ga" || connector.id === "powerbi-modeling"
      };
    });
  }

  commandFor(connector, access, localPath = null) {
    const args = [...connector.template.args];
    if (connector.id === "powerbi-modeling") {
      const readOnlyIndex = args.indexOf("--readonly");
      if (["write", "admin"].includes(access) && readOnlyIndex >= 0) args.splice(readOnlyIndex, 1);
    }
    if (connector.id === "fabric-knowledge") {
      if (!localPath || (!path.isAbsolute(localPath) && localPath !== "<CAMINHO_FABRIC_MCP>")) throw new Error("Informe a pasta local do Fabric.Mcp.Server antes de ativar.");
      const placeholder = args.indexOf("<CAMINHO_FABRIC_MCP>");
      if (placeholder >= 0) args[placeholder] = localPath;
    }
    return { command: connector.template.command, args };
  }

  registrationName(id) { return `codex-hub-${id.replace(/[^a-z0-9-]/g, "-")}`; }

  runCodex(args) {
    return this.runner(this.codexBin, args, { encoding: "utf8", windowsHide: true, timeout: 30000, env: { ...process.env, GIT_TERMINAL_PROMPT: "0" } });
  }

  applyRegistration(connector, next, previous) {
    const name = this.registrationName(connector.id);
    this.runCodex(["mcp", "remove", name]);
    if (!next.enabled) return false;
    const resolved = this.commandFor(connector, next.access, next.localPath);
    const added = this.runCodex(["mcp", "add", name, "--", resolved.command, ...resolved.args]);
    if (added.status === 0) return true;
    if (previous?.enabled && previous.registered) {
      try {
        const rollback = this.commandFor(connector, previous.access || "read", previous.localPath || null);
        this.runCodex(["mcp", "add", name, "--", rollback.command, ...rollback.args]);
      } catch { /* Preserve the original failure below. */ }
    }
    throw new Error(`O Codex recusou o registro MCP: ${String(added.stderr || added.error?.message || "falha desconhecida").trim().slice(0, 500)}`);
  }

  configure(id, input = {}, options = {}) {
    const connector = this.get(id);
    if (!connector) throw new Error("Conector MCP desconhecido.");
    const access = ACCESS_LEVELS.includes(input.access) ? input.access : "read";
    if (input.enabled === true && ["write", "admin"].includes(access) && options.allowElevated !== true) throw new Error("Ative Full access para conceder escrita ou administração a um MCP.");
    if (connector.maturity === "preview-restricted" && input.acceptPreviewTerms !== true && input.enabled === true) {
      throw new Error("Este conector está em preview e exige aceite explícito dos termos pelo cliente.");
    }
    const previous = this.state[id] || {};
    const localPath = input.localPath === undefined ? previous.localPath || null : String(input.localPath || "").trim() || null;
    const next = {
      enabled: input.enabled === true,
      access,
      localPath,
      updatedAt: new Date().toISOString(),
      registered: false,
      termsAcceptedAt: connector.maturity === "preview-restricted" && input.acceptPreviewTerms === true ? new Date().toISOString() : previous.termsAcceptedAt || null
    };
    if (options.applyToCodex === true) next.registered = this.applyRegistration(connector, next, previous);
    this.state[id] = next;
    writeJson(this.statePath, this.state);
    this.audit("mcp.configured", { connectorId: id, enabled: this.state[id].enabled, access, maturity: connector.maturity, previewTermsAccepted: Boolean(this.state[id].termsAcceptedAt) });
    return this.list().find((item) => item.id === id);
  }

  codexSnippet(id) {
    const connector = this.get(id);
    if (!connector) throw new Error("Conector MCP desconhecido.");
    const configured = this.state[id] || { access: "read" };
    const resolved = this.commandFor(connector, configured.access || "read", configured.localPath || "<CAMINHO_FABRIC_MCP>");
    const safeName = connector.id.replace(/[^a-z0-9_-]/g, "-");
    return `[mcp_servers.${safeName}]\ncommand = ${toml(resolved.command)}\nargs = [${resolved.args.map(toml).join(", ")}]\n`;
  }
}

module.exports = { McpControlCenter, MCP_CATALOG: CATALOG, ACCESS_LEVELS, executableAvailable };
