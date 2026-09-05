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
- Power BI Desktop workflow using official local knowledge and temporary Computer Use sessions;
- organization policy foundation and role capability model;
- export of audit and memory data;
- isolated automated smoke environment.

## Customer-specific prerequisites

- written authorization for installation on managed devices;
- an approved Codex/OpenAI account and documented data-processing boundary;
- Microsoft tenant consent and least-privilege identities for any cloud service used outside the Hub;
- customer approval for visual automation on managed desktops;
- operating-system encryption, backups and endpoint protection;
- classification rules defining which content may be sent to the model.

## Required before a hosted multi-user edition

The local role selector is a policy preview, not authentication. A hosted or shared edition must add:

- Microsoft Entra ID/OIDC authentication and tenant validation;
- server-side user-to-role assignments;
- database row-level isolation per tenant;
- managed secrets in Key Vault or an equivalent customer vault;
- network egress policies, managed identities and a reviewed automation boundary;
- centralized immutable audit export to SIEM;
- backup/restore drills, availability targets and incident response;
- signed installers and updates, SBOM, dependency scanning and release provenance;
- privacy, support, SLA and data-processing agreements.

## Desktop automation boundary

The Hub does not install or redistribute Microsoft connectors. Power BI assistance combines pinned official knowledge with the Computer Use capability already supplied by the Codex environment. Managed-device policy, Power BI licensing, tenant permissions and human confirmation for consequential actions remain customer responsibilities.
