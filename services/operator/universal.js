"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { PlatformKernel } = require("../../core/platform/kernel");
const {
  RuntimeError, now, id, sha256, canonical, atomicWrite,
} = require("../../runtime/missions/base");
const { requireMission } = require("../../runtime/missions/store");
const { CompanyOperator, compare, slugify } = require("./index");

const UNIVERSAL_ENTITY_TYPES = Object.freeze({
  personal: { label: "Personal Operator", kind: "person", default_metric: "actions_completed", public_default: false },
  household: { label: "Household Operator", kind: "household", default_metric: "monthly_savings_cents", public_default: false },
  creator: { label: "Creator Operator", kind: "creator", default_metric: "audience_count", public_default: true },
  venture: { label: "Venture Operator", kind: "company", default_metric: "lead_count", public_default: true },
  commerce: { label: "Commerce Operator", kind: "commerce", default_metric: "orders_count", public_default: true },
  production: { label: "Production Operator", kind: "producer", default_metric: "units_produced", public_default: false },
  distribution: { label: "Distribution Operator", kind: "distributor", default_metric: "on_time_delivery_rate", public_default: false },
  enterprise: { label: "Enterprise Operator", kind: "enterprise", default_metric: "cycle_time_reduction", public_default: false },
  marketplace: { label: "Marketplace Operator", kind: "marketplace", default_metric: "successful_matches", public_default: true },
  institution: { label: "Institution Operator", kind: "institution", default_metric: "participants_served", public_default: false },
  portfolio: { label: "Portfolio Command", kind: "portfolio", default_metric: "portfolio_value_cents", public_default: false },
});

const UNIVERSAL_STATES = new Set(["awaiting_approval", "active", "paused", "completed", "stopped", "failed"]);
const UNIVERSAL_ACTION_STATES = new Set(["pending", "awaiting_approval", "approved", "running", "completed", "blocked", "failed", "cancelled"]);
const UNIVERSAL_AGENT_PREFIX = "cyvx-universal-operator";
const CORE_CAPABILITIES = ["artifact.write", "reality.model", "plan.create", "metric.record"];
const DEFAULT_PROHIBITED_ACTIONS = ["send_message", "purchase", "submit_bid", "sign_contract", "transfer_funds", "medical_decision", "legal_filing"];

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

function boundedArray(value, name, maximum = 50) {
  if (value === undefined || value === null || value === "") return [];
  const source = Array.isArray(value) ? value : String(value).split(",");
  if (source.length > maximum) throw new RuntimeError("VALIDATION_ERROR", `${name} exceeds ${maximum} items`, 422);
  return [...new Set(source.map((item) => boundedString(item, `${name} item`, 300, true)))];
}

function finiteNumber(value, name, minimum = 0) {
  const output = Number(value);
  if (!Number.isFinite(output) || output < minimum) throw new RuntimeError("VALIDATION_ERROR", `${name} must be a finite number greater than or equal to ${minimum}`, 422);
  return output;
}

function integer(value, name, minimum = 0, maximum = 1_000_000_000) {
  const output = Number(value);
  if (!Number.isInteger(output) || output < minimum || output > maximum) {
    throw new RuntimeError("VALIDATION_ERROR", `${name} must be an integer from ${minimum} to ${maximum}`, 422);
  }
  return output;
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
    throw new RuntimeError("WORKSPACE_PATH_INVALID", "Entity workspace escaped the configured root", 500);
  }
  return resolved;
}

function ensureUniversalSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS operator_entities (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL,
      platform_entity_id TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_kind TEXT NOT NULL,
      adapter_type TEXT NOT NULL,
      adapter_record_id TEXT,
      mission_id TEXT NOT NULL,
      contract_id TEXT NOT NULL,
      slug TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      owner_user_id TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('awaiting_approval','active','paused','completed','stopped','failed')),
      activation_status TEXT NOT NULL DEFAULT 'planned',
      workspace_path TEXT NOT NULL,
      visibility TEXT NOT NULL DEFAULT 'private',
      profile TEXT NOT NULL,
      counters TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      last_tick_at TEXT,
      UNIQUE(organization_id, slug),
      UNIQUE(organization_id, platform_entity_id)
    );
    CREATE INDEX IF NOT EXISTS idx_operator_entities_org_status ON operator_entities(organization_id,status,updated_at);
    CREATE INDEX IF NOT EXISTS idx_operator_entities_type ON operator_entities(organization_id,entity_type,status);

    CREATE TABLE IF NOT EXISTS operator_entity_contracts (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL,
      entity_id TEXT NOT NULL UNIQUE,
      objective TEXT NOT NULL,
      target_metric TEXT NOT NULL,
      comparator TEXT NOT NULL,
      target_value REAL NOT NULL,
      target_unit TEXT NOT NULL,
      max_budget_cents INTEGER NOT NULL,
      approval_threshold_cents INTEGER NOT NULL,
      deadline TEXT,
      risk_level TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('active','achieved','expired','stopped','failed')),
      payload TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(entity_id) REFERENCES operator_entities(id)
    );

    CREATE TABLE IF NOT EXISTS operator_entity_actions (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL,
      entity_id TEXT NOT NULL,
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
      UNIQUE(entity_id,sequence),
      FOREIGN KEY(entity_id) REFERENCES operator_entities(id)
    );
    CREATE INDEX IF NOT EXISTS idx_operator_entity_actions_next ON operator_entity_actions(entity_id,status,sequence);

    CREATE TABLE IF NOT EXISTS operator_entity_action_approvals (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      action_id TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL CHECK(status IN ('pending','approved','rejected')),
      reason TEXT,
      requested_at TEXT NOT NULL,
      decided_at TEXT,
      decided_by TEXT,
      decision_reason TEXT,
      FOREIGN KEY(entity_id) REFERENCES operator_entities(id),
      FOREIGN KEY(action_id) REFERENCES operator_entity_actions(id)
    );

    CREATE TABLE IF NOT EXISTS operator_entity_metrics (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      name TEXT NOT NULL,
      value REAL NOT NULL,
      unit TEXT NOT NULL,
      source TEXT NOT NULL,
      evidence_id TEXT,
      recorded_at TEXT NOT NULL,
      FOREIGN KEY(entity_id) REFERENCES operator_entities(id)
    );
    CREATE INDEX IF NOT EXISTS idx_operator_entity_metrics_latest ON operator_entity_metrics(entity_id,name,recorded_at DESC);

    CREATE TABLE IF NOT EXISTS operator_entity_ticks (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      action_id TEXT,
      status TEXT NOT NULL,
      summary TEXT NOT NULL,
      details TEXT NOT NULL,
      started_at TEXT NOT NULL,
      completed_at TEXT NOT NULL,
      FOREIGN KEY(entity_id) REFERENCES operator_entities(id)
    );
    CREATE INDEX IF NOT EXISTS idx_operator_entity_ticks_time ON operator_entity_ticks(entity_id,completed_at DESC);

    CREATE TABLE IF NOT EXISTS operator_entity_relationships (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL,
      from_entity_id TEXT NOT NULL,
      to_entity_id TEXT NOT NULL,
      relation TEXT NOT NULL,
      strength REAL NOT NULL DEFAULT 0.5,
      metadata TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(organization_id,from_entity_id,to_entity_id,relation),
      FOREIGN KEY(from_entity_id) REFERENCES operator_entities(id),
      FOREIGN KEY(to_entity_id) REFERENCES operator_entities(id)
    );
  `);
}

function normalizeEntityType(value) {
  const output = String(value || "venture").trim().toLowerCase();
  if (!UNIVERSAL_ENTITY_TYPES[output]) throw new RuntimeError("VALIDATION_ERROR", `Unsupported entity_type ${output}`, 422);
  return output;
}

function adapterCapabilities(entityType) {
  const domain = {
    personal: ["personal.plan"], household: ["household.plan"], creator: ["creator.model"],
    venture: ["intelligence.read", "lead.capture"], commerce: ["commerce.model"],
    production: ["production.model"], distribution: ["distribution.model"],
    enterprise: ["enterprise.model"], marketplace: ["marketplace.model"],
    institution: ["institution.model"], portfolio: ["portfolio.model"],
  };
  return [...CORE_CAPABILITIES, ...(domain[entityType] || [])];
}

function normalizeUniversalContract(input = {}, entityType = "venture") {
  const definition = UNIVERSAL_ENTITY_TYPES[entityType];
  const objective = boundedString(input.objective, "outcome_contract.objective", 1200, true);
  const targetMetric = boundedString(input.target_metric || definition.default_metric, "outcome_contract.target_metric", 64, true);
  if (!/^[a-z][a-z0-9_]{1,63}$/.test(targetMetric)) throw new RuntimeError("VALIDATION_ERROR", "target_metric must use lowercase letters, numbers, and underscores", 422);
  const comparator = boundedString(input.comparator || ">=", "outcome_contract.comparator", 2, true);
  if (![">=", "<=", ">", "<", "="].includes(comparator)) throw new RuntimeError("VALIDATION_ERROR", "comparator must be >=, <=, >, <, or =", 422);
  const targetValue = finiteNumber(input.target_value ?? 1, "outcome_contract.target_value");
  const maxBudgetCents = integer(input.max_budget_cents ?? 0, "outcome_contract.max_budget_cents");
  const approvalThresholdCents = integer(input.approval_threshold_cents ?? 0, "outcome_contract.approval_threshold_cents", 0, maxBudgetCents || 1_000_000_000);
  const riskLevel = boundedString(input.risk_level || "medium", "outcome_contract.risk_level", 20, true);
  if (!["low", "medium", "high", "critical"].includes(riskLevel)) throw new RuntimeError("VALIDATION_ERROR", "risk_level must be low, medium, high, or critical", 422);
  let deadline = null;
  if (input.deadline) {
    const parsed = new Date(input.deadline);
    if (!Number.isFinite(parsed.getTime())) throw new RuntimeError("VALIDATION_ERROR", "deadline must be a valid date", 422);
    deadline = parsed.toISOString();
  }
  const required = adapterCapabilities(entityType);
  const allowed = boundedArray(input.allowed_capabilities || required, "outcome_contract.allowed_capabilities");
  const missing = required.filter((capability) => !allowed.includes(capability));
  if (missing.length) throw new RuntimeError("CONTRACT_CAPABILITY_GAP", "The outcome contract excludes required operator capabilities", 422, { missing_capabilities: missing });
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
    allowed_capabilities: allowed,
    prohibited_actions: boundedArray(input.prohibited_actions || DEFAULT_PROHIBITED_ACTIONS, "outcome_contract.prohibited_actions"),
    stop_conditions: boundedArray(input.stop_conditions || ["deadline_reached", "budget_exhausted", "target_achieved"], "outcome_contract.stop_conditions"),
  };
}

function normalizeProfile(input, entityType) {
  const definition = UNIVERSAL_ENTITY_TYPES[entityType];
  return {
    entity_type: entityType,
    entity_kind: boundedString(input.entity_kind || definition.kind, "entity_kind", 80, true),
    subject: boundedString(input.subject || input.target_customer || input.audience || "", "subject", 800),
    operating_system: boundedString(input.operating_system || input.offer || input.system || "", "operating_system", 1600),
    location: boundedString(input.location || "", "location", 240),
    resources: boundedArray(input.resources || [], "resources"),
    constraints: boundedArray(input.constraints || [], "constraints"),
    stakeholders: boundedArray(input.stakeholders || [], "stakeholders"),
    capabilities: boundedArray(input.capabilities || [], "capabilities"),
    channels: boundedArray(input.channels || [], "channels"),
    keywords: boundedArray(input.keywords || [], "keywords"),
    visibility: boundedString(input.visibility || (definition.public_default ? "public" : "private"), "visibility", 20, true),
    metadata: input.metadata && typeof input.metadata === "object" ? input.metadata : {},
  };
}

function action(type, title, capability, evidenceType, input, sequence) {
  return {
    id: id("operator_entity_action"), sequence, type, title, capability,
    evidence_type: evidenceType, risk_level: "low", estimated_cost_cents: 0,
    requires_approval: false, input,
  };
}

function domainActions(entityType, common, start) {
  const definitions = {
    personal: [
      ["personal.resource_map", "Map personal resources and obligations", "personal.plan", "personal_resource_map"],
      ["personal.action_system", "Build the personal action system", "personal.plan", "personal_action_system"],
    ],
    household: [
      ["household.resource_map", "Map household resources, obligations, and risks", "household.plan", "household_resource_map"],
      ["household.operating_plan", "Build the household operating plan", "household.plan", "household_operating_plan"],
    ],
    creator: [
      ["creator.audience_map", "Model audience, demand, and trust", "creator.model", "creator_audience_map"],
      ["creator.product_system", "Design the creator product and distribution system", "creator.model", "creator_product_system"],
    ],
    commerce: [
      ["commerce.catalog_model", "Model catalog, unit economics, and demand", "commerce.model", "commerce_catalog_model"],
      ["commerce.fulfillment_system", "Design acquisition, order, and fulfillment flows", "commerce.model", "commerce_fulfillment_system"],
    ],
    production: [
      ["production.capacity_model", "Model production capacity and constraints", "production.model", "production_capacity_model"],
      ["production.quality_system", "Build quality, traceability, and exception controls", "production.model", "production_quality_system"],
      ["production.flow_map", "Map materials, work, inventory, and distribution flow", "production.model", "production_flow_map"],
    ],
    distribution: [
      ["distribution.network_model", "Model the distribution network and service levels", "distribution.model", "distribution_network_model"],
      ["distribution.inventory_policy", "Build inventory and replenishment policy", "distribution.model", "distribution_inventory_policy"],
      ["distribution.route_system", "Design routing, delivery, and exception operations", "distribution.model", "distribution_route_system"],
    ],
    enterprise: [
      ["enterprise.operating_model", "Map departments, owners, workflows, and economics", "enterprise.model", "enterprise_operating_model"],
      ["enterprise.control_matrix", "Build approvals, controls, risks, and evidence matrix", "enterprise.model", "enterprise_control_matrix"],
    ],
    marketplace: [
      ["marketplace.side_model", "Model demand, supply, liquidity, and matching", "marketplace.model", "marketplace_side_model"],
      ["marketplace.trust_system", "Build trust, quality, dispute, and retention controls", "marketplace.model", "marketplace_trust_system"],
    ],
    institution: [
      ["institution.program_model", "Map programs, participants, resources, and obligations", "institution.model", "institution_program_model"],
      ["institution.impact_system", "Build service delivery and impact measurement", "institution.model", "institution_impact_system"],
    ],
    portfolio: [
      ["portfolio.entity_map", "Map portfolio entities, dependencies, and concentration", "portfolio.model", "portfolio_entity_map"],
      ["portfolio.allocation_policy", "Build allocation, review, and intervention policy", "portfolio.model", "portfolio_allocation_policy"],
    ],
  };
  return (definitions[entityType] || []).map((item, index) => action(item[0], item[1], item[2], item[3], common, start + index));
}

function buildUniversalActionPlan(entity, contract) {
  const common = { entity, contract };
  const actions = [
    action("entity.profile", "Create universal entity profile", "artifact.write", "entity_profile", common, 1),
    action("reality.snapshot", "Create governed reality snapshot", "reality.model", "reality_snapshot", common, 2),
    action("constraint.map", "Rank constraints, unknowns, and opportunities", "reality.model", "constraint_map", common, 3),
    action("outcome.plan", "Create outcome execution plan", "plan.create", "outcome_plan", common, 4),
    ...domainActions(entity.entity_type, common, 5),
  ];
  actions.push(action("workspace.publish", "Publish adaptive operator workspace", "artifact.write", "operator_workspace", common, actions.length + 1));
  actions.push(action("measurement.baseline", "Establish universal outcome baseline", "metric.record", "measurement_baseline", common, actions.length + 1));
  return actions;
}

function initialCounters() {
  return { spent_cents: 0, revenue_cents: 0, lead_count: 0, qualified_opportunities: 0, actions_completed: 0 };
}

class UniversalOperator {
  constructor(runtime, options = {}) {
    if (!runtime || !runtime.db || !runtime.engine || !runtime.store || !runtime.evidence) throw new Error("UniversalOperator requires a CYVX mission runtime");
    this.runtime = runtime;
    this.db = runtime.db;
    this.logger = runtime.logger || runtime.store.logger || { write() {} };
    runtime.logger = this.logger;
    this.legacy = options.legacy || new CompanyOperator(runtime, options);
    this.workspaceRoot = path.resolve(options.universalWorkspaceRoot || process.env.CYVX_ENTITY_ROOT || path.join(runtime.dataRoot, "entities"));
    this.platformStatePath = path.resolve(options.platformStatePath || process.env.CYVX_PLATFORM_STATE_FILE || path.join(runtime.dataRoot, "platform-state.json"));
    fs.mkdirSync(this.workspaceRoot, { recursive: true, mode: 0o700 });
    ensureUniversalSchema(this.db);
    this.platform = options.platform || new PlatformKernel({ filePath: this.platformStatePath });
    this.migrateLegacyCompanies();
  }

  assertRole(auth, allowed) {
    if (!auth || !allowed.includes(auth.role)) throw new RuntimeError("PERMISSION_DENIED", `Role ${auth && auth.role || "anonymous"} cannot perform this universal operator action`, 403);
  }

  context(auth, operation, causationId = null) {
    return this.runtime.store.withContext({
      organization_id: auth.organization_id,
      actor: auth.user_id,
      correlation_id: auth.correlation_id || id("correlation"),
      causation_id: causationId,
    }, operation);
  }

  ensureAgent(organizationId) {
    const agentId = `${UNIVERSAL_AGENT_PREFIX}-${sha256(organizationId).slice(0, 12)}`;
    const timestamp = now();
    this.db.prepare(`INSERT INTO users(id,organization_id,role,active,created_at,updated_at)
      VALUES(?,?,?,?,?,?) ON CONFLICT(organization_id,id) DO UPDATE SET role='agent',active=1,updated_at=excluded.updated_at`)
      .run(agentId, organizationId, "agent", 1, timestamp, timestamp);
    const snapshot = this.platform.snapshot();
    if (!snapshot.agents.some((item) => item.id === agentId)) {
      this.platform.createAgent({ id: agentId, name: "CYVX Universal Operator", role: "universal outcome operator", status: "ready", lifecycle: "deployed", capabilities: ["model", "plan", "execute", "measure", "learn"], ownership: organizationId });
    }
    return agentId;
  }

  uniqueSlug(organizationId, requested, name) {
    const base = slugify(requested || name);
    let candidate = base;
    let counter = 1;
    while (this.db.prepare("SELECT 1 FROM operator_entities WHERE organization_id=? AND slug=?").get(organizationId, candidate)) {
      counter += 1;
      candidate = `${base.slice(0, Math.max(1, 60 - String(counter).length))}-${counter}`;
    }
    return candidate;
  }

  migrateLegacyCompanies() {
    const table = this.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='operator_companies'").get();
    if (!table) return 0;
    const rows = this.db.prepare("SELECT * FROM operator_companies ORDER BY created_at").all();
    let migrated = 0;
    for (const company of rows) {
      const existing = this.db.prepare("SELECT id FROM operator_entities WHERE id=?").get(company.id);
      const profile = this.legacyProfile(company);
      const counters = {
        ...initialCounters(), spent_cents: Number(company.spent_cents || 0), revenue_cents: Number(company.revenue_cents || 0),
        lead_count: Number(company.leads_count || 0), qualified_opportunities: Number(company.qualified_opportunities || 0),
      };
      if (!existing) {
        this.db.prepare(`INSERT INTO operator_entities(
          id,organization_id,platform_entity_id,entity_type,entity_kind,adapter_type,adapter_record_id,mission_id,contract_id,
          slug,name,description,owner_user_id,status,activation_status,workspace_path,visibility,profile,counters,created_at,updated_at,last_tick_at
        ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
          company.id, company.organization_id, company.id, "venture", "company", "venture", company.id,
          company.mission_id, company.contract_id, company.slug, company.name, company.description || "",
          company.owner_user_id, company.status, company.activation_status, company.workspace_path, "public",
          JSON.stringify(profile), JSON.stringify(counters), company.created_at, company.updated_at, company.last_tick_at,
        );
        migrated += 1;
      } else {
        this.db.prepare(`UPDATE operator_entities SET status=?,activation_status=?,counters=?,updated_at=?,last_tick_at=? WHERE id=?`)
          .run(company.status, company.activation_status, JSON.stringify(counters), company.updated_at, company.last_tick_at, company.id);
      }
      this.upsertPlatformEntity(this.requireEntity(company.id, company.organization_id));
    }
    return migrated;
  }

  legacyProfile(company) {
    const file = path.join(company.workspace_path || "", "company.json");
    let stored = {};
    if (file && fs.existsSync(file)) {
      try { stored = JSON.parse(fs.readFileSync(file, "utf8")); } catch { stored = {}; }
    }
    if (!stored.target_customer) {
      const row = this.db.prepare("SELECT input FROM operator_actions WHERE company_id=? ORDER BY sequence LIMIT 1").get(company.id);
      const input = parseJson(row && row.input, {});
      stored = { ...input, ...stored };
    }
    return {
      entity_type: "venture", entity_kind: "company", subject: stored.target_customer || "",
      operating_system: stored.offer || "", location: stored.location || "", resources: [], constraints: [],
      stakeholders: [], capabilities: [], channels: [], keywords: stored.keywords || [], visibility: "public",
      metadata: { migrated_from: "operator_companies", price_cents: Number(stored.price_cents || 0) },
    };
  }

  upsertPlatformEntity(entity) {
    const profile = parseJson(entity.profile, {});
    const counters = parseJson(entity.counters, initialCounters());
    const snapshot = this.platform.snapshot();
    const patch = {
      label: entity.name, name: entity.name, kind: entity.entity_kind, state: entity.status,
      health: ["active", "completed"].includes(entity.status) ? "healthy" : entity.status === "paused" ? "monitoring" : "unknown",
      ownership: entity.organization_id,
      economics: { cost: Number(counters.spent_cents || 0), savings: Number(counters.monthly_savings_cents || 0), value: Number(counters.revenue_cents || counters.portfolio_value_cents || 0), roi: Number(counters.spent_cents) > 0 ? Number(counters.revenue_cents || 0) / Number(counters.spent_cents) : 0 },
      risk: { score: entity.status === "failed" ? 1 : entity.status === "paused" ? 0.6 : 0.2, drivers: profile.constraints || [] },
      opportunity: { score: entity.status === "active" ? 0.75 : 0.45, drivers: profile.keywords || [] },
      capability: { current: entity.activation_status === "learned" ? 0.7 : 0.25, potential: 0.95, growth_rate: entity.activation_status === "learned" ? 0.2 : 0.1, impact: 0.5 },
      metadata: { operator_entity_id: entity.id, entity_type: entity.entity_type, adapter_type: entity.adapter_type, mission_id: entity.mission_id, contract_id: entity.contract_id, visibility: entity.visibility },
    };
    if (snapshot.entities.some((item) => item.id === entity.platform_entity_id)) this.platform.updateEntity(entity.platform_entity_id, patch);
    else this.platform.createEntity({ id: entity.platform_entity_id, ...patch });
  }

  createPlatformMission(entity, contract) {
    const snapshot = this.platform.snapshot();
    const goalId = `goal-${entity.id}`;
    const objectiveId = `objective-${entity.id}`;
    if (!snapshot.goals.some((item) => item.id === goalId)) this.platform.createGoal({ id: goalId, title: contract.objective, description: `Desired outcome for ${entity.name}`, entity_ids: [entity.platform_entity_id], confidence: 0.7 });
    if (!snapshot.objectives.some((item) => item.id === objectiveId)) this.platform.createObjective({ id: objectiveId, title: contract.objective, description: entity.description, entity_ids: [entity.platform_entity_id], mission_id: entity.mission_id, target_metric: contract.target_metric, target_value: contract.target_value, confidence: 0.7 });
    if (!snapshot.missions.some((item) => item.id === entity.mission_id)) this.platform.createMission({ id: entity.mission_id, title: `Operate ${entity.name}`, objective: contract.objective, objective_id: objectiveId, target_entity_ids: [entity.platform_entity_id], stage: "awaiting_approval", status: "awaiting_approval", confidence: 0.7, risk: contract.risk_level === "high" ? 0.7 : 0.35, governance: { approval_required: true, operator_override: true, reversible: true } });
  }

  createEntity(input = {}, auth) {
    this.assertRole(auth, ["admin"]);
    const entityType = normalizeEntityType(input.entity_type);
    if (entityType === "venture") return this.createVenture(input, auth);
    const definition = UNIVERSAL_ENTITY_TYPES[entityType];
    const name = boundedString(input.name, "name", 180, true);
    const description = boundedString(input.description, "description", 1800, true);
    const profile = normalizeProfile(input, entityType);
    const contract = normalizeUniversalContract(input.outcome_contract || {}, entityType);
    const entityId = id("operator_entity");
    const contractId = id("outcome_contract");
    const slug = this.uniqueSlug(auth.organization_id, input.slug, name);
    const workspacePath = ensureInside(this.workspaceRoot, path.join(this.workspaceRoot, auth.organization_id, entityId));
    const entityInput = { id: entityId, entity_type: entityType, entity_kind: profile.entity_kind, name, description, profile };
    const actions = buildUniversalActionPlan(entityInput, contract);
    const timestamp = now();

    const mission = this.context(auth, () => this.runtime.engine.createMission({
      organization_id: auth.organization_id,
      title: `Activate ${definition.label} for ${name}`,
      objective: contract.objective,
      context: canonical({ entity_id: entityId, entity_type: entityType, entity_kind: profile.entity_kind, profile }).slice(0, 4000),
      constraints: [`Maximum operating budget: ${contract.max_budget_cents} cents`, ...(profile.constraints || []), ...contract.prohibited_actions.map((item) => `Prohibited action: ${item}`)],
      opportunities: profile.keywords,
      success_metrics: [{ name: "operator_activation", comparator: "=", target: 1 }, { name: contract.target_metric, comparator: contract.comparator, target: contract.target_value, unit: contract.target_unit }],
      approval_required: true,
      risk_level: contract.risk_level,
      priority: Number(input.priority) || 80,
      created_by: auth.user_id,
      expected_completion: contract.deadline,
    }));
    this.context(auth, () => this.runtime.engine.validateMission(mission.id, {
      feasible: true, blockers: [], validated_by: auth.user_id,
      assumptions: ["The owner controls the entity workspace", "External commitments require separately granted capabilities", "Outcome metrics must be recorded from evidence-backed sources"],
    }), mission.id);
    this.context(auth, () => this.runtime.engine.planMission(mission.id, {
      actions: actions.map((item) => ({ id: item.id, type: item.type, title: item.title, capability: item.capability, estimated_cost_cents: item.estimated_cost_cents, requires_approval: item.requires_approval })),
      dependencies: [], estimated_duration_minutes: Math.max(15, actions.length * 3),
      resource_requirements: { workspace: workspacePath, budget_cents: contract.max_budget_cents, capabilities: contract.allowed_capabilities, entity_type: entityType },
      planned_by: auth.user_id,
    }), mission.id);
    const approval = this.context(auth, () => this.runtime.engine.requestApproval(mission.id, {
      reason: `Authorize CYVX to operate ${name} as a ${entityType} within the outcome contract and capability boundary.`,
      requested_by: auth.user_id, approval_deadline: contract.deadline,
    }), mission.id);

    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db.prepare(`INSERT INTO operator_entities(
        id,organization_id,platform_entity_id,entity_type,entity_kind,adapter_type,adapter_record_id,mission_id,contract_id,
        slug,name,description,owner_user_id,status,activation_status,workspace_path,visibility,profile,counters,created_at,updated_at,last_tick_at
      ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
        entityId, auth.organization_id, entityId, entityType, profile.entity_kind, entityType, null,
        mission.id, contractId, slug, name, description, auth.user_id, "awaiting_approval", "planned",
        workspacePath, profile.visibility, JSON.stringify(profile), JSON.stringify(initialCounters()), timestamp, timestamp, null,
      );
      this.db.prepare(`INSERT INTO operator_entity_contracts(
        id,organization_id,entity_id,objective,target_metric,comparator,target_value,target_unit,max_budget_cents,
        approval_threshold_cents,deadline,risk_level,status,payload,created_at,updated_at
      ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
        contractId, auth.organization_id, entityId, contract.objective, contract.target_metric, contract.comparator,
        contract.target_value, contract.target_unit, contract.max_budget_cents, contract.approval_threshold_cents,
        contract.deadline, contract.risk_level, "active", JSON.stringify(contract), timestamp, timestamp,
      );
      const insertAction = this.db.prepare(`INSERT INTO operator_entity_actions(
        id,organization_id,entity_id,mission_id,sequence,type,title,capability,status,risk_level,estimated_cost_cents,
        actual_cost_cents,requires_approval,input,created_at,updated_at
      ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
      for (const item of actions) insertAction.run(
        item.id, auth.organization_id, entityId, mission.id, item.sequence, item.type, item.title, item.capability,
        "pending", item.risk_level, item.estimated_cost_cents, 0, item.requires_approval ? 1 : 0,
        JSON.stringify({ ...item.input, evidence_type: item.evidence_type }), timestamp, timestamp,
      );
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    const entity = this.requireEntity(entityId, auth.organization_id);
    this.upsertPlatformEntity(entity);
    this.createPlatformMission(entity, this.requireContract(contractId, auth.organization_id));
    this.context(auth, () => this.runtime.store.transaction((state) => {
      const stored = state.missions.find((item) => item.id === mission.id);
      stored.entity_id = entityId;
      stored.entity_type = entityType;
      stored.outcome_contract_id = contractId;
      stored.operator_version = "universal.operator.v2";
      return stored;
    }), approval.approval.id);
    this.audit(auth, "operator_entity", entityId, "created", "Universal operated entity created", { entity_type: entityType, mission_id: mission.id, contract_id: contractId, actions: actions.length });
    return this.getEntity(entityId, auth);
  }

  createVenture(input, auth) {
    const targetCustomer = boundedString(input.target_customer || input.subject, "target_customer", 800, true);
    const offer = boundedString(input.offer || input.operating_system || input.system, "offer", 1600, true);
    const graph = this.legacy.createCompany({
      ...input,
      target_customer: targetCustomer,
      offer,
      price_cents: integer(input.price_cents ?? 0, "price_cents"),
      keywords: boundedArray(input.keywords || [], "keywords"),
      outcome_contract: { ...(input.outcome_contract || {}), target_metric: input.outcome_contract && input.outcome_contract.target_metric || "lead_count" },
    }, auth);
    this.migrateLegacyCompanies();
    const row = this.requireEntity(graph.company.id, auth.organization_id);
    const profile = normalizeProfile({ ...input, target_customer: targetCustomer, offer, visibility: input.visibility || "public" }, "venture");
    profile.metadata = { ...(profile.metadata || {}), price_cents: Number(input.price_cents || 0) };
    this.db.prepare("UPDATE operator_entities SET profile=?,visibility=?,updated_at=? WHERE id=?")
      .run(JSON.stringify(profile), profile.visibility, now(), row.id);
    this.upsertPlatformEntity(this.requireEntity(row.id, auth.organization_id));
    this.createPlatformMission(this.requireEntity(row.id, auth.organization_id), {
      ...graph.contract,
      target_unit: graph.contract.payload && graph.contract.payload.target_unit || "count",
    });
    return this.getEntity(row.id, auth);
  }

  approveEntity(entityId, input = {}, auth) {
    this.assertRole(auth, ["admin", "approver"]);
    const entity = this.requireEntity(entityId, auth.organization_id);
    if (entity.adapter_type === "venture") {
      const graph = this.legacy.approveCompany(entity.adapter_record_id, input, auth);
      this.syncLegacyEntity(entity.id, auth.organization_id);
      this.platform.updateMission(entity.mission_id, { status: graph.mission.status, stage: graph.mission.status, progress: graph.mission.status === "queued" ? 0.1 : 0 }, "mission.status_changed");
      return this.getEntity(entity.id, auth);
    }
    if (entity.status !== "awaiting_approval") throw new RuntimeError("INVALID_STATE", `Entity cannot be approved from ${entity.status}`, 409);
    const mission = requireMission(this.db, auth, entity.mission_id);
    this.context(auth, () => this.runtime.engine.decideApproval(mission.approval_record_id, {
      decision: "approved", decided_by: auth.user_id,
      decision_reason: boundedString(input.decision_reason || "Universal outcome contract approved", "decision_reason", 500, true),
    }), mission.approval_record_id);
    const agentId = this.ensureAgent(auth.organization_id);
    this.context(auth, () => this.runtime.engine.assignAgent(entity.mission_id, { agent_id: agentId, assigned_by: auth.user_id }), mission.approval_record_id);
    this.db.prepare("UPDATE operator_entities SET status='active',activation_status='queued',updated_at=? WHERE id=?").run(now(), entity.id);
    this.upsertPlatformEntity(this.requireEntity(entity.id, auth.organization_id));
    this.platform.updateMission(entity.mission_id, { status: "queued", stage: "queued", progress: 0.1 }, "mission.status_changed");
    this.audit(auth, "operator_entity", entity.id, "approved", "Universal entity outcome contract approved", { agent_id: agentId });
    if (input.run_now === true) this.runToIdle(entity.id, auth);
    return this.getEntity(entity.id, auth);
  }

  controlEntity(entityId, command, auth) {
    this.assertRole(auth, ["admin"]);
    const entity = this.requireEntity(entityId, auth.organization_id);
    if (entity.adapter_type === "venture") {
      this.legacy.controlCompany(entity.adapter_record_id, command, auth);
      this.syncLegacyEntity(entity.id, auth.organization_id);
      return this.getEntity(entity.id, auth);
    }
    const next = String(command || "").toLowerCase();
    let status;
    if (next === "pause" && entity.status === "active") status = "paused";
    else if (next === "resume" && entity.status === "paused") status = "active";
    else if (next === "stop" && ["active", "paused", "awaiting_approval"].includes(entity.status)) status = "stopped";
    else throw new RuntimeError("INVALID_STATE", `Cannot ${next || "control"} entity from ${entity.status}`, 409);
    this.db.prepare("UPDATE operator_entities SET status=?,updated_at=? WHERE id=?").run(status, now(), entity.id);
    if (status === "stopped") this.db.prepare("UPDATE operator_entity_contracts SET status='stopped',updated_at=? WHERE id=?").run(now(), entity.contract_id);
    this.upsertPlatformEntity(this.requireEntity(entity.id, auth.organization_id));
    this.audit(auth, "operator_entity", entity.id, next, `Universal entity operator ${next}`, {});
    return this.getEntity(entity.id, auth);
  }

  approveAction(actionId, input = {}, auth) {
    this.assertRole(auth, ["admin", "approver"]);
    const actionRow = this.db.prepare("SELECT * FROM operator_entity_actions WHERE id=? AND organization_id=?").get(actionId, auth.organization_id);
    if (!actionRow) {
      const result = this.legacy.approveAction(actionId, input, auth);
      this.syncLegacyEntity(result.company.id, auth.organization_id);
      return this.getEntity(result.company.id, auth);
    }
    const approval = this.db.prepare("SELECT * FROM operator_entity_action_approvals WHERE action_id=? AND organization_id=?").get(actionId, auth.organization_id);
    if (!approval || approval.status !== "pending") throw new RuntimeError("INVALID_STATE", "Entity action is not awaiting approval", 409);
    const decision = input.decision === "rejected" ? "rejected" : "approved";
    const timestamp = now();
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db.prepare("UPDATE operator_entity_action_approvals SET status=?,decided_at=?,decided_by=?,decision_reason=? WHERE id=?")
        .run(decision, timestamp, auth.user_id, boundedString(input.decision_reason || decision, "decision_reason", 500, true), approval.id);
      this.db.prepare("UPDATE operator_entity_actions SET status=?,updated_at=? WHERE id=?")
        .run(decision === "approved" ? "approved" : "cancelled", timestamp, actionId);
      this.db.exec("COMMIT");
    } catch (error) { this.db.exec("ROLLBACK"); throw error; }
    return this.getEntity(actionRow.entity_id, auth);
  }

  runTick(entityId, auth) {
    this.assertRole(auth, ["admin", "agent"]);
    const entity = this.requireEntity(entityId, auth.organization_id);
    if (entity.adapter_type === "venture") {
      const tick = this.legacy.runTick(entity.adapter_record_id, auth);
      this.syncLegacyEntity(entity.id, auth.organization_id);
      return { ...tick, entity_id: entity.id, adapter_type: "venture" };
    }
    if (entity.status !== "active") return this.recordTick(entity, null, "noop", `Entity is ${entity.status}`, { status: entity.status });
    const contract = this.requireContract(entity.contract_id, auth.organization_id);
    const terminal = this.evaluateContract(entity, contract);
    if (terminal.terminal) {
      this.applyTerminal(entity, contract, terminal);
      return this.recordTick(entity, null, "stopped", terminal.reason, terminal);
    }
    let mission = requireMission(this.db, auth, entity.mission_id);
    if (mission.status === "queued") {
      this.context(auth, () => this.runtime.engine.execute(entity.mission_id, {
        started_by: auth.user_id,
        steps: this.db.prepare("SELECT id,type,title FROM operator_entity_actions WHERE entity_id=? ORDER BY sequence").all(entity.id),
      }), entity.id);
      this.db.prepare("UPDATE operator_entities SET activation_status='running',updated_at=? WHERE id=?").run(now(), entity.id);
      this.platform.updateMission(entity.mission_id, { status: "running", stage: "running", progress: 0.2 }, "mission.status_changed");
      mission = requireMission(this.db, auth, entity.mission_id);
    }
    if (!["running", "completed", "evaluated", "learned"].includes(mission.status)) throw new RuntimeError("MISSION_NOT_EXECUTABLE", `Entity mission is ${mission.status}`, 409);
    const nextAction = this.db.prepare(`SELECT * FROM operator_entity_actions WHERE entity_id=? AND status IN ('pending','approved','awaiting_approval') ORDER BY sequence LIMIT 1`).get(entity.id);
    if (!nextAction) {
      const finalized = this.finalizeActivation(entity, auth);
      return this.recordTick(entity, null, "idle", finalized ? "Universal activation finalized" : "No executable actions remain", { activation_finalized: finalized });
    }
    if (nextAction.status === "awaiting_approval") return this.recordTick(entity, nextAction, "blocked", "Action is awaiting approval", { action_id: nextAction.id });
    const payload = parseJson(contract.payload, {});
    if (!payload.allowed_capabilities.includes(nextAction.capability)) {
      this.blockAction(nextAction, `Capability ${nextAction.capability} is not allowed by the outcome contract`);
      return this.recordTick(entity, nextAction, "blocked", "Capability denied by contract", { capability: nextAction.capability });
    }
    if (payload.prohibited_actions.includes(nextAction.type)) {
      this.blockAction(nextAction, `Action ${nextAction.type} is prohibited by the outcome contract`);
      return this.recordTick(entity, nextAction, "blocked", "Action prohibited by contract", { type: nextAction.type });
    }
    const counters = parseJson(entity.counters, initialCounters());
    if (Number(counters.spent_cents || 0) + Number(nextAction.estimated_cost_cents || 0) > Number(contract.max_budget_cents)) {
      this.blockAction(nextAction, "Action would exceed the maximum budget");
      this.db.prepare("UPDATE operator_entities SET status='paused',updated_at=? WHERE id=?").run(now(), entity.id);
      return this.recordTick(entity, nextAction, "blocked", "Budget guard stopped execution", { spent_cents: counters.spent_cents, estimated_cost_cents: nextAction.estimated_cost_cents });
    }
    if ((nextAction.requires_approval || Number(nextAction.estimated_cost_cents) > Number(contract.approval_threshold_cents)) && nextAction.status !== "approved") {
      this.requestActionApproval(entity, nextAction, auth);
      return this.recordTick(entity, nextAction, "blocked", "Action approval requested", { action_id: nextAction.id });
    }
    const startedAt = now();
    this.db.prepare("UPDATE operator_entity_actions SET status='running',started_at=?,updated_at=?,error=NULL WHERE id=?").run(startedAt, startedAt, nextAction.id);
    try {
      const result = this.executeAction(entity, contract, nextAction);
      const evidence = this.runtime.evidence.record({
        auth: { user_id: auth.user_id, organization_id: auth.organization_id, role: auth.role },
        missionId: entity.mission_id, content: result.content, type: result.evidence_type, title: nextAction.title,
        source: "universal.operator.v2", correlationId: auth.correlation_id || id("correlation"), causationId: nextAction.id,
      });
      const completedAt = now();
      const latest = this.requireEntity(entity.id, entity.organization_id);
      const latestCounters = parseJson(latest.counters, initialCounters());
      latestCounters.spent_cents = Number(latestCounters.spent_cents || 0) + Number(result.actual_cost_cents || 0);
      latestCounters.actions_completed = Number(latestCounters.actions_completed || 0) + 1;
      this.db.exec("BEGIN IMMEDIATE");
      try {
        this.db.prepare(`UPDATE operator_entity_actions SET status='completed',actual_cost_cents=?,output=?,evidence_id=?,completed_at=?,updated_at=? WHERE id=?`)
          .run(Number(result.actual_cost_cents || 0), JSON.stringify(result.output || {}), evidence.id, completedAt, completedAt, nextAction.id);
        this.db.prepare("UPDATE operator_entities SET counters=?,last_tick_at=?,updated_at=? WHERE id=?")
          .run(JSON.stringify(latestCounters), completedAt, completedAt, entity.id);
        this.db.exec("COMMIT");
      } catch (error) { this.db.exec("ROLLBACK"); throw error; }
      for (const [name, value] of Object.entries(result.metrics || {})) this.insertMetric(entity, name, Number(value), name.endsWith("_cents") ? "cents" : "count", "universal.operator.v2", evidence.id);
      this.upsertPlatformEntity(this.requireEntity(entity.id, entity.organization_id));
      const remaining = Number(this.db.prepare("SELECT count(*) AS count FROM operator_entity_actions WHERE entity_id=? AND status NOT IN ('completed','cancelled')").get(entity.id).count);
      if (remaining === 0) this.finalizeActivation(this.requireEntity(entity.id, entity.organization_id), auth);
      return this.recordTick(entity, nextAction, "completed", `${nextAction.title} completed`, { action_id: nextAction.id, evidence_id: evidence.id, artifact_path: result.output && result.output.artifact_path });
    } catch (error) {
      const failedAt = now();
      this.db.prepare("UPDATE operator_entity_actions SET status='failed',error=?,updated_at=? WHERE id=?").run(String(error.message || error).slice(0, 2000), failedAt, nextAction.id);
      this.db.prepare("UPDATE operator_entities SET status='paused',updated_at=?,last_tick_at=? WHERE id=?").run(failedAt, failedAt, entity.id);
      this.logger.write("error", "universal_operator.action_failed", { entity_id: entity.id, action_id: nextAction.id, type: nextAction.type, error: error.message });
      this.recordTick(entity, nextAction, "failed", `${nextAction.title} failed`, { error: error.message });
      throw error;
    }
  }

  runToIdle(entityId, auth, maximumTicks = 30) {
    const results = [];
    for (let index = 0; index < maximumTicks; index += 1) {
      const entity = this.requireEntity(entityId, auth.organization_id);
      if (entity.status !== "active") break;
      if (entity.adapter_type === "venture") {
        const legacyResult = this.legacy.runToIdle(entity.adapter_record_id, auth, maximumTicks);
        this.syncLegacyEntity(entity.id, auth.organization_id);
        return { entity: this.getEntity(entity.id, auth), ticks: legacyResult.ticks };
      }
      const pending = Number(this.db.prepare("SELECT count(*) AS count FROM operator_entity_actions WHERE entity_id=? AND status IN ('pending','approved')").get(entityId).count);
      if (!pending) { this.finalizeActivation(entity, auth); break; }
      const result = this.runTick(entityId, auth);
      results.push(result);
      if (["blocked", "failed", "stopped"].includes(result.status)) break;
    }
    return { entity: this.getEntity(entityId, auth), ticks: results };
  }

  runAllOnce() {
    this.migrateLegacyCompanies();
    const rows = this.db.prepare("SELECT id,organization_id FROM operator_entities WHERE status='active' ORDER BY COALESCE(last_tick_at,created_at) LIMIT 100").all();
    const results = [];
    for (const row of rows) {
      const agentId = this.ensureAgent(row.organization_id);
      try { results.push(this.runTick(row.id, { user_id: agentId, organization_id: row.organization_id, role: "agent" })); }
      catch (error) { results.push({ entity_id: row.id, status: "failed", error: error.message }); }
    }
    return results;
  }

  executeAction(entity, contract, actionRow) {
    const input = parseJson(actionRow.input, {});
    const profile = parseJson(entity.profile, {});
    const workspace = ensureInside(this.workspaceRoot, entity.workspace_path);
    fs.mkdirSync(workspace, { recursive: true, mode: 0o700 });
    const write = (relative, content) => {
      const target = ensureInside(workspace, path.join(workspace, relative));
      atomicWrite(target, content);
      return target;
    };
    const base = { schema_version: 2, entity_id: entity.id, platform_entity_id: entity.platform_entity_id, entity_type: entity.entity_type, entity_kind: entity.entity_kind, name: entity.name, description: entity.description, profile, outcome_contract: parseJson(contract.payload, {}), generated_at: now() };
    let relative;
    let payload;
    if (actionRow.type === "entity.profile") {
      relative = "entity.json";
      payload = { ...base, ownership: { data: "owner-controlled", artifacts: "owner-controlled", decisions: "governed" } };
    } else if (actionRow.type === "reality.snapshot") {
      relative = "reality/snapshot.json";
      payload = { ...base, reality: { current_state: entity.description, subject: profile.subject, resources: profile.resources, constraints: profile.constraints, stakeholders: profile.stakeholders, capabilities: profile.capabilities, channels: profile.channels, location: profile.location, known_unknowns: ["External data coverage", "Outcome measurement source", "Execution permissions not yet granted"] } };
    } else if (actionRow.type === "constraint.map") {
      relative = "reality/constraint-map.md";
      const constraints = profile.constraints.length ? profile.constraints : ["Outcome evidence must be connected", "External execution requires explicit capability grants", "Resource availability must be verified"];
      payload = `# ${entity.name} Constraint Map\n\n## Outcome\n${contract.objective}\n\n## Ranked constraints\n${constraints.map((item, index) => `${index + 1}. ${item}`).join("\n")}\n\n## Opportunities\n${(profile.keywords.length ? profile.keywords : ["automation", "coordination", "measurement"]).map((item) => `- ${item}`).join("\n")}\n\n## Decision rule\nExecute the highest-leverage reversible action that remains inside budget, permissions, and evidence requirements.\n`;
    } else if (actionRow.type === "outcome.plan") {
      relative = "plans/outcome-plan.md";
      payload = `# Outcome Plan — ${entity.name}\n\n## Contract\n${contract.objective}\n\n- Metric: ${contract.target_metric}\n- Target: ${contract.comparator} ${contract.target_value} ${contract.target_unit}\n- Budget ceiling: ${contract.max_budget_cents} cents\n- Deadline: ${contract.deadline || "none"}\n\n## Operating sequence\n1. Verify reality and constraints.\n2. Select a permitted capability.\n3. Execute the smallest reversible action.\n4. Record evidence and cost.\n5. Measure the target metric.\n6. Learn and update the entity graph.\n\n## Stop conditions\n${parseJson(contract.payload, {}).stop_conditions.map((item) => `- ${item}`).join("\n")}\n`;
    } else if (actionRow.type === "workspace.publish") {
      relative = "public/index.html";
      payload = this.workspaceHtml(entity, contract, profile);
    } else if (actionRow.type === "measurement.baseline") {
      relative = "metrics/baseline.json";
      payload = { ...base, baseline: { [contract.target_metric]: this.metricValue(entity, contract.target_metric), ...parseJson(entity.counters, initialCounters()) }, measurement: { source_required: true, evidence_required: true, recorded_at: now() } };
    } else {
      relative = `domain/${actionRow.type.replace(/[^a-z0-9._-]+/gi, "-")}.json`;
      payload = this.domainArtifact(actionRow.type, base, profile, contract);
    }
    const content = typeof payload === "string" ? payload : `${JSON.stringify(payload, null, 2)}\n`;
    const artifactPath = write(relative, content);
    const metrics = actionRow.type === "measurement.baseline" ? { actions_completed: Number(parseJson(entity.counters, initialCounters()).actions_completed || 0) } : {};
    return { content, evidence_type: input.evidence_type || actionRow.type, output: { artifact_path: artifactPath, relative_path: relative, sha256: sha256(content) }, metrics };
  }

  domainArtifact(type, base, profile, contract) {
    const common = { ...base, target: { metric: contract.target_metric, comparator: contract.comparator, value: contract.target_value, unit: contract.target_unit }, controls: { approval_threshold_cents: contract.approval_threshold_cents, budget_cents: contract.max_budget_cents, prohibited_actions: parseJson(contract.payload, {}).prohibited_actions }, inputs: { resources: profile.resources, constraints: profile.constraints, stakeholders: profile.stakeholders, channels: profile.channels } };
    const maps = {
      "personal.resource_map": { resources: profile.resources, obligations: profile.constraints, support_network: profile.stakeholders, gaps: ["Verified schedule", "Authorized accounts", "Evidence source"] },
      "personal.action_system": { cadence: ["daily reality check", "weekly outcome review", "monthly capability review"], queue_policy: "highest impact reversible action first", escalation: "owner approval for external commitments" },
      "household.resource_map": { resources: profile.resources, obligations: profile.constraints, members_and_stakeholders: profile.stakeholders, resilience_domains: ["cash", "housing", "transportation", "health", "schedule"] },
      "household.operating_plan": { workflows: ["bills", "appointments", "maintenance", "purchases", "benefits", "emergencies"], review_cadence: "weekly", evidence: ["receipts", "balances", "appointments", "completed work"] },
      "creator.audience_map": { audience: profile.subject, channels: profile.channels, demand_signals: profile.keywords, trust_assets: profile.resources },
      "creator.product_system": { product_outcome: profile.operating_system, acquisition: profile.channels, fulfillment: ["intake", "delivery", "proof", "retention"], economics_metric: contract.target_metric },
      "commerce.catalog_model": { demand: profile.subject, products_and_resources: profile.resources, channels: profile.channels, unit_economics: ["price", "cost", "margin", "returns", "retention"] },
      "commerce.fulfillment_system": { stages: ["discover", "evaluate", "order", "pay", "fulfill", "deliver", "support", "retain"], exception_controls: ["inventory unavailable", "payment failed", "delivery delayed", "refund requested"] },
      "production.capacity_model": { resources: profile.resources, capacity_equation: "available_time × rate × yield", constraints: profile.constraints, measurements: ["throughput", "cycle_time", "yield", "downtime", "work_in_process"] },
      "production.quality_system": { quality_gates: ["incoming", "in_process", "final", "release"], traceability: ["material lot", "work order", "operator", "machine", "inspection", "shipment"], stop_rule: "quarantine on failed acceptance criteria" },
      "production.flow_map": { flow: ["demand", "plan", "source", "receive", "produce", "inspect", "store", "ship", "learn"], bottlenecks: profile.constraints, distribution_channels: profile.channels },
      "distribution.network_model": { nodes: profile.resources, stakeholders: profile.stakeholders, channels: profile.channels, service_metrics: ["availability", "fill_rate", "on_time_delivery", "cost_per_delivery"] },
      "distribution.inventory_policy": { policy: ["forecast", "reorder_point", "safety_stock", "allocation", "exception"], constraints: profile.constraints, review_frequency: "event-driven plus weekly" },
      "distribution.route_system": { stages: ["order", "pick", "stage", "load", "route", "deliver", "proof", "exception"], optimization_targets: ["service level", "distance", "capacity", "cost", "risk"] },
      "enterprise.operating_model": { stakeholders: profile.stakeholders, capabilities: profile.capabilities, workflows: profile.channels, governance: ["owner", "approver", "operator", "auditor"], economics: ["cost", "value", "risk", "capacity"] },
      "enterprise.control_matrix": { controls: ["identity", "approval", "budget", "evidence", "rollback", "audit", "kill switch"], constraints: profile.constraints, outcome_metric: contract.target_metric },
      "marketplace.side_model": { demand_side: profile.subject, supply_side: profile.stakeholders, channels: profile.channels, liquidity_metrics: ["active demand", "active supply", "match rate", "time to match"] },
      "marketplace.trust_system": { controls: ["identity", "quality", "reputation", "payment", "dispute", "fraud", "retention"], evidence: ["transaction", "delivery", "rating", "resolution"] },
      "institution.program_model": { participants: profile.subject, programs_and_resources: profile.resources, stakeholders: profile.stakeholders, obligations: profile.constraints },
      "institution.impact_system": { service_flow: ["eligibility", "intake", "assessment", "service", "follow-up", "outcome"], impact_metric: contract.target_metric, evidence: ["attendance", "delivery", "change", "satisfaction"] },
      "portfolio.entity_map": { entities: profile.resources, dependencies: profile.stakeholders, concentrations: profile.constraints, opportunities: profile.keywords },
      "portfolio.allocation_policy": { allocation_inputs: ["risk", "return", "liquidity", "capacity", "strategic value"], review: "monthly plus event-driven", intervention: "rebalance only with evidence and approval" },
    };
    return { ...common, model: maps[type] || { operating_system: profile.operating_system } };
  }

  workspaceHtml(entity, contract, profile) {
    const publicLabel = entity.visibility === "public" ? "PUBLIC OPERATING SURFACE" : "OWNER-CONTROLLED OPERATING SURFACE";
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${html(entity.name)}</title><style>body{font-family:system-ui;margin:0;background:#06111f;color:#edf5ff}main{max-width:860px;margin:auto;padding:48px 18px}.card{background:#10243a;border:1px solid #29445f;border-radius:18px;padding:22px;margin:16px 0}h1{font-size:clamp(2.2rem,8vw,4.8rem);line-height:.95}p,li{line-height:1.6}.tag{color:#e8bd55;font-weight:900;letter-spacing:.1em;font-size:.75rem}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:12px}.metric{background:#081827;padding:14px;border-radius:12px}</style></head><body><main><div class="tag">${publicLabel} • ${html(entity.entity_type.toUpperCase())}</div><h1>${html(entity.name)}</h1><p>${html(entity.description)}</p><section class="card"><h2>Desired outcome</h2><p>${html(contract.objective)}</p><div class="grid"><div class="metric"><strong>${html(contract.target_metric)}</strong><br>${html(contract.comparator)} ${html(contract.target_value)} ${html(contract.target_unit)}</div><div class="metric"><strong>Budget ceiling</strong><br>${html(contract.max_budget_cents)} cents</div><div class="metric"><strong>Status</strong><br>${html(entity.status)}</div></div></section><section class="card"><h2>Reality</h2><p><strong>Subject:</strong> ${html(profile.subject || "Not yet supplied")}</p><p><strong>Operating system:</strong> ${html(profile.operating_system || "Generated from the outcome contract")}</p><p><strong>Location:</strong> ${html(profile.location || "Not constrained")}</p></section><section class="card"><h2>Constraints</h2><ul>${(profile.constraints.length ? profile.constraints : ["External actions require explicit grants", "Evidence is required for measured outcomes"]).map((item) => `<li>${html(item)}</li>`).join("")}</ul></section><section class="card"><h2>CYVX loop</h2><p>Reality → Constraint → Opportunity → Mission → Action → Evidence → Outcome → Learning → Growth</p></section></main></body></html>`;
  }

  finalizeActivation(entity, auth) {
    if (entity.adapter_type === "venture") return false;
    let mission = requireMission(this.db, auth, entity.mission_id);
    if (["learned", "failed", "cancelled"].includes(mission.status)) {
      if (mission.status === "learned" && entity.activation_status !== "learned") this.db.prepare("UPDATE operator_entities SET activation_status='learned',updated_at=? WHERE id=?").run(now(), entity.id);
      return false;
    }
    const incomplete = Number(this.db.prepare("SELECT count(*) AS count FROM operator_entity_actions WHERE entity_id=? AND status NOT IN ('completed','cancelled')").get(entity.id).count);
    if (incomplete) return false;
    const evidenceIds = this.db.prepare("SELECT evidence_id FROM operator_entity_actions WHERE entity_id=? AND evidence_id IS NOT NULL ORDER BY sequence").all(entity.id).map((row) => row.evidence_id);
    if (mission.status === "running") {
      this.context(auth, () => this.runtime.engine.complete(entity.mission_id, {
        result_summary: `Universal ${entity.entity_type} operating capability activated with an owned reality model, outcome plan, adaptive workspace, evidence, and metrics.`,
        metrics: { operator_activation: 1, actions_executed: evidenceIds.length, ...parseJson(entity.counters, initialCounters()) },
        evidence_ids: evidenceIds, verified: true, completed_by: auth.user_id,
      }), entity.id);
      mission = requireMission(this.db, auth, entity.mission_id);
    }
    if (mission.status === "completed") {
      this.context(auth, () => this.runtime.engine.evaluate(entity.mission_id, {
        success: true,
        lessons_learned: ["The universal entity spine reused the existing mission and evidence kernel", "Entity-specific behavior was assembled through a bounded adapter"],
        improvements: ["Connect additional authorized data and execution capabilities to this entity"],
        capability_delta: { created: 1, protected: 1, improved: 1 }, evaluated_by: auth.user_id,
      }), entity.id);
      mission = requireMission(this.db, auth, entity.mission_id);
    }
    if (mission.status === "evaluated") {
      this.context(auth, () => this.runtime.engine.learnCapability(entity.mission_id, {
        title: `Operate ${entity.name} as ${entity.entity_type}`,
        description: "Reusable universal entity operation with reality modeling, outcome contracts, governed actions, owned artifacts, evidence, metrics, and learning.",
        inputs: ["entity_profile", "reality_snapshot", "outcome_contract", "approved_capabilities"],
        outputs: ["owned_workspace", "constraint_map", "outcome_plan", "domain_model", "evidence", "scoreboard"],
        permissions_required: ["operator:execute", "artifact:write", "metric:record"],
        tests: ["universal-entity-contract", "adapter-plan", "budget-guard", "evidence-chain", "platform-graph-sync"],
        cost_basis: { activation_spent_cents: Number(parseJson(entity.counters, initialCounters()).spent_cents || 0) },
        risk_level: "medium", owned_by: entity.organization_id, learned_by: auth.user_id, is_reusable: true,
      }), entity.id);
    }
    this.db.prepare("UPDATE operator_entities SET activation_status='learned',updated_at=? WHERE id=?").run(now(), entity.id);
    this.platform.updateMission(entity.mission_id, { status: "completed", stage: "learned", progress: 1, verification: "complete" }, "mission.status_changed");
    const snapshot = this.platform.snapshot();
    if (!snapshot.capabilities.some((item) => item.id === `capability-${entity.id}`)) this.platform.createCapability({ id: `capability-${entity.id}`, title: `${UNIVERSAL_ENTITY_TYPES[entity.entity_type].label} capability`, current: 0.7, potential: 0.95, growth_rate: 0.2, impact: 0.5, owner_id: entity.platform_entity_id, linked_entity_ids: [entity.platform_entity_id], constraints: parseJson(entity.profile, {}).constraints || [], opportunities: parseJson(entity.profile, {}).keywords || [] });
    if (!snapshot.knowledgeRecords.some((item) => item.id === `knowledge-${entity.id}`)) this.platform.createKnowledgeRecord({ id: `knowledge-${entity.id}`, title: `${entity.name} activation learning`, mission_id: entity.mission_id, entity_ids: [entity.platform_entity_id], lesson_learned: "Universal activation works through the shared entity, mission, evidence, outcome, and capability spine.", what_worked: "Bounded adapter execution and durable evidence.", future_recommendation: "Connect measured external execution capabilities one grant at a time.", capability_delta: { created: 1, protected: 1, improved: 1 } });
    this.upsertPlatformEntity(this.requireEntity(entity.id, entity.organization_id));
    this.audit(auth, "operator_entity", entity.id, "activation_completed", "Universal entity activation learned", { mission_id: entity.mission_id });
    return true;
  }

  recordMetric(entityId, input = {}, auth) {
    this.assertRole(auth, ["admin", "agent"]);
    const entity = this.requireEntity(entityId, auth.organization_id);
    if (entity.adapter_type === "venture") {
      const result = this.legacy.recordMetric(entity.adapter_record_id, input, auth);
      this.syncLegacyEntity(entity.id, auth.organization_id);
      return { ...result, entity: this.getEntity(entity.id, auth) };
    }
    const name = boundedString(input.name, "name", 64, true);
    if (!/^[a-z][a-z0-9_]{1,63}$/.test(name)) throw new RuntimeError("VALIDATION_ERROR", "Metric name is invalid", 422);
    const value = finiteNumber(input.value, "value");
    const metric = this.insertMetric(entity, name, value, boundedString(input.unit || "count", "unit", 40, true), boundedString(input.source || "universal_operator_api", "source", 120, true), input.evidence_id || null);
    const current = this.requireEntity(entity.id, entity.organization_id);
    const counters = parseJson(current.counters, initialCounters());
    counters[name] = value;
    this.db.prepare("UPDATE operator_entities SET counters=?,updated_at=? WHERE id=?").run(JSON.stringify(counters), now(), current.id);
    const updated = this.requireEntity(current.id, current.organization_id);
    const contract = this.requireContract(updated.contract_id, updated.organization_id);
    const evaluation = this.evaluateContract(updated, contract);
    if (evaluation.terminal) this.applyTerminal(updated, contract, evaluation);
    this.upsertPlatformEntity(this.requireEntity(updated.id, updated.organization_id));
    return { metric, evaluation, entity: this.getEntity(updated.id, auth) };
  }

  createRelationship(input = {}, auth) {
    this.assertRole(auth, ["admin"]);
    const from = this.requireEntity(input.from_entity_id, auth.organization_id);
    const to = this.requireEntity(input.to_entity_id, auth.organization_id);
    const relation = boundedString(input.relation || "related_to", "relation", 100, true);
    const strength = Math.max(0, Math.min(1, finiteNumber(input.strength ?? 0.5, "strength")));
    const relationshipId = id("operator_relationship");
    const timestamp = now();
    this.db.prepare(`INSERT INTO operator_entity_relationships(id,organization_id,from_entity_id,to_entity_id,relation,strength,metadata,created_at,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(organization_id,from_entity_id,to_entity_id,relation) DO UPDATE SET strength=excluded.strength,metadata=excluded.metadata,updated_at=excluded.updated_at`)
      .run(relationshipId, auth.organization_id, from.id, to.id, relation, strength, JSON.stringify(input.metadata || {}), timestamp, timestamp);
    const snapshot = this.platform.snapshot();
    const platformId = `relationship-${slugify(`${from.platform_entity_id}-${relation}-${to.platform_entity_id}`)}`;
    if (!snapshot.relationships.some((item) => item.id === platformId)) this.platform.createRelationship({ id: platformId, from: from.platform_entity_id, to: to.platform_entity_id, relation, strength, metadata: input.metadata || {} });
    return this.listRelationships(auth);
  }

  listRelationships(auth) {
    this.assertRole(auth, ["admin", "approver", "agent", "viewer"]);
    return this.db.prepare("SELECT * FROM operator_entity_relationships WHERE organization_id=? ORDER BY updated_at DESC").all(auth.organization_id).map((row) => ({ ...row, metadata: parseJson(row.metadata, {}) }));
  }

  insertMetric(entity, name, value, unit, source, evidenceId) {
    const metric = { id: id("entity_metric"), organization_id: entity.organization_id, entity_id: entity.id, name, value, unit, source, evidence_id: evidenceId, recorded_at: now() };
    this.db.prepare(`INSERT INTO operator_entity_metrics(id,organization_id,entity_id,name,value,unit,source,evidence_id,recorded_at) VALUES(?,?,?,?,?,?,?,?,?)`)
      .run(metric.id, metric.organization_id, metric.entity_id, metric.name, metric.value, metric.unit, metric.source, metric.evidence_id, metric.recorded_at);
    return metric;
  }

  metricValue(entity, name) {
    const counters = parseJson(entity.counters, initialCounters());
    if (counters[name] !== undefined) return Number(counters[name] || 0);
    const row = this.db.prepare("SELECT value FROM operator_entity_metrics WHERE entity_id=? AND name=? ORDER BY recorded_at DESC LIMIT 1").get(entity.id, name);
    return Number(row && row.value || 0);
  }

  evaluateContract(entity, contract) {
    const actual = this.metricValue(entity, contract.target_metric);
    if (compare(actual, contract.comparator, Number(contract.target_value))) return { terminal: true, outcome: "achieved", reason: `Target achieved: ${contract.target_metric} ${actual} ${contract.comparator} ${contract.target_value}`, actual };
    if (contract.deadline && Date.now() >= Date.parse(contract.deadline)) return { terminal: true, outcome: "expired", reason: `Outcome contract deadline reached at ${contract.deadline}`, actual };
    const spent = Number(parseJson(entity.counters, initialCounters()).spent_cents || 0);
    if (spent >= Number(contract.max_budget_cents) && Number(contract.max_budget_cents) > 0) return { terminal: true, outcome: "budget_exhausted", reason: `Maximum budget of ${contract.max_budget_cents} cents reached`, actual };
    return { terminal: false, outcome: "active", reason: "Outcome contract remains active", actual };
  }

  applyTerminal(entity, contract, evaluation) {
    const timestamp = now();
    if (evaluation.outcome === "achieved") {
      this.db.prepare("UPDATE operator_entities SET status='completed',updated_at=? WHERE id=?").run(timestamp, entity.id);
      this.db.prepare("UPDATE operator_entity_contracts SET status='achieved',updated_at=? WHERE id=?").run(timestamp, contract.id);
      const snapshot = this.platform.snapshot();
      const outcomeId = `outcome-${entity.id}-${contract.target_metric}`;
      if (!snapshot.outcomes.some((item) => item.id === outcomeId)) this.platform.recordOutcome({ id: outcomeId, title: `${entity.name} outcome achieved`, mission_id: entity.mission_id, status: "measured", predicted_outcome: { metric: contract.target_metric, value: contract.target_value }, actual_outcome: { metric: contract.target_metric, value: evaluation.actual }, measured: { value: evaluation.actual }, expected: { value: contract.target_value }, entity_ids: [entity.platform_entity_id], capability_delta: { created: 0, protected: 1, improved: 1 } });
    } else if (evaluation.outcome === "expired") {
      this.db.prepare("UPDATE operator_entities SET status='stopped',updated_at=? WHERE id=?").run(timestamp, entity.id);
      this.db.prepare("UPDATE operator_entity_contracts SET status='expired',updated_at=? WHERE id=?").run(timestamp, contract.id);
    } else if (evaluation.outcome === "budget_exhausted") this.db.prepare("UPDATE operator_entities SET status='paused',updated_at=? WHERE id=?").run(timestamp, entity.id);
    this.upsertPlatformEntity(this.requireEntity(entity.id, entity.organization_id));
  }

  requestActionApproval(entity, actionRow, auth) {
    const existing = this.db.prepare("SELECT id FROM operator_entity_action_approvals WHERE action_id=?").get(actionRow.id);
    const timestamp = now();
    if (!existing) this.db.prepare(`INSERT INTO operator_entity_action_approvals(id,organization_id,entity_id,action_id,status,reason,requested_at) VALUES(?,?,?,?,?,?,?)`)
      .run(id("operator_entity_approval"), entity.organization_id, entity.id, actionRow.id, "pending", `Approve ${actionRow.title}; estimated cost ${actionRow.estimated_cost_cents} cents; risk ${actionRow.risk_level}.`, timestamp);
    this.db.prepare("UPDATE operator_entity_actions SET status='awaiting_approval',updated_at=? WHERE id=?").run(timestamp, actionRow.id);
    this.audit(auth, "operator_entity_action", actionRow.id, "approval_requested", "Universal entity action requires approval", { entity_id: entity.id });
  }

  blockAction(actionRow, reason) {
    this.db.prepare("UPDATE operator_entity_actions SET status='blocked',error=?,updated_at=? WHERE id=?").run(String(reason).slice(0, 2000), now(), actionRow.id);
  }

  recordTick(entity, actionRow, status, summary, details) {
    const timestamp = now();
    const tick = { id: id("operator_entity_tick"), organization_id: entity.organization_id, entity_id: entity.id, action_id: actionRow && actionRow.id || null, status, summary, details, started_at: timestamp, completed_at: timestamp };
    this.db.prepare(`INSERT INTO operator_entity_ticks(id,organization_id,entity_id,action_id,status,summary,details,started_at,completed_at) VALUES(?,?,?,?,?,?,?,?,?)`)
      .run(tick.id, tick.organization_id, tick.entity_id, tick.action_id, tick.status, tick.summary, JSON.stringify(tick.details || {}), tick.started_at, tick.completed_at);
    this.db.prepare("UPDATE operator_entities SET last_tick_at=?,updated_at=? WHERE id=?").run(timestamp, timestamp, entity.id);
    return tick;
  }

  audit(auth, resourceType, resourceId, actionName, reason, changes) {
    this.db.prepare(`INSERT INTO audit_log(id,organization_id,resource_type,resource_id,action,actor,reason,changes,timestamp) VALUES(?,?,?,?,?,?,?,?,?)`)
      .run(id("audit"), auth.organization_id, resourceType, resourceId, actionName, auth.user_id, reason, JSON.stringify(changes || {}), now());
  }

  syncLegacyEntity(entityId, organizationId) {
    const registry = this.requireEntity(entityId, organizationId);
    const company = this.db.prepare("SELECT * FROM operator_companies WHERE id=? AND organization_id=?").get(registry.adapter_record_id, organizationId);
    if (!company) return registry;
    const counters = { ...initialCounters(), spent_cents: Number(company.spent_cents || 0), revenue_cents: Number(company.revenue_cents || 0), lead_count: Number(company.leads_count || 0), qualified_opportunities: Number(company.qualified_opportunities || 0) };
    this.db.prepare("UPDATE operator_entities SET status=?,activation_status=?,workspace_path=?,counters=?,updated_at=?,last_tick_at=? WHERE id=?")
      .run(company.status, company.activation_status, company.workspace_path, JSON.stringify(counters), company.updated_at, company.last_tick_at, registry.id);
    this.upsertPlatformEntity(this.requireEntity(registry.id, organizationId));
    return this.requireEntity(registry.id, organizationId);
  }

  requireEntity(entityId, organizationId) {
    const entity = this.db.prepare("SELECT * FROM operator_entities WHERE id=? AND organization_id=?").get(entityId, organizationId);
    if (!entity) throw new RuntimeError("NOT_FOUND", "Universal operated entity not found", 404);
    return entity;
  }

  requireContract(contractId, organizationId) {
    const contract = this.db.prepare("SELECT * FROM operator_entity_contracts WHERE id=? AND organization_id=?").get(contractId, organizationId);
    if (!contract) throw new RuntimeError("NOT_FOUND", "Universal outcome contract not found", 404);
    return contract;
  }

  listEntities(auth) {
    this.assertRole(auth, ["admin", "approver", "agent", "viewer"]);
    this.migrateLegacyCompanies();
    const rows = this.db.prepare("SELECT * FROM operator_entities WHERE organization_id=? ORDER BY created_at DESC").all(auth.organization_id);
    return rows.map((row) => {
      if (row.adapter_type === "venture") row = this.syncLegacyEntity(row.id, auth.organization_id);
      return this.decorateEntity(row);
    });
  }

  getEntity(entityId, auth) {
    this.assertRole(auth, ["admin", "approver", "agent", "viewer"]);
    let entity = this.requireEntity(entityId, auth.organization_id);
    if (entity.adapter_type === "venture") {
      entity = this.syncLegacyEntity(entity.id, auth.organization_id);
      const graph = this.legacy.getCompany(entity.adapter_record_id, auth);
      return {
        entity: this.decorateEntity(entity), contract: graph.contract, progress: graph.progress, mission: graph.mission,
        actions: graph.actions, approvals: graph.approvals, metrics: graph.metrics, ticks: graph.ticks,
        evidence: graph.evidence, next_best_action: graph.next_best_action,
        relationships: this.relationshipsFor(entity.id, auth.organization_id),
        reality_graph: this.platformEntityGraph(entity),
        adapter: { type: "venture", legacy_compatible: true, record_id: entity.adapter_record_id },
      };
    }
    const contract = this.requireContract(entity.contract_id, auth.organization_id);
    const mission = requireMission(this.db, auth, entity.mission_id);
    const actions = this.db.prepare("SELECT * FROM operator_entity_actions WHERE entity_id=? ORDER BY sequence").all(entity.id)
      .map((item) => ({ ...item, input: parseJson(item.input, {}), output: parseJson(item.output, null), requires_approval: Boolean(item.requires_approval) }));
    const approvals = this.db.prepare("SELECT * FROM operator_entity_action_approvals WHERE entity_id=? ORDER BY requested_at DESC").all(entity.id);
    const metrics = this.db.prepare("SELECT * FROM operator_entity_metrics WHERE entity_id=? ORDER BY recorded_at DESC LIMIT 100").all(entity.id);
    const ticks = this.db.prepare("SELECT * FROM operator_entity_ticks WHERE entity_id=? ORDER BY completed_at DESC LIMIT 50").all(entity.id).map((item) => ({ ...item, details: parseJson(item.details, {}) }));
    const actual = this.metricValue(entity, contract.target_metric);
    const target = Number(contract.target_value);
    return {
      entity: this.decorateEntity(entity),
      contract: { ...contract, payload: parseJson(contract.payload, {}) },
      progress: { metric: contract.target_metric, comparator: contract.comparator, actual, target, achieved: compare(actual, contract.comparator, target), ratio: target > 0 ? Math.max(0, Math.min(1, actual / target)) : Number(compare(actual, contract.comparator, target)) },
      mission, actions, approvals, metrics, ticks,
      evidence: this.runtime.evidence.list(auth, entity.mission_id),
      next_best_action: this.nextBestAction(entity, contract, actions),
      relationships: this.relationshipsFor(entity.id, auth.organization_id),
      reality_graph: this.platformEntityGraph(entity),
      adapter: { type: entity.adapter_type, legacy_compatible: false },
    };
  }

  relationshipsFor(entityId, organizationId) {
    return this.db.prepare("SELECT * FROM operator_entity_relationships WHERE organization_id=? AND (from_entity_id=? OR to_entity_id=?) ORDER BY updated_at DESC")
      .all(organizationId, entityId, entityId).map((row) => ({ ...row, metadata: parseJson(row.metadata, {}) }));
  }

  platformEntityGraph(entity) {
    const snapshot = this.platform.snapshot();
    return {
      entity: snapshot.entities.find((item) => item.id === entity.platform_entity_id) || null,
      relationships: snapshot.relationships.filter((item) => item.from === entity.platform_entity_id || item.to === entity.platform_entity_id),
      goals: snapshot.goals.filter((item) => (item.entity_ids || []).includes(entity.platform_entity_id)),
      missions: snapshot.missions.filter((item) => (item.target_entity_ids || []).includes(entity.platform_entity_id)),
      outcomes: snapshot.outcomes.filter((item) => (item.entity_ids || []).includes(entity.platform_entity_id)),
      capabilities: snapshot.capabilities.filter((item) => (item.linked_entity_ids || []).includes(entity.platform_entity_id)),
    };
  }

  decorateEntity(entity) {
    const profile = parseJson(entity.profile, {});
    const counters = parseJson(entity.counters, initialCounters());
    return {
      ...entity, profile, counters,
      type_definition: UNIVERSAL_ENTITY_TYPES[entity.entity_type],
      public_path: entity.adapter_type === "venture" ? `/c/${entity.slug}` : `/e/${entity.slug}`,
      workspace_owned: true,
    };
  }

  nextBestAction(entity, contract, actions) {
    const executable = actions.find((item) => ["pending", "approved"].includes(item.status));
    if (executable) return { type: "execute", action_id: executable.id, title: executable.title };
    const awaiting = actions.find((item) => item.status === "awaiting_approval");
    if (awaiting) return { type: "approve", action_id: awaiting.id, title: awaiting.title };
    if (entity.activation_status !== "learned") return { type: "finalize_activation", title: "Finalize evidence, outcome evaluation, and capability learning" };
    if (entity.status === "completed") return { type: "retain", title: "Protect, retain, and compound the achieved outcome" };
    return { type: "measure", title: `Connect evidence and increase ${contract.target_metric}` };
  }

  getWorkspace(slug, auth = null) {
    const entity = this.db.prepare("SELECT * FROM operator_entities WHERE slug=? ORDER BY updated_at DESC LIMIT 1").get(slug);
    if (!entity) throw new RuntimeError("NOT_FOUND", "Entity workspace not found", 404);
    if (entity.adapter_type === "venture") return { redirect: `/c/${entity.slug}`, entity };
    if (entity.visibility !== "public" && !this.runtime.allowLocalAuth) {
      if (!auth || auth.organization_id !== entity.organization_id) throw new RuntimeError("AUTH_REQUIRED", "Private entity workspace requires authentication", 401);
    }
    const file = ensureInside(this.workspaceRoot, path.join(entity.workspace_path, "public", "index.html"));
    if (!fs.existsSync(file)) throw new RuntimeError("NOT_FOUND", "Entity workspace is not published yet", 404);
    return { entity, file, content: fs.readFileSync(file) };
  }

  health() {
    const entities = Number(this.db.prepare("SELECT count(*) AS count FROM operator_entities").get().count);
    const active = Number(this.db.prepare("SELECT count(*) AS count FROM operator_entities WHERE status='active'").get().count);
    const byType = Object.fromEntries(this.db.prepare("SELECT entity_type,count(*) AS count FROM operator_entities GROUP BY entity_type").all().map((row) => [row.entity_type, Number(row.count)]));
    return { ok: true, service: "cyvx-universal-operator", version: "2.0.0", database: true, workspace_root: this.workspaceRoot, platform_state: this.platformStatePath, entities, active, by_type: byType, legacy_company_compatibility: true, timestamp: now() };
  }
}

module.exports = {
  UniversalOperator,
  ensureUniversalSchema,
  normalizeUniversalContract,
  normalizeProfile,
  buildUniversalActionPlan,
  UNIVERSAL_ENTITY_TYPES,
  UNIVERSAL_STATES,
  UNIVERSAL_ACTION_STATES,
};