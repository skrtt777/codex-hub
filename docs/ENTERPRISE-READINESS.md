# Enterprise readiness

## Implemented in the local edition

- loopback-only authenticated service;
- CSRF, Host and Origin validation;
- workspace allowlist and RPC allowlist;
- explicit approval center and time-limited Full access;
- append-only audit events without prompt bodies;
- local memory with scope, provenance, version, sensitivity and retention;
- secret-pattern rejection and restricted-memory exclusion from automatic retrieval;
- official-source Knowledge Packs pinned to a Git commit;
- MCP catalog with read-only default, elevation gate and Codex CLI registration;
- organization policy foundation and role capability model;
- export of audit and memory data;
- isolated automated smoke environment.

## Customer-specific prerequisites

- written authorization for installation on managed devices;
- an approved Codex/OpenAI account and documented data-processing boundary;
- Microsoft tenant consent and least-privilege identities for Azure, Fabric, Power BI or Power Platform;
- customer review and acceptance of every connector's terms;
- operating-system encryption, backups and endpoint protection;
- classification rules defining which content may be sent to the model.

## Required before a hosted multi-user edition

The local role selector is a policy preview, not authentication. A hosted or shared edition must add:

- Microsoft Entra ID/OIDC authentication and tenant validation;
- server-side user-to-role assignments;
- database row-level isolation per tenant;
- managed secrets in Key Vault or an equivalent customer vault;
- a supported MCP gateway, network egress policies and connector identities;
- centralized immutable audit export to SIEM;
- backup/restore drills, availability targets and incident response;
- signed installers and updates, SBOM, dependency scanning and release provenance;
- privacy, support, SLA and data-processing agreements.

Microsoft MCP Gateway is a candidate for this edition: https://github.com/microsoft/mcp-gateway. It is intentionally not embedded in the desktop process.

## Power BI preview restriction

Power BI Modeling MCP is useful for pilots but its current pre-release EULA restricts production and redistribution. Codex Hub therefore registers a customer-managed installation only after explicit acceptance. Commercial bundling remains blocked until Microsoft provides suitable terms or written permission.
