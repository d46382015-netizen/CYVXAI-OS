# CLI Reference

## Help
- `node ./cli/cyvx.js help`

## Service
- `node ./cli/cyvx.js serve`

## Read APIs
- `status`
- `agents`
- `leaderboard`
- `roadmap`
- `cluster`
- `workloads`
- `actions`
- `metrics`
- `healthz`
- dashboard

## Ask / Intelligence
- `ask <task>`
- `report`
- `genome`
- `simulate`
- onboard
- `evolve`

## Planned command surface
- `forecast`
- `optimize`
- `intervene`
- `causal`
- `memory`
- `dream`
- `join`
- `partner`
- `sdk`
- `plugin`
- `test`
- `observability`
- `pricing`
- `revenue`
- `security`
- `compliance`
- `cloud`
- `web3`
- `token`
- `chain`
- `nft`
- `defi`
- `mine`
- `node`
- `doc`


## Proof Surfaces
- API: /api/v1/github/repository?owner=acme&repo=cyvx
- API: /api/v1/github/health?owner=acme&repo=cyvx
- API: /api/v1/github/proof?owner=acme&repo=cyvx
- API: /api/v1/repository-health?owner=acme&repo=cyvx
- API: /api/v1/proof?owner=acme&repo=cyvx
- CLI: repository-health, repo-health, proof, github, github-health, github-proof


## Self-Scan Commands

### node ./cli/cyvx.js scan-self
Runs the CYVX self-scan engine.

### node ./cli/cyvx.js self-scan-mission
Runs self-scan and creates a mission plus next-best-action record from the top detected constraint.
