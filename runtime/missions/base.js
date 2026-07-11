"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");

const APP_VERSION = "8.1.0-runtime";
const SCHEMA_VERSION = 2;
const ROLES = new Set(["admin", "approver", "agent", "viewer"]);

class RuntimeError extends Error {
  constructor(code, message, status = 400, details) {
    super(message);
    this.name = "RuntimeError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

function now() { return new Date().toISOString(); }
function id(prefix) { return `${prefix}_${crypto.randomUUID().replace(/-/g, "")}`; }
function sha256(value) { return crypto.createHash("sha256").update(value).digest("hex"); }
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
function parseJson(value, fallback) {
  if (value === null || value === undefined || value === "") return fallback;
  if (typeof value !== "string") return value;
  try { return JSON.parse(value); } catch { return fallback; }
}
function safeEqual(left, right) {
  const a = Buffer.from(String(left || ""));
  const b = Buffer.from(String(right || ""));
  return a.length === b.length && a.length > 0 && crypto.timingSafeEqual(a, b);
}
function redact(value) {
  const sensitive = /authorization|token|secret|password|cookie|api[-_]?key/i;
  if (Array.isArray(value)) return value.map(redact);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, sensitive.test(key) ? "[REDACTED]" : redact(item)]));
}

class JsonLogger {
  constructor(filePath, options = {}) {
    this.filePath = path.resolve(filePath);
    this.maxBytes = Number(options.maxBytes || 2 * 1024 * 1024);
    this.keep = Number(options.keep || 5);
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
  }
  write(level, event, data = {}) {
    this.rotate();
    fs.appendFileSync(this.filePath, `${JSON.stringify({ timestamp: now(), level, event, ...redact(data) })}\n`, { mode: 0o600 });
  }
  rotate() {
    try {
      if (!fs.existsSync(this.filePath) || fs.statSync(this.filePath).size < this.maxBytes) return;
      for (let index = this.keep - 1; index >= 1; index -= 1) {
        const source = `${this.filePath}.${index}`;
        const target = `${this.filePath}.${index + 1}`;
        if (fs.existsSync(source)) fs.renameSync(source, target);
      }
      fs.renameSync(this.filePath, `${this.filePath}.1`);
    } catch { /* logging cannot take down runtime */ }
  }
}

function normalizeLegacySchema(sql) {
  const lines = [];
  const indexes = [];
  let table = null;
  for (const source of sql.split(/\r?\n/)) {
    const create = source.match(/^\s*CREATE TABLE IF NOT EXISTS\s+([A-Za-z0-9_]+)/i);
    if (create) table = create[1];
    const inline = source.match(/^\s*INDEX\s+([A-Za-z0-9_]+)\s*\(([^)]+)\)\s*,?\s*$/i);
    if (/^\s*PRAGMA\s+(foreign_keys|journal_mode|busy_timeout)/i.test(source)) continue;
    if (inline && table) {
      indexes.push(`CREATE INDEX IF NOT EXISTS ${inline[1]} ON ${table}(${inline[2]});`);
      continue;
    }
    if (/^\s*\);\s*$/.test(source) && lines.length) {
      lines[lines.length - 1] = lines[lines.length - 1].replace(/,(\s*--.*)?$/, "$1");
      table = null;
    }
    lines.push(source);
  }
  return `${lines.join("\n")}\n${indexes.join("\n")}\n`;
}

function columns(db, table) {
  return new Set(db.prepare(`PRAGMA table_info(${table})`).all().map((row) => row.name));
}
function ensureColumn(db, table, definition) {
  const name = definition.trim().split(/\s+/)[0];
  if (!columns(db, table).has(name)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${definition}`);
}

function seedPrincipals(db) {
  const timestamp = now();
  db.prepare("INSERT OR IGNORE INTO organizations(id,name,created_at,updated_at) VALUES(?,?,?,?)")
    .run("default", "Default Organization", timestamp, timestamp);
  for (const [userId, role] of [["admin-local", "admin"], ["approver-local", "approver"], ["agent-local", "agent"], ["viewer-local", "viewer"]]) {
    db.prepare("INSERT OR IGNORE INTO users(id,organization_id,role,active,created_at,updated_at) VALUES(?,?,?,?,?,?)")
      .run(userId, "default", role, 1, timestamp, timestamp);
  }
}

function migrateDatabase(options = {}) {
  const repoRoot = path.resolve(options.repoRoot || path.join(__dirname, "../.."));
  const dataRoot = path.resolve(options.dataRoot || process.env.CYVX_DATA_ROOT || path.join(os.homedir(), ".cyvx"));
  const dbPath = path.resolve(options.dbPath || path.join(dataRoot, "mission-runtime.db"));
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec("PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;");
  db.exec("CREATE TABLE IF NOT EXISTS schema_migrations(version INTEGER PRIMARY KEY,name TEXT NOT NULL,checksum TEXT NOT NULL,applied_at TEXT NOT NULL)");
  const migrations = [
    { version: 1, name: "001_mission_workflow.sql", normalize: true },
    { version: 2, name: "002_runtime_completion.sql", normalize: false },
  ];
  for (const migration of migrations) {
    const file = path.join(repoRoot, "ops", "sqlite", migration.name);
    const raw = fs.readFileSync(file, "utf8");
    const checksum = sha256(raw);
    const existing = db.prepare("SELECT checksum FROM schema_migrations WHERE version=?").get(migration.version);
    if (existing) {
      if (existing.checksum !== checksum) throw new RuntimeError("MIGRATION_CHECKSUM_MISMATCH", `Migration ${migration.name} changed after application`, 500);
      continue;
    }
    db.exec("BEGIN IMMEDIATE");
    try {
      const sql = migration.normalize ? normalizeLegacySchema(raw) : raw.replace(/^\s*PRAGMA\s+(foreign_keys|journal_mode|busy_timeout).*$/gmi, "");
      db.exec(sql);
      db.prepare("INSERT INTO schema_migrations(version,name,checksum,applied_at) VALUES(?,?,?,?)")
        .run(migration.version, migration.name, checksum, now());
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      db.close();
      throw error;
    }
  }
  for (const table of ["missions", "approvals", "assignments", "evidence", "outcomes", "capabilities", "events"]) {
    ensureColumn(db, table, "payload TEXT");
  }
  ensureColumn(db, "assignments", "organization_id TEXT");
  for (const definition of [
    "sequence INTEGER", "artifact_path TEXT", "artifact_sha256 TEXT", "record_sha256 TEXT",
    "previous_chain_hash TEXT", "job_id TEXT", "record_json TEXT",
  ]) ensureColumn(db, "evidence", definition);
  ensureColumn(db, "outcomes", "job_id TEXT");
  db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_evidence_mission_sequence ON evidence(organization_id,mission_id,sequence) WHERE sequence IS NOT NULL");
  db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_evidence_job ON evidence(job_id) WHERE job_id IS NOT NULL");
  db.prepare("INSERT OR REPLACE INTO runtime_metadata(key,value,updated_at) VALUES('schema_version',?,?)")
    .run(String(SCHEMA_VERSION), now());
  seedPrincipals(db);
  return { db, dbPath, dataRoot, schemaVersion: SCHEMA_VERSION };
}

function issueToken(claims, secret, ttlSeconds = 3600) {
  if (String(secret || "").length < 32) throw new RuntimeError("AUTH_SECRET_INVALID", "Authentication secret must be at least 32 characters", 500);
  const payload = {
    sub: String(claims.sub), organization_id: String(claims.organization_id), role: String(claims.role),
    iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + Number(ttlSeconds), jti: crypto.randomUUID(),
  };
  if (!ROLES.has(payload.role)) throw new RuntimeError("ROLE_INVALID", "Unsupported role", 400);
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "CYVX" })).toString("base64url");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto.createHmac("sha256", secret).update(`${header}.${body}`).digest("base64url");
  return `${header}.${body}.${signature}`;
}

function verifyToken(token, secret, db) {
  const parts = String(token || "").split(".");
  if (parts.length !== 3) throw new RuntimeError("AUTH_INVALID", "Authentication token is invalid", 401);
  const expected = crypto.createHmac("sha256", secret).update(`${parts[0]}.${parts[1]}`).digest("base64url");
  if (!safeEqual(parts[2], expected)) throw new RuntimeError("AUTH_INVALID", "Authentication token is invalid", 401);
  let payload;
  try { payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")); }
  catch { throw new RuntimeError("AUTH_INVALID", "Authentication token is invalid", 401); }
  if (!payload.sub || !payload.organization_id || !ROLES.has(payload.role)) throw new RuntimeError("AUTH_INVALID", "Authentication token is incomplete", 401);
  if (!Number.isFinite(payload.exp) || payload.exp <= Math.floor(Date.now() / 1000)) throw new RuntimeError("AUTH_EXPIRED", "Authentication token has expired", 401);
  const user = db.prepare("SELECT id,organization_id,role,active FROM users WHERE organization_id=? AND id=?")
    .get(payload.organization_id, payload.sub);
  if (!user || !user.active || user.role !== payload.role) throw new RuntimeError("AUTH_REJECTED", "Authentication principal is not active", 401);
  return { user_id: user.id, organization_id: user.organization_id, role: user.role, token_id: payload.jti, expires_at: new Date(payload.exp * 1000).toISOString() };
}

const permissions = {
  read: ["admin", "approver", "agent", "viewer"], create: ["admin"], validate: ["admin"], plan: ["admin"],
  requestApproval: ["admin"], approve: ["admin", "approver"], assign: ["admin"], execute: ["admin", "agent"],
  evaluate: ["admin"], learn: ["admin"], evidenceVerify: ["admin", "approver", "agent", "viewer"],
  jobsInspect: ["admin", "agent"], jobsRequeue: ["admin"], organizationManage: ["admin"],
};
function authorize(auth, action) {
  if (!permissions[action] || !permissions[action].includes(auth.role)) {
    throw new RuntimeError("PERMISSION_DENIED", `Role ${auth.role} cannot perform ${action}`, 403);
  }
}

function safeArtifactPath(root, relative) {
  const base = path.resolve(root);
  const candidate = path.resolve(base, String(relative || ""));
  if (candidate !== base && !candidate.startsWith(`${base}${path.sep}`)) {
    throw new RuntimeError("ARTIFACT_PATH_INVALID", "Artifact path escapes configured root", 400);
  }
  return candidate;
}
function atomicWrite(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.${crypto.randomUUID()}.tmp`;
  fs.writeFileSync(temporary, content, { mode: 0o600 });
  fs.renameSync(temporary, file);
}

module.exports = {
  APP_VERSION, SCHEMA_VERSION, RuntimeError, JsonLogger, now, id, sha256, canonical, parseJson,
  migrateDatabase, issueToken, verifyToken, authorize, safeArtifactPath, atomicWrite, redact,
};
