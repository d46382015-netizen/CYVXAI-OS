"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const zlib = require("node:zlib");
const { backupStorageToken, backupStorageUrl } = require("../security/production_guard");

const ARCHIVE_FORMAT = "cyvx-backup-v1";
const ENVELOPE_FORMAT = "cyvx-encrypted-backup-v1";

async function createBackup(options = {}) {
  const env = options.env || process.env;
  const dataRoot = path.resolve(options.dataRoot || env.CYVX_DATA_ROOT || path.join(os.homedir(), ".cyvx"));
  const encryptionKey = String(options.encryptionKey || env.CYVX_BACKUP_ENCRYPTION_KEY || "");
  if (encryptionKey.length < 32) throw coded("CYVX_BACKUP_KEY_INVALID", "CYVX_BACKUP_ENCRYPTION_KEY must contain at least 32 characters");
  const maxBytes = positive(options.maxBytes || env.CYVX_BACKUP_MAX_BYTES, 512 * 1024 * 1024);
  const archive = collectArchive(dataRoot, { maxBytes, exclude: options.exclude });
  const envelope = encryptArchive(archive, encryptionKey);
  const timestamp = archive.created_at.replace(/[:.]/g, "-");
  const fileName = options.fileName || `cyvx-${env.CYVX_ENV || env.NODE_ENV || "environment"}-${timestamp}.cyvxbak`;
  const outputPath = path.resolve(options.outputPath || path.join(dataRoot, "backups", fileName));
  atomicWrite(outputPath, `${JSON.stringify(envelope)}\n`, 0o600);
  const result = {
    ok: true,
    format: ENVELOPE_FORMAT,
    created_at: archive.created_at,
    backup_id: archive.backup_id,
    source_root: dataRoot,
    output_path: outputPath,
    file_name: path.basename(outputPath),
    files: archive.files.length,
    source_bytes: archive.source_bytes,
    backup_bytes: fs.statSync(outputPath).size,
    sha256: sha256(fs.readFileSync(outputPath)),
    uploaded: false,
    remote_key: null,
  };
  if (options.upload || truthy(env.CYVX_BACKUP_UPLOAD)) {
    const remote = await uploadBackup(outputPath, { env, key: options.remoteKey });
    result.uploaded = true;
    result.remote_key = remote.key;
    result.remote_status = remote.status;
  }
  return result;
}

function restoreBackup(options = {}) {
  const env = options.env || process.env;
  const inputPath = path.resolve(String(options.inputPath || ""));
  const targetRoot = path.resolve(options.targetRoot || env.CYVX_RESTORE_ROOT || env.CYVX_DATA_ROOT || path.join(os.homedir(), ".cyvx-restore"));
  const encryptionKey = String(options.encryptionKey || env.CYVX_BACKUP_ENCRYPTION_KEY || "");
  if (!inputPath || !fs.existsSync(inputPath)) throw coded("CYVX_BACKUP_NOT_FOUND", `backup file not found: ${inputPath}`);
  if (encryptionKey.length < 32) throw coded("CYVX_BACKUP_KEY_INVALID", "CYVX_BACKUP_ENCRYPTION_KEY must contain at least 32 characters");
  const envelope = JSON.parse(fs.readFileSync(inputPath, "utf8"));
  const archive = decryptArchive(envelope, encryptionKey);
  verifyArchive(archive);
  if (fs.existsSync(targetRoot) && fs.readdirSync(targetRoot).length && !options.force) {
    throw coded("CYVX_RESTORE_TARGET_NOT_EMPTY", `restore target is not empty: ${targetRoot}`);
  }
  if (options.dryRun) {
    return { ok: true, dry_run: true, target_root: targetRoot, backup_id: archive.backup_id, files: archive.files.length, source_bytes: archive.source_bytes };
  }
  fs.mkdirSync(targetRoot, { recursive: true, mode: 0o700 });
  for (const entry of archive.files) {
    const destination = safeDestination(targetRoot, entry.path);
    fs.mkdirSync(path.dirname(destination), { recursive: true, mode: 0o700 });
    const content = Buffer.from(entry.content_base64, "base64");
    if (sha256(content) !== entry.sha256) throw coded("CYVX_BACKUP_FILE_HASH_MISMATCH", `hash mismatch for ${entry.path}`);
    atomicWrite(destination, content, entry.mode || 0o600);
    if (entry.mtime_ms) fs.utimesSync(destination, new Date(entry.mtime_ms), new Date(entry.mtime_ms));
  }
  return { ok: true, restored_at: new Date().toISOString(), target_root: targetRoot, backup_id: archive.backup_id, files: archive.files.length, source_bytes: archive.source_bytes };
}

function verifyBackup(options = {}) {
  return restoreBackup({ ...options, dryRun: true, targetRoot: options.targetRoot || path.join(os.tmpdir(), `cyvx-verify-${process.pid}`), force: true });
}

async function uploadBackup(filePath, options = {}) {
  const env = options.env || process.env;
  const baseUrl = String(options.storageUrl || backupStorageUrl(env)).replace(/\/$/, "");
  const token = String(options.token || backupStorageToken(env));
  const bucket = String(options.bucket || env.CYVX_BACKUP_BUCKET || "cyvx-backups");
  const prefix = cleanPrefix(options.prefix || env.CYVX_BACKUP_PREFIX || env.CYVX_ENV || "production");
  if (!baseUrl || !token || !bucket) throw coded("CYVX_BACKUP_STORAGE_UNCONFIGURED", "backup storage URL, token, and bucket are required");
  const key = options.key || `${prefix}/${path.basename(filePath)}`;
  const response = await fetch(`${baseUrl}/object/${encodePath(bucket)}/${encodePath(key)}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      apikey: token,
      "content-type": "application/octet-stream",
      "x-upsert": "false",
      "cache-control": "private, max-age=0, no-store",
    },
    body: fs.readFileSync(filePath),
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) throw coded("CYVX_BACKUP_UPLOAD_FAILED", `backup upload failed: HTTP ${response.status} ${await safeText(response)}`);
  return { ok: true, status: response.status, bucket, key };
}

async function downloadBackup(options = {}) {
  const env = options.env || process.env;
  const baseUrl = String(options.storageUrl || backupStorageUrl(env)).replace(/\/$/, "");
  const token = String(options.token || backupStorageToken(env));
  const bucket = String(options.bucket || env.CYVX_BACKUP_BUCKET || "cyvx-backups");
  const key = String(options.key || "");
  if (!baseUrl || !token || !bucket || !key) throw coded("CYVX_BACKUP_STORAGE_UNCONFIGURED", "backup storage URL, token, bucket, and key are required");
  const response = await fetch(`${baseUrl}/object/${encodePath(bucket)}/${encodePath(key)}`, {
    headers: { authorization: `Bearer ${token}`, apikey: token },
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) throw coded("CYVX_BACKUP_DOWNLOAD_FAILED", `backup download failed: HTTP ${response.status} ${await safeText(response)}`);
  const outputPath = path.resolve(options.outputPath || path.join(os.tmpdir(), path.basename(key)));
  atomicWrite(outputPath, Buffer.from(await response.arrayBuffer()), 0o600);
  return { ok: true, output_path: outputPath, bucket, key, bytes: fs.statSync(outputPath).size };
}

async function listRemoteBackups(options = {}) {
  const env = options.env || process.env;
  const baseUrl = String(options.storageUrl || backupStorageUrl(env)).replace(/\/$/, "");
  const token = String(options.token || backupStorageToken(env));
  const bucket = String(options.bucket || env.CYVX_BACKUP_BUCKET || "cyvx-backups");
  const prefix = cleanPrefix(options.prefix || env.CYVX_BACKUP_PREFIX || env.CYVX_ENV || "production");
  if (!baseUrl || !token || !bucket) throw coded("CYVX_BACKUP_STORAGE_UNCONFIGURED", "backup storage URL, token, and bucket are required");
  const response = await fetch(`${baseUrl}/object/list/${encodeURIComponent(bucket)}`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, apikey: token, "content-type": "application/json" },
    body: JSON.stringify({ prefix, limit: Math.min(1000, positive(options.limit, 1000)), offset: 0, sortBy: { column: "created_at", order: "desc" } }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw coded("CYVX_BACKUP_LIST_FAILED", `backup list failed: HTTP ${response.status} ${await safeText(response)}`);
  const rows = await response.json();
  return (Array.isArray(rows) ? rows : []).filter((item) => item && item.name && item.name.endsWith(".cyvxbak")).map((item) => ({ ...item, key: `${prefix}/${item.name}` }));
}

async function pruneRemoteBackups(options = {}) {
  const env = options.env || process.env;
  const retentionDays = positive(options.retentionDays || env.CYVX_BACKUP_RETENTION_DAYS, 30);
  const rows = await listRemoteBackups(options);
  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  const expired = rows.filter((item) => Date.parse(item.created_at || item.updated_at || 0) < cutoff);
  if (!expired.length) return { ok: true, deleted: 0, retained: rows.length };
  const baseUrl = String(options.storageUrl || backupStorageUrl(env)).replace(/\/$/, "");
  const token = String(options.token || backupStorageToken(env));
  const bucket = String(options.bucket || env.CYVX_BACKUP_BUCKET || "cyvx-backups");
  const response = await fetch(`${baseUrl}/object/${encodeURIComponent(bucket)}`, {
    method: "DELETE",
    headers: { authorization: `Bearer ${token}`, apikey: token, "content-type": "application/json" },
    body: JSON.stringify({ prefixes: expired.map((item) => item.key) }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw coded("CYVX_BACKUP_PRUNE_FAILED", `backup prune failed: HTTP ${response.status} ${await safeText(response)}`);
  return { ok: true, deleted: expired.length, retained: rows.length - expired.length };
}

function collectArchive(dataRoot, options = {}) {
  if (!fs.existsSync(dataRoot)) throw coded("CYVX_DATA_ROOT_NOT_FOUND", `data root not found: ${dataRoot}`);
  const maxBytes = positive(options.maxBytes, 512 * 1024 * 1024);
  const files = [];
  let sourceBytes = 0;
  walk(dataRoot, "", (absolute, relative, stat) => {
    if (shouldExclude(relative, options.exclude)) return;
    sourceBytes += stat.size;
    if (sourceBytes > maxBytes) throw coded("CYVX_BACKUP_TOO_LARGE", `backup exceeds maximum source size of ${maxBytes} bytes`);
    const content = fs.readFileSync(absolute);
    files.push({
      path: relative.split(path.sep).join("/"),
      mode: stat.mode & 0o777,
      mtime_ms: stat.mtimeMs,
      size: content.length,
      sha256: sha256(content),
      content_base64: content.toString("base64"),
    });
  });
  files.sort((a, b) => a.path.localeCompare(b.path));
  return {
    format: ARCHIVE_FORMAT,
    backup_id: crypto.randomUUID(),
    created_at: new Date().toISOString(),
    source_root: dataRoot,
    source_bytes: sourceBytes,
    files,
    manifest_sha256: sha256(Buffer.from(JSON.stringify(files.map(({ path: name, size, sha256: hash }) => ({ path: name, size, sha256: hash }))))),
  };
}

function encryptArchive(archive, passphrase) {
  const compressed = zlib.gzipSync(Buffer.from(JSON.stringify(archive)), { level: 9 });
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const key = crypto.scryptSync(passphrase, salt, 32);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(compressed), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    format: ENVELOPE_FORMAT,
    version: 1,
    algorithm: "aes-256-gcm",
    kdf: "scrypt",
    created_at: archive.created_at,
    backup_id: archive.backup_id,
    salt_base64: salt.toString("base64"),
    iv_base64: iv.toString("base64"),
    auth_tag_base64: tag.toString("base64"),
    ciphertext_base64: ciphertext.toString("base64"),
    ciphertext_sha256: sha256(ciphertext),
  };
}

function decryptArchive(envelope, passphrase) {
  if (!envelope || envelope.format !== ENVELOPE_FORMAT || envelope.version !== 1) throw coded("CYVX_BACKUP_FORMAT_INVALID", "unsupported backup envelope");
  const ciphertext = Buffer.from(envelope.ciphertext_base64, "base64");
  if (sha256(ciphertext) !== envelope.ciphertext_sha256) throw coded("CYVX_BACKUP_CIPHERTEXT_HASH_MISMATCH", "encrypted backup hash mismatch");
  const salt = Buffer.from(envelope.salt_base64, "base64");
  const iv = Buffer.from(envelope.iv_base64, "base64");
  const tag = Buffer.from(envelope.auth_tag_base64, "base64");
  const key = crypto.scryptSync(passphrase, salt, 32);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  let compressed;
  try { compressed = Buffer.concat([decipher.update(ciphertext), decipher.final()]); }
  catch { throw coded("CYVX_BACKUP_DECRYPT_FAILED", "backup could not be decrypted or authentication failed"); }
  return JSON.parse(zlib.gunzipSync(compressed).toString("utf8"));
}

function verifyArchive(archive) {
  if (!archive || archive.format !== ARCHIVE_FORMAT || !Array.isArray(archive.files)) throw coded("CYVX_BACKUP_ARCHIVE_INVALID", "invalid backup archive");
  const manifestHash = sha256(Buffer.from(JSON.stringify(archive.files.map(({ path: name, size, sha256: hash }) => ({ path: name, size, sha256: hash })))));
  if (manifestHash !== archive.manifest_sha256) throw coded("CYVX_BACKUP_MANIFEST_HASH_MISMATCH", "backup manifest hash mismatch");
  for (const entry of archive.files) {
    if (!entry.path || path.isAbsolute(entry.path) || entry.path.split(/[\\/]+/).includes("..")) throw coded("CYVX_BACKUP_PATH_INVALID", `invalid backup path: ${entry.path}`);
    const content = Buffer.from(entry.content_base64, "base64");
    if (content.length !== entry.size || sha256(content) !== entry.sha256) throw coded("CYVX_BACKUP_FILE_HASH_MISMATCH", `backup file verification failed: ${entry.path}`);
  }
  return true;
}

function walk(root, relative, visit) {
  const directory = path.join(root, relative);
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const childRelative = path.join(relative, entry.name);
    const absolute = path.join(root, childRelative);
    const stat = fs.lstatSync(absolute);
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) walk(root, childRelative, visit);
    else if (entry.isFile()) visit(absolute, childRelative, stat);
  }
}

function shouldExclude(relative, custom) {
  const normalized = relative.split(path.sep).join("/");
  const defaults = [/^backups\//, /(^|\/)\.DS_Store$/, /(^|\/)\.lock$/, /(^|\/)tmp\//, /(^|\/)node_modules\//];
  const rules = defaults.concat(Array.isArray(custom) ? custom : []);
  return rules.some((rule) => rule instanceof RegExp ? rule.test(normalized) : normalized.startsWith(String(rule)));
}

function safeDestination(root, relative) {
  const destination = path.resolve(root, relative);
  if (destination !== root && !destination.startsWith(`${root}${path.sep}`)) throw coded("CYVX_BACKUP_PATH_TRAVERSAL", `unsafe restore path: ${relative}`);
  return destination;
}

function atomicWrite(target, content, mode) {
  fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
  const temporary = `${target}.${process.pid}.${crypto.randomBytes(4).toString("hex")}.tmp`;
  fs.writeFileSync(temporary, content, { mode });
  fs.renameSync(temporary, target);
  try { fs.chmodSync(target, mode); } catch {}
}

function sha256(value) { return crypto.createHash("sha256").update(value).digest("hex"); }
function positive(value, fallback) { const parsed = Number(value); return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback; }
function truthy(value) { return ["1", "true", "yes", "on"].includes(String(value || "").toLowerCase()); }
function cleanPrefix(value) { return String(value || "production").replace(/^\/+|\/+$/g, "").replace(/[^A-Za-z0-9._/-]/g, "-") || "production"; }
function encodePath(value) { return String(value).split("/").map(encodeURIComponent).join("/"); }
function coded(code, message) { const error = new Error(message); error.code = code; return error; }
async function safeText(response) { try { return (await response.text()).slice(0, 500); } catch { return ""; } }

module.exports = {
  ARCHIVE_FORMAT,
  ENVELOPE_FORMAT,
  collectArchive,
  createBackup,
  decryptArchive,
  downloadBackup,
  encryptArchive,
  listRemoteBackups,
  pruneRemoteBackups,
  restoreBackup,
  uploadBackup,
  verifyArchive,
  verifyBackup,
};
