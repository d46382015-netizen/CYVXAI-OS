# CYVX Release Notes

## Release Tag
- `v6.0.0-cyvx.1`

## What changed
- Replaced the placeholder dashboard flow with a real interactive operations console.
- Added computed operational health, insight generation, and recent event history to the API.
- Added a structured command route so the UI can trigger asks, workload submissions, and concrete actions.
- Replaced the placeholder protocol codec with deterministic encode/decode behavior.
- Added a build pipeline that validates entrypoints and produces a distributable `dist/` tree.
- Added CI and release workflows so the project can be verified on every push and packaged on tags.

## User-facing improvements
- Live overview cards show health, top agent, workload pressure, and recent activity.
- Insight cards present actionable guidance instead of static marketing copy.
- Event history surfaces the controller’s recent actions and autonomous loop output.
- Quick actions make it possible to trigger common operations from the dashboard.

## Runtime and API
- `GET /api/v1/overview`
- `GET /api/v1/insights`
- `POST /api/v1/command`
- Existing health, status, leaderboard, roadmap, and metrics routes remain available.

## CI/CD
- `CI` workflow builds the app and smoke-tests the live API.
- `Release` workflow packages the build artifacts and publishes a GitHub release when a version tag is pushed.

## Notes
- The repository currently runs as a Node service with a static dashboard served from the same process.
- Production deployment should keep API access protected with `CYVX_API_KEY` if the service is exposed publicly.

