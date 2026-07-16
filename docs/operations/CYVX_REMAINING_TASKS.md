# CYVX Evolution Queue

Static remaining-task lists are retired.

The authoritative repository upgrade queue is generated from live repository reality by the Repository Evolution Control Plane:

```bash
npm run repo:intelligence
npm run repo:intelligence:verify
npm run repo:intelligence:serve
```

Dashboard:

```text
http://127.0.0.1:3014/repo-intelligence
```

## Source of truth

- Contract: `config/repository-contract.json`
- Latest machine proof: `~/.cyvx/repository-intelligence/latest.json`
- Latest human report: `~/.cyvx/repository-intelligence/latest.md`
- Measured history: `~/.cyvx/repository-intelligence/history.jsonl`
- Operational log: `~/.cyvx/repository-intelligence/repository-intelligence.jsonl`
- CI proof: `CYVX Repository Intelligence` workflow artifact

## Execution policy

Work the highest-ranked verified constraint first. Every upgrade must improve or preserve the next scan, retain tests and evidence, and respect the stop condition against destructive moves, credentials, spending, external deployment, legal actions, or irreversible production changes.

Repository fragmentation remains a governed migration program, not a blind directory move. It requires an import graph, compatibility aliases, staged moves, full verification, rollback proof, and a separate reviewable pull request.
