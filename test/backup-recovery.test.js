"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { createBackup, restoreBackup, verifyArchive, verifyBackup } = require("../core/production/backup_manager");

const KEY = "test-backup-encryption-key-abcdefghijklmnopqrstuvwxyz";

test("encrypted backup completes a full ownership and recovery lifecycle", async () => {
  const source = fs.mkdtempSync(path.join(os.tmpdir(), "cyvx-backup-test-source-"));
  const target = path.join(os.tmpdir(), `cyvx-backup-test-target-${process.pid}-${Date.now()}`);
  const backupPath = path.join(os.tmpdir(), `cyvx-backup-test-${process.pid}-${Date.now()}.cyvxbak`);
  fs.mkdirSync(path.join(source, "worlds", "alpha"), { recursive: true });
  fs.writeFileSync(path.join(source, "state.json"), JSON.stringify({ status: "operational", count: 7 }));
  fs.writeFileSync(path.join(source, "worlds", "alpha", "proof.txt"), "verified outcome\n");

  const backup = await createBackup({ dataRoot: source, outputPath: backupPath, encryptionKey: KEY });
  assert.equal(backup.ok, true);
  assert.equal(backup.files, 2);
  assert.equal(backup.uploaded, false);
  assert.ok(backup.backup_bytes > 0);

  const verification = verifyBackup({ inputPath: backupPath, encryptionKey: KEY });
  assert.equal(verification.ok, true);
  assert.equal(verification.dry_run, true);
  assert.equal(verification.files, 2);

  const recovery = restoreBackup({ inputPath: backupPath, targetRoot: target, encryptionKey: KEY });
  assert.equal(recovery.ok, true);
  assert.deepEqual(
    JSON.parse(fs.readFileSync(path.join(target, "state.json"), "utf8")),
    { status: "operational", count: 7 },
  );
  assert.equal(fs.readFileSync(path.join(target, "worlds", "alpha", "proof.txt"), "utf8"), "verified outcome\n");

  assert.throws(() => restoreBackup({ inputPath: backupPath, targetRoot: `${target}-wrong`, encryptionKey: `${KEY}-wrong` }), { code: "CYVX_BACKUP_DECRYPT_FAILED" });
  fs.rmSync(source, { recursive: true, force: true });
  fs.rmSync(target, { recursive: true, force: true });
  fs.rmSync(`${target}-wrong`, { recursive: true, force: true });
  fs.rmSync(backupPath, { force: true });
});

test("archive verification rejects traversal paths", () => {
  const content = Buffer.from("unsafe");
  const archive = {
    format: "cyvx-backup-v1",
    files: [{ path: "../escape.txt", size: content.length, sha256: require("node:crypto").createHash("sha256").update(content).digest("hex"), content_base64: content.toString("base64") }],
  };
  archive.manifest_sha256 = require("node:crypto").createHash("sha256").update(Buffer.from(JSON.stringify([{ path: "../escape.txt", size: content.length, sha256: archive.files[0].sha256 }]))).digest("hex");
  assert.throws(() => verifyArchive(archive), { code: "CYVX_BACKUP_PATH_INVALID" });
});
