# CYVX Governed Topology Consolidation

## Mission

Reduce repository sprawl without breaking runtime behavior, imports, deployment, evidence, or rollback. Every physical move is generated from a measured dependency graph and executed as a reversible, approval-bound stage.

## Operating loop

```text
Repository reality
→ dependency/import graph
→ stage risk and affected references
→ immutable plan digest
→ explicit operator approval
→ clean-tree and drift preflight
→ atomic directory moves
→ compatibility aliases
→ automated reference rewriting
→ quick or full regression verification
→ applied proof or automatic rollback
→ measured repository-intelligence rescan
```

## Stages

1. `research-leaves` — physics, science, thermodynamics, formal, futures, and civilization into `research/`.
2. `domain-assets` — brand and legal assets into `domains/`.
3. `operations-unification` — infrastructure, operations, observability, security, evidence, and artifacts into `ops/`.
4. `product-platform` — optional public/SaaS surfaces into `apps/` and the legacy control plane into `platform/`.
5. `intelligence-proof` — optional ML, internet, evaluations, and economics modules into `services/`.

Core roots such as `api`, `core`, `runtime`, `services`, `scripts`, `cli`, `ui`, `spark`, `status`, `config`, `test`, `docs`, `supabase`, `data`, and `.github` are protected from movement.

## Commands

```bash
npm run topology:scan
npm run topology:plan -- research-leaves
```

The plan returns an exact SHA-256 approval digest. Apply only that unchanged plan:

```bash
npm run topology:apply -- research-leaves --approve <PLAN_DIGEST> --verify quick
```

For the complete production gate:

```bash
npm run topology:apply -- research-leaves --approve <PLAN_DIGEST> --verify full
```

Inspect or reverse a run:

```bash
npm run topology:verify-run -- <RUN_ID>
npm run topology:rollback -- <RUN_ID>
```

Start the mobile control plane:

```bash
npm run topology:serve
```

Dashboard: `http://127.0.0.1:3015/topology`

## Governance boundaries

- Apply requires an exact plan digest and an unchanged tree digest.
- The working tree must be clean unless an operator explicitly overrides the guard.
- A process lock prevents concurrent topology mutations.
- Existing destinations, protected roots, nested targets, and unsupported aliases block execution.
- Non-loopback HTTP mutation requires `CYVX_TOPOLOGY_TOKEN`.
- The engine never commits, pushes, merges, deploys, spends, or removes aliases automatically.
- Verification failure triggers immediate rollback.

## Compatibility aliases

The default Linux/UserLAnd strategy creates a relative directory symlink at every old path. Existing references continue to work while rewritten references adopt the canonical target. Aliases remain until a later measured deprecation mission proves that no runtime, workflow, deployment, documentation, or external consumer depends on them.

## Persistence and proof

State is stored outside the repository by default:

```text
~/.cyvx/topology-consolidation/
  latest/scan.json
  latest/plan.json
  latest/verification.json
  plans/<stage>.json
  runs/<run-id>/state.json
  runs/<run-id>/backups/**
  history.jsonl
  topology-consolidation.jsonl
```

Each run records:

- approved plan digest
- Git commit and pre-move tree digest
- source/target pairs and source content digests
- rewritten files with before/after hashes
- verification commands, output, status, and elapsed time
- post-move tree digest
- final proof digest

Rollback restores rewritten files, removes only verified aliases, moves targets back in reverse order, and proves that the resulting tree digest exactly matches the pre-migration tree.

## Verification

```bash
npm run topology:verify
npm run repo:intelligence:verify
npm run verify:production-baseline
```

The focused suite proves dependency resolution, exact-digest approval, alias creation, reference rewriting, run verification, authorization, automatic rollback on failed regression checks, and byte-equivalent rollback proof.
