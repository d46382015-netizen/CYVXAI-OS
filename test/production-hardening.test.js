"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const {
  assertRequiredSecurityConfiguration,
  authorize,
} = require("../api/production");
const { wrap } = require("../api");
const {
  JsonFileStore,
  PlatformKernel,
  createPlatformState,
} = require("../core/platform");
const { validatePayload } = require("../core/security/request_validation");
const packageJson = require("../package.json");

function request(headers = {}, remoteAddress = "203.0.113.10") {
  return { headers, socket: { remoteAddress } };
}

test("production authorization fails closed without a configured credential", () => {
  assert.equal(authorize(request(), {
    apiKey: "",
    allowInsecureLocalhost: false,
    host: "0.0.0.0",
  }), false);
  assert.throws(() => assertRequiredSecurityConfiguration({
    apiKey: "",
    allowInsecureLocalhost: false,
    host: "0.0.0.0",
  }), { code: "PRODUCTION_AUTH_NOT_CONFIGURED" });
});

test("localhost bypass is explicit and cannot authorize a remote peer", () => {
  const security = { apiKey: "", allowInsecureLocalhost: true, host: "127.0.0.1" };
  assert.doesNotThrow(() => assertRequiredSecurityConfiguration(security));
  assert.equal(authorize(request({}, "127.0.0.1"), security), true);
  assert.equal(authorize(request({}, "203.0.113.10"), security), false);
});

test("configured production credential accepts header and bearer forms", () => {
  const security = { apiKey: "production-secret", allowInsecureLocalhost: false, host: "0.0.0.0" };
  assert.equal(authorize(request({ "x-api-key": "production-secret" }), security), true);
  assert.equal(authorize(request({ authorization: "Bearer production-secret" }), security), true);
  assert.equal(authorize(request({ authorization: "Bearer incorrect" }), security), false);
});

test("production payload validation enforces ranges and cross-field rules", () => {
  assert.equal(validatePayload("workload", { name: "api", replicas: 3 }).replicas, 3);
  assert.throws(() => validatePayload("workload", { replicas: 0 }), { code: "INVALID_PAYLOAD", statusCode: 422 });
  assert.throws(() => validatePayload("action", { type: "scale_up", workload_id: "api" }), /replicas is required/);
  assert.throws(() => validatePayload("action", { type: "migrate", workload_id: "api" }), /node_id is required/);
  assert.doesNotThrow(() => validatePayload("action", { type: "migrate", workload_id: "api", node_id: "node-2" }));
  assert.throws(() => validatePayload("outcome", { succeeded: "yes" }), /must be boolean/);
});

test("SQLite platform state migrates legacy JSON without deleting the source", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cyvx-migration-"));
  const legacyPath = path.join(dir, "platform-state.json");
  const databasePath = path.join(dir, "platform.db");
  const legacy = createPlatformState({
    companyName: "Migration Proof",
    entities: [{ id: "company-proof", name: "Migration Proof", kind: "company" }],
  });
  fs.writeFileSync(legacyPath, JSON.stringify(legacy, null, 2) + "\n");

  const kernel = new PlatformKernel({ filePath: databasePath });
  const snapshot = kernel.snapshot();
  const metadata = kernel.store.metadata();

  assert.equal(fs.existsSync(legacyPath), true);
  assert.equal(metadata.backend, "sqlite");
  assert.equal(String(metadata.journal_mode).toLowerCase(), "wal");
  assert.equal(metadata.last_migration.name, "legacy-json-import");
  assert.ok(snapshot.entities.some((entity) => entity.id === "company-proof"));
  kernel.store.close();
});

test("separate platform kernels preserve both writers through serialized transactions", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cyvx-writers-"));
  const databasePath = path.join(dir, "platform.db");
  const first = new PlatformKernel({ filePath: databasePath, seed: { entities: [], events: [] } });
  const second = new PlatformKernel({ filePath: databasePath, seed: { entities: [], events: [] } });

  first.createEntity({ name: "Writer A", kind: "system" });
  second.createEntity({ name: "Writer B", kind: "system" });

  const verification = new PlatformKernel({ filePath: databasePath });
  const names = new Set(verification.entities().map((entity) => entity.label));
  assert.equal(names.has("Writer A"), true);
  assert.equal(names.has("Writer B"), true);
  assert.ok(verification.store.metadata().revision >= 2);

  first.store.close();
  second.store.close();
  verification.store.close();
});

test("rollback export is equivalent and JSON fallback keeps a backup", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cyvx-rollback-"));
  const databasePath = path.join(dir, "platform.db");
  const exportPath = path.join(dir, "platform-state.rollback.json");
  const fallbackPath = path.join(dir, "fallback.json");
  const kernel = new PlatformKernel({ filePath: databasePath, seed: { entities: [], events: [] } });
  kernel.createEntity({ name: "Rollback Proof", kind: "system" });

  const before = kernel.snapshot();
  const exported = kernel.store.exportJson(exportPath);
  const after = JSON.parse(fs.readFileSync(exportPath, "utf8"));
  assert.equal(exported.bytes > 0, true);
  assert.deepEqual(after, before);

  const fallback = new JsonFileStore(fallbackPath, { revision: 0 });
  fallback.save({ revision: 1 });
  fallback.save({ revision: 2 });
  assert.equal(fs.existsSync(`${fallbackPath}.bak`), true);
  assert.deepEqual(JSON.parse(fs.readFileSync(`${fallbackPath}.bak`, "utf8")), { revision: 1 });
  kernel.store.close();
});

test("package, API envelope, and platform kernel report one version", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cyvx-version-"));
  const kernel = new PlatformKernel({ filePath: path.join(dir, "state.json") });
  assert.equal(kernel.status().version, packageJson.version);
  assert.equal(wrap({}).version, packageJson.version);
});
