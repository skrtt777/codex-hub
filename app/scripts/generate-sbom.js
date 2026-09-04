"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const appRoot = path.resolve(__dirname, "..");
const projectRoot = path.resolve(appRoot, "..");
const application = JSON.parse(fs.readFileSync(path.join(appRoot, "package.json"), "utf8"));
const components = [];
const seen = new Set();
const packageStore = path.join(appRoot, "node_modules", ".pnpm");

function addPackage(filePath) {
  try {
    const value = JSON.parse(fs.readFileSync(filePath, "utf8"));
    const key = `${value.name}@${value.version}`;
    if (!value.name || !value.version || seen.has(key)) return;
    seen.add(key);
    const licenseName = typeof value.license === "string" ? value.license : value.license?.type;
    components.push({
      type: "library",
      "bom-ref": `pkg:npm/${encodeURIComponent(value.name)}@${value.version}`,
      name: value.name,
      version: value.version,
      purl: `pkg:npm/${encodeURIComponent(value.name)}@${value.version}`,
      licenses: licenseName ? [{ license: { id: licenseName } }] : undefined
    });
  } catch { /* Ignore malformed dependency metadata. */ }
}

if (fs.existsSync(packageStore)) {
  for (const entry of fs.readdirSync(packageStore, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith("lock")) continue;
    const modules = path.join(packageStore, entry.name, "node_modules");
    if (!fs.existsSync(modules)) continue;
    for (const name of fs.readdirSync(modules)) {
      if (name.startsWith("@")) {
        for (const scoped of fs.readdirSync(path.join(modules, name))) addPackage(path.join(modules, name, scoped, "package.json"));
      } else addPackage(path.join(modules, name, "package.json"));
    }
  }
}

components.sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version));
const identity = crypto.createHash("sha256").update(`${application.name}@${application.version}`).digest("hex").slice(0, 32);
const serial = `urn:uuid:${identity.slice(0, 8)}-${identity.slice(8, 12)}-4${identity.slice(13, 16)}-8${identity.slice(17, 20)}-${identity.slice(20)}`;
const sbom = {
  bomFormat: "CycloneDX",
  specVersion: "1.5",
  serialNumber: serial,
  version: 1,
  metadata: { component: { type: "application", name: application.name, version: application.version } },
  components
};

fs.writeFileSync(path.join(projectRoot, "SBOM.cdx.json"), `${JSON.stringify(sbom, null, 2)}\n`, "utf8");
console.log(`SBOM generated with ${components.length} component(s).`);
