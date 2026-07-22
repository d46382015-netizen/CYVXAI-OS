# CYVX Core v1

CYVX Core is the single operating intelligence for CYVXAI-OS. It is not a collection of chat agents. One kernel owns each request from observation through learning and invokes registered capabilities under explicit permissions, budgets, evidence, and durable tracing.

## Lifecycle

Every run follows one enforced sequence:

1. Observe
2. Understand
3. Recall
4. Plan
5. Execute
6. Verify
7. Learn

The execution context rejects out-of-order stages. Every stage is persisted with status, timestamps, duration, output hash, and failure details.

## Runtime package

`runtime/core/` contains:

- `context.js` — execution identity, lifecycle state, permissions, budgets, stage transitions, and capability results.
- `capability-registry.js` — versioned capability registration, input validation, permissions, retry policy, timeout policy, output envelopes, metrics, and SHA-256 evidence.
- `builtins.js` — governed production capabilities for runtime inspection, bounded workspace reads and atomic writes, and durable learning records.
- `kernel.js` — the single orchestration kernel, durable schema, planning, dependency-ordered execution, verification, tracing, idempotent runs, and learning.
- `index.js` — stable package API and integration with the existing durable mission runtime.

## Durable records

CYVX Core extends the existing SQLite runtime with organization-scoped tables:

- `core_runs`
- `core_stage_events`
- `core_capability_invocations`
- `core_learning_records`
- `core_events`

Sensitive fields matching password, secret, token, authorization, cookie, or key names are redacted before durable context and result storage.

## Capability contract

Each capability has:

- a dotted stable name and semantic version;
- description and risk level;
- a required permission;
- input validation;
- timeout and retry limits;
- idempotency metadata;
- a handler receiving an abort signal and immutable execution snapshot;
- an output envelope with evidence and metrics.

Every successful invocation receives an output SHA-256 evidence record even when the provider supplies additional receipts.

Example request:

```js
const { createMissionRuntime } = require("../runtime/missions");
const { createCyvxCore } = require("../runtime/core");

const missionRuntime = createMissionRuntime();
const core = createCyvxCore(missionRuntime, {
  workspaceRoot: missionRuntime.repoRoot,
});

const result = await core.run({
  objective: "Write and verify an owned artifact",
  operations: [
    {
      id: "write",
      capability: "filesystem.write",
      input: {
        path: "artifacts/example.txt",
        content: "verified\n",
      },
    },
    {
      id: "read",
      capability: "filesystem.read",
      depends_on: ["write"],
      input: { path: "artifacts/example.txt" },
    },
  ],
}, {
  user_id: "operator",
  organization_id: "default",
  role: "admin",
  permissions: ["filesystem.write", "filesystem.read"],
});
```

## Built-in capabilities

| Capability | Permission | Risk | Behavior |
| --- | --- | --- | --- |
| `runtime.inspect` | `runtime.read` | low | Returns registered capabilities and database readiness. |
| `filesystem.write` | `filesystem.write` | medium | Atomically writes at most 1 MiB inside the configured workspace. |
| `filesystem.read` | `filesystem.read` | low | Reads at most 1 MiB inside the configured workspace. |
| `learning.record` | `learning.write` | low | Persists organization-scoped execution learning. |

No shell, network, GitHub, Gmail, deployment, finance, or payment capability is silently implied. Those adapters must be registered with their real provider credentials, approval policy, and evidence contract.

## Verification

Run:

```bash
npm run core:test
npm run core:verify
```

Verification writes `artifacts/cyvx-core/verification.json` and proves:

- all seven lifecycle stages completed;
- governed capabilities executed;
- filesystem path containment and atomic writes worked;
- outputs produced SHA-256 evidence;
- traces and learning persisted;
- the result can be retrieved from the durable runtime.

## Next milestones

Sprint 2 adds the world model and relationship graph. Sprint 3 replaces the v1 dependency-ordered sequential executor with durable scheduling and bounded parallelism. Sprint 4 expands policy, evidence validators, metrics, and distributed tracing. Sprint 5 streams runtime state into the Control Room.
