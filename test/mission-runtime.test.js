"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const {
  createHarness,
  createApprovedQueuedMission,
  expectStatus,
  queueMission,
  request,
} = require("./mission-runtime-helpers");

async function completeMission(harness, title) {
  const prepared = await createApprovedQueuedMission(harness, { title });
  const queued = await queueMission(harness, prepared.mission.id, { correlationId: prepared.correlationId });
  const duplicate = await queueMission(harness, prepared.mission.id, {
    correlationId: prepared.correlationId,
    idempotencyKey: `execute:${prepared.mission.id}`,
  });
  assert.equal(duplicate.payload.job.id, queued.payload.job.id, "idempotency must return the same durable job");
  const worker = harness.runtime.createWorker({ workerId: "worker-test", pollMs: 10 });
  const completed = await worker.runOnce();
  assert.equal(completed.status, "completed");
  return { ...prepared, job: completed };
}

test("runtime migrates from zero and exposes structured authentication and security responses", async (t) => {
  const harness = await createHarness();
  t.after(() => harness.close());

  const migrations = harness.runtime.db.prepare("SELECT version,name FROM schema_migrations ORDER BY version").all();
  assert.deepEqual(migrations.map((row) => row.version), [1, 2]);
  assert.equal(harness.runtime.db.prepare("PRAGMA journal_mode").get().journal_mode.toLowerCase(), "wal");
  assert.equal(Number(harness.runtime.db.prepare("PRAGMA busy_timeout").get().timeout), 5000);

  const unauthenticated = await request(harness, "GET", "/api/v1/missions");
  assert.equal(unauthenticated.status, 401);
  assert.equal(unauthenticated.payload.error, "AUTH_REQUIRED");
  assert.ok(unauthenticated.payload.correlation_id);
  assert.equal(unauthenticated.response.headers.get("x-content-type-options"), "nosniff");
  assert.match(unauthenticated.response.headers.get("content-security-policy"), /default-src/);

  const invalid = await request(harness, "POST", "/api/v1/auth/token", null, "{invalid");
  assert.equal(invalid.status, 400);
  assert.equal(invalid.payload.error, "INVALID_JSON");

  const forbiddenOrigin = await request(harness, "GET", "/api/v1/missions", harness.tokens["admin-a"], undefined, { origin: "http://rejected.test" });
  assert.equal(forbiddenOrigin.status, 403);
  assert.equal(forbiddenOrigin.payload.error, "CORS_REJECTED");

  const unknown = await request(harness, "GET", "/api/v1/not-a-real-route", harness.tokens["admin-a"]);
  assert.equal(unknown.status, 404);
  assert.equal(unknown.payload.error, "NOT_FOUND");
  assert.equal(Object.prototype.hasOwnProperty.call(unknown.payload, "stack"), false);
});

test("approved mission queues a durable job and a separate worker completes evidence outcome and learning", async (t) => {
  const harness = await createHarness();
  t.after(() => harness.close());
  const { mission, job, correlationId } = await completeMission(harness, "Complete production runtime path");

  const graph = await expectStatus(request(harness, "GET", `/api/v1/missions/${mission.id}`, harness.tokens["admin-a"]), 200);
  assert.equal(graph.payload.graph.mission.status, "learned");
  assert.equal(graph.payload.graph.mission.organization_id, "org-a", "client organization override must be ignored");
  assert.equal(graph.payload.graph.mission.created_by, "admin-a", "client actor override must be ignored");
  assert.equal(graph.payload.graph.evidence.length, 1);
  assert.equal(graph.payload.graph.outcomes.length, 1);

  const jobResponse = await expectStatus(request(harness, "GET", `/api/v1/jobs/${job.id}`, harness.tokens["admin-a"]), 200);
  assert.equal(jobResponse.payload.job.status, "completed");
  assert.equal(jobResponse.payload.job.attempts, 1);
  assert.ok(jobResponse.payload.job.result_hash);

  const verification = await expectStatus(request(harness, "POST", "/api/v1/evidence/verify", harness.tokens["viewer-a"], { mission_id: mission.id }), 200);
  assert.equal(verification.payload.report.valid, true);
  assert.equal(verification.payload.report.records_checked, 1);
  assert.equal(verification.payload.report.artifacts_checked, 1);

  const proof = await expectStatus(request(harness, "GET", `/api/v1/missions/${mission.id}/proof`, harness.tokens["viewer-a"]), 200);
  assert.equal(proof.payload.proof.verification.valid, true);
  assert.equal(proof.payload.proof.outcome.status, "completed");

  const events = await expectStatus(request(harness, "GET", `/api/v1/missions/${mission.id}/events`, harness.tokens["viewer-a"]), 200);
  const eventTypes = new Set(events.payload.events.map((event) => event.type));
  for (const required of ["mission.created", "approval.approved", "job.queued", "job.leased", "job.running", "evidence.recorded", "mission.completed", "mission.evaluated", "capability.learned", "job.completed"]) {
    assert.equal(eventTypes.has(required), true, `missing event ${required}`);
  }
  assert.equal(events.payload.events.some((event) => event.correlation_id === correlationId), true);
  assert.equal(events.payload.events.some((event) => event.causation_id), true);

  const audits = await expectStatus(request(harness, "GET", `/api/v1/missions/${mission.id}/audits`, harness.tokens["viewer-a"]), 200);
  assert.ok(audits.payload.audits.length >= 8);
  assert.equal(audits.payload.audits.some((audit) => audit.actor === "admin-a"), true);
  assert.equal(audits.payload.audits.some((audit) => String(audit.actor).startsWith("worker:")), true);

  const effects = harness.runtime.db.prepare("SELECT COUNT(*) AS count FROM execution_effects WHERE mission_id=?").get(mission.id);
  const outcomes = harness.runtime.db.prepare("SELECT COUNT(*) AS count FROM outcomes WHERE mission_id=?").get(mission.id);
  const evidence = harness.runtime.db.prepare("SELECT COUNT(*) AS count FROM evidence WHERE mission_id=?").get(mission.id);
  assert.equal(Number(effects.count), 1);
  assert.equal(Number(outcomes.count), 1);
  assert.equal(Number(evidence.count), 1);
});

test("tenant isolation and RBAC deny every cross-organization and unauthorized operation", async (t) => {
  const harness = await createHarness();
  t.after(() => harness.close());
  const completed = await completeMission(harness, "Tenant isolation mission");
  const missionId = completed.mission.id;
  const approvalId = completed.approval.id;
  const jobId = completed.job.id;
  const evidenceRow = harness.runtime.db.prepare("SELECT id FROM evidence WHERE mission_id=?").get(missionId);

  await expectStatus(request(harness, "POST", "/api/v1/missions", harness.tokens["viewer-a"], { title: "denied", objective: "denied" }), 403, "PERMISSION_DENIED");
  await expectStatus(request(harness, "POST", "/api/v1/missions", harness.tokens["approver-a"], { title: "denied", objective: "denied" }), 403, "PERMISSION_DENIED");
  await expectStatus(request(harness, "POST", `/api/v1/missions/${missionId}/cancel`, harness.tokens["agent-a"], { reason: "denied" }), 403, "PERMISSION_DENIED");
  await expectStatus(request(harness, "POST", `/api/v1/jobs/${jobId}/requeue`, harness.tokens["agent-a"], {}), 403, "PERMISSION_DENIED");

  const crossOrganizationChecks = [
    request(harness, "GET", `/api/v1/missions/${missionId}`, harness.tokens["admin-b"]),
    request(harness, "POST", `/api/v1/missions/${missionId}/validate`, harness.tokens["admin-b"], { feasible: true }),
    request(harness, "POST", `/api/v1/approvals/${approvalId}/decide`, harness.tokens["approver-b"], { decision: "approved" }),
    request(harness, "POST", `/api/v1/missions/${missionId}/execute`, harness.tokens["agent-b"], {}),
    request(harness, "POST", `/api/v1/missions/${missionId}/cancel`, harness.tokens["admin-b"], {}),
    request(harness, "POST", "/api/v1/evidence/verify", harness.tokens["viewer-b"], { mission_id: missionId }),
    request(harness, "GET", `/api/v1/missions/${missionId}/export`, harness.tokens["viewer-b"]),
    request(harness, "GET", `/api/v1/jobs/${jobId}`, harness.tokens["admin-b"]),
    request(harness, "GET", `/api/v1/evidence/${evidenceRow.id}`, harness.tokens["viewer-b"]),
    request(harness, "GET", `/api/v1/missions/${missionId}/outcome`, harness.tokens["viewer-b"]),
    request(harness, "GET", `/api/v1/missions/${missionId}/events`, harness.tokens["viewer-b"]),
    request(harness, "GET", `/api/v1/missions/${missionId}/audits`, harness.tokens["viewer-b"]),
  ];
  for (const resultPromise of crossOrganizationChecks) {
    const result = await resultPromise;
    assert.ok([403, 404, 409].includes(result.status), result.text);
    assert.notEqual(result.status, 200);
  }

  const listed = await expectStatus(request(harness, "GET", "/api/v1/missions", harness.tokens["viewer-b"]), 200);
  assert.equal(listed.payload.missions.length, 0);
});

test("assigned-agent enforcement rejects an unassigned execution identity", async (t) => {
  const harness = await createHarness();
  t.after(() => harness.close());
  const prepared = await createApprovedQueuedMission(harness, { title: "Assigned agent boundary" });
  harness.runtime.db.prepare("INSERT OR REPLACE INTO users(id,organization_id,role,active,created_at,updated_at) VALUES('agent-a2','org-a','agent',1,datetime('now'),datetime('now'))").run();
  const token = harness.runtime.issueToken({ sub: "agent-a2", organization_id: "org-a", role: "agent" }, 3600);
  await expectStatus(request(harness, "POST", `/api/v1/missions/${prepared.mission.id}/execute`, token, {}), 403, "PERMISSION_DENIED");
  const allowed = await queueMission(harness, prepared.mission.id);
  assert.equal(allowed.payload.job.status, "queued");
});

test("evidence verifier detects artifact record chain link hash and ordering corruption", async (t) => {
  const harness = await createHarness();
  t.after(() => harness.close());
  const completed = await completeMission(harness, "Evidence tamper mission");
  const auth = { user_id: "admin-a", organization_id: "org-a", role: "admin" };
  const second = harness.runtime.evidence.record({
    auth,
    missionId: completed.mission.id,
    content: { checkpoint: 2, verified: true },
    title: "Second checkpoint",
    type: "checkpoint",
    correlationId: completed.correlationId,
  });
  assert.equal(second.sequence, 2);

  const rows = harness.runtime.db.prepare("SELECT * FROM evidence WHERE mission_id=? ORDER BY sequence").all(completed.mission.id);
  const first = rows[0];
  const secondRow = rows[1];
  const firstArtifact = path.join(harness.runtime.artifactRoot, first.artifact_path);
  const originalArtifact = fs.readFileSync(firstArtifact);
  const verify = () => harness.runtime.evidence.verify(auth, { mission_id: completed.mission.id });
  assert.equal(verify().valid, true);

  fs.appendFileSync(firstArtifact, "corruption");
  let report = verify();
  assert.equal(report.valid, false);
  assert.equal(report.errors.some((error) => error.code === "ARTIFACT_HASH_INVALID"), true);
  fs.writeFileSync(firstArtifact, originalArtifact);

  harness.runtime.db.prepare("UPDATE evidence SET record_json=? WHERE id=?").run('{"modified":true}', first.id);
  report = verify();
  assert.equal(report.errors.some((error) => error.code === "RECORD_HASH_INVALID"), true);
  harness.runtime.db.prepare("UPDATE evidence SET record_json=? WHERE id=?").run(first.record_json, first.id);

  harness.runtime.db.prepare("UPDATE evidence SET chain_hash=? WHERE id=?").run("0".repeat(64), first.id);
  report = verify();
  assert.equal(report.errors.some((error) => error.code === "CHAIN_HASH_INVALID"), true);
  harness.runtime.db.prepare("UPDATE evidence SET chain_hash=? WHERE id=?").run(first.chain_hash, first.id);

  harness.runtime.db.prepare("UPDATE evidence SET previous_chain_hash=? WHERE id=?").run("broken-link", secondRow.id);
  report = verify();
  assert.equal(report.errors.some((error) => error.code === "PREVIOUS_CHAIN_INVALID"), true);
  harness.runtime.db.prepare("UPDATE evidence SET previous_chain_hash=? WHERE id=?").run(secondRow.previous_chain_hash, secondRow.id);

  harness.runtime.db.prepare("UPDATE evidence SET sequence=3 WHERE id=?").run(secondRow.id);
  report = verify();
  assert.equal(report.errors.some((error) => error.code === "EVIDENCE_ORDER_INVALID"), true);
  harness.runtime.db.prepare("UPDATE evidence SET sequence=2 WHERE id=?").run(secondRow.id);

  harness.runtime.db.exec("DROP INDEX idx_evidence_mission_sequence");
  harness.runtime.db.prepare("UPDATE evidence SET sequence=1 WHERE id=?").run(secondRow.id);
  report = verify();
  assert.equal(report.errors.some((error) => error.code === "EVIDENCE_SEQUENCE_DUPLICATE"), true);
});

test("UI is server-served uses real endpoints and contains operational states instead of mock totals", async (t) => {
  const harness = await createHarness();
  t.after(() => harness.close());
  const response = await fetch(`${harness.baseUrl}/missions`);
  const html = await response.text();
  assert.equal(response.status, 200);
  for (const required of ["/api/v1/missions", "/api/v1/evidence/verify", "Worker offline", "Viewer access is read-only", "No missions exist", "confirm("]) {
    assert.match(html, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.doesNotMatch(html, /mock mission|hardcoded operational totals/i);
});
