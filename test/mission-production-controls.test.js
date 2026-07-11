"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { createMissionRuntime } = require("../runtime/missions");
const { JsonLogger, safeArtifactPath } = require("../runtime/missions/base");
const { restoreBackup } = require("../runtime/missions/backup");
const {
  AUTH_SECRET,
  createHarness,
  createApprovedQueuedMission,
  expectStatus,
  queueMission,
  request,
  temporaryRoot,
} = require("./mission-runtime-helpers");

test("request limits rate limits token expiry CORS and worker-offline readiness are enforced", async (t) => {
  const limitedBody = await createHarness({ bodyLimit: 256 });
  t.after(() => limitedBody.close());
  const oversized = await request(
    limitedBody,
    "POST",
    "/api/v1/missions",
    limitedBody.tokens["admin-a"],
    { title: "Oversized", objective: "x".repeat(1000) },
  );
  assert.equal(oversized.status, 413, oversized.text);
  assert.equal(oversized.payload.error, "REQUEST_TOO_LARGE");
  assert.ok(oversized.payload.correlation_id);

  const expiredToken = limitedBody.runtime.issueToken({ sub: "viewer-a", organization_id: "org-a", role: "viewer" }, -1);
  await expectStatus(request(limitedBody, "GET", "/api/v1/missions", expiredToken), 401, "AUTH_EXPIRED");

  const allowedCors = await expectStatus(request(
    limitedBody,
    "GET",
    "/api/v1/missions",
    limitedBody.tokens["viewer-a"],
    undefined,
    { origin: "http://allowed.test" },
  ), 200);
  assert.equal(allowedCors.response.headers.get("access-control-allow-origin"), "http://allowed.test");

  const readiness = await request(limitedBody, "GET", "/readyz");
  assert.equal(readiness.status, 503);
  assert.equal(readiness.payload.dependencies.database.ready, true);
  assert.equal(readiness.payload.dependencies.worker.ready, false);

  const mutationLimited = await createHarness({ mutationLimit: 1 });
  t.after(() => mutationLimited.close());
  await expectStatus(request(mutationLimited, "POST", "/api/v1/missions", mutationLimited.tokens["admin-a"], {
    title: "First mutation",
    objective: "Allowed within the current rate window",
  }), 201);
  await expectStatus(request(mutationLimited, "POST", "/api/v1/missions", mutationLimited.tokens["admin-a"], {
    title: "Second mutation",
    objective: "Must be rate limited",
  }), 429, "RATE_LIMITED");

  const authLimited = await createHarness({ authLimit: 1 });
  t.after(() => authLimited.close());
  await expectStatus(request(authLimited, "POST", "/api/v1/auth/token", null, {
    organization_id: "org-a",
    user_id: "admin-a",
  }), 200);
  await expectStatus(request(authLimited, "POST", "/api/v1/auth/token", null, {
    organization_id: "org-a",
    user_id: "admin-a",
  }), 429, "RATE_LIMITED");
});

test("production configuration safe artifact paths and protected restore fail closed", () => {
  const shortSecretRoot = temporaryRoot("cyvx-production-short-secret-");
  assert.throws(() => createMissionRuntime({
    dataRoot: shortSecretRoot,
    nodeEnv: "production",
    allowLocalAuth: false,
    authSecret: "short",
    corsAllowlist: "https://operator.example",
  }), (error) => error && error.code === "AUTH_SECRET_INVALID");
  fs.rmSync(shortSecretRoot, { recursive: true, force: true });

  const missingCorsRoot = temporaryRoot("cyvx-production-no-cors-");
  assert.throws(() => createMissionRuntime({
    dataRoot: missingCorsRoot,
    nodeEnv: "production",
    allowLocalAuth: false,
    authSecret: AUTH_SECRET,
    corsAllowlist: "",
  }), (error) => error && error.code === "CORS_ALLOWLIST_REQUIRED");
  fs.rmSync(missingCorsRoot, { recursive: true, force: true });

  const artifactRoot = temporaryRoot("cyvx-safe-artifacts-");
  assert.throws(() => safeArtifactPath(artifactRoot, "../escape.json"), (error) => error && error.code === "ARTIFACT_PATH_INVALID");
  assert.equal(safeArtifactPath(artifactRoot, "org/mission/evidence.json").startsWith(artifactRoot), true);
  fs.rmSync(artifactRoot, { recursive: true, force: true });

  const previous = process.env.CYVX_ALLOW_RESTORE;
  delete process.env.CYVX_ALLOW_RESTORE;
  try {
    assert.throws(() => restoreBackup({ archive: "/missing/backup.tar.gz", targetDataRoot: "/tmp/cyvx-protected-restore" }),
      (error) => error && error.code === "RESTORE_PROTECTED");
  } finally {
    if (previous === undefined) delete process.env.CYVX_ALLOW_RESTORE;
    else process.env.CYVX_ALLOW_RESTORE = previous;
  }
});

test("structured logging redacts secrets and rotates bounded log files", () => {
  const root = temporaryRoot("cyvx-log-controls-");
  const logPath = path.join(root, "runtime.jsonl");
  const logger = new JsonLogger(logPath, { maxBytes: 140, keep: 2 });
  for (let index = 0; index < 8; index += 1) {
    logger.write("info", "control.test", {
      index,
      authorization: "Bearer never-write-this-token",
      password: "never-write-this-password",
      api_key: "never-write-this-key",
      safe: "visible",
    });
  }
  assert.equal(fs.existsSync(logPath), true);
  assert.equal(fs.existsSync(`${logPath}.1`), true);
  const combined = fs.readdirSync(root).map((name) => fs.readFileSync(path.join(root, name), "utf8")).join("\n");
  assert.doesNotMatch(combined, /never-write-this/);
  assert.match(combined, /\[REDACTED\]/);
  assert.match(combined, /visible/);
  fs.rmSync(root, { recursive: true, force: true });
});

test("failed jobs are inspectable safely requeued and completed by a replacement worker", async (t) => {
  const harness = await createHarness();
  t.after(() => harness.close());
  const prepared = await createApprovedQueuedMission(harness, { title: "Safe requeue mission" });
  const queued = await queueMission(harness, prepared.mission.id, {
    correlationId: prepared.correlationId,
    idempotencyKey: `safe-requeue:${prepared.mission.id}`,
  });
  const jobId = queued.payload.job.id;
  const timestamp = new Date().toISOString();
  harness.runtime.db.prepare(`UPDATE jobs SET status='failed',attempts=max_attempts,last_error='forced terminal failure',
    completed_at=?,updated_at=? WHERE id=?`).run(timestamp, timestamp, jobId);
  harness.runtime.db.prepare(`UPDATE missions SET status='failed',updated_at=?,payload=json_set(payload,'$.status','failed','$.updated_at',?)
    WHERE id=?`).run(timestamp, timestamp, prepared.mission.id);

  const failed = await expectStatus(request(harness, "GET", "/api/v1/jobs/failed", harness.tokens["admin-a"]), 200);
  assert.equal(failed.payload.jobs.length, 1);
  assert.equal(failed.payload.jobs[0].id, jobId);
  assert.equal(failed.payload.jobs[0].last_error, "forced terminal failure");

  const requeued = await expectStatus(request(harness, "POST", `/api/v1/jobs/${jobId}/requeue`, harness.tokens["admin-a"], {}), 200);
  assert.equal(requeued.payload.job.status, "queued");
  assert.equal(Number(requeued.payload.job.attempts), 0);
  assert.equal(requeued.payload.job.last_error, null);
  const missionAfterRequeue = harness.runtime.db.prepare("SELECT status FROM missions WHERE id=?").get(prepared.mission.id);
  assert.equal(missionAfterRequeue.status, "queued");

  const worker = harness.runtime.createWorker({ workerId: "worker-after-safe-requeue", pollMs: 10 });
  const completed = await worker.runOnce();
  assert.equal(completed.status, "completed");
  const finalMission = harness.runtime.db.prepare("SELECT status FROM missions WHERE id=?").get(prepared.mission.id);
  assert.equal(finalMission.status, "learned");

  const audits = await expectStatus(request(harness, "GET", `/api/v1/missions/${prepared.mission.id}/audits`, harness.tokens["viewer-a"]), 200);
  assert.equal(audits.payload.audits.some((audit) => audit.resource_type === "job" && audit.resource_id === jobId), true);
  assert.equal(audits.payload.audits.some((audit) => audit.action === "requeue_checkpoint"), true);
});
