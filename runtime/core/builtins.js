"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { boundedString } = require("./context");
const { sha256 } = require("./capability-registry");

function ensureInside(root, candidate) {
  const base = path.resolve(root);
  const resolved = path.resolve(candidate);
  if (resolved !== base && !resolved.startsWith(`${base}${path.sep}`)) {
    const error = new Error("Filesystem capability path escaped the configured workspace");
    error.code = "CORE_WORKSPACE_PATH_DENIED";
    error.status = 403;
    throw error;
  }
  return resolved;
}

function registerBuiltinCapabilities(registry, options = {}) {
  if (!registry || typeof registry.register !== "function") throw new TypeError("A capability registry is required");
  const db = options.db;
  const workspaceRoot = path.resolve(options.workspaceRoot || process.cwd());

  registry.register({
    name: "runtime.inspect",
    version: "1.0.0",
    description: "Inspect the active CYVX Core capability bus and persistence health without mutating external state.",
    permission: "runtime.read",
    risk_level: "low",
    timeout_ms: 5000,
    retries: 0,
    idempotent: true,
    validate(input) {
      if (input !== undefined && (input === null || typeof input !== "object" || Array.isArray(input))) throw new TypeError("runtime.inspect input must be an object");
      return true;
    },
    handler() {
      let databaseReady = null;
      if (db) {
        try { databaseReady = Number(db.prepare("SELECT 1 AS ok").get().ok) === 1; }
        catch { databaseReady = false; }
      }
      return {
        output: {
          service: "cyvx-core",
          database_ready: databaseReady,
          workspace_root: workspaceRoot,
          capabilities: registry.list(),
          timestamp: new Date().toISOString(),
        },
        evidence: [{ type: "database_probe", ready: databaseReady }],
      };
    },
  });

  registry.register({
    name: "filesystem.write",
    version: "1.0.0",
    description: "Atomically write a UTF-8 file inside the governed CYVX workspace and return cryptographic evidence.",
    permission: "filesystem.write",
    risk_level: "medium",
    timeout_ms: 15000,
    retries: 1,
    idempotent: true,
    validate(input) {
      if (!input || typeof input !== "object" || Array.isArray(input)) throw new TypeError("filesystem.write input must be an object");
      boundedString(input.path, "filesystem.write.path", 1000, true);
      const content = String(input.content ?? "");
      if (Buffer.byteLength(content) > 1024 * 1024) throw new TypeError("filesystem.write content exceeds 1 MiB");
      return true;
    },
    handler(input) {
      const relative = boundedString(input.path, "filesystem.write.path", 1000, true);
      const target = ensureInside(workspaceRoot, path.join(workspaceRoot, relative));
      const content = String(input.content ?? "");
      fs.mkdirSync(path.dirname(target), { recursive: true });
      const temporary = `${target}.${process.pid}.${crypto.randomBytes(6).toString("hex")}.tmp`;
      fs.writeFileSync(temporary, content, { encoding: "utf8", mode: 0o600 });
      fs.renameSync(temporary, target);
      const digest = sha256(content);
      return {
        output: {
          path: target,
          relative_path: path.relative(workspaceRoot, target),
          bytes: Buffer.byteLength(content),
          sha256: digest,
        },
        evidence: [{ type: "file_sha256", path: target, algorithm: "sha256", value: digest }],
        metrics: { bytes_written: Buffer.byteLength(content) },
      };
    },
  });

  registry.register({
    name: "filesystem.read",
    version: "1.0.0",
    description: "Read a bounded UTF-8 file inside the governed CYVX workspace with hash evidence.",
    permission: "filesystem.read",
    risk_level: "low",
    timeout_ms: 10000,
    retries: 0,
    idempotent: true,
    validate(input) {
      if (!input || typeof input !== "object" || Array.isArray(input)) throw new TypeError("filesystem.read input must be an object");
      boundedString(input.path, "filesystem.read.path", 1000, true);
      return true;
    },
    handler(input) {
      const relative = boundedString(input.path, "filesystem.read.path", 1000, true);
      const target = ensureInside(workspaceRoot, path.join(workspaceRoot, relative));
      const stat = fs.statSync(target);
      if (!stat.isFile()) throw new TypeError("filesystem.read target must be a file");
      if (stat.size > 1024 * 1024) throw new TypeError("filesystem.read target exceeds 1 MiB");
      const content = fs.readFileSync(target, "utf8");
      const digest = sha256(content);
      return {
        output: {
          path: target,
          relative_path: path.relative(workspaceRoot, target),
          bytes: stat.size,
          sha256: digest,
          content,
        },
        evidence: [{ type: "file_sha256", path: target, algorithm: "sha256", value: digest }],
        metrics: { bytes_read: stat.size },
      };
    },
  });

  if (db) {
    registry.register({
      name: "learning.record",
      version: "1.0.0",
      description: "Persist a bounded, organization-scoped learning record for future CYVX Core planning.",
      permission: "learning.write",
      risk_level: "low",
      timeout_ms: 5000,
      retries: 1,
      idempotent: true,
      validate(input) {
        if (!input || typeof input !== "object" || Array.isArray(input)) throw new TypeError("learning.record input must be an object");
        boundedString(input.subject, "learning.record.subject", 240, true);
        boundedString(input.lesson, "learning.record.lesson", 4000, true);
        return true;
      },
      handler(input, invocation) {
        const recordId = `corelearn_${crypto.randomUUID().replace(/-/g, "")}`;
        const timestamp = new Date().toISOString();
        const subject = boundedString(input.subject, "learning.record.subject", 240, true);
        const lesson = boundedString(input.lesson, "learning.record.lesson", 4000, true);
        const evidence = input.evidence && typeof input.evidence === "object" ? structuredClone(input.evidence) : {};
        db.prepare(`INSERT INTO core_learning_records(
          id,organization_id,run_id,subject,outcome,lesson,evidence,created_at
        ) VALUES(?,?,?,?,?,?,?,?)`).run(
          recordId,
          invocation.context.organization_id,
          invocation.context.run_id,
          subject,
          boundedString(input.outcome || "observed", "learning.record.outcome", 80, true),
          lesson,
          JSON.stringify(evidence),
          timestamp,
        );
        return {
          output: { id: recordId, subject, lesson, created_at: timestamp },
          evidence: [{ type: "database_record", table: "core_learning_records", id: recordId }],
        };
      },
    });
  }

  return registry;
}

module.exports = {
  ensureInside,
  registerBuiltinCapabilities,
};
