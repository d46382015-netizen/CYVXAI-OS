# CYVX Cinematic Public Experience and Production Control Room

## Routes

- `/` — public CYVXAI-OS experience backed by `/api/public/status`, `/healthz`, and `/api/public/worlds`.
- `/control` — production control room backed by the durable mission runtime.
- `/spark` — Spark world factory remains available.
- `/missions` — original durable mission operator remains available for recovery and diagnostics.
- `/operator`, `/revenue`, and `/field-manual` remain connected production surfaces.

## Production behavior

The control room does not synthesize mission state in the browser. It authenticates against the mission runtime, reads durable SQLite-backed mission graphs, and invokes the existing governed lifecycle endpoints.

`Create mission` persists a real mission. `Run selected to idle` validates, plans, requests and decides approval, assigns the production agent principal, queues execution, and polls the worker-backed job until it reaches an idle terminal state. `Record measured proof` writes evidence, evaluates the completed result, and stores a reusable learned capability. Proof verification and export use the evidence ledger and mission export endpoints.

Local development may issue a short-lived token for `admin-local`. Production operators must use an authorized bearer token. Tokens remain in browser local storage only until the operator clears the session.

## Runtime

The canonical cinematic entrypoint is:

```bash
node ./api/runtime-cinematic.js
```

The entrypoint wraps the existing `runtime-v7` composition instead of creating a parallel backend. All non-experience HTTP and WebSocket traffic delegates to the established public gateway.

## Verification

```bash
node --check api/public-experience.js api/runtime-cinematic.js ui/experience.js ui/control.js
node --test test/cinematic-interface.test.js
npm test
npm run build
```

The focused interface contract verifies that visible controls exist, browser logic calls the real production endpoints, the public root and control routes are mounted, and Spark/API traffic remains delegated to the existing runtime.
