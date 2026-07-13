"use strict";

const fs = require("node:fs");
const path = require("node:path");
const {
  RuntimeError, now, id, sha256, canonical, atomicWrite,
} = require("../../runtime/missions/base");
const { rowPayload, requireMission } = require("../../runtime/missions/store");

const COMPANY_STATES = new Set(["awaiting_approval", "active", "paused", "completed", "stopped", "failed"]);
const CONTRACT_STATES = new Set(["active", "achieved", "expired", "stopped", "failed"]);
const ACTION_STATES = new Set(["pending", "awaiting_approval", "approved", "running", "completed", "blocked", "failed", "cancelled"]);
const OPERATOR_AGENT_PREFIX = "cyvx-company-operator";
const BOOTSTRAP_CAPABILITIES = ["artifact.write", "intelligence.read", "lead.capture", "metric.record"];
const DEFAULT_PROHIBITED_ACTIONS = ["send_message", "purchase", "submit_bid", "sign_contract", "transfer_funds"];

function parseJson(value, fallback) {
  if (value === null || value === undefined || value === "") return fallback;
  if (typeof value !== "string") return value;
  try { return JSON.parse(value); } catch { return fallback; }
}

function boundedString(value, name, maximum, required = false) {
  const output = String(value || "").trim();
  if (required && !output) throw new RuntimeError("VALIDATION_ERROR", `${name} is required`, 422);
  if (output.length > maximum) throw new RuntimeError("VALIDATION_ERROR", `${name} exceeds ${maximum} characters`, 422);
  return output;
}

function boundedArray(value, name, maximum = 30) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new RuntimeError("VALIDATION_ERROR", `${name} must be an array`, 422);
  if (value.length > maximum) throw new RuntimeError("VALIDATION_ERROR", `${name} exceeds ${maximum} items`, 422);
  return [...new Set(value.map((item) => boundedString(item, `${name} item`, 160, true)))];
}

function integer(value, name, minimum = 0, maximum = 1_000_000_000) {
  const output = Number(value);
  if (!Number.isInteger(output) || output < minimum || output > maximum) {
    throw new RuntimeError("VALIDATION_ERROR", `${name} must be an integer from ${minimum} to ${maximum}`, 422);
  }
  return output;
}

function finiteNumber(value, name, minimum = 0) {
  const output = Number(value);
  if (!Number.isFinite(output) || output < minimum) {
    throw new RuntimeError("VALIDATION_ERROR", `${name} must be a finite number greater than or equal to ${minimum}`, 422);
  }
  return output;
}

function slugify(value) {
  return String(value || "company")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64) || "company";
}

function html(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function ensureInside(root, candidate) {
  const base = path.resolve(root);
  const resolved = path.resolve(candidate);
  if (resolved !== base && !resolved.startsWith(`${base}${path.sep}`)) {
    throw new RuntimeError("WORKSPACE_PATH_INVALID", "Company workspace escaped the configured root", 500);
  }
  return resolved;
}

function ensureOperatorSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS operator_companies (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL,
      mission_id TEXT NOT NULL,
      contract_id TEXT NOT NULL,
      slug TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      owner_user_id TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('awaiting_approval','active','paused','completed','stopped','failed')),
      activation_status TEXT NOT NULL DEFAULT 'planned',
      workspace_path TEXT NOT NULL,
      spent_cents INTEGER NOT NULL DEFAULT 0,
      revenue_cents INTEGER NOT NULL DEFAULT 0,
      leads_count INTEGER NOT NULL DEFAULT 0,
      qualified_opportunities INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      last_tick_at TEXT,
      UNIQUE(organization_id, slug),
      FOREIGN KEY(organization_id) REFERENCES organizations(id),
      FOREIGN KEY(mission_id) REFERENCES missions(id)
    );
    CREATE INDEX IF NOT EXISTS idx_operator_companies_org_status ON operator_companies(organization_id,status,updated_at);

    CREATE TABLE IF NOT EXISTS operator_contracts (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL,
      company_id TEXT NOT NULL UNIQUE,
      objective TEXT NOT NULL,
      target_metric TEXT NOT NULL,
      comparator TEXT NOT NULL,
      target_value REAL NOT NULL,
      max_budget_cents INTEGER NOT NULL,
      approval_threshold_cents INTEGER NOT NULL,
      deadline TEXT,
      risk_level TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('active','achieved','expired','stopped','failed')),
      payload TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(company_id) REFERENCES operator_companies(id)
    );

    CREATE TABLE IF NOT EXISTS operator_actions (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL,
      company_id TEXT NOT NULL,
      mission_id TEXT NOT NULL,
      sequence INTEGER NOT NULL,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      capability TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('pending','awaiting_approval','approved','running','completed','blocked','failed','cancelled')),
      risk_level TEXT NOT NULL,
      estimated_cost_cents INTEGER NOT NULL DEFAULT 0,
      actual_cost_cents INTEGER NOT NULL DEFAULT 0,
      requires_approval INTEGER NOT NULL DEFAULT 0,
      input TEXT NOT NULL,
      output TEXT,
      evidence_id TEXT,
      error TEXT,
      created_at TEXT NOT NULL,
      started_at TEXT,
      completed_at TEXT,
      updated_at TEXT NOT NULL,
      UNIQUE(company_id,sequence),
      FOREIGN KEY(company_id) REFERENCES operator_companies(id),
      FOREIGN KEY(mission_id) REFERENCES missions(id)
    );
    CREATE INDEX IF NOT EXISTS idx_operator_actions_next ON operator_actions(company_id,status,sequence);

    CREATE TABLE IF NOT EXISTS operator_action_approvals (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL,
      company_id TEXT NOT NULL,
      action_id TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL CHECK(status IN ('pending','approved','rejected')),
      reason TEXT,
      requested_at TEXT NOT NULL,
      decided_at TEXT,
      decided_by TEXT,
      decision_reason TEXT,
      FOREIGN KEY(company_id) REFERENCES operator_companies(id),
      FOREIGN KEY(action_id) REFERENCES operator_actions(id)
    );

    CREATE TABLE IF NOT EXISTS operator_metrics (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL,
      company_id TEXT NOT NULL,
      name TEXT NOT NULL,
      value REAL NOT NULL,
      unit TEXT NOT NULL,
      source TEXT NOT NULL,
      evidence_id TEXT,
      recorded_at TEXT NOT NULL,
      FOREIGN KEY(company_id) REFERENCES operator_companies(id)
    );
    CREATE INDEX IF NOT EXISTS idx_operator_metrics_latest ON operator_metrics(company_id,name,recorded_at DESC);

    CREATE TABLE IF NOT EXISTS operator_leads (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL,
      company_id TEXT NOT NULL,
      name TEXT,
      email TEXT,
      phone TEXT,
      company_name TEXT,
      message TEXT,
      source TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'new',
      received_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(company_id) REFERENCES operator_companies(id)
    );
    CREATE INDEX IF NOT EXISTS idx_operator_leads_company_time ON operator_leads(company_id,received_at DESC);

    CREATE TABLE IF NOT EXISTS operator_ticks (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL,
      company_id TEXT NOT NULL,
      action_id TEXT,
      status TEXT NOT NULL,
      summary TEXT NOT NULL,
      details TEXT NOT NULL,
      started_at TEXT NOT NULL,
      completed_at TEXT NOT NULL,
      FOREIGN KEY(company_id) REFERENCES operator_companies(id)
    );
    CREATE INDEX IF NOT EXISTS idx_operator_ticks_company_time ON operator_ticks(company_id,completed_at DESC);
  `);
}

function normalizeContract(input = {}) {
  const objective = boundedString(input.objective, "outcome_contract.objective", 1000, true);
  const targetMetric = boundedString(input.target_metric || "lead_count", "outcome_contract.target_metric", 64, true);
  if (!/^[a-z][a-z0-9_]{1,63}$/.test(targetMetric)) {
    throw new RuntimeError("VALIDATION_ERROR", "target_metric must use lowercase letters, numbers, and underscores", 422);
  }
  const comparator = boundedString(input.comparator || ">=", "outcome_contract.comparator", 2, true);
  if (![">=", "<=", ">", "<", "="].includes(comparator)) {
    throw new RuntimeError("VALIDATION_ERROR", "comparator must be >=, <=, >, <, or =", 422);
  }
  const targetValue = finiteNumber(input.target_value ?? 1, "outcome_contract.target_value");
  const maxBudgetCents = integer(input.max_budget_cents ?? 0, "outcome_contract.max_budget_cents");
  const approvalThresholdCents = integer(input.approval_threshold_cents ?? 0, "outcome_contract.approval_threshold_cents", 0, maxBudgetCents || 1_000_000_000);
  const riskLevel = boundedString(input.risk_level || "medium", "outcome_contract.risk_level", 20, true);
  if (!["low", "medium", "high", "critical"].includes(riskLevel)) {
    throw new RuntimeError("VALIDATION_ERROR", "risk_level must be low, medium, high, or critical", 422);
  }
  let deadline = null;
  if (input.deadline) {
    const parsed = new Date(input.deadline);
    if (!Number.isFinite(parsed.getTime())) throw new RuntimeError("VALIDATION_ERROR", "deadline must be a valid date", 422);
    deadline = parsed.toISOString();
  }
  const allowedCapabilities = boundedArray(input.allowed_capabilities || BOOTSTRAP_CAPABILITIES, "outcome_contract.allowed_capabilities");
  const missingCapabilities = BOOTSTRAP_CAPABILITIES.filter((capability) => !allowedCapabilities.includes(capability));
  if (missingCapabilities.length) {
    throw new RuntimeError("CONTRACT_CAPABILITY_GAP", "The contract excludes capabilities required to activate the company operator", 422, { missing_capabilities: missingCapabilities });
  }
  return {
    objective,
    target_metric: targetMetric,
    comparator,
    target_value: targetValue,
    target_unit: boundedString(input.target_unit || (targetMetric.endsWith("_cents") ? "cents" : "count"), "outcome_contract.target_unit", 40, true),
    max_budget_cents: maxBudgetCents,
    approval_threshold_cents: approvalThresholdCents,
    deadline,
    risk_level: riskLevel,
    allowed_capabilities: allowedCapabilities,
    prohibited_actions: boundedArray(input.prohibited_actions || DEFAULT_PROHIBITED_ACTIONS, "outcome_contract.prohibited_actions"),
    required_evidence_types: boundedArray(input.required_evidence_types || [
      "company_profile", "offer", "opportunity_scan", "landing_page", "lead_capture", "measurement_baseline",
    ], "outcome_contract.required_evidence_types"),
    stop_conditions: boundedArray(input.stop_conditions || ["deadline_reached", "budget_exhausted", "target_achieved"], "outcome_contract.stop_conditions"),
  };
}

function buildActionPlan(company, contract) {
  const common = {
    company_id: company.id,
    company_name: company.name,
    description: company.description,
    target_customer: company.target_customer,
    offer: company.offer,
    price_cents: company.price_cents,
    location: company.location,
    keywords: company.keywords,
  };
  return [
    { type: "company.profile", title: "Create owned company profile", capability: "artifact.write", evidence_type: "company_profile", input: common },
    { type: "offer.asset", title: "Create measurable commercial offer", capability: "artifact.write", evidence_type: "offer", input: common },
    { type: "opportunity.scan", title: "Scan connected intelligence for revenue opportunities", capability: "intelligence.read", evidence_type: "opportunity_scan", input: common },
    { type: "landing.page", title: "Publish owned conversion page", capability: "artifact.write", evidence_type: "landing_page", input: common },
    { type: "lead.capture", title: "Activate persistent lead capture", capability: "lead.capture", evidence_type: "lead_capture", input: common },
    { type: "measurement.baseline", title: "Establish economic scoreboard baseline", capability: "metric.record", evidence_type: "measurement_baseline", input: { ...common, contract } },
  ].map((action, index) => ({
    ...action,
    id: id("operator_action"),
    sequence: index + 1,
    risk_level: "low",
    estimated_cost_cents: 0,
    requires_approval: false,
  }));
}

function compare(actual, comparator, target) {
  if (comparator === ">=") return actual >= target;
  if (comparator === "<=") return actual <= target;
  if (comparator === ">") return actual > target;
  if (comparator === "<") return actual < target;
  return actual === target;
}

class CompanyOperator {
  constructor(runtime, options = {}) {
    if (!runtime || !runtime.db || !runtime.engine || !runtime.store || !runtime.evidence) {
      throw new Error("CompanyOperator requires a CYVX mission runtime");
    }
    this.runtime = runtime;
    this.logger = runtime.logger || (runtime.store && runtime.store.logger) || { write() {} };
    runtime.logger = this.logger;
    this.db = runtime.db;
    this.workspaceRoot = path.resolve(options.workspaceRoot || process.env.CYVX_COMPANY_ROOT || path.join(runtime.dataRoot, "companies"));
    this.intelligenceStatePath = path.resolve(options.intelligenceStatePath || process.env.CYVX_MN_STATE_FILE || path.join(runtime.dataRoot, "intelligence", "minnesota", "state.json"));
    fs.mkdirSync(this.workspaceRoot, { recursive: true, mode: 0o700 });
    ensureOperatorSchema(this.db);
  }

  context(auth, operation, causationId = null) {
    return this.runtime.store.withContext({
      organization_id: auth.organization_id,
      actor: auth.user_id,
      correlation_id: auth.correlation_id || id("correlation"),
      causation_id: causationId,
    }, operation);
  }

  assertRole(auth, allowed) {
    if (!auth || !allowed.includes(auth.role)) {
      throw new RuntimeError("PERMISSION_DENIED", `Role ${auth && auth.role || "anonymous"} cannot perform this operator action`, 403);
    }
  }

  ensureOperatorAgent(organizationId) {
    const agentId = `${OPERATOR_AGENT_PREFIX}-${sha256(organizationId).slice(0, 12)}`;
    const timestamp = now();
    this.db.prepare(`INSERT INTO users(id,organization_id,role,active,created_at,updated_at)
      VALUES(?,?,?,?,?,?) ON CONFLICT(organization_id,id) DO UPDATE SET role='agent',active=1,updated_at=excluded.updated_at`)
      .run(agentId, organizationId, "agent", 1, timestamp, timestamp);
    return agentId;
  }

  uniqueSlug(organizationId, requested, name) {
    const base = slugify(requested || name);
    let candidate = base;
    let counter = 1;
    while (this.db.prepare("SELECT 1 FROM operator_companies WHERE organization_id=? AND slug=?").get(organizationId, candidate)) {
      counter += 1;
      candidate = `${base.slice(0, Math.max(1, 60 - String(counter).length))}-${counter}`;
    }
    return candidate;
  }

  createCompany(input = {}, auth) {
    this.assertRole(auth, ["admin"]);
    const name = boundedString(input.name, "name", 160, true);
    const description = boundedString(input.description, "description", 1200, true);
    const targetCustomer = boundedString(input.target_customer, "target_customer", 500, true);
    const offer = boundedString(input.offer, "offer", 1000, true);
    const priceCents = integer(input.price_cents ?? 0, "price_cents");
    const location = boundedString(input.location || "", "location", 200);
    const keywords = boundedArray(input.keywords || [targetCustomer, offer], "keywords");
    const contract = normalizeContract(input.outcome_contract || {});
    const companyId = id("company");
    const contractId = id("outcome_contract");
    const slug = this.uniqueSlug(auth.organization_id, input.slug, name);
    const workspacePath = ensureInside(this.workspaceRoot, path.join(this.workspaceRoot, auth.organization_id, companyId));
    const companyInput = { id: companyId, name, description, target_customer: targetCustomer, offer, price_cents: priceCents, location, keywords };
    const actions = buildActionPlan(companyInput, contract);
    const timestamp = now();

    const mission = this.context(auth, () => this.runtime.engine.createMission({
      organization_id: auth.organization_id,
      title: `Activate autonomous operator for ${name}`,
      objective: `Install an owned, measurable company operating capability for: ${contract.objective}`,
      context: canonical({ company_id: companyId, company_name: name, target_customer: targetCustomer, offer }).slice(0, 2000),
      constraints: [
        `Maximum operating budget: ${contract.max_budget_cents} cents`,
        contract.deadline ? `Deadline: ${contract.deadline}` : "No fixed deadline",
        ...contract.prohibited_actions.map((action) => `Prohibited action: ${action}`),
      ],
      opportunities: boundedArray(input.opportunities || [], "opportunities", 20),
      success_metrics: [{ name: "operator_activation", comparator: "=", target: 1 }, {
        name: contract.target_metric, comparator: contract.comparator, target: contract.target_value, unit: contract.target_unit,
      }],
      approval_required: true,
      risk_level: contract.risk_level,
      priority: Number(input.priority) || 90,
      created_by: auth.user_id,
      expected_completion: contract.deadline,
    }));

    this.context(auth, () => this.runtime.engine.validateMission(mission.id, {
      feasible: true,
      blockers: [],
      assumptions: ["Owned workspace is writable", "No external commitment occurs without approval", "Connected intelligence may be partially available"],
      validated_by: auth.user_id,
    }), mission.id);
    this.context(auth, () => this.runtime.engine.planMission(mission.id, {
      actions: actions.map((action) => ({
        id: action.id, type: action.type, title: action.title, capability: action.capability,
        estimated_cost_cents: action.estimated_cost_cents, requires_approval: action.requires_approval,
      })),
      dependencies: [],
      estimated_duration_minutes: 15,
      resource_requirements: { workspace: workspacePath, budget_cents: contract.max_budget_cents, capabilities: contract.allowed_capabilities },
      planned_by: auth.user_id,
    }), mission.id);
    const approval = this.context(auth, () => this.runtime.engine.requestApproval(mission.id, {
      reason: `Authorize CYVX to activate ${name} within the outcome contract, budget, prohibited-action list, and evidence requirements.`,
      requested_by: auth.user_id,
      approval_deadline: contract.deadline,
    }), mission.id);

    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db.prepare(`INSERT INTO operator_companies(
        id,organization_id,mission_id,contract_id,slug,name,description,owner_user_id,status,activation_status,
        workspace_path,spent_cents,revenue_cents,leads_count,qualified_opportunities,created_at,updated_at
      ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
        companyId, auth.organization_id, mission.id, contractId, slug, name, description, auth.user_id,
        "awaiting_approval", "planned", workspacePath, 0, 0, 0, 0, timestamp, timestamp,
      );
      this.db.prepare(`INSERT INTO operator_contracts(
        id,organization_id,company_id,objective,target_metric,comparator,target_value,max_budget_cents,
        approval_threshold_cents,deadline,risk_level,status,payload,created_at,updated_at
      ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
        contractId, auth.organization_id, companyId, contract.objective, contract.target_metric, contract.comparator,
        contract.target_value, contract.max_budget_cents, contract.approval_threshold_cents, contract.deadline,
        contract.risk_level, "active", JSON.stringify(contract), timestamp, timestamp,
      );
      const insertAction = this.db.prepare(`INSERT INTO operator_actions(
        id,organization_id,company_id,mission_id,sequence,type,title,capability,status,risk_level,estimated_cost_cents,
        actual_cost_cents,requires_approval,input,created_at,updated_at
      ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
      for (const action of actions) insertAction.run(
        action.id, auth.organization_id, companyId, mission.id, action.sequence, action.type, action.title,
        action.capability, "pending", action.risk_level, action.estimated_cost_cents, 0,
        action.requires_approval ? 1 : 0, JSON.stringify({ ...action.input, evidence_type: action.evidence_type }), timestamp, timestamp,
      );
      this.audit(auth, "operator_company", companyId, "created", "Autonomous company operator created", {
        mission_id: mission.id, contract_id: contractId, action_count: actions.length,
      });
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }

    this.context(auth, () => this.runtime.store.transaction((state) => {
      const stored = state.missions.find((item) => item.id === mission.id);
      stored.company_id = companyId;
      stored.outcome_contract_id = contractId;
      stored.operator_version = "company.operator.v1";
      return stored;
    }), approval.approval.id);

    return this.getCompany(companyId, auth);
  }

  approveCompany(companyId, input = {}, auth) {
    this.assertRole(auth, ["admin", "approver"]);
    const company = this.requireCompany(companyId, auth.organization_id);
    if (company.status !== "awaiting_approval") {
      throw new RuntimeError("INVALID_STATE", `Company cannot be approved from ${company.status}`, 409);
    }
    const mission = requireMission(this.db, auth, company.mission_id);
    if (!mission.approval_record_id) throw new RuntimeError("APPROVAL_MISSING", "Mission approval record is missing", 500);
    this.context(auth, () => this.runtime.engine.decideApproval(mission.approval_record_id, {
      decision: "approved",
      decided_by: auth.user_id,
      decision_reason: boundedString(input.decision_reason || "Outcome contract approved", "decision_reason", 500, true),
    }), mission.approval_record_id);
    const agentId = this.ensureOperatorAgent(auth.organization_id);
    this.context(auth, () => this.runtime.engine.assignAgent(company.mission_id, {
      agent_id: agentId,
      assigned_by: auth.user_id,
    }), mission.approval_record_id);
    this.db.prepare("UPDATE operator_companies SET status='active',activation_status='queued',updated_at=? WHERE id=? AND organization_id=?")
      .run(now(), companyId, auth.organization_id);
    this.audit(auth, "operator_company", companyId, "approved", "Outcome contract approved and operator activated", { agent_id: agentId });
    if (input.run_now === true) this.runToIdle(companyId, auth);
    return this.getCompany(companyId, auth);
  }

  controlCompany(companyId, command, auth) {
    this.assertRole(auth, ["admin"]);
    const company = this.requireCompany(companyId, auth.organization_id);
    const next = String(command || "").toLowerCase();
    if (next === "pause" && company.status === "active") this.updateCompanyStatus(company, "paused");
    else if (next === "resume" && company.status === "paused") this.updateCompanyStatus(company, "active");
    else if (next === "stop" && ["active", "paused", "awaiting_approval"].includes(company.status)) {
      this.updateCompanyStatus(company, "stopped");
      this.db.prepare("UPDATE operator_contracts SET status='stopped',updated_at=? WHERE id=?").run(now(), company.contract_id);
    } else throw new RuntimeError("INVALID_STATE", `Cannot ${next || "control"} company from ${company.status}`, 409);
    this.audit(auth, "operator_company", companyId, next, `Company operator ${next}`, {});
    return this.getCompany(companyId, auth);
  }

  approveAction(actionId, input = {}, auth) {
    this.assertRole(auth, ["admin", "approver"]);
    const action = this.db.prepare("SELECT * FROM operator_actions WHERE id=? AND organization_id=?").get(actionId, auth.organization_id);
    if (!action) throw new RuntimeError("NOT_FOUND", "Operator action not found", 404);
    const approval = this.db.prepare("SELECT * FROM operator_action_approvals WHERE action_id=? AND organization_id=?").get(actionId, auth.organization_id);
    if (!approval || approval.status !== "pending") throw new RuntimeError("INVALID_STATE", "Operator action is not awaiting approval", 409);
    const decision = input.decision === "rejected" ? "rejected" : "approved";
    const timestamp = now();
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db.prepare("UPDATE operator_action_approvals SET status=?,decided_at=?,decided_by=?,decision_reason=? WHERE id=?")
        .run(decision, timestamp, auth.user_id, boundedString(input.decision_reason || decision, "decision_reason", 500, true), approval.id);
      this.db.prepare("UPDATE operator_actions SET status=?,updated_at=? WHERE id=?")
        .run(decision === "approved" ? "approved" : "cancelled", timestamp, actionId);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    return this.getCompany(action.company_id, auth);
  }

  runTick(companyId, auth) {
    this.assertRole(auth, ["admin", "agent"]);
    const company = this.requireCompany(companyId, auth.organization_id);
    if (company.status !== "active") return this.recordTick(company, null, "noop", `Company is ${company.status}`, { status: company.status });
    const contract = this.requireContract(company.contract_id, auth.organization_id);
    const stop = this.evaluateContract(company, contract);
    if (stop.terminal) {
      this.applyContractTerminal(company, contract, stop);
      return this.recordTick(company, null, "stopped", stop.reason, stop);
    }

    let mission = requireMission(this.db, auth, company.mission_id);
    if (mission.status === "queued") {
      this.context(auth, () => this.runtime.engine.execute(company.mission_id, {
        started_by: auth.user_id,
        steps: this.db.prepare("SELECT id,type,title FROM operator_actions WHERE company_id=? ORDER BY sequence").all(company.id),
      }), company.id);
      this.db.prepare("UPDATE operator_companies SET activation_status='running',updated_at=? WHERE id=?").run(now(), company.id);
      mission = requireMission(this.db, auth, company.mission_id);
    }
    if (!["running", "completed", "evaluated", "learned"].includes(mission.status)) {
      throw new RuntimeError("MISSION_NOT_EXECUTABLE", `Activation mission is ${mission.status}`, 409);
    }

    const action = this.db.prepare(`SELECT * FROM operator_actions WHERE company_id=? AND status IN ('pending','approved','awaiting_approval')
      ORDER BY sequence LIMIT 1`).get(company.id);
    if (!action) {
      const finalized = this.finalizeActivation(company, auth);
      return this.recordTick(company, null, "idle", finalized ? "Operator activation finalized" : "No executable actions remain", { activation_finalized: finalized });
    }
    if (action.status === "awaiting_approval") {
      return this.recordTick(company, action, "blocked", "Action is awaiting approval", { action_id: action.id });
    }

    const contractPayload = parseJson(contract.payload, {});
    if (!contractPayload.allowed_capabilities.includes(action.capability)) {
      this.blockAction(action, `Capability ${action.capability} is not allowed by the outcome contract`);
      return this.recordTick(company, action, "blocked", "Capability denied by contract", { capability: action.capability });
    }
    if (contractPayload.prohibited_actions.includes(action.type)) {
      this.blockAction(action, `Action ${action.type} is prohibited by the outcome contract`);
      return this.recordTick(company, action, "blocked", "Action prohibited by contract", { type: action.type });
    }
    if (Number(company.spent_cents) + Number(action.estimated_cost_cents) > Number(contract.max_budget_cents)) {
      this.blockAction(action, "Action would exceed the maximum budget");
      this.updateCompanyStatus(company, "paused");
      return this.recordTick(company, action, "blocked", "Budget guard stopped execution", { spent_cents: company.spent_cents, estimated_cost_cents: action.estimated_cost_cents });
    }
    if ((action.requires_approval || Number(action.estimated_cost_cents) > Number(contract.approval_threshold_cents)) && action.status !== "approved") {
      this.requestActionApproval(company, action, auth);
      return this.recordTick(company, action, "blocked", "Action approval requested", { action_id: action.id });
    }

    const startedAt = now();
    this.db.prepare("UPDATE operator_actions SET status='running',started_at=?,updated_at=?,error=NULL WHERE id=?")
      .run(startedAt, startedAt, action.id);
    try {
      const result = this.executeAction(company, contractPayload, rowPayload({ ...action, payload: null }));
      const evidence = this.runtime.evidence.record({
        auth: { user_id: auth.user_id, organization_id: auth.organization_id, role: auth.role },
        missionId: company.mission_id,
        content: result.content,
        type: result.evidence_type,
        title: action.title,
        source: "company.operator.v1",
        correlationId: auth.correlation_id || id("correlation"),
        causationId: action.id,
      });
      const completedAt = now();
      this.db.exec("BEGIN IMMEDIATE");
      try {
        this.db.prepare(`UPDATE operator_actions SET status='completed',actual_cost_cents=?,output=?,evidence_id=?,
          completed_at=?,updated_at=? WHERE id=?`).run(
          Number(result.actual_cost_cents || 0), JSON.stringify(result.output || {}), evidence.id,
          completedAt, completedAt, action.id,
        );
        const qualifiedOpportunities = result.metrics && result.metrics.qualified_opportunities;
        this.db.prepare(`UPDATE operator_companies SET spent_cents=spent_cents+?,last_tick_at=?,updated_at=?,
          qualified_opportunities=CASE WHEN ? IS NULL THEN qualified_opportunities ELSE ? END WHERE id=?`).run(
          Number(result.actual_cost_cents || 0), completedAt, completedAt,
          qualifiedOpportunities === undefined ? null : Number(qualifiedOpportunities),
          qualifiedOpportunities === undefined ? 0 : Number(qualifiedOpportunities),
          company.id,
        );
        this.db.exec("COMMIT");
      } catch (error) {
        this.db.exec("ROLLBACK");
        throw error;
      }
      if (result.metrics) {
        for (const [name, value] of Object.entries(result.metrics)) {
          this.insertMetric(company, name, Number(value), name.endsWith("_cents") ? "cents" : "count", "company.operator.v1", evidence.id);
        }
      }
      const remaining = Number(this.db.prepare("SELECT count(*) AS count FROM operator_actions WHERE company_id=? AND status NOT IN ('completed','cancelled')").get(company.id).count);
      if (remaining === 0) this.finalizeActivation(this.requireCompany(company.id, company.organization_id), auth);
      return this.recordTick(company, action, "completed", `${action.title} completed`, {
        action_id: action.id, evidence_id: evidence.id, artifact_path: result.output && result.output.artifact_path,
      });
    } catch (error) {
      const failedAt = now();
      this.db.prepare("UPDATE operator_actions SET status='failed',error=?,updated_at=? WHERE id=?")
        .run(String(error.message || error).slice(0, 2000), failedAt, action.id);
      this.db.prepare("UPDATE operator_companies SET status='paused',updated_at=?,last_tick_at=? WHERE id=?")
        .run(failedAt, failedAt, company.id);
      this.runtime.logger.write("error", "company_operator.action_failed", {
        company_id: company.id, action_id: action.id, type: action.type, error: error.message,
      });
      this.recordTick(company, action, "failed", `${action.title} failed`, { error: error.message });
      throw error;
    }
  }

  runToIdle(companyId, auth, maximumTicks = 20) {
    const results = [];
    for (let index = 0; index < maximumTicks; index += 1) {
      const company = this.requireCompany(companyId, auth.organization_id);
      if (company.status !== "active") break;
      const pending = Number(this.db.prepare("SELECT count(*) AS count FROM operator_actions WHERE company_id=? AND status IN ('pending','approved')").get(companyId).count);
      if (!pending) {
        this.finalizeActivation(company, auth);
        break;
      }
      const result = this.runTick(companyId, auth);
      results.push(result);
      if (["blocked", "failed", "stopped"].includes(result.status)) break;
    }
    return { company: this.getCompany(companyId, auth), ticks: results };
  }

  runAllOnce() {
    const rows = this.db.prepare("SELECT id,organization_id FROM operator_companies WHERE status='active' ORDER BY COALESCE(last_tick_at,created_at) LIMIT 100").all();
    const results = [];
    for (const row of rows) {
      const agentId = this.ensureOperatorAgent(row.organization_id);
      try {
        results.push(this.runTick(row.id, { user_id: agentId, organization_id: row.organization_id, role: "agent" }));
      } catch (error) {
        results.push({ company_id: row.id, status: "failed", error: error.message });
      }
    }
    return results;
  }

  executeAction(company, contract, action) {
    const input = parseJson(action.input, {});
    const workspace = ensureInside(this.workspaceRoot, company.workspace_path);
    fs.mkdirSync(workspace, { recursive: true, mode: 0o700 });
    const write = (relative, content) => {
      const target = ensureInside(workspace, path.join(workspace, relative));
      atomicWrite(target, content);
      return target;
    };
    if (action.type === "company.profile") {
      const profile = {
        schema_version: 1, company_id: company.id, organization_id: company.organization_id,
        name: company.name, description: company.description, target_customer: input.target_customer,
        offer: input.offer, price_cents: input.price_cents, location: input.location, keywords: input.keywords,
        outcome_contract: contract, ownership: { code: "owner-controlled", data: "owner-controlled", domain: "owner-controlled" },
        generated_at: now(),
      };
      const content = `${JSON.stringify(profile, null, 2)}\n`;
      const artifactPath = write("company.json", content);
      return { content, evidence_type: input.evidence_type, output: { artifact_path: artifactPath, sha256: sha256(content) } };
    }
    if (action.type === "offer.asset") {
      const dollars = (Number(input.price_cents || 0) / 100).toFixed(2);
      const content = `# ${input.company_name}\n\n## Outcome\n${input.offer}\n\n## Built for\n${input.target_customer}\n\n## Why it matters\n${input.description}\n\n## Price\n${Number(input.price_cents) > 0 ? `$${dollars}` : "Custom quote"}\n\n## Proof standard\nEvery deliverable is tied to an acceptance test, evidence artifact, and measurable customer outcome.\n`;
      const artifactPath = write("assets/offer.md", content);
      return { content, evidence_type: input.evidence_type, output: { artifact_path: artifactPath, sha256: sha256(content) } };
    }
    if (action.type === "opportunity.scan") {
      const scan = this.scanIntelligence(input);
      const content = `${JSON.stringify(scan, null, 2)}\n`;
      const artifactPath = write("intelligence/opportunities.json", content);
      return {
        content, evidence_type: input.evidence_type,
        output: { artifact_path: artifactPath, sha256: sha256(content), opportunity_count: scan.opportunities.length, source_ready: scan.source_ready },
        metrics: { qualified_opportunities: scan.opportunities.filter((item) => Number(item.operator_score || item.score || 0) >= 50).length },
      };
    }
    if (action.type === "landing.page") {
      const price = Number(input.price_cents) > 0 ? `$${(Number(input.price_cents) / 100).toFixed(2)}` : "Request a quote";
      const content = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${html(input.company_name)}</title><style>body{font-family:system-ui;margin:0;background:#07111f;color:#edf5ff}main{max-width:760px;margin:auto;padding:64px 20px}.card{background:#10243a;border:1px solid #29445f;border-radius:18px;padding:24px;margin:18px 0}h1{font-size:clamp(2.2rem,8vw,4.5rem);line-height:.95}p{line-height:1.6}input,textarea,button{box-sizing:border-box;width:100%;padding:14px;margin:8px 0;border-radius:10px;border:1px solid #45627e;background:#081827;color:#fff}button{background:#e6b84a;color:#07111f;font-weight:800;cursor:pointer}.proof{font-size:.9rem;color:#a9bdd0}</style></head><body><main><p class="proof">OWNER-CONTROLLED • EVIDENCE-BACKED • OUTCOME-MEASURED</p><h1>${html(input.company_name)}</h1><div class="card"><h2>${html(input.offer)}</h2><p>${html(input.description)}</p><p><strong>For:</strong> ${html(input.target_customer)}</p><p><strong>Starting at:</strong> ${html(price)}</p></div><div class="card"><h2>Start a conversation</h2><form id="lead"><input name="name" placeholder="Your name"><input name="company_name" placeholder="Company"><input type="email" name="email" placeholder="Email"><input name="phone" placeholder="Phone"><textarea name="message" placeholder="What outcome do you need?"></textarea><button>Submit</button><p id="result" class="proof"></p></form></div></main><script>document.getElementById('lead').addEventListener('submit',async(e)=>{e.preventDefault();const body=Object.fromEntries(new FormData(e.target));const r=await fetch('/api/v1/operator/companies/${company.id}/leads',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});const d=await r.json();document.getElementById('result').textContent=d.ok?'Received. We will follow up.':(d.message||'Unable to submit.');if(d.ok)e.target.reset();});</script></body></html>`;
      const artifactPath = write("public/index.html", content);
      return { content, evidence_type: input.evidence_type, output: { artifact_path: artifactPath, sha256: sha256(content), public_path: `/c/${company.slug}` } };
    }
    if (action.type === "lead.capture") {
      const schema = {
        schema_version: 1,
        endpoint: `/api/v1/operator/companies/${company.id}/leads`,
        method: "POST",
        accepted_fields: ["name", "email", "phone", "company_name", "message", "source"],
        validation: { contact_required: true, body_limit_bytes: 32768 },
        persistence: "sqlite.operator_leads",
        generated_at: now(),
      };
      const content = `${JSON.stringify(schema, null, 2)}\n`;
      const artifactPath = write("lead-capture.json", content);
      return { content, evidence_type: input.evidence_type, output: { artifact_path: artifactPath, sha256: sha256(content), endpoint: schema.endpoint } };
    }
    if (action.type === "measurement.baseline") {
      const baseline = {
        schema_version: 1, company_id: company.id, target_metric: contract.target_metric,
        target_value: contract.target_value, comparator: contract.comparator,
        baseline: { lead_count: Number(company.leads_count), revenue_cents: Number(company.revenue_cents), spent_cents: Number(company.spent_cents), qualified_opportunities: Number(company.qualified_opportunities) },
        measured_at: now(),
      };
      const content = `${JSON.stringify(baseline, null, 2)}\n`;
      const artifactPath = write("metrics/baseline.json", content);
      return { content, evidence_type: input.evidence_type, output: { artifact_path: artifactPath, sha256: sha256(content) }, metrics: baseline.baseline };
    }
    throw new RuntimeError("CAPABILITY_NOT_IMPLEMENTED", `No executor is registered for ${action.type}`, 422);
  }

  scanIntelligence(input) {
    const response = { source: this.intelligenceStatePath, source_ready: false, scanned_at: now(), opportunities: [] };
    if (!fs.existsSync(this.intelligenceStatePath)) return response;
    let state;
    try { state = JSON.parse(fs.readFileSync(this.intelligenceStatePath, "utf8")); }
    catch (error) { return { ...response, error: `INTELLIGENCE_STATE_INVALID: ${error.message}` }; }
    const records = Array.isArray(state.opportunities) ? state.opportunities : [];
    const tokens = [...new Set((input.keywords || []).flatMap((value) => String(value).toLowerCase().split(/[^a-z0-9]+/)).filter((value) => value.length > 2))];
    const location = String(input.location || "").toLowerCase();
    response.source_ready = true;
    response.opportunities = records.map((record) => {
      const text = [record.title, record.description, record.category, record.agency, record.location].filter(Boolean).join(" ").toLowerCase();
      const keywordMatches = tokens.filter((token) => text.includes(token));
      const geographicMatch = location && text.includes(location) ? 10 : 0;
      const operatorScore = Math.min(100, Number(record.score || 0) + keywordMatches.length * 8 + geographicMatch);
      return { ...record, operator_score: operatorScore, operator_matches: keywordMatches };
    }).filter((record) => record.operator_matches.length || Number(record.operator_score) >= 50)
      .sort((left, right) => Number(right.operator_score) - Number(left.operator_score))
      .slice(0, 20);
    return response;
  }

  requestActionApproval(company, action, auth) {
    const existing = this.db.prepare("SELECT id FROM operator_action_approvals WHERE action_id=?").get(action.id);
    const timestamp = now();
    if (!existing) {
      this.db.prepare(`INSERT INTO operator_action_approvals(id,organization_id,company_id,action_id,status,reason,requested_at)
        VALUES(?,?,?,?,?,?,?)`).run(
        id("operator_approval"), company.organization_id, company.id, action.id, "pending",
        `Approve ${action.title}; estimated cost ${action.estimated_cost_cents} cents; risk ${action.risk_level}.`, timestamp,
      );
    }
    this.db.prepare("UPDATE operator_actions SET status='awaiting_approval',updated_at=? WHERE id=?").run(timestamp, action.id);
    this.audit(auth, "operator_action", action.id, "approval_requested", "Operator action requires approval", { company_id: company.id });
  }

  blockAction(action, reason) {
    this.db.prepare("UPDATE operator_actions SET status='blocked',error=?,updated_at=? WHERE id=?")
      .run(String(reason).slice(0, 2000), now(), action.id);
  }

  finalizeActivation(company, auth) {
    let mission = requireMission(this.db, auth, company.mission_id);
    if (["learned", "failed", "cancelled"].includes(mission.status)) {
      if (mission.status === "learned" && company.activation_status !== "learned") {
        this.db.prepare("UPDATE operator_companies SET activation_status='learned',updated_at=? WHERE id=?").run(now(), company.id);
      }
      return false;
    }
    const incomplete = Number(this.db.prepare("SELECT count(*) AS count FROM operator_actions WHERE company_id=? AND status NOT IN ('completed','cancelled')").get(company.id).count);
    if (incomplete) return false;
    const evidenceIds = this.db.prepare("SELECT evidence_id FROM operator_actions WHERE company_id=? AND evidence_id IS NOT NULL ORDER BY sequence").all(company.id).map((row) => row.evidence_id);
    if (mission.status === "running") {
      this.context(auth, () => this.runtime.engine.complete(company.mission_id, {
        result_summary: "Autonomous company operating capability activated with owned assets, lead capture, intelligence scan, and economic measurement.",
        metrics: { operator_activation: 1, actions_executed: evidenceIds.length, spent_cents: Number(company.spent_cents) },
        evidence_ids: evidenceIds,
        verified: true,
        completed_by: auth.user_id,
      }), company.id);
      mission = requireMission(this.db, auth, company.mission_id);
    }
    if (mission.status === "completed") {
      this.context(auth, () => this.runtime.engine.evaluate(company.mission_id, {
        success: true,
        lessons_learned: ["Bounded company activation completed with tamper-evident artifacts", "External commitments remained behind approval boundaries"],
        improvements: ["Connect additional acquisition and fulfillment adapters as governed capabilities"],
        capability_delta: { created: 1, protected: 1, improved: 1 },
        evaluated_by: auth.user_id,
      }), company.id);
      mission = requireMission(this.db, auth, company.mission_id);
    }
    if (mission.status === "evaluated") {
      this.context(auth, () => this.runtime.engine.learnCapability(company.mission_id, {
        title: `Operate ${company.name}`,
        description: "Reusable outcome-contract company activation with owned assets, budget enforcement, approvals, evidence, lead capture, and metrics.",
        inputs: ["company_profile", "outcome_contract", "approved_capabilities"],
        outputs: ["owned_workspace", "offer", "landing_page", "lead_capture", "evidence", "scoreboard"],
        permissions_required: ["operator:execute", "artifact:write", "metric:record"],
        tests: ["company-operator-contract", "budget-guard", "evidence-chain", "lead-capture"],
        cost_basis: { activation_spent_cents: Number(company.spent_cents) },
        risk_level: "medium",
        owned_by: company.organization_id,
        learned_by: auth.user_id,
        is_reusable: true,
      }), company.id);
    }
    this.db.prepare("UPDATE operator_companies SET activation_status='learned',updated_at=? WHERE id=?").run(now(), company.id);
    this.audit(auth, "operator_company", company.id, "activation_completed", "Company operator activation capability learned", { mission_id: company.mission_id });
    return true;
  }

  recordLead(companyId, input = {}) {
    const company = this.db.prepare("SELECT * FROM operator_companies WHERE id=?").get(companyId);
    if (!company || !["active", "completed"].includes(company.status)) throw new RuntimeError("NOT_FOUND", "Active company not found", 404);
    const email = boundedString(input.email, "email", 320);
    const phone = boundedString(input.phone, "phone", 80);
    if (!email && !phone) throw new RuntimeError("VALIDATION_ERROR", "An email address or phone number is required", 422);
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new RuntimeError("VALIDATION_ERROR", "email is invalid", 422);
    const lead = {
      id: id("lead"), organization_id: company.organization_id, company_id: company.id,
      name: boundedString(input.name, "name", 160), email, phone,
      company_name: boundedString(input.company_name, "company_name", 200),
      message: boundedString(input.message, "message", 3000), source: boundedString(input.source || "landing_page", "source", 100, true),
      status: "new", received_at: now(), updated_at: now(),
    };
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db.prepare(`INSERT INTO operator_leads(id,organization_id,company_id,name,email,phone,company_name,message,source,status,received_at,updated_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`).run(
        lead.id, lead.organization_id, lead.company_id, lead.name, lead.email, lead.phone, lead.company_name,
        lead.message, lead.source, lead.status, lead.received_at, lead.updated_at,
      );
      this.db.prepare("UPDATE operator_companies SET leads_count=leads_count+1,updated_at=? WHERE id=?").run(lead.received_at, company.id);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    this.insertMetric(company, "lead_count", Number(company.leads_count) + 1, "count", "lead.capture", null);
    const current = this.requireCompany(company.id, company.organization_id);
    const contract = this.requireContract(current.contract_id, current.organization_id);
    const evaluation = this.evaluateContract(current, contract);
    if (evaluation.terminal) this.applyContractTerminal(current, contract, evaluation);
    this.runtime.logger.write("info", "company_operator.lead_received", { company_id: company.id, lead_id: lead.id, source: lead.source });
    return { id: lead.id, status: lead.status, received_at: lead.received_at };
  }

  recordMetric(companyId, input = {}, auth) {
    this.assertRole(auth, ["admin", "agent"]);
    const company = this.requireCompany(companyId, auth.organization_id);
    const name = boundedString(input.name, "name", 64, true);
    if (!/^[a-z][a-z0-9_]{1,63}$/.test(name)) throw new RuntimeError("VALIDATION_ERROR", "Metric name is invalid", 422);
    const value = finiteNumber(input.value, "value");
    const metric = this.insertMetric(company, name, value, boundedString(input.unit || "count", "unit", 40, true), boundedString(input.source || "operator_api", "source", 100, true), input.evidence_id || null);
    const timestamp = now();
    if (name === "revenue_cents") this.db.prepare("UPDATE operator_companies SET revenue_cents=?,updated_at=? WHERE id=?").run(Math.round(value), timestamp, company.id);
    if (name === "spent_cents") this.db.prepare("UPDATE operator_companies SET spent_cents=?,updated_at=? WHERE id=?").run(Math.round(value), timestamp, company.id);
    if (name === "lead_count") this.db.prepare("UPDATE operator_companies SET leads_count=?,updated_at=? WHERE id=?").run(Math.round(value), timestamp, company.id);
    if (name === "qualified_opportunities") this.db.prepare("UPDATE operator_companies SET qualified_opportunities=?,updated_at=? WHERE id=?").run(Math.round(value), timestamp, company.id);
    const current = this.requireCompany(company.id, company.organization_id);
    const contract = this.requireContract(current.contract_id, current.organization_id);
    const evaluation = this.evaluateContract(current, contract);
    if (evaluation.terminal) this.applyContractTerminal(current, contract, evaluation);
    return { metric, evaluation, company: this.getCompany(company.id, auth) };
  }

  insertMetric(company, name, value, unit, source, evidenceId) {
    const metric = { id: id("metric"), organization_id: company.organization_id, company_id: company.id, name, value, unit, source, evidence_id: evidenceId, recorded_at: now() };
    this.db.prepare(`INSERT INTO operator_metrics(id,organization_id,company_id,name,value,unit,source,evidence_id,recorded_at)
      VALUES(?,?,?,?,?,?,?,?,?)`).run(metric.id, metric.organization_id, metric.company_id, metric.name, metric.value, metric.unit, metric.source, metric.evidence_id, metric.recorded_at);
    return metric;
  }

  metricValue(company, name) {
    if (name === "lead_count") return Number(company.leads_count);
    if (name === "revenue_cents") return Number(company.revenue_cents);
    if (name === "spent_cents") return Number(company.spent_cents);
    if (name === "qualified_opportunities") return Number(company.qualified_opportunities);
    const row = this.db.prepare("SELECT value FROM operator_metrics WHERE company_id=? AND name=? ORDER BY recorded_at DESC LIMIT 1").get(company.id, name);
    return Number(row && row.value || 0);
  }

  evaluateContract(company, contract) {
    const actual = this.metricValue(company, contract.target_metric);
    if (compare(actual, contract.comparator, Number(contract.target_value))) {
      return { terminal: true, outcome: "achieved", reason: `Target achieved: ${contract.target_metric} ${actual} ${contract.comparator} ${contract.target_value}`, actual };
    }
    if (contract.deadline && Date.now() >= Date.parse(contract.deadline)) {
      return { terminal: true, outcome: "expired", reason: `Outcome contract deadline reached at ${contract.deadline}`, actual };
    }
    if (Number(company.spent_cents) >= Number(contract.max_budget_cents) && Number(contract.max_budget_cents) > 0) {
      return { terminal: true, outcome: "budget_exhausted", reason: `Maximum budget of ${contract.max_budget_cents} cents reached`, actual };
    }
    return { terminal: false, outcome: "active", reason: "Outcome contract remains active", actual };
  }

  applyContractTerminal(company, contract, evaluation) {
    const timestamp = now();
    if (evaluation.outcome === "achieved") {
      this.db.prepare("UPDATE operator_companies SET status='completed',updated_at=? WHERE id=?").run(timestamp, company.id);
      this.db.prepare("UPDATE operator_contracts SET status='achieved',updated_at=? WHERE id=?").run(timestamp, contract.id);
    } else if (evaluation.outcome === "expired") {
      this.db.prepare("UPDATE operator_companies SET status='stopped',updated_at=? WHERE id=?").run(timestamp, company.id);
      this.db.prepare("UPDATE operator_contracts SET status='expired',updated_at=? WHERE id=?").run(timestamp, contract.id);
    } else if (evaluation.outcome === "budget_exhausted") {
      this.db.prepare("UPDATE operator_companies SET status='paused',updated_at=? WHERE id=?").run(timestamp, company.id);
    }
  }

  recordTick(company, action, status, summary, details) {
    const timestamp = now();
    const tick = {
      id: id("operator_tick"), organization_id: company.organization_id, company_id: company.id,
      action_id: action && action.id || null, status, summary, details, started_at: timestamp, completed_at: timestamp,
    };
    this.db.prepare(`INSERT INTO operator_ticks(id,organization_id,company_id,action_id,status,summary,details,started_at,completed_at)
      VALUES(?,?,?,?,?,?,?,?,?)`).run(
      tick.id, tick.organization_id, tick.company_id, tick.action_id, tick.status, tick.summary,
      JSON.stringify(tick.details || {}), tick.started_at, tick.completed_at,
    );
    this.db.prepare("UPDATE operator_companies SET last_tick_at=?,updated_at=? WHERE id=?").run(timestamp, timestamp, company.id);
    return tick;
  }

  audit(auth, resourceType, resourceId, action, reason, changes) {
    this.db.prepare(`INSERT INTO audit_log(id,organization_id,resource_type,resource_id,action,actor,reason,changes,timestamp)
      VALUES(?,?,?,?,?,?,?,?,?)`).run(
      id("audit"), auth.organization_id, resourceType, resourceId, action, auth.user_id,
      reason, JSON.stringify(changes || {}), now(),
    );
  }

  updateCompanyStatus(company, status) {
    if (!COMPANY_STATES.has(status)) throw new RuntimeError("INVALID_STATE", `Unsupported company state ${status}`, 500);
    this.db.prepare("UPDATE operator_companies SET status=?,updated_at=? WHERE id=?").run(status, now(), company.id);
  }

  requireCompany(companyId, organizationId) {
    const company = this.db.prepare("SELECT * FROM operator_companies WHERE id=? AND organization_id=?").get(companyId, organizationId);
    if (!company) throw new RuntimeError("NOT_FOUND", "Company operator not found", 404);
    return company;
  }

  requireContract(contractId, organizationId) {
    const contract = this.db.prepare("SELECT * FROM operator_contracts WHERE id=? AND organization_id=?").get(contractId, organizationId);
    if (!contract) throw new RuntimeError("NOT_FOUND", "Outcome contract not found", 404);
    return contract;
  }

  getLanding(slug) {
    const company = this.db.prepare("SELECT * FROM operator_companies WHERE slug=? AND status IN ('active','completed') ORDER BY updated_at DESC LIMIT 1").get(slug);
    if (!company) throw new RuntimeError("NOT_FOUND", "Company page not found", 404);
    const file = ensureInside(this.workspaceRoot, path.join(company.workspace_path, "public", "index.html"));
    if (!fs.existsSync(file)) throw new RuntimeError("NOT_FOUND", "Company page is not published yet", 404);
    return { company, file, content: fs.readFileSync(file) };
  }

  listCompanies(auth) {
    this.assertRole(auth, ["admin", "approver", "agent", "viewer"]);
    return this.db.prepare("SELECT * FROM operator_companies WHERE organization_id=? ORDER BY created_at DESC")
      .all(auth.organization_id).map((company) => this.decorateCompany(company));
  }

  listLeads(companyId, auth) {
    this.assertRole(auth, ["admin", "agent"]);
    this.requireCompany(companyId, auth.organization_id);
    return this.db.prepare("SELECT id,name,email,phone,company_name,message,source,status,received_at,updated_at FROM operator_leads WHERE company_id=? AND organization_id=? ORDER BY received_at DESC LIMIT 500")
      .all(companyId, auth.organization_id);
  }

  getCompany(companyId, auth) {
    this.assertRole(auth, ["admin", "approver", "agent", "viewer"]);
    const company = this.requireCompany(companyId, auth.organization_id);
    const contract = this.requireContract(company.contract_id, auth.organization_id);
    const mission = requireMission(this.db, auth, company.mission_id);
    const actions = this.db.prepare("SELECT * FROM operator_actions WHERE company_id=? ORDER BY sequence").all(company.id)
      .map((action) => ({ ...action, input: parseJson(action.input, {}), output: parseJson(action.output, null), requires_approval: Boolean(action.requires_approval) }));
    const approvals = this.db.prepare("SELECT * FROM operator_action_approvals WHERE company_id=? ORDER BY requested_at DESC").all(company.id);
    const metrics = this.db.prepare("SELECT * FROM operator_metrics WHERE company_id=? ORDER BY recorded_at DESC LIMIT 100").all(company.id);
    const ticks = this.db.prepare("SELECT * FROM operator_ticks WHERE company_id=? ORDER BY completed_at DESC LIMIT 50").all(company.id)
      .map((tick) => ({ ...tick, details: parseJson(tick.details, {}) }));
    const actual = this.metricValue(company, contract.target_metric);
    const target = Number(contract.target_value);
    return {
      company: this.decorateCompany(company),
      contract: { ...contract, payload: parseJson(contract.payload, {}) },
      progress: {
        metric: contract.target_metric, comparator: contract.comparator, actual, target,
        achieved: compare(actual, contract.comparator, target),
        ratio: target > 0 ? Math.max(0, Math.min(1, actual / target)) : Number(compare(actual, contract.comparator, target)),
      },
      mission,
      actions,
      approvals,
      metrics,
      ticks,
      evidence: this.runtime.evidence.list(auth, company.mission_id),
      next_best_action: this.nextBestAction(company, contract, actions),
    };
  }

  decorateCompany(company) {
    return {
      ...company,
      public_path: `/c/${company.slug}`,
      workspace_owned: true,
      counters: {
        spent_cents: Number(company.spent_cents), revenue_cents: Number(company.revenue_cents),
        leads_count: Number(company.leads_count), qualified_opportunities: Number(company.qualified_opportunities),
      },
    };
  }

  nextBestAction(company, contract, actions) {
    const executable = actions.find((action) => ["pending", "approved"].includes(action.status));
    if (executable) return { type: "execute", action_id: executable.id, title: executable.title };
    const awaiting = actions.find((action) => action.status === "awaiting_approval");
    if (awaiting) return { type: "approve", action_id: awaiting.id, title: awaiting.title };
    if (company.activation_status !== "learned") return { type: "finalize_activation", title: "Finalize activation evidence and learning" };
    if (company.status === "completed") return { type: "retain", title: "Fulfill, retain, and expand the achieved customer outcome" };
    if (contract.target_metric === "lead_count" && Number(company.leads_count) === 0) return { type: "distribution", title: "Distribute the owned conversion page through an approved channel" };
    if (Number(company.qualified_opportunities) > 0) return { type: "proposal", title: "Approve a proposal mission for the highest-fit opportunity" };
    return { type: "measure", title: `Increase and record ${contract.target_metric}` };
  }

  health() {
    const database = Number(this.db.prepare("SELECT 1 AS ok").get().ok) === 1;
    const companies = Number(this.db.prepare("SELECT count(*) AS count FROM operator_companies").get().count);
    const active = Number(this.db.prepare("SELECT count(*) AS count FROM operator_companies WHERE status='active'").get().count);
    return {
      ok: database,
      service: "cyvx-company-operator",
      version: "1.0.0",
      database,
      workspace_root: this.workspaceRoot,
      intelligence_state: this.intelligenceStatePath,
      companies,
      active,
      timestamp: now(),
    };
  }
}

module.exports = {
  CompanyOperator,
  ensureOperatorSchema,
  normalizeContract,
  buildActionPlan,
  compare,
  slugify,
  COMPANY_STATES,
  CONTRACT_STATES,
  ACTION_STATES,
};