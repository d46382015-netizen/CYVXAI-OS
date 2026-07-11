"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { createMissionRuntime, createMissionHttpServer } = require("../runtime/missions");
const { createBackup, restoreBackup, hashFile } = require("../runtime/missions/backup");
const {
  AUTH_SECRET,
  createHarness,
  createApprovedQueuedMission,
  expectStatus,
  queueMission,
  request,
} = require("./mission-runtime-helpers");

async function complete(harness, title) {
  const prepared = await createApprovedQueuedMission(harness, { title });
  await queueMission(harness, prepared.mission.id, { correlationId: prepared.correlationId });
  const worker = harness.runtime.createWorker({ workerId: `worker-${title.replace(/\W/g, "-")}`, pollMs: 10 });
  const result = await worker.runOnce();
  assert.equal(result.status, "completed");
  return prepared.mission.id;
}

test("backup verifies manifest and checksums restores into a clean runtime and executes new work", async (t) => {
  const harness = await createHarness({ keepData: true });
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "cyvx-backup-test-"));
  t.after(async () => {
    await harness.close();
    fs.rmSync(harness.dataRoot, { recursive: true, force: true });
    fs.rmSync(scratch, { recursive: true, force: true });
  });

  const originalMissionId = await complete(harness, "Pre-backup mission");
  const archive = path.join(scratch, "verified-backup.tar.gz");
  const backup = createBackup({ runtime: harness.runtime, output: archive });
  assert.equal(backup.ok, true);
  assert.equal(fs.existsSync(archive), true);
  assert.equal(backup.archive_sha256, hashFile(archive));
  assert.equal(backup.manifest.format, "cyvx-mission-backup-v1");
  assert.equal(backup.manifest.schema_version, 2);
  assert.ok(backup.manifest.application_version);
  assert.ok(backup.manifest.created_at);
  for (const required of ["database.sqlite", "config.json"]) {
    assert.ok(backup.manifest.checksums[required], `missing checksum for ${required}`);
  }
  assert.equal(Object.keys(backup.manifest.checksums).some((name) => name.startsWith("artifacts/")), true);

  const restoredRoot = path.join(scratch, "restored");
  const restored = restoreBackup({ archive, targetDataRoot: restoredRoot, allow: true });
  assert.equal(restored.ok, true);
  assert.equal(restored.manifest.schema_version, 2);

  const runtime = createMissionRuntime({
    dataRoot: restoredRoot,
    authSecret: AUTH_SECRET,
    allowLocalAuth: true,
    leaseMs: 200,
    mutationLimit: 1000,
    authLimit: 1000,
  });
  const server = createMissionHttpServer(runtime);
  const address = await server.listen(0, "127.0.0.1");
  const restoredHarness = {
    runtime,
    httpRuntime: server,
    dataRoot: restoredRoot,
    baseUrl: `http://127.0.0.1:${address.port}`,
    tokens: {
      "admin-a": runtime.issueToken({ sub: "admin-a", organization_id: "org-a", role: "admin" }, 3600),
      "approver-a": runtime.issueToken({ sub: "approver-a", organization_id: "org-a", role: "approver" }, 3600),
      "agent-a": runtime.issueToken({ sub: "agent-a", organization_id: "org-a", role: "agent" }, 3600),
      "viewer-a": runtime.issueToken({ sub: "viewer-a", organization_id: "org-a", role: "viewer" }, 3600),
    },
  };
  t.after(async () => {
    await server.close();
    runtime.close();
  });

  const retrieved = await expectStatus(request(restoredHarness, "GET", `/api/v1/missions/${originalMissionId}`, restoredHarness.tokens["viewer-a"]), 200);
  assert.equal(retrieved.payload.graph.mission.status, "learned");
  const proof = await expectStatus(request(restoredHarness, "GET", `/api/v1/missions/${originalMissionId}/proof`, restoredHarness.tokens["viewer-a"]), 200);
  assert.equal(proof.payload.proof.verification.valid, true);
  assert.equal(proof.payload.proof.verification.records_checked, 1);

  const restoredMissionId = await complete(restoredHarness, "Post-restore mission");
  const restoredMission = await expectStatus(request(restoredHarness, "GET", `/api/v1/missions/${restoredMissionId}`, restoredHarness.tokens["viewer-a"]), 200);
  assert.equal(restoredMission.payload.graph.mission.status, "learned");
  const restoredVerification = runtime.evidence.verify({ user_id: "viewer-a", organization_id: "org-a", role: "viewer" }, { mission_id: restoredMissionId });
  assert.equal(restoredVerification.valid, true);

  const rejectedTarget = path.join(scratch, "rejected");
  fs.mkdirSync(rejectedTarget, { recursive: true });
  fs.writeFileSync(path.join(rejectedTarget, "existing.txt"), "do not overwrite");
  assert.throws(() => restoreBackup({ archive, targetDataRoot: rejectedTarget, allow: true }), /clean|empty/i);

  const corrupted = path.join(scratch, "corrupted.tar.gz");
  const bytes = fs.readFileSync(archive);
  bytes[Math.floor(bytes.length / 2)] ^= 0xff;
  fs.writeFileSync(corrupted, bytes);
  assert.throws(() => restoreBackup({ archive: corrupted, targetDataRoot: path.join(scratch, "corrupt-target"), allow: true }), /invalid|checksum|archive|extract/i);
});
