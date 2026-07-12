"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const SUPERVISOR_DECISIONS = new Set(["approved", "rejected", "remediation_required", "escalation_required"]);
const BOSS_DECISIONS = new Set(["authorize", "deny", "return_for_revision", "quarantine", "human_exception"]);
const TERMINAL_PACKAGE_STATES = new Set(["rejected", "denied", "quarantined", "human_exception", "consumed"]);

const DEFAULT_CONSTITUTION = Object.freeze({
  name: "CYVX Autonomous Governance Constitution",
  version: 1,
  max_autonomous_risk_tier: 2,
  minimum_evidence_items: 1,
  require_all_tests_passed: true,
  require_rollback_from_risk_tier: 1,
  maximum_action_cost_usd: 25,
  maximum_monthly_cost_usd: 100,
  maximum_grant_ttl_minutes: 30,
  prohibited_autonomous_actions: [
    "sign_contract",
    "open_financial_account",
    "borrow_money",
    "tax_filing",
    "legal_representation",
    "high_value_transfer",
    "employment_decision",
    "healthcare_decision",
    "housing_decision",
    "credit_decision",
    "insurance_decision",
    "collect_sensitive_health_data",
    "collect_sensitive_financial_data",
    "irreversible_delete",
    "change_governance",
    "change_security_ownership",
    "export_credentials",
    "read_production_secrets"
  ],
  human_exception_actions: [
    "sign_contract",
    "borrow_money",
    "tax_filing",
    "legal_representation",
    "employment_decision",
    "healthcare_decision",
    "housing_decision",
    "credit_decision",
    "insurance_decision",
    "change_governance",
    "change_security_ownership"
  ]
});

class GovernanceError extends Error {
  constructor(code, message, status = 400, details) {
    super(message);
    this.name = "GovernanceError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

function now() { return new Date().toISOString(); }
function newId(prefix) { return `${prefix}_${crypto.randomUUID().replace(/-/g, "")}`; }
function sha256(value) { return crypto.createHash("sha256").update(String(value)).digest("hex"); }
function hmac(secret, value) { return crypto.createHmac("sha256", secret).update(String(value)).digest("hex"); }
function parseJson(value, fallback) {
  if (value === null || value === undefined || value === "") return fallback;
  if (typeof value !== "string") return value;
  try { return JSON.parse(value); } catch { return fallback; }
}
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
function boundedString(value, name, max = 500, required = true) {
  const output = String(value ?? "").trim();
  if (required && !output) throw new GovernanceError("VALIDATION_ERROR", `${name} is required`, 422);
  if (output.length > max) throw new GovernanceError("VALIDATION_ERROR", `${name} exceeds ${max} characters`, 422);
  return output;
}
function normalizeArray(value, max = 100) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, max);
}
function normalizeTests(value) {
  return normalizeArray(value, 100).map((item, index) => ({
    name: boundedString(item && item.name || `test-${index + 1}`, "test name", 200),
    status: ["passed", "failed", "skipped"].includes(item && item.status) ? item.status : "failed",
    evidence_id: item && item.evidence_id ? String(item.evidence_id).slice(0, 200) : null,
    details: item && item.details ? String(item.details).slice(0, 1000) : null
  }));
}
function packageRow(row) {
  if (!row) return null;
  return {
    ...row,
    evidence_ids: parseJson(row.evidence_ids, []),
    tests: parseJson(row.tests_json, []),
    rollback_plan: parseJson(row.rollback_plan_json, null),
    declared_risks: parseJson(row.declared_risks_json, []),
    policy_decision: parseJson(row.policy_decision_json, null),
    payload: parseJson(row.payload, {})
  };
}
function reviewRow(row) {
  if (!row) return null;
  return { ...row, findings: parseJson(row.findings_json, []) };
}
function grantRow(row) {
  if (!row) return null;
  return { ...row, receipt: parseJson(row.receipt_json, null) };
}

class GovernanceKernel {
  constructor(options = {}) {
    if (!options.db) throw new GovernanceError("CONFIG_INVALID", "db is required", 500);
    this.db = options.db;
    this.repoRoot = path.resolve(options.repoRoot || path.join(__dirname, "../.."));
    this.secret = String(options.secret || "");
    if (this.secret.length < 32) throw new GovernanceError("CONFIG_INVALID", "governance secret must contain at least 32 characters", 500);
    this.logger = options.logger || { write() {} };
    this.bootstrap();
  }

  bootstrap() {
    const migrationPath = path.join(this.repoRoot, "ops", "sqlite", "003_autonomous_governance.sql");
    const sql = fs.readFileSync(migrationPath, "utf8");
    const checksum = sha256(sql);
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db.exec(sql);
      const existing = this.db.prepare("SELECT checksum FROM governance_schema_migrations WHERE version=3").get();
      if (existing && existing.checksum !== checksum) {
        throw new GovernanceError("MIGRATION_CHECKSUM_MISMATCH", "Governance migration changed after application", 500);
      }
      if (!existing) {
        this.db.prepare("INSERT INTO governance_schema_migrations(version,name,checksum,applied_at) VALUES(3,?,?,?)")
          .run("003_autonomous_governance.sql", checksum, now());
      }
      this.seedOrganization("default");
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  seedOrganization(organizationId) {
    const timestamp = now();
    const policyJson = canonical(DEFAULT_CONSTITUTION);
    const policyHash = sha256(policyJson);
    const active = this.db.prepare("SELECT version FROM governance_constitutions WHERE organization_id=? AND active=1").get(organizationId);
    if (!active) {
      this.db.prepare(`INSERT OR IGNORE INTO governance_constitutions(
        organization_id,version,active,policy_json,policy_hash,created_at,created_by
      ) VALUES(?,1,1,?,?,?,?)`).run(organizationId, policyJson, policyHash, timestamp, "system-bootstrap");
    }
    this.db.prepare(`INSERT OR IGNORE INTO governance_controls(
      organization_id,global_stop,spending_frozen,agent_creation_disabled,external_actions_disabled,reason,updated_at,updated_by
    ) VALUES(?,0,0,0,0,NULL,?,?)`).run(organizationId, timestamp, "system-bootstrap");

    if (this._tableExists("users")) {
      this.db.prepare(`INSERT OR IGNORE INTO users(id,organization_id,role,active,created_at,updated_at)
        VALUES(?,?,?,?,?,?)`).run("supervisor-local", organizationId, "approver", 1, timestamp, timestamp);
      this.db.prepare(`INSERT OR IGNORE INTO users(id,organization_id,role,active,created_at,updated_at)
        VALUES(?,?,?,?,?,?)`).run("boss-local", organizationId, "admin", 1, timestamp, timestamp);
    }
    for (const [userId, governanceRole] of [["supervisor-local", "supervisor"], ["boss-local", "boss"]]) {
      this.db.prepare(`INSERT OR IGNORE INTO governance_principals(
        organization_id,user_id,governance_role,active,created_at,updated_at
      ) VALUES(?,?,?,?,?,?)`).run(organizationId, userId, governanceRole, 1, timestamp, timestamp);
    }
  }

  submit(auth, input = {}) {
    this._requireAuth(auth);
    this.seedOrganization(auth.organization_id);
    if (!new Set(["agent", "admin"]).has(auth.role)) {
      throw new GovernanceError("PERMISSION_DENIED", "Only an assigned worker or administrator can submit work", 403);
    }
    const missionId = boundedString(input.mission_id, "mission_id", 200);
    const mission = this._requireMission(auth.organization_id, missionId);
    if (["draft", "validated", "planned", "awaiting_approval", "cancelled"].includes(mission.status)) {
      throw new GovernanceError("MISSION_NOT_EXECUTABLE", `Mission state ${mission.status} cannot enter governance review`, 409);
    }
    const workerId = auth.role === "admin" && input.worker_id ? boundedString(input.worker_id, "worker_id", 200) : auth.user_id;
    if (mission.assigned_agent_id && auth.role !== "admin" && mission.assigned_agent_id !== workerId) {
      throw new GovernanceError("PERMISSION_DENIED", "Worker is not assigned to this mission", 403);
    }
    const requestedAction = boundedString(input.requested_action, "requested_action", 120);
    const riskTier = Number(input.risk_tier);
    if (!Number.isInteger(riskTier) || riskTier < 0 || riskTier > 3) {
      throw new GovernanceError("VALIDATION_ERROR", "risk_tier must be an integer from 0 through 3", 422);
    }
    const artifactHash = boundedString(input.artifact_sha256, "artifact_sha256", 64).toLowerCase();
    if (!/^[a-f0-9]{64}$/.test(artifactHash)) {
      throw new GovernanceError("VALIDATION_ERROR", "artifact_sha256 must be a 64-character SHA-256 digest", 422);
    }
    const evidenceIds = normalizeArray(input.evidence_ids, 100).map((value) => String(value).slice(0, 200));
    const tests = normalizeTests(input.tests);
    const rollbackPlan = input.rollback_plan && typeof input.rollback_plan === "object" ? input.rollback_plan : null;
    const declaredRisks = normalizeArray(input.declared_risks, 50).map((value) => String(value).slice(0, 500));
    const estimatedCost = Number(input.estimated_cost_usd || 0);
    if (!Number.isFinite(estimatedCost) || estimatedCost < 0) {
      throw new GovernanceError("VALIDATION_ERROR", "estimated_cost_usd must be zero or greater", 422);
    }
    const timestamp = now();
    const packageId = newId("govpkg");
    const payload = {
      mission_id: missionId,
      worker_id: workerId,
      requested_action: requestedAction,
      risk_tier: riskTier,
      artifact_sha256: artifactHash,
      evidence_ids: evidenceIds,
      tests,
      rollback_plan: rollbackPlan,
      declared_risks: declaredRisks,
      estimated_cost_usd: estimatedCost,
      acceptance_summary: input.acceptance_summary ? String(input.acceptance_summary).slice(0, 2000) : null,
      metadata: input.metadata && typeof input.metadata === "object" ? input.metadata : {}
    };
    this._transaction(() => {
      this.db.prepare(`INSERT INTO governance_packages(
        id,organization_id,mission_id,worker_id,status,requested_action,risk_tier,artifact_sha256,evidence_ids,
        tests_json,rollback_plan_json,declared_risks_json,estimated_cost_usd,payload,created_at,updated_at
      ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
        packageId, auth.organization_id, missionId, workerId, "awaiting_supervisor", requestedAction, riskTier,
        artifactHash, JSON.stringify(evidenceIds), JSON.stringify(tests), rollbackPlan ? JSON.stringify(rollbackPlan) : null,
        JSON.stringify(declaredRisks), estimatedCost, JSON.stringify(payload), timestamp, timestamp
      );
      this._appendEvent(auth.organization_id, "governance.package_submitted", auth.user_id, packageId, missionId, payload);
    });
    this._log("info", "governance.package_submitted", { package_id: packageId, mission_id: missionId, worker_id: workerId });
    return this.getPackage(auth, packageId);
  }

  supervisorReview(auth, packageId, input = {}) {
    this._requireGovernanceRole(auth, "supervisor");
    const decision = boundedString(input.decision, "decision", 60).toLowerCase();
    if (!SUPERVISOR_DECISIONS.has(decision)) {
      throw new GovernanceError("INVALID_DECISION", `Supervisor decision must be one of ${[...SUPERVISOR_DECISIONS].join(", ")}`, 422);
    }
    const reason = boundedString(input.reason, "reason", 2000);
    const findings = normalizeArray(input.findings, 100).map((value) => typeof value === "object" ? value : { message: String(value).slice(0, 1000) });
    return this._transaction(() => {
      const pkg = this._requirePackage(auth.organization_id, packageId);
      if (!new Set(["awaiting_supervisor", "remediation_required"]).has(pkg.status)) {
        throw new GovernanceError("INVALID_STATE", `Package cannot receive Supervisor review from ${pkg.status}`, 409);
      }
      if (auth.user_id === pkg.worker_id) {
        throw new GovernanceError("SEPARATION_OF_DUTIES", "Worker cannot perform Supervisor review", 409);
      }
      const automaticFindings = this._supervisorChecks(auth.organization_id, pkg);
      const allFindings = [...automaticFindings, ...findings];
      if (decision === "approved" && automaticFindings.some((finding) => finding.severity === "block")) {
        throw new GovernanceError("SUPERVISOR_CHECKS_FAILED", "Supervisor cannot approve while deterministic checks are failing", 409, { findings: automaticFindings });
      }
      const review = this._createReview(auth, pkg, "supervisor", decision, reason, allFindings);
      const nextStatus = {
        approved: "awaiting_boss",
        rejected: "rejected",
        remediation_required: "remediation_required",
        escalation_required: "human_exception"
      }[decision];
      this.db.prepare("UPDATE governance_packages SET status=?,supervisor_review_id=?,updated_at=? WHERE id=?")
        .run(nextStatus, review.id, now(), packageId);
      this._appendEvent(auth.organization_id, `governance.supervisor_${decision}`, auth.user_id, packageId, pkg.mission_id, { review_id: review.id, findings: allFindings });
      return this.getPackage(auth, packageId);
    });
  }

  bossReview(auth, packageId, input = {}) {
    this._requireGovernanceRole(auth, "boss");
    const decision = boundedString(input.decision, "decision", 60).toLowerCase();
    if (!BOSS_DECISIONS.has(decision)) {
      throw new GovernanceError("INVALID_DECISION", `Boss decision must be one of ${[...BOSS_DECISIONS].join(", ")}`, 422);
    }
    const reason = boundedString(input.reason, "reason", 2000);
    const findings = normalizeArray(input.findings, 100).map((value) => typeof value === "object" ? value : { message: String(value).slice(0, 1000) });
    return this._transaction(() => {
      const pkg = this._requirePackage(auth.organization_id, packageId);
      if (pkg.status !== "awaiting_boss") {
        throw new GovernanceError("INVALID_STATE", `Package cannot receive Boss review from ${pkg.status}`, 409);
      }
      const supervisor = this.db.prepare("SELECT * FROM governance_reviews WHERE id=? AND organization_id=?")
        .get(pkg.supervisor_review_id, auth.organization_id);
      if (!supervisor || supervisor.decision !== "approved") {
        throw new GovernanceError("SUPERVISOR_APPROVAL_REQUIRED", "A valid Supervisor approval is required", 409);
      }
      if (auth.user_id === pkg.worker_id || auth.user_id === supervisor.reviewer_id) {
        throw new GovernanceError("SEPARATION_OF_DUTIES", "Boss must be independent from Worker and Supervisor", 409);
      }
      const review = this._createReview(auth, pkg, "boss", decision, reason, findings);
      let status = {
        deny: "denied",
        return_for_revision: "remediation_required",
        quarantine: "quarantined",
        human_exception: "human_exception"
      }[decision] || "policy_evaluation";
      this.db.prepare("UPDATE governance_packages SET status=?,boss_review_id=?,updated_at=? WHERE id=?")
        .run(status, review.id, now(), packageId);
      this._appendEvent(auth.organization_id, `governance.boss_${decision}`, auth.user_id, packageId, pkg.mission_id, { review_id: review.id, findings });

      if (decision === "authorize") {
        const refreshed = this._requirePackage(auth.organization_id, packageId);
        const policyDecision = this._evaluatePolicy(auth.organization_id, refreshed);
        if (policyDecision.allowed) {
          const grant = this._issueGrant(auth, refreshed, policyDecision, input.grant_ttl_minutes);
          status = "authorized";
          this.db.prepare(`UPDATE governance_packages SET status=?,capability_grant_id=?,policy_decision_json=?,updated_at=? WHERE id=?`)
            .run(status, grant.id, JSON.stringify(policyDecision), now(), packageId);
          this._appendEvent(auth.organization_id, "governance.policy_authorized", auth.user_id, packageId, refreshed.mission_id, { policy_decision: policyDecision, grant_id: grant.id });
        } else {
          status = policyDecision.human_exception ? "human_exception" : "blocked";
          this.db.prepare("UPDATE governance_packages SET status=?,policy_decision_json=?,updated_at=? WHERE id=?")
            .run(status, JSON.stringify(policyDecision), now(), packageId);
          this._appendEvent(auth.organization_id, "governance.policy_blocked", auth.user_id, packageId, refreshed.mission_id, policyDecision);
        }
      }
      return this.getPackage(auth, packageId);
    });
  }

  consumeGrant(auth, grantId, input = {}) {
    this._requireAuth(auth);
    const actualCost = Number(input.actual_cost_usd || 0);
    if (!Number.isFinite(actualCost) || actualCost < 0) throw new GovernanceError("VALIDATION_ERROR", "actual_cost_usd must be zero or greater", 422);
    return this._transaction(() => {
      const row = this.db.prepare("SELECT * FROM governance_capability_grants WHERE id=? AND organization_id=?").get(grantId, auth.organization_id);
      if (!row) throw new GovernanceError("NOT_FOUND", "Capability grant not found", 404);
      const grant = grantRow(row);
      if (grant.status !== "active") throw new GovernanceError("GRANT_NOT_ACTIVE", `Capability grant is ${grant.status}`, 409);
      if (Date.parse(grant.expires_at) <= Date.now()) {
        this.db.prepare("UPDATE governance_capability_grants SET status='expired' WHERE id=?").run(grantId);
        throw new GovernanceError("GRANT_EXPIRED", "Capability grant has expired", 409);
      }
      if (auth.role !== "admin" && auth.user_id !== grant.grantee_id) {
        throw new GovernanceError("PERMISSION_DENIED", "Capability grant belongs to another worker", 403);
      }
      this._assertControlsPermit(auth.organization_id, grant.capability, actualCost);
      if (actualCost > Number(grant.maximum_cost_usd)) {
        throw new GovernanceError("BUDGET_EXCEEDED", "Actual cost exceeds the capability grant", 409, {
          maximum_cost_usd: grant.maximum_cost_usd,
          actual_cost_usd: actualCost
        });
      }
      const receipt = {
        external_reference: input.external_reference ? String(input.external_reference).slice(0, 500) : null,
        result_sha256: input.result_sha256 ? String(input.result_sha256).slice(0, 64) : null,
        outcome: input.outcome ? String(input.outcome).slice(0, 2000) : null,
        metadata: input.metadata && typeof input.metadata === "object" ? input.metadata : {}
      };
      const timestamp = now();
      this.db.prepare(`UPDATE governance_capability_grants SET
        status='consumed',actual_cost_usd=?,consumed_at=?,consumed_by=?,receipt_json=? WHERE id=?`)
        .run(actualCost, timestamp, auth.user_id, JSON.stringify(receipt), grantId);
      this.db.prepare("UPDATE governance_packages SET status='consumed',updated_at=? WHERE id=?")
        .run(timestamp, grant.package_id);
      this.db.prepare(`INSERT INTO governance_budget_ledger(
        id,organization_id,package_id,grant_id,entry_type,amount_usd,metadata_json,created_at,created_by
      ) VALUES(?,?,?,?,?,?,?,?,?)`).run(
        newId("budget"), auth.organization_id, grant.package_id, grantId, "spend", actualCost,
        JSON.stringify({ capability: grant.capability, receipt }), timestamp, auth.user_id
      );
      this._appendEvent(auth.organization_id, "governance.grant_consumed", auth.user_id, grant.package_id, grant.mission_id, { grant_id: grantId, actual_cost_usd: actualCost, receipt });
      return this.getGrant(auth, grantId);
    });
  }

  revokeGrant(auth, grantId, reason = "Grant revoked") {
    this._requireAdmin(auth);
    return this._transaction(() => {
      const row = this.db.prepare("SELECT * FROM governance_capability_grants WHERE id=? AND organization_id=?").get(grantId, auth.organization_id);
      if (!row) throw new GovernanceError("NOT_FOUND", "Capability grant not found", 404);
      if (row.status !== "active") return grantRow(row);
      this.db.prepare("UPDATE governance_capability_grants SET status='revoked',receipt_json=? WHERE id=?")
        .run(JSON.stringify({ revoked_reason: String(reason).slice(0, 1000) }), grantId);
      this.db.prepare("UPDATE governance_packages SET status='quarantined',updated_at=? WHERE id=?")
        .run(now(), row.package_id);
      this._appendEvent(auth.organization_id, "governance.grant_revoked", auth.user_id, row.package_id, row.mission_id, { grant_id: grantId, reason });
      return this.getGrant(auth, grantId);
    });
  }

  setControls(auth, input = {}) {
    this._requireAdmin(auth);
    this.seedOrganization(auth.organization_id);
    const current = this.getControls(auth);
    const next = {
      global_stop: input.global_stop === undefined ? current.global_stop : Boolean(input.global_stop),
      spending_frozen: input.spending_frozen === undefined ? current.spending_frozen : Boolean(input.spending_frozen),
      agent_creation_disabled: input.agent_creation_disabled === undefined ? current.agent_creation_disabled : Boolean(input.agent_creation_disabled),
      external_actions_disabled: input.external_actions_disabled === undefined ? current.external_actions_disabled : Boolean(input.external_actions_disabled),
      reason: input.reason === undefined ? current.reason : String(input.reason || "").slice(0, 1000)
    };
    return this._transaction(() => {
      this.db.prepare(`UPDATE governance_controls SET
        global_stop=?,spending_frozen=?,agent_creation_disabled=?,external_actions_disabled=?,reason=?,updated_at=?,updated_by=?
        WHERE organization_id=?`).run(
        next.global_stop ? 1 : 0, next.spending_frozen ? 1 : 0, next.agent_creation_disabled ? 1 : 0,
        next.external_actions_disabled ? 1 : 0, next.reason || null, now(), auth.user_id, auth.organization_id
      );
      if (next.global_stop || next.external_actions_disabled) {
        this.db.prepare("UPDATE governance_capability_grants SET status='revoked' WHERE organization_id=? AND status='active'")
          .run(auth.organization_id);
      }
      this._appendEvent(auth.organization_id, "governance.controls_updated", auth.user_id, null, null, next);
      return this.getControls(auth);
    });
  }

  getPackage(auth, packageId) {
    this._requireAuth(auth);
    const pkg = this._requirePackage(auth.organization_id, packageId);
    const reviews = this.db.prepare("SELECT * FROM governance_reviews WHERE organization_id=? AND package_id=? ORDER BY created_at")
      .all(auth.organization_id, packageId).map(reviewRow);
    const grant = pkg.capability_grant_id ? this.getGrant(auth, pkg.capability_grant_id) : null;
    return { ...pkg, reviews, grant };
  }

  getGrant(auth, grantId) {
    this._requireAuth(auth);
    const row = this.db.prepare("SELECT * FROM governance_capability_grants WHERE id=? AND organization_id=?").get(grantId, auth.organization_id);
    if (!row) throw new GovernanceError("NOT_FOUND", "Capability grant not found", 404);
    return grantRow(row);
  }

  getConstitution(auth) {
    this._requireAuth(auth);
    this.seedOrganization(auth.organization_id);
    const row = this.db.prepare("SELECT * FROM governance_constitutions WHERE organization_id=? AND active=1").get(auth.organization_id);
    return { ...row, policy: parseJson(row.policy_json, {}) };
  }

  getControls(auth) {
    this._requireAuth(auth);
    this.seedOrganization(auth.organization_id);
    const row = this.db.prepare("SELECT * FROM governance_controls WHERE organization_id=?").get(auth.organization_id);
    return {
      ...row,
      global_stop: Boolean(row.global_stop),
      spending_frozen: Boolean(row.spending_frozen),
      agent_creation_disabled: Boolean(row.agent_creation_disabled),
      external_actions_disabled: Boolean(row.external_actions_disabled)
    };
  }

  dashboard(auth, options = {}) {
    this._requireAuth(auth);
    this._expireGrants(auth.organization_id);
    const limit = Math.min(200, Math.max(1, Number(options.limit || 50)));
    const packages = this.db.prepare("SELECT * FROM governance_packages WHERE organization_id=? ORDER BY created_at DESC LIMIT ?")
      .all(auth.organization_id, limit).map(packageRow);
    const grants = this.db.prepare("SELECT * FROM governance_capability_grants WHERE organization_id=? ORDER BY issued_at DESC LIMIT ?")
      .all(auth.organization_id, limit).map(grantRow);
    const counts = Object.fromEntries(this.db.prepare("SELECT status,COUNT(*) AS count FROM governance_packages WHERE organization_id=? GROUP BY status")
      .all(auth.organization_id).map((row) => [row.status, Number(row.count)]));
    return {
      controls: this.getControls(auth),
      constitution: this.getConstitution(auth),
      monthly_spend_usd: this._monthlySpend(auth.organization_id),
      active_grant_reservations_usd: this._activeReservations(auth.organization_id),
      package_counts: counts,
      packages,
      grants
    };
  }

  verifyLedger(auth) {
    this._requireAuth(auth);
    const events = this.db.prepare("SELECT * FROM governance_events WHERE organization_id=? ORDER BY sequence")
      .all(auth.organization_id);
    let previous = null;
    const failures = [];
    for (const event of events) {
      const record = {
        id: event.id,
        organization_id: event.organization_id,
        sequence: event.sequence,
        event_type: event.event_type,
        actor: event.actor,
        package_id: event.package_id,
        mission_id: event.mission_id,
        payload: parseJson(event.payload_json, {}),
        previous_hash: event.previous_hash,
        created_at: event.created_at
      };
      const expected = sha256(canonical(record));
      if (event.previous_hash !== previous || event.record_hash !== expected) {
        failures.push({ sequence: event.sequence, id: event.id, expected_previous: previous, actual_previous: event.previous_hash, expected_hash: expected, actual_hash: event.record_hash });
      }
      previous = event.record_hash;
    }
    return { ok: failures.length === 0, event_count: events.length, head_hash: previous, failures };
  }

  _supervisorChecks(organizationId, pkg) {
    const constitution = this._constitutionPolicy(organizationId);
    const findings = [];
    if (constitution.require_all_tests_passed && (!pkg.tests.length || pkg.tests.some((test) => test.status !== "passed"))) {
      findings.push({ code: "TESTS_NOT_PASSED", severity: "block", message: "All declared tests must pass" });
    }
    if (pkg.evidence_ids.length < Number(constitution.minimum_evidence_items || 1)) {
      findings.push({ code: "EVIDENCE_INSUFFICIENT", severity: "block", message: "Required evidence is missing" });
    }
    if (pkg.risk_tier >= Number(constitution.require_rollback_from_risk_tier || 1) && !pkg.rollback_plan) {
      findings.push({ code: "ROLLBACK_REQUIRED", severity: "block", message: "Rollback plan is required for this risk tier" });
    }
    if (normalizeArray(constitution.prohibited_autonomous_actions).includes(pkg.requested_action)) {
      findings.push({ code: "PROHIBITED_AUTONOMOUS_ACTION", severity: "block", message: "Requested action requires a human exception" });
    }
    if (!findings.length) findings.push({ code: "DETERMINISTIC_CHECKS_PASSED", severity: "info", message: "Tests, evidence, rollback, and action checks passed" });
    return findings;
  }

  _evaluatePolicy(organizationId, pkg) {
    const policy = this._constitutionPolicy(organizationId);
    const controls = this.db.prepare("SELECT * FROM governance_controls WHERE organization_id=?").get(organizationId);
    const failures = [];
    const humanException = normalizeArray(policy.human_exception_actions).includes(pkg.requested_action);
    if (controls.global_stop) failures.push({ code: "GLOBAL_STOP", message: "Global emergency stop is active" });
    if (controls.external_actions_disabled) failures.push({ code: "EXTERNAL_ACTIONS_DISABLED", message: "External actions are disabled" });
    if (controls.spending_frozen && Number(pkg.estimated_cost_usd) > 0) failures.push({ code: "SPENDING_FROZEN", message: "Spending is frozen" });
    if (pkg.requested_action === "create_agent" && controls.agent_creation_disabled) failures.push({ code: "AGENT_CREATION_DISABLED", message: "Agent creation is disabled" });
    if (pkg.risk_tier > Number(policy.max_autonomous_risk_tier)) failures.push({ code: "RISK_TIER_EXCEEDED", message: "Risk tier exceeds autonomous authority" });
    if (normalizeArray(policy.prohibited_autonomous_actions).includes(pkg.requested_action)) failures.push({ code: "ACTION_PROHIBITED", message: "Action is prohibited from autonomous execution" });
    if (Number(pkg.estimated_cost_usd) > Number(policy.maximum_action_cost_usd)) failures.push({ code: "ACTION_BUDGET_EXCEEDED", message: "Estimated action cost exceeds constitutional limit" });
    const projected = this._monthlySpend(organizationId) + this._activeReservations(organizationId) + Number(pkg.estimated_cost_usd);
    if (projected > Number(policy.maximum_monthly_cost_usd)) failures.push({ code: "MONTHLY_BUDGET_EXCEEDED", message: "Projected monthly spend exceeds constitutional limit" });
    if (pkg.evidence_ids.length < Number(policy.minimum_evidence_items || 1)) failures.push({ code: "EVIDENCE_INSUFFICIENT", message: "Evidence threshold not met" });
    if (policy.require_all_tests_passed && (!pkg.tests.length || pkg.tests.some((test) => test.status !== "passed"))) failures.push({ code: "TESTS_NOT_PASSED", message: "Test threshold not met" });
    if (pkg.risk_tier >= Number(policy.require_rollback_from_risk_tier || 1) && !pkg.rollback_plan) failures.push({ code: "ROLLBACK_REQUIRED", message: "Rollback plan is required" });
    return {
      allowed: failures.length === 0,
      human_exception: humanException || pkg.risk_tier > Number(policy.max_autonomous_risk_tier),
      constitution_version: policy.version,
      constitution_hash: sha256(canonical(policy)),
      projected_monthly_cost_usd: projected,
      failures,
      evaluated_at: now()
    };
  }

  _issueGrant(auth, pkg, policyDecision, requestedTtl) {
    const policy = this._constitutionPolicy(auth.organization_id);
    const ttl = Math.max(1, Math.min(Number(requestedTtl || 20), Number(policy.maximum_grant_ttl_minutes || 30)));
    const issuedAt = now();
    const expiresAt = new Date(Date.now() + ttl * 60_000).toISOString();
    const grantId = newId("grant");
    const unsigned = {
      id: grantId,
      organization_id: auth.organization_id,
      package_id: pkg.id,
      mission_id: pkg.mission_id,
      grantee_id: pkg.worker_id,
      capability: pkg.requested_action,
      maximum_cost_usd: Number(pkg.estimated_cost_usd),
      issued_at: issuedAt,
      expires_at: expiresAt,
      constitution_hash: policyDecision.constitution_hash
    };
    const signature = hmac(this.secret, canonical(unsigned));
    this.db.prepare(`INSERT INTO governance_capability_grants(
      id,organization_id,package_id,mission_id,grantee_id,capability,status,maximum_cost_usd,issued_at,expires_at,signature
    ) VALUES(?,?,?,?,?,?,?,?,?,?,?)`).run(
      grantId, auth.organization_id, pkg.id, pkg.mission_id, pkg.worker_id, pkg.requested_action, "active",
      Number(pkg.estimated_cost_usd), issuedAt, expiresAt, signature
    );
    this.db.prepare(`INSERT INTO governance_budget_ledger(
      id,organization_id,package_id,grant_id,entry_type,amount_usd,metadata_json,created_at,created_by
    ) VALUES(?,?,?,?,?,?,?,?,?)`).run(
      newId("budget"), auth.organization_id, pkg.id, grantId, "reserve", Number(pkg.estimated_cost_usd),
      JSON.stringify({ expires_at: expiresAt, capability: pkg.requested_action }), issuedAt, auth.user_id
    );
    return this.getGrant(auth, grantId);
  }

  _createReview(auth, pkg, reviewType, decision, reason, findings) {
    const createdAt = now();
    const id = newId(`${reviewType}review`);
    const signedPayload = {
      id,
      organization_id: auth.organization_id,
      package_id: pkg.id,
      artifact_sha256: pkg.artifact_sha256,
      review_type: reviewType,
      reviewer_id: auth.user_id,
      decision,
      reason,
      findings,
      created_at: createdAt
    };
    const signedPayloadHash = sha256(canonical(signedPayload));
    const signature = hmac(this.secret, signedPayloadHash);
    this.db.prepare(`INSERT INTO governance_reviews(
      id,organization_id,package_id,review_type,reviewer_id,decision,reason,findings_json,signature,signed_payload_hash,created_at
    ) VALUES(?,?,?,?,?,?,?,?,?,?,?)`).run(
      id, auth.organization_id, pkg.id, reviewType, auth.user_id, decision, reason, JSON.stringify(findings), signature, signedPayloadHash, createdAt
    );
    return reviewRow(this.db.prepare("SELECT * FROM governance_reviews WHERE id=?").get(id));
  }

  _appendEvent(organizationId, eventType, actor, packageId, missionId, payload) {
    const prior = this.db.prepare("SELECT sequence,record_hash FROM governance_events WHERE organization_id=? ORDER BY sequence DESC LIMIT 1").get(organizationId);
    const sequence = prior ? Number(prior.sequence) + 1 : 1;
    const event = {
      id: newId("govevent"),
      organization_id: organizationId,
      sequence,
      event_type: eventType,
      actor,
      package_id: packageId || null,
      mission_id: missionId || null,
      payload: payload || {},
      previous_hash: prior ? prior.record_hash : null,
      created_at: now()
    };
    const recordHash = sha256(canonical(event));
    this.db.prepare(`INSERT INTO governance_events(
      id,organization_id,sequence,event_type,actor,package_id,mission_id,payload_json,previous_hash,record_hash,created_at
    ) VALUES(?,?,?,?,?,?,?,?,?,?,?)`).run(
      event.id, organizationId, sequence, eventType, actor, packageId || null, missionId || null,
      JSON.stringify(event.payload), event.previous_hash, recordHash, event.created_at
    );
    return { ...event, record_hash: recordHash };
  }

  _assertControlsPermit(organizationId, capability, cost) {
    const controls = this.db.prepare("SELECT * FROM governance_controls WHERE organization_id=?").get(organizationId);
    if (controls.global_stop) throw new GovernanceError("GLOBAL_STOP", "Global emergency stop is active", 423);
    if (controls.external_actions_disabled) throw new GovernanceError("EXTERNAL_ACTIONS_DISABLED", "External actions are disabled", 423);
    if (controls.spending_frozen && cost > 0) throw new GovernanceError("SPENDING_FROZEN", "Spending is frozen", 423);
    if (capability === "create_agent" && controls.agent_creation_disabled) throw new GovernanceError("AGENT_CREATION_DISABLED", "Agent creation is disabled", 423);
  }

  _expireGrants(organizationId) {
    this.db.prepare("UPDATE governance_capability_grants SET status='expired' WHERE organization_id=? AND status='active' AND expires_at<=?")
      .run(organizationId, now());
  }

  _monthlySpend(organizationId) {
    const start = new Date();
    start.setUTCDate(1); start.setUTCHours(0, 0, 0, 0);
    const row = this.db.prepare(`SELECT COALESCE(SUM(CASE WHEN entry_type='spend' THEN amount_usd WHEN entry_type='credit' THEN -amount_usd ELSE 0 END),0) AS total
      FROM governance_budget_ledger WHERE organization_id=? AND created_at>=?`).get(organizationId, start.toISOString());
    return Number(row && row.total || 0);
  }

  _activeReservations(organizationId) {
    this._expireGrants(organizationId);
    const row = this.db.prepare("SELECT COALESCE(SUM(maximum_cost_usd),0) AS total FROM governance_capability_grants WHERE organization_id=? AND status='active'")
      .get(organizationId);
    return Number(row && row.total || 0);
  }

  _constitutionPolicy(organizationId) {
    this.seedOrganization(organizationId);
    const row = this.db.prepare("SELECT policy_json FROM governance_constitutions WHERE organization_id=? AND active=1").get(organizationId);
    if (!row) throw new GovernanceError("CONSTITUTION_MISSING", "Active governance constitution is missing", 500);
    return parseJson(row.policy_json, DEFAULT_CONSTITUTION);
  }

  _requirePackage(organizationId, packageId) {
    const row = this.db.prepare("SELECT * FROM governance_packages WHERE id=? AND organization_id=?").get(packageId, organizationId);
    if (!row) throw new GovernanceError("NOT_FOUND", "Governance package not found", 404);
    return packageRow(row);
  }

  _requireMission(organizationId, missionId) {
    if (!this._tableExists("missions")) throw new GovernanceError("MISSION_RUNTIME_UNAVAILABLE", "Missions table is unavailable", 503);
    const row = this.db.prepare("SELECT id,organization_id,status,assigned_agent_id FROM missions WHERE id=? AND organization_id=?").get(missionId, organizationId);
    if (!row) throw new GovernanceError("NOT_FOUND", "Mission not found", 404);
    return row;
  }

  _requireAuth(auth) {
    if (!auth || !auth.user_id || !auth.organization_id || !auth.role) {
      throw new GovernanceError("AUTH_REQUIRED", "Authenticated principal is required", 401);
    }
  }

  _requireAdmin(auth) {
    this._requireAuth(auth);
    if (auth.role !== "admin") throw new GovernanceError("PERMISSION_DENIED", "Administrator authority is required", 403);
  }

  _requireGovernanceRole(auth, governanceRole) {
    this._requireAuth(auth);
    const row = this.db.prepare(`SELECT active FROM governance_principals
      WHERE organization_id=? AND user_id=? AND governance_role=?`).get(auth.organization_id, auth.user_id, governanceRole);
    if (!row || !row.active) throw new GovernanceError("PERMISSION_DENIED", `Active ${governanceRole} governance identity is required`, 403);
  }

  _tableExists(name) {
    return Boolean(this.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(name));
  }

  _transaction(operation) {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = operation();
      this.db.exec("COMMIT");
      return result;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  _log(level, event, data) {
    try { this.logger.write(level, event, data); } catch { }
  }
}

module.exports = {
  GovernanceKernel,
  GovernanceError,
  DEFAULT_CONSTITUTION,
  SUPERVISOR_DECISIONS,
  BOSS_DECISIONS,
  TERMINAL_PACKAGE_STATES,
  canonical,
  sha256
};
