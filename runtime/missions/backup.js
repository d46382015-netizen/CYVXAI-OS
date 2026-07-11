"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { APP_VERSION, SCHEMA_VERSION, RuntimeError, now, sha256, safeArtifactPath } = require("./base");

function hashFile(file) { return sha256(fs.readFileSync(file)); }
function walk(root, prefix = "") {
  if (!fs.existsSync(root)) return [];
  const files = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const relative = path.join(prefix, entry.name);
    const absolute = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...walk(absolute, relative));
    else files.push(relative.replace(/\\/g, "/"));
  }
  return files.sort();
}

function verifyBackupDirectory(root) {
  const manifestFile = path.join(root, "manifest.json");
  if (!fs.existsSync(manifestFile)) throw new RuntimeError("BACKUP_INVALID", "Backup manifest is missing", 400);
  let manifest;
  try { manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8")); }
  catch { throw new RuntimeError("BACKUP_INVALID", "Backup manifest is invalid JSON", 400); }
  const errors = [];
  if (manifest.format !== "cyvx-mission-backup-v1") errors.push({ file: "manifest.json", error: "unsupported_format" });
  if (!Number.isInteger(Number(manifest.schema_version))) errors.push({ file: "manifest.json", error: "schema_version_missing" });
  for (const required of ["database.sqlite", "config.json"]) {
    if (!fs.existsSync(path.join(root, required))) errors.push({ file: required, error: "missing" });
  }
  for (const [relative, expected] of Object.entries(manifest.checksums || {})) {
    let file;
    try { file = safeArtifactPath(root, relative); }
    catch { errors.push({ file: relative, error: "unsafe_path" }); continue; }
    if (!fs.existsSync(file)) errors.push({ file: relative, error: "missing" });
    else if (hashFile(file) !== expected) errors.push({ file: relative, error: "checksum_mismatch" });
  }
  return { valid: errors.length === 0, errors, manifest };
}

function createBackup({ runtime, output }) {
  const destination = path.resolve(output || path.join(runtime.dataRoot, "backups", `cyvx-mission-${Date.now()}.tar.gz`));
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "cyvx-backup-"));
  const root = path.join(temporary, "backup");
  fs.mkdirSync(root);
  try {
    runtime.db.exec("PRAGMA wal_checkpoint(FULL)");
    const database = path.join(root, "database.sqlite");
    runtime.db.exec(`VACUUM INTO '${database.replace(/'/g, "''")}'`);
    const artifacts = path.join(root, "artifacts");
    if (fs.existsSync(runtime.artifactRoot)) fs.cpSync(runtime.artifactRoot, artifacts, { recursive: true });
    else fs.mkdirSync(artifacts);
    const configuration = {
      application_version: APP_VERSION,
      schema_version: SCHEMA_VERSION,
      database_file: "database.sqlite",
      artifact_directory: "artifacts",
      created_at: now(),
    };
    fs.writeFileSync(path.join(root, "config.json"), `${JSON.stringify(configuration, null, 2)}\n`, { mode: 0o600 });
    const checksums = {};
    for (const relative of walk(root)) {
      if (relative !== "manifest.json") checksums[relative] = hashFile(path.join(root, relative));
    }
    const manifest = {
      format: "cyvx-mission-backup-v1",
      created_at: now(),
      application_version: APP_VERSION,
      schema_version: SCHEMA_VERSION,
      checksums,
    };
    fs.writeFileSync(path.join(root, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
    const verified = verifyBackupDirectory(root);
    if (!verified.valid) throw new RuntimeError("BACKUP_VERIFY_FAILED", "Backup verification failed", 500, verified.errors);
    const tar = spawnSync("tar", ["-czf", destination, "-C", temporary, "backup"], { encoding: "utf8" });
    if (tar.status !== 0) throw new RuntimeError("BACKUP_ARCHIVE_FAILED", tar.stderr || "Unable to create backup archive", 500);
    return { ok: true, path: destination, manifest, archive_sha256: hashFile(destination) };
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
}

function inspectArchive(archive) {
  const listing = spawnSync("tar", ["-tzf", archive], { encoding: "utf8" });
  if (listing.status !== 0) throw new RuntimeError("BACKUP_INVALID", listing.stderr || "Unable to inspect backup archive", 400);
  const entries = listing.stdout.split(/\r?\n/).filter(Boolean);
  if (!entries.length || entries.some((entry) => !entry.startsWith("backup/") || entry.includes("../") || path.isAbsolute(entry))) {
    throw new RuntimeError("BACKUP_INVALID", "Backup archive contains unsafe paths", 400);
  }
}

function extractArchive(archive) {
  inspectArchive(archive);
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "cyvx-restore-"));
  const tar = spawnSync("tar", ["-xzf", path.resolve(archive), "-C", temporary], { encoding: "utf8" });
  if (tar.status !== 0) {
    fs.rmSync(temporary, { recursive: true, force: true });
    throw new RuntimeError("BACKUP_INVALID", tar.stderr || "Unable to extract backup archive", 400);
  }
  return { temporary, root: path.join(temporary, "backup") };
}

function restoreBackup({ archive, targetDataRoot, allow = false }) {
  if (!allow && process.env.CYVX_ALLOW_RESTORE !== "1") {
    throw new RuntimeError("RESTORE_PROTECTED", "Set CYVX_ALLOW_RESTORE=1 to authorize restore", 403);
  }
  const target = path.resolve(targetDataRoot);
  if (target === path.parse(target).root || target.length < 6) throw new RuntimeError("RESTORE_TARGET_INVALID", "Restore target is unsafe", 400);
  const extracted = extractArchive(archive);
  try {
    const verification = verifyBackupDirectory(extracted.root);
    if (!verification.valid) throw new RuntimeError("BACKUP_INVALID", "Backup checksums failed", 400, verification.errors);
    if (Number(verification.manifest.schema_version) > SCHEMA_VERSION) {
      throw new RuntimeError("BACKUP_SCHEMA_UNSUPPORTED", "Backup schema is newer than this application", 400);
    }
    fs.mkdirSync(target, { recursive: true });
    const existing = fs.readdirSync(target).filter((name) => !["logs"].includes(name));
    if (existing.length) throw new RuntimeError("RESTORE_TARGET_NOT_EMPTY", "Restore target must be clean", 409, { existing });
    fs.copyFileSync(path.join(extracted.root, "database.sqlite"), path.join(target, "mission-runtime.db"));
    fs.cpSync(path.join(extracted.root, "artifacts"), path.join(target, "evidence"), { recursive: true });
    fs.copyFileSync(path.join(extracted.root, "config.json"), path.join(target, "restored-config.json"));
    return { ok: true, target, manifest: verification.manifest };
  } finally {
    fs.rmSync(extracted.temporary, { recursive: true, force: true });
  }
}

module.exports = { createBackup, restoreBackup, verifyBackupDirectory, hashFile, walk };
