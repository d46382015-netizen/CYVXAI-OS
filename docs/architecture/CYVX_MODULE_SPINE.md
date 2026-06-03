# CYVX Module Spine

## Active Core
api
core
cli
ui
data
scripts
test
observability
.github/workflows

## Runtime / Coordination Modules
runtime
scheduler
control

## Expansion Plugins
civilization
internet
ml
futures

## Research / Theory Modules
physics
science
thermodynamics
formal

## Business / Identity / Legal
brand
legal
docs

## Rule
No new top-level folders unless approved.

New features must go into:
- core/
- api/
- ui/
- cli/
- scripts/
- docs/
- modules/
- research/

## Next Refactor Target
Create:
modules/
research/

Then gradually move non-core folders under those without breaking imports.
