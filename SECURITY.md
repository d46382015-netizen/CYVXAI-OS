# Security Policy

## Supported release

Security fixes are applied to the current production release and the active `main` branch.

## Reporting a vulnerability

Do not open a public issue containing credentials, exploit details, customer data, or an unpatched vulnerability. Use GitHub private vulnerability reporting when enabled, or contact the repository owner through a private verified channel.

Include:

- Affected commit or release
- Reproduction steps
- Security impact
- Required privileges
- Evidence with secrets and personal data removed
- Suggested containment when known

## Operational response

Suspected credential exposure, unauthorized action, data integrity loss, or remote-code execution is a SEV-1 incident. Rotate affected credentials, disable unsafe automation, preserve evidence, and follow `docs/operations/INCIDENT_RESPONSE.md`.

## Production requirements

- Production startup must pass `core/security/production_guard.js`.
- Secrets must never be committed to the repository.
- Production and staging use separate credentials and storage prefixes.
- Service-role database and object-storage tokens remain server-side.
- All pull requests pass CodeQL, dependency review, runtime audit, and the production-baseline CI gate.
