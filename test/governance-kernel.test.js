"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { DatabaseSync } = require("node:sqlite");
const { GovernanceKernel, GovernanceError } = require("../core/governance");

function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cyvx-governance-"));
  fs.mkdirSync(path.join(root, "ops", "sqlite"), { recursive: true });
  fs.copyFileSync(
    path.join(__dirname, "..", "ops", "sqlite", "003_autonomous_governance.sql"),
    path.join(root, "ops", "sqlite", "003_autonomous_governance.sql")
  );
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
  const kernel = new GovernanceKernel({ db, repoRoot: root, secret: "test-governance-secret-that-is-long-enough-123" });
  return { root, db, kernel };
}

const worker = { user_id: "agent-local", organization_id: "default", role: "agent" };
const supervisor = { user_id: "supervisor-local", organization_id: "default", role: "approver" };
const boss = { user_id: "boss-local", organization_id: "default", role: "admin" };
const admin = { user_id: "admin-local", organization_id: "default", role: "admin" };

function validSubmission(overrides = {}) {
  return {
    mission_id: "mission_001",
    requested_action: "deploy_staging",
    risk_tier: 1,
    artifact_sha256: "a".repeat(64),
    evidence_ids: ["evidence_001"],
    tests: [{ name: "contract", status: "passed", evidence_id: "evidence_001" }],
    rollback_plan: { command: "restore previous release", verification: "health endpoint returns 200" },
    declared_risks: ["deployment regression"],
    estimated_cost_usd: 2,
    ...overrides
  };
}

test("two-key review creates and consumes a scoped capability grant", () => {
  const { db, kernel } = setup();
  try {
    const submitted = kernel.submit(worker, validSubmission());
    assert.equal(submitted.status, "awaiting_supervisor");

    const supervised = kernel.supervisorReview(supervisor, submitted.id, {
      decision: "approved",
      reason: "Acceptance tests, evidence, and rollback plan are valid"
    });
    assert.equal(supervised.status, "awaiting_boss");
    assert.equal(supervised.reviews.length, 1);

    const authorized = kernel.bossReview(boss, submitted.id, {
      decision: "authorize",
      reason: "Mission value and cost are inside constitutional authority",
      grant_ttl_minutes: 10
    });
    assert.equal(authorized.status, "authorized");
    assert.equal(authorized.grant.status, "active");
    assert.equal(authorized.grant.grantee_id, "agent-local");

    const consumed = kernel.consumeGrant(worker, authorized.grant.id, {
      actual_cost_usd: 1.5,
      external_reference: "deployment-42",
      result_sha256: "b".repeat(64),
      outcome: "Staging deployment passed health checks"
    });
    assert.equal(consumed.status, "consumed");
    assert.equal(consumed.actual_cost_usd, 1.5);

    const dashboard = kernel.dashboard(admin);
    assert.equal(dashboard.monthly_spend_usd, 1.5);
    assert.equal(dashboard.active_grant_reservations_usd, 0);
    assert.equal(kernel.verifyLedger(admin).ok, true);
  } finally {
    db.close();
  }
});

test("separation of duties prevents a worker from supervising its own package", () => {
  const { db, kernel } = setup();
  try {
    const submitted = kernel.submit(worker, validSubmission());
    assert.throws(
      () => kernel.supervisorReview(worker, submitted.id, { decision: "approved", reason: "self approval" }),
      (error) => error instanceof GovernanceError && error.code === "PERMISSION_DENIED"
    );
  } finally {
    db.close();
  }
});

test("deterministic Supervisor checks reject failed tests", () => {
  const { db, kernel } = setup();
  try {
    const submitted = kernel.submit(worker, validSubmission({ tests: [{ name: "security", status: "failed" }] }));
    assert.throws(
      () => kernel.supervisorReview(supervisor, submitted.id, { decision: "approved", reason: "approve anyway" }),
      (error) => error instanceof GovernanceError && error.code === "SUPERVISOR_CHECKS_FAILED"
    );
    const remediation = kernel.supervisorReview(supervisor, submitted.id, {
      decision: "remediation_required",
      reason: "Security test must pass before authorization"
    });
    assert.equal(remediation.status, "remediation_required");
  } finally {
    db.close();
  }
});

test("human-exception actions cannot be autonomously authorized", () => {
  const { db, kernel } = setup();
  try {
    const submitted = kernel.submit(worker, validSubmission({ requested_action: "sign_contract", risk_tier: 3 }));
    const escalated = kernel.supervisorReview(supervisor, submitted.id, {
      decision: "escalation_required",
      reason: "Contract signature requires accountable human authority"
    });
    assert.equal(escalated.status, "human_exception");
  } finally {
    db.close();
  }
});

test("global stop revokes active grants and blocks consumption", () => {
  const { db, kernel } = setup();
  try {
    const submitted = kernel.submit(worker, validSubmission());
    kernel.supervisorReview(supervisor, submitted.id, { decision: "approved", reason: "Checks passed" });
    const authorized = kernel.bossReview(boss, submitted.id, { decision: "authorize", reason: "Authorized" });
    const controls = kernel.setControls(boss, { global_stop: true, reason: "Incident containment" });
    assert.equal(controls.global_stop, true);
    assert.throws(
      () => kernel.consumeGrant(worker, authorized.grant.id, { actual_cost_usd: 0 }),
      (error) => error instanceof GovernanceError && error.code === "GRANT_NOT_ACTIVE"
    );
  } finally {
    db.close();
  }
});
