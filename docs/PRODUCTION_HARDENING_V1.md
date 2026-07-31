# CYVX Production Hardening v1

This change is a bounded remediation of verified production gaps. It does not replace the platform architecture, change the domain model, or claim distributed/hyperscale behavior that is not implemented.

## Scope

This version hardens four existing seams:

1. Production authentication fails closed unless a credential is configured or the gateway is explicitly bound to loopback for an internal runtime.
2. Workload, action, and outcome payloads receive bounded field, range, and cross-field validation.
3. Production platform state uses SQLite WAL transactions while the existing JSON backend remains available for compatibility and rollback.
4. The platform kernel reports the package release version instead of a separate hard-coded version.

## Existing behavior preserved

- The platform model, collections, mission loops, GitHub event mapping, API envelopes, Spark runtime, and public UI are unchanged.
- Explicit `.json` platform-state paths still use the JSON store.
- JSON writes now use temporary-file replacement and retain the previous successful file as `<state>.bak`.
- The public runtime may start a CYVX gateway on an explicitly loopback-only internal port without exposing an unauthenticated external production bind.
- The legacy JSON state is read during migration but is not deleted or overwritten.

## Production defaults

The production gateway now selects:

```text
CYVX_PLATFORM_BACKEND=sqlite
CYVX_PLATFORM_DB=~/.cyvx/platform.db
CYVX_PLATFORM_LEGACY_STATE=~/.cyvx/platform-state.json
```

Protected production routes require `CYVX_API_KEY`.

For a deliberate localhost-only developer runtime:

```bash
CYVX_HOST=127.0.0.1 \
CYVX_ALLOW_INSECURE_LOCALHOST=true \
npm run api
```

The bypass is rejected for non-loopback peers and non-loopback binds.

## Migration

Preview the migration without writing:

```bash
node scripts/platform-state-migrate.js migrate \
  --from "$HOME/.cyvx/platform-state.json" \
  --to "$HOME/.cyvx/platform.db" \
  --dry-run
```

Execute and verify:

```bash
npm run platform:migrate -- \
  --from "$HOME/.cyvx/platform-state.json" \
  --to "$HOME/.cyvx/platform.db"
```

The command compares deterministic checksums and collection counts. The source JSON remains intact.

## Rollback

Export the current SQLite snapshot to JSON:

```bash
npm run platform:rollback -- \
  --from "$HOME/.cyvx/platform.db" \
  --to "$HOME/.cyvx/platform-state.rollback.json"
```

Then restart with:

```bash
CYVX_PLATFORM_BACKEND=json \
CYVX_PLATFORM_STATE="$HOME/.cyvx/platform-state.rollback.json" \
npm run api
```

When replacing an existing rollback destination, pass `--force`; the previous destination is retained as `.bak`.

## Verification

```bash
npm ci
npm run hardening:test
npm test
npm run build
```

CI additionally starts the production gateway, proves that a missing credential receives `401`, proves that a configured credential succeeds, proves invalid payloads receive `422`, and runs the existing CYVX and Spark smoke flows.

## Before-and-after evidence

Baseline source: commit `6c65c3e4d40c6d05dfbd950bb8a8cb898d4e748d`.

| Control | Before | After proof |
|---|---|---|
| Missing production credential | Authorized by default | Unit test and production smoke require denial |
| Platform state | Whole-file JSON rewrite | SQLite WAL with `BEGIN IMMEDIATE` transaction boundary |
| Legacy migration | Manual/unverified | Source-preserving import with checksum verification |
| Rollback | No defined path | Verified SQLite-to-JSON export plus backend switch |
| JSON partial-write safety | Direct overwrite | Temporary file, atomic rename, and `.bak` |
| Payload validation | JSON object only | Range, type, size, and action cross-field tests |
| Version ownership | Package `6.0.0`, kernel `7.0.0` | Package, API envelope, and kernel all report package version |
| Multi-writer lost update | Unprotected state rewrite | Test opens separate kernels and proves both writes survive |

## Explicitly not addressed in this PR

This change does not claim or introduce:

- distributed worker pools or message streaming
- database-enforced multi-tenant row isolation
- horizontal autoscaling or distributed locks across services
- cross-region replication or disaster-recovery automation
- enterprise SSO, SCIM, billing, or compliance certification
- validated predictive models for simulation and health scoring

Those require separate, reviewable changes with their own tests, migration plans, rollback plans, load evidence, and customer workflow proof.
