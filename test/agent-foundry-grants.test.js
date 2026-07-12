"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { DatabaseSync } = require("node:sqlite");
const { GovernanceKernel, GovernanceError } = require("../core/governance");
const { AgentFoundry, hashPath } = require("../core/agent-foundry");

const worker = { user_id: "agent-local", organization_id: "default", role: "agent" };
const supervisor = { user_id: "supervisor-local", organization_id: "default", role: "approver" };
const boss = { user_id: "boss-local", organization_id: "default", role: "admin" };

function setup(options = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cyvx-foundry-"));
  fs.mkdirSync(path.join(root, "ops", "sqlite"), { recursive: true });
  for (const file of ["003_autonomous_governance.sql", "004_grant_gated_agent_foundry.sql"]) {
    fs.copyFileSync(path.join(__dirname, "..", "ops", "sqlite", file), path.join(root, "ops", "sqlite", file));
  }
  const db = new DatabaseSync(path.join(root, "test.db"));
  db.exec(`
    PRAGMA journal_mode=WAL;
    CREATE TABLE organizations(id TEXT PRIMARY KEY,name TEXT,created_at TEXT,updated_at TEXT);
    CREATE TABLE users(
      id TEXT NOT NULL, organization_id TEXT NOT NULL, role TEXT NOT NULL, active INTEGER NOT NULL,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY(organization_id,id)
    );
    CREATE TABLE missions(
      id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, status TEXT NOT NULL, assigned_agent_id TEXT
    );
  `);
  const timestamp = new Date().toISOString();
  db.prepare("INSERT INTO organizations VALUES(?,?,?,?)").run("default", "Default", timestamp, timestamp);
  db.prepare("INSERT INTO users VALUES(?,?,?,?,?,?)").run("agent-local", "default", "agent", 1, timestamp, timestamp);
  db.prepare("INSERT INTO users VALUES(?,?,?,?,?,?)").run("admin-local", "default", "admin", 1, timestamp, timestamp);
  db.prepare("INSERT INTO missions VALUES(?,?,?,?)").run("mission_001", "default", "running", "agent-local");
  const secret = "test-governance-secret-that-is-long-enough-123";
  const kernel = new GovernanceKernel({ db, repoRoot: root, secret });
  const foundry = new AgentFoundry({ db, kernel, repoRoot: root, dataRoot: path.join(root, "data"), secret, spendExecutor: options.spendExecutor });
  return { root, db, kernel, foundry };
}

function authorize(kernel, action, options = {}) {
  const submitted = kernel.submit(worker, {
    mission_id: "mission_001",
    requested_action: action,
    risk_tier: options.risk_tier ?? (action === "deploy_production" ? 2 : 1),
    artifact_sha256: options.artifact_sha256 || "a".repeat(64),
    evidence_ids: ["evidence_001"],
    tests: [{ name: "foundry contract", status: "passed", evidence_id: "evidence_001" }],
    rollback_plan: { procedure: "revert durable resource and restore prior state", verification: "boundary report remains valid" },
    declared_risks: ["bounded execution failure"],
    estimated_cost_usd: options.estimated_cost_usd ?? 0
  });
  kernel.supervisorReview(supervisor, submitted.id, { decision: "approved", reason: "Deterministic controls and artifact evidence passed" });
  return kernel.bossReview(boss, submitted.id, { decision: "authorize", reason: "Action is inside Constitution authority", grant_ttl_minutes: 10 }).grant;
}

test("all sensitive Foundry actions reject requests without a capability grant", () => {
  const { db, foundry } = setup();
  try {
    for (const action of ["create_agent", "deploy_staging", "deploy_production", "spend_budget"]) {
      assert.throws(
        () => foundry.executeAction(worker, action, {}),
        (error) => error instanceof GovernanceError && error.code === "VALIDATION_ERROR"
      );
    }
  } finally { db.close(); }
});

test("create_agent creates a persistent child identity and consumes exactly one matching grant", () => {
  const { db, kernel, foundry } = setup();
  try {
    const grant = authorize(kernel, "create_agent");
    const result = foundry.executeAction(worker, "create_agent", {
      grant_id: grant.id,
      name: "Landing Page Optimizer",
      mission: "Improve visitor-to-qualified-lead conversion",
      capabilities: ["analytics", "copywriting"],
      permissions: { repository_write: true, deploy_requires_grant: true },
      budget: { monthly_usd: 5 }
    });
    assert.equal(result.grant.status, "consumed");
    assert.equal(result.result.parent_agent_id, "agent-local");
    assert.equal(result.result.status, "active");
    const principal = db.prepare("SELECT role,active FROM users WHERE organization_id='default' AND id=?").get(result.result.id);
    assert.equal(principal.role, "agent");
    assert.equal(principal.active, 1);
    assert.throws(
      () => foundry.executeAction(worker, "create_agent", { grant_id: grant.id, name: "Duplicate", mission: "Should fail" }),
      (error) => error instanceof GovernanceError && error.code === "GRANT_NOT_ACTIVE"
    );
    assert.equal(foundry.verifyBoundary(worker).ok, true);
  } finally { db.close(); }
});

test("a grant cannot be replayed for a different Foundry capability", () => {
  const { db, kernel, foundry } = setup();
  try {
    const grant = authorize(kernel, "create_agent");
    assert.throws(
      () => foundry.executeAction(worker, "deploy_staging", { grant_id: grant.id, source_path: ".", app_id: "wrong" }),
      (error) => error instanceof GovernanceError && error.code === "CAPABILITY_MISMATCH"
    );
  } finally { db.close(); }
});

test("deploy_staging atomically activates only the exact approved artifact", () => {
  const { root, db, kernel, foundry } = setup();
  try {
    const source = path.join(root, "artifact-staging");
    fs.mkdirSync(source, { recursive: true });
    fs.writeFileSync(path.join(source, "index.html"), "<h1>CYVX staging</h1>\n");
    const approvedHash = hashPath(source);
    const grant = authorize(kernel, "deploy_staging", { artifact_sha256: approvedHash, estimated_cost_usd: 2 });
    const result = foundry.executeAction(worker, "deploy_staging", {
      grant_id: grant.id, source_path: source, app_id: "cyvx-landing", actual_cost_usd: 1.25
    });
    assert.equal(result.grant.status, "consumed");
    assert.equal(result.result.environment, "staging");
    assert.equal(fs.existsSync(result.result.release_path), true);
    const current = JSON.parse(fs.readFileSync(path.join(root, "data", "foundry", "deployments", "staging", "cyvx-landing", "current.json")));
    assert.equal(current.release_id, result.result.release_id);
    assert.equal(foundry.verifyBoundary(worker).ok, true);
  } finally { db.close(); }
});

test("deploy_production refuses an artifact modified after approval", () => {
  const { root, db, kernel, foundry } = setup();
  try {
    const source = path.join(root, "artifact-production");
    fs.mkdirSync(source, { recursive: true });
    fs.writeFileSync(path.join(source, "server.js"), "module.exports = 'approved';\n");
    const grant = authorize(kernel, "deploy_production", { artifact_sha256: hashPath(source) });
    fs.writeFileSync(path.join(source, "server.js"), "module.exports = 'tampered';\n");
    assert.throws(
      () => foundry.executeAction(worker, "deploy_production", { grant_id: grant.id, source_path: source, app_id: "core-api" }),
      (error) => error instanceof GovernanceError && error.code === "ARTIFACT_HASH_MISMATCH"
    );
    assert.equal(kernel.getGrant(worker, grant.id).status, "active");
  } finally { db.close(); }
});

test("spend_budget uses a configured provider, durable idempotency, and the governance budget ledger", () => {
  const calls = [];
  const { db, kernel, foundry } = setup({ spendExecutor: (request) => {
    calls.push(request);
    return { status: "succeeded", external_reference: `provider_${request.idempotency_key}`, metadata: { provider: "test-bank" } };
  } });
  try {
    const grant = authorize(kernel, "spend_budget", { estimated_cost_usd: 12 });
    const result = foundry.executeAction(worker, "spend_budget", {
      grant_id: grant.id, amount_usd: 10.5, currency: "USD", vendor: "Compute Provider",
      purpose: "Approved staging infrastructure", idempotency_key: "invoice-2026-0001"
    });
    assert.equal(calls.length, 1);
    assert.equal(result.grant.actual_cost_usd, 10.5);
    assert.equal(result.result.external_reference, "provider_invoice-2026-0001");
    assert.equal(kernel.dashboard(boss).monthly_spend_usd, 10.5);
    assert.equal(foundry.verifyBoundary(worker).ok, true);
  } finally { db.close(); }
});

test("spend_budget moves no funds when no provider is configured", () => {
  const { db, kernel, foundry } = setup();
  try {
    const grant = authorize(kernel, "spend_budget", { estimated_cost_usd: 5 });
    assert.throws(
      () => foundry.executeAction(worker, "spend_budget", {
        grant_id: grant.id, amount_usd: 5, vendor: "Compute Provider", purpose: "Infrastructure", idempotency_key: "missing-provider"
      }),
      (error) => error instanceof GovernanceError && error.code === "SPEND_EXECUTOR_NOT_CONFIGURED"
    );
    assert.equal(kernel.getGrant(worker, grant.id).status, "active");
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM foundry_spend_receipts").get().count, 0);
  } finally { db.close(); }
});

test("Foundry control switches block child creation even after a grant exists", () => {
  const { db, kernel, foundry } = setup();
  try {
    const grant = authorize(kernel, "create_agent");
    kernel.setControls(boss, { agent_creation_disabled: true, reason: "Contain recursive growth" });
    assert.throws(
      () => foundry.executeAction(worker, "create_agent", { grant_id: grant.id, name: "Blocked Child", mission: "Must not exist" }),
      (error) => error instanceof GovernanceError && error.code === "AGENT_CREATION_DISABLED"
    );
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM foundry_agents").get().count, 0);
  } finally { db.close(); }
});
