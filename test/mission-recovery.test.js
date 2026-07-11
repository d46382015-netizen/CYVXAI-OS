"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const { spawn, spawnSync } = require("node:child_process");
const test = require("node:test");
const {
  AUTH_SECRET,
  createHarness,
  createApprovedQueuedMission,
  queueMission,
  waitFor,
} = require("./mission-runtime-helpers");

function workerEnvironment(harness, extra = {}) {
  return {
    ...process.env,
    NODE_ENV: "test",
    CYVX_ENV: "test",
    CYVX_ALLOW_INSECURE_LOCAL: "true",
    CYVX_AUTH_SECRET: AUTH_SECRET,
    CYVX_DATA_ROOT: harness.dataRoot,
    CYVX_EVIDENCE_ROOT: harness.runtime.artifactRoot,
    CYVX_JOB_LEASE_MS: "150",
    CYVX_WORKER_POLL_MS: "20",
    ...extra,
  };
}

test("claimed work survives interruption lease expiry and a new worker without duplicate effects", async (t) => {
  const harness = await createHarness({ leaseMs: 150, keepData: true });
  t.after(async () => {
    await harness.close();
    require("node:fs").rmSync(harness.dataRoot, { recursive: true, force: true });
  });

  const prepared = await createApprovedQueuedMission(harness, { title: "Restart recovery mission" });
  const queued = await queueMission(harness, prepared.mission.id, {
    correlationId: prepared.correlationId,
    idempotencyKey: `recovery:${prepared.mission.id}`,
  });
  const jobId = queued.payload.job.id;
  const workerScript = path.resolve(__dirname, "../runtime/missions/worker.js");

  const interrupted = spawnSync(process.execPath, [workerScript], {
    cwd: path.resolve(__dirname, ".."),
    env: workerEnvironment(harness, {
      CYVX_WORKER_ID: "worker-interrupted",
      CYVX_WORKER_CRASH_AFTER_CLAIM: "1",
    }),
    encoding: "utf8",
    timeout: 10_000,
  });
  assert.equal(interrupted.status, 99, `${interrupted.stdout}\n${interrupted.stderr}`);
  const leased = harness.runtime.db.prepare("SELECT * FROM jobs WHERE id=?").get(jobId);
  assert.equal(leased.status, "leased");
  assert.equal(leased.lease_owner, "worker-interrupted");
  assert.equal(Number(leased.attempts), 1);
  assert.equal(harness.runtime.db.prepare("SELECT COUNT(*) AS count FROM execution_effects WHERE job_id=?").get(jobId).count, 0);

  await new Promise((resolve) => setTimeout(resolve, 225));
  const recovering = spawn(process.execPath, [workerScript], {
    cwd: path.resolve(__dirname, ".."),
    env: workerEnvironment(harness, { CYVX_WORKER_ID: "worker-recovered" }),
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  recovering.stdout.on("data", (chunk) => { output += chunk; });
  recovering.stderr.on("data", (chunk) => { output += chunk; });
  t.after(() => { if (recovering.exitCode === null) recovering.kill("SIGTERM"); });

  const completed = await waitFor(() => {
    const row = harness.runtime.db.prepare("SELECT status FROM jobs WHERE id=?").get(jobId);
    return row && row.status === "completed" ? row : null;
  }, 8_000, 30);
  assert.equal(completed.status, "completed");

  recovering.kill("SIGTERM");
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Recovered worker did not stop\n${output}`)), 5_000);
    recovering.once("exit", () => { clearTimeout(timeout); resolve(); });
  });

  const recoveredJob = harness.runtime.db.prepare("SELECT * FROM jobs WHERE id=?").get(jobId);
  assert.equal(recoveredJob.status, "completed");
  assert.equal(Number(recoveredJob.attempts), 2);
  assert.equal(recoveredJob.lease_owner, null);
  assert.ok(recoveredJob.result_hash);

  const mission = harness.runtime.db.prepare("SELECT status FROM missions WHERE id=?").get(prepared.mission.id);
  assert.equal(mission.status, "learned");
  assert.equal(Number(harness.runtime.db.prepare("SELECT COUNT(*) AS count FROM execution_effects WHERE job_id=?").get(jobId).count), 1);
  assert.equal(Number(harness.runtime.db.prepare("SELECT COUNT(*) AS count FROM evidence WHERE job_id=?").get(jobId).count), 1);
  assert.equal(Number(harness.runtime.db.prepare("SELECT COUNT(*) AS count FROM outcomes WHERE job_id=?").get(jobId).count), 1);
  assert.equal(Number(harness.runtime.db.prepare("SELECT COUNT(*) AS count FROM learning_records WHERE mission_id=?").get(prepared.mission.id).count), 1);

  const events = harness.runtime.db.prepare("SELECT type FROM events WHERE organization_id='org-a' AND json_extract(data,'$.job_id')=? ORDER BY timestamp").all(jobId);
  const eventTypes = events.map((event) => event.type);
  assert.ok(eventTypes.includes("job.leased"));
  assert.ok(eventTypes.includes("job.lease_expired"));
  assert.ok(eventTypes.includes("job.running"));
  assert.ok(eventTypes.includes("job.completed"));
  assert.equal(eventTypes.filter((type) => type === "job.completed").length, 1);

  const audits = harness.runtime.db.prepare("SELECT action FROM audit_log WHERE organization_id='org-a' AND resource_type='job' AND resource_id=?").all(jobId);
  assert.ok(audits.length >= 5);
  const verification = harness.runtime.evidence.verify({ user_id: "admin-a", organization_id: "org-a", role: "admin" }, { mission_id: prepared.mission.id });
  assert.equal(verification.valid, true);
  assert.equal(verification.records_checked, 1);
});
