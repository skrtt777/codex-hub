# Security policy

## Supported release

Security fixes are applied to the latest `main` release. Enterprise deployments should pin a reviewed commit and update through a controlled rollout.

## Reporting

Do not open a public issue containing credentials, customer data or exploit details. Send a private report to the repository owner with the affected version, reproduction steps, impact and any proposed mitigation. Revoke exposed credentials before sending the report.

## Trust boundaries

- The web server listens on loopback and is not designed for direct LAN or internet exposure.
- Browser requests require a local session, origin validation and CSRF protection.
- Workspaces are explicit filesystem trust boundaries.
- Desktop control is a separate native capability and must remain disabled outside authorized sessions.
- Full access is a temporary local elevation, not an enterprise identity mechanism.
- Retrieved memory and knowledge are untrusted reference data and cannot override system policy.

## Secrets and data

Never store passwords, tokens or private keys in memory, knowledge folders, Git, issue reports or screenshots. Codex Hub rejects several known secret formats, but this is defense in depth rather than a complete DLP system. Use Windows Credential Manager, DPAPI or an organization-approved vault for credentials.

The `app/data` directory can contain local configuration, audit events, downloaded knowledge and user memory. It is ignored by Git. Back it up, encrypt the disk and apply operating-system permissions appropriate to the data classification.

## Commercial deployment checklist

Before a customer deployment: review `THIRD_PARTY_NOTICES.md`, generate an SBOM, run the complete test suite, scan dependencies, verify code signing, define retention and backup, approve desktop-control policy, and document which content can be sent to the configured model provider.
