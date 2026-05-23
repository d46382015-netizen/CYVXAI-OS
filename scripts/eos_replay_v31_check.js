"use strict";

const assert = require("node:assert/strict");
const {
  createUEF,
  withUEF,
  queryEvents,
  httpPlugin,
  ciPlugin,
} = require("../packages/eos-replay/production");

(async () => {
  const uef = createUEF({
    runId: "run-789",
    actor: "service-a",
  });

  uef.use(httpPlugin);
  uef.use(ciPlugin);

  const handler = withUEF(async (req, res, runtime) => {
    runtime.dispatch("ci-step", {
      run_id: "run-789",
      name: "build",
      status: "ok",
      meta: { job: "test" },
    });
    res.statusCode = 204;
    return { ok: true };
  }, { uef, httpPlugin: true });

  const req = { url: "/api/hello", method: "GET", headers: { host: "localhost" }, run_id: "run-789", trace_id: "run-789" };
  const res = { statusCode: 200 };
  await handler(req, res);

  const snapshot = uef.snapshot();
  const httpEvents = queryEvents(snapshot.events, { type: "HTTP_REQUEST" });
  const ciEvents = queryEvents(snapshot.events, { type: "CI_STEP" });

  assert.equal(httpEvents.length >= 1, true);
  assert.equal(ciEvents.length >= 1, true);
  assert.equal(uef.query({ trace_id: "run-789" }).length >= 2, true);

  console.log("EOS replay v3.1 plugin check passed.");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
