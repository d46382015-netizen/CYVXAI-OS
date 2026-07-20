"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { CompanyOperator } = require("../operator");
const { RuntimeError, now, id, sha256, atomicWrite } = require("../../runtime/missions/base");

const AGENT_DEFINITIONS = Object.freeze([
  { role: "ceo", label: "CEO", purpose: "Set the outcome strategy, constraints, priorities, and decision cadence.", task: "strategy.operating_plan", priority: 100, depends_on: [] },
  { role: "research", label: "Research", purpose: "Define the evidence required to understand customers, competitors, risks, and opportunities.", task: "research.evidence_brief", priority: 90, depends_on: ["strategy.operating_plan"] },
  { role: "engineering", label: "Engineering", purpose: "Convert the mission into a deployable system backlog with acceptance criteria and operational controls.", task: "engineering.delivery_plan", priority: 85, depends_on: ["strategy.operating_plan"] },
  { role: "marketing", label: "Marketing", purpose: "Build the positioning, content, channel, and conversion plan tied to measurable demand.", task: "marketing.demand_system", priority: 80, depends_on: ["research.evidence_brief"] },
  { role: "outreach", label: "Outreach", purpose: "Prepare approval-ready prospecting sequences and qualification logic without sending unapproved messages.", task: "outreach.pipeline_playbook", priority: 75, depends_on: ["research.evidence_brief", "marketing.demand_system"] },
  { role: "growth", label: "Growth", purpose: "Design measurable experiments that improve activation, conversion, retention, and expansion.", task: "growth.experiment_portfolio", priority: 70, depends_on: ["marketing.demand_system"] },
  { role: "support", label: "Support", purpose: "Create the support policy, service levels, triage routes, and reusable response knowledge.", task: "support.service_system", priority: 65, depends_on: ["strategy.operating_plan"] },
  { role: "finance", label: "Finance", purpose: "Model unit economics, cash controls, pricing, runway, and evidence required for financial decisions.", task: "finance.unit_economics", priority: 60, depends_on: ["strategy.operating_plan"] },
  { role: "operations", label: "Operations", purpose: "Connect the team into a durable operating cadence, runbook, scorecard, and escalation system.", task: "operations.company_runbook", priority: 55, depends_on: ["engineering.delivery_plan", "marketing.demand_system", "support.service_system", "finance.unit_economics"] },
]);

const TASK_STATES = new Set(["pending", "running", "completed", "blocked", "failed", "cancelled"]);
const ROLE_NAMES = new Set(AGENT_DEFINITIONS.map((agent) => agent.role));

function parseJson(value, fallback) {
  if (value === null || value === undefined || value === "") return fallback;
  if (typeof value !== "string") return value;
  try { return JSON.parse(value); } catch { return fallback; }
}

function boundedString(value, name, maximum, required = false) {
  const output = String(value ?? "").trim();
  if (required && !output) throw new RuntimeError("VALIDATION_ERROR", `${name} is required`, 422);
  if (output.length > maximum) throw new RuntimeError("VALIDATION_ERROR", `${name} exceeds ${maximum} characters`, 422);
  return output;
}

function boundedArray(value, name, maximum = 100) {
  if (value === undefined || value === null || value === "") return [];
  const source = Array.isArray(value) ? value : [value];
  if (source.length > maximum) throw new RuntimeError("VALIDATION_ERROR", `${name} exceeds ${maximum} items`, 422);
  return source.map((entry, index) => boundedString(entry, `${name}[${index}]`, 2000, true));
}

function finiteNumber(value, name, minimum = -1_000_000_000, maximum = 1_000_000_000) {
  const output = Number(value);
  if (!Number.isFinite(output) || output < minimum || output > maximum) {
    throw new RuntimeError("VALIDATION_ERROR", `${name} must be a finite number from ${minimum} to ${maximum}`, 422);
  }
  return output;
}

function integer(value, name, minimum = 0, maximum = 1_000_000) {
  const output = Number(value);
  if (!Number.isInteger(output) || output < minimum || output > maximum) {
    throw new RuntimeError("VALIDATION_ERROR", `${name} must be an integer from ${minimum} to ${maximum}`, 422);
  }
  return output;
}

function normalizeUrl(value) {
  const output = boundedString(value, "url", 2000, true);
  let parsed;
  try { parsed = new URL(output); } catch { throw new RuntimeError("VALIDATION_ERROR", "url must be valid", 422); }
  const local = ["localhost", "127.0.0.1", "::1"].includes(parsed.hostname);
  if (parsed.protocol !== "https:" && !(local && parsed.protocol === "http:")) {
    throw new RuntimeError("VALIDATION_ERROR", "integration URLs must use HTTPS except for loopback development", 422);
  }
  return parsed.toString();
}

function ensureInside(root, candidate) {
  const base = path.resolve(root);
  const resolved = path.resolve(candidate);
  if (resolved !== base && !resolved.startsWith(`${base}${path.sep}`)) {
    throw new RuntimeError("WORKSPACE_PATH_INVALID", "Autonomous company artifact escaped the configured workspace", 500);
  }
  return resolved;
}

function canonicalJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
}

function safeFilePart(value) {
  return String(value || "artifact").toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 100) || "artifact";
}

function ensureSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS acr_teams (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL,
      company_id TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('planned','active','paused','completed','failed')),
      model_provider TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      last_tick_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_acr_teams_org_status ON acr_teams(organization_id,status,updated_at);

    CREATE TABLE IF NOT EXISTS acr_agents (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL,
      company_id TEXT NOT NULL,
      role TEXT NOT NULL,
      label TEXT NOT NULL,
      purpose TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('ready','running','blocked','failed','completed')),
      completed_tasks INTEGER NOT NULL DEFAULT 0,
      failed_tasks INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(company_id,role)
    );

    CREATE TABLE IF NOT EXISTS acr_tasks (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL,
      company_id TEXT NOT NULL,
      agent_id TEXT NOT NULL,
      role TEXT NOT NULL,
      kind TEXT NOT NULL,
      title TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('pending','running','completed','blocked','failed','cancelled')),
      priority INTEGER NOT NULL DEFAULT 50,
      dependencies TEXT NOT NULL DEFAULT '[]',
      input TEXT NOT NULL DEFAULT '{}',
      output TEXT,
      attempts INTEGER NOT NULL DEFAULT 0,
      max_attempts INTEGER NOT NULL DEFAULT 3,
      run_after TEXT NOT NULL,
      lease_owner TEXT,
      lease_until TEXT,
      artifact_path TEXT,
      artifact_sha256 TEXT,
      error TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      completed_at TEXT,
      UNIQUE(company_id,kind)
    );
    CREATE INDEX IF NOT EXISTS idx_acr_tasks_claim ON acr_tasks(company_id,status,run_after,priority DESC,created_at);

    CREATE TABLE IF NOT EXISTS acr_memories (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL,
      company_id TEXT NOT NULL,
      role TEXT NOT NULL,
      kind TEXT NOT NULL,
      content TEXT NOT NULL,
      content_sha256 TEXT NOT NULL,
      source_task_id TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_acr_memories_company_time ON acr_memories(company_id,created_at DESC);

    CREATE TABLE IF NOT EXISTS acr_metrics (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL,
      company_id TEXT NOT NULL,
      name TEXT NOT NULL,
      value REAL NOT NULL,
      unit TEXT NOT NULL,
      source TEXT NOT NULL,
      evidence TEXT NOT NULL DEFAULT '{}',
      recorded_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_acr_metrics_company_name ON acr_metrics(company_id,name,recorded_at DESC);

    CREATE TABLE IF NOT EXISTS acr_learnings (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL,
      company_id TEXT NOT NULL,
      metric_name TEXT NOT NULL,
      observed_result TEXT NOT NULL,
      learning TEXT NOT NULL,
      next_hypothesis TEXT NOT NULL,
      source_metric_id TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS acr_integrations (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL,
      company_id TEXT NOT NULL,
      name TEXT NOT NULL,
      kind TEXT NOT NULL,
      url TEXT NOT NULL,
      secret_env TEXT NOT NULL,
      allowed_event_types TEXT NOT NULL,
      timeout_ms INTEGER NOT NULL DEFAULT 15000,
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(company_id,name)
    );

    CREATE TABLE IF NOT EXISTS acr_deliveries (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL,
      company_id TEXT NOT NULL,
      integration_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      idempotency_key TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('pending','delivered','failed')),
      request_sha256 TEXT NOT NULL,
      response_status INTEGER,
      response_body TEXT,
      error TEXT,
      created_at TEXT NOT NULL,
      completed_at TEXT,
      UNIQUE(company_id,integration_id,idempotency_key)
    );

    CREATE TABLE IF NOT EXISTS acr_events (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL,
      company_id TEXT NOT NULL,
      type TEXT NOT NULL,
      payload TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_acr_events_company_time ON acr_events(company_id,created_at DESC);
  `);
}

function normalizeModelOutput(raw, task) {
  const value = typeof raw === "string" ? parseJson(raw, null) : raw;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new RuntimeError("MODEL_OUTPUT_INVALID", "Model output must be a JSON object", 502);
  }
  const summary = boundedString(value.summary, "model.summary", 4000, true);
  const decisions = boundedArray(value.decisions || [], "model.decisions", 30);
  const actions = boundedArray(value.actions || [], "model.actions", 50);
  const risks = boundedArray(value.risks || [], "model.risks", 30);
  const evidence_required = boundedArray(value.evidence_required || [], "model.evidence_required", 30);
  const metrics = Array.isArray(value.metrics) ? value.metrics.slice(0, 20).map((metric, index) => ({
    name: boundedString(metric?.name, `model.metrics[${index}].name`, 80, true),
    target: boundedString(metric?.target, `model.metrics[${index}].target`, 200, true),
    source: boundedString(metric?.source || "runtime", `model.metrics[${index}].source`, 200, true),
  })) : [];
  return {
    schema_version: 1,
    task_id: task.id,
    role: task.role,
    kind: task.kind,
    summary,
    decisions,
    actions,
    risks,
    evidence_required,
    metrics,
  };
}

function buildRulesOutput(task, companyGraph, memories) {
  const company = companyGraph.company;
  const contract = companyGraph.contract;
  const profile = company.profile || companyGraph.profile || {};
  const name = company.name;
  const objective = contract.objective;
  const target = `${contract.target_metric} ${contract.comparator} ${contract.target_value} ${contract.target_unit || ""}`.trim();
  const context = profile.target_customer || profile.subject || profile.audience || "the defined target customer";
  const offer = profile.offer || profile.operating_system || company.description;
  const memorySignal = memories.length ? `Use ${memories.length} prior durable memories as constraints.` : "No prior execution memory exists; establish the baseline explicitly.";
  const common = {
    risks: ["Unverified assumptions must remain labeled until supported by source or outcome evidence.", "External communication, spending, contracting, and account changes require an approved integration action."],
    evidence_required: ["Timestamped artifact", "Source or operator input for every material claim", "Measured outcome tied to the contract metric"],
  };
  const outputs = {
    "strategy.operating_plan": {
      summary: `${name} will operate against the single outcome contract: ${objective}. ${memorySignal}`,
      decisions: [`Primary customer: ${context}`, `Primary offer: ${offer}`, `North-star contract: ${target}`, "Run weekly evidence reviews and stop work that cannot show a path to the target metric."],
      actions: ["Freeze the offer and customer definition for one measurement cycle.", "Assign one accountable owner to every metric and action.", "Reject activity metrics that cannot connect to revenue, retention, cost, risk, or delivery quality."],
      metrics: [{ name: contract.target_metric, target, source: "outcome_contract" }, { name: "decision_cycle_hours", target: "<= 168", source: "operating_cadence" }],
    },
    "research.evidence_brief": {
      summary: `Research will reduce the highest-value uncertainties around ${context} before the company increases cost or automation.`,
      decisions: ["Separate verified facts, operator assumptions, and hypotheses.", "Prioritize purchase triggers, switching barriers, budget authority, urgency, and current alternatives.", "Do not convert generated text into a market claim without a source record."],
      actions: ["Collect ten first-party customer statements or equivalent owned observations.", "Build a competitor and alternative matrix with dated URLs or documents.", "Record confidence, source date, and business consequence for every insight."],
      metrics: [{ name: "verified_customer_observations", target: ">= 10", source: "research_ledger" }, { name: "critical_assumptions_open", target: "decreasing each cycle", source: "assumption_register" }],
    },
    "engineering.delivery_plan": {
      summary: `Engineering will convert ${objective} into a deployable, observable, reversible production backlog.`,
      decisions: ["Ship vertical slices that include API, storage, UI, validation, logs, tests, and rollback.", "Use idempotency keys for side effects and explicit ownership for credentials.", "Treat proof generation as part of done, not documentation after the fact."],
      actions: ["Map the current user journey from input to measured outcome.", "Define service-level objectives and failure budgets.", "Prioritize the smallest slice that can produce externally verifiable value."],
      metrics: [{ name: "lead_time_hours", target: "decreasing", source: "delivery_ledger" }, { name: "change_failure_rate", target: "< 10%", source: "deployment_evidence" }],
    },
    "marketing.demand_system": {
      summary: `Marketing will turn the offer into an owned demand system for ${context}, measured through qualified intent instead of reach alone.`,
      decisions: ["Use one promise, one proof mechanism, and one next action per campaign.", "Route every channel into owned capture with source attribution.", "Promote only claims supported by delivery evidence or clearly labeled projections."],
      actions: ["Create a problem-to-proof message matrix.", "Publish a four-week content and conversion calendar.", "Instrument visitor, lead, qualified lead, proposal, win, revenue, and retention events."],
      metrics: [{ name: "qualified_lead_rate", target: "increasing", source: "funnel_events" }, { name: "owned_audience_growth", target: "positive weekly", source: "consented_contacts" }],
    },
    "outreach.pipeline_playbook": {
      summary: "Outreach will prepare permissioned, approval-ready sequences that qualify demand without silently sending messages.",
      decisions: ["No message is sent without a configured provider, consent basis, suppression handling, and approval policy.", "Personalization must use verified business facts, not invented familiarity.", "Every sequence must define stop, reply, unsubscribe, and handoff behavior."],
      actions: ["Define ideal account and contact filters.", "Create three message paths: problem-aware, opportunity-aware, and referral.", "Queue messages as drafts with evidence, owner, and expected next state."],
      metrics: [{ name: "positive_reply_rate", target: "measured after approved launch", source: "provider_delivery_events" }, { name: "qualified_meetings", target: "tied to outcome contract", source: "pipeline_ledger" }],
    },
    "growth.experiment_portfolio": {
      summary: `Growth will maintain a ranked experiment portfolio tied to ${target}, with explicit costs, expected lift, evidence, and kill criteria.`,
      decisions: ["Rank experiments by expected value, confidence, speed, and reversibility.", "Run one primary constraint experiment at a time.", "Promote a tactic into a playbook only after repeatable measured lift."],
      actions: ["Identify the current bottleneck in acquisition, activation, conversion, retention, or expansion.", "Define baseline, treatment, sample, duration, success threshold, and stop rule.", "Store the result and next hypothesis in the learning ledger."],
      metrics: [{ name: "experiment_velocity", target: ">= 1 completed learning cycle per week", source: "learning_ledger" }, { name: "validated_lift", target: "> 0", source: "experiment_evidence" }],
    },
    "support.service_system": {
      summary: "Support will protect retention and trust through owned knowledge, response targets, triage, and closed-loop product feedback.",
      decisions: ["Classify requests by severity, customer impact, and required authority.", "Never fabricate account state, refunds, legal terms, or delivery status.", "Convert recurring issues into product, documentation, or automation work."],
      actions: ["Create severity definitions and response targets.", "Build reusable answer templates with escalation boundaries.", "Track first response, resolution time, reopen rate, satisfaction, and churn risk."],
      metrics: [{ name: "first_response_minutes", target: "within plan SLA", source: "support_events" }, { name: "reopen_rate", target: "decreasing", source: "support_events" }],
    },
    "finance.unit_economics": {
      summary: `Finance will keep ${name} inside explicit cash, margin, pricing, and evidence controls while pursuing ${objective}.`,
      decisions: ["Revenue is recognized only from verified payments or reconciled records.", "Separate pipeline, contracted value, invoiced value, collected cash, and retained revenue.", "Require approval before commitments, purchases, transfers, discounts, or pricing exceptions."],
      actions: ["Build contribution margin by offer and customer segment.", "Set cash runway, collection, refund, and concentration alerts.", "Create pricing floors from delivery cost, risk, acquisition cost, and target margin."],
      metrics: [{ name: "gross_margin_percent", target: "positive and improving", source: "reconciled_financials" }, { name: "cash_conversion_days", target: "decreasing", source: "invoice_payment_ledger" }],
    },
    "operations.company_runbook": {
      summary: "Operations will connect all nine roles into one durable execution system with visible work, evidence, escalation, and learning.",
      decisions: ["The outcome contract is the source of priority.", "Every action has an owner, state, due condition, evidence requirement, and rollback or stop rule.", "Blocked work escalates with the exact missing decision, credential, source, or capability."],
      actions: ["Run a daily constraint and exception review.", "Run a weekly metric, cash, delivery, and learning review.", "Maintain incident, decision, risk, and capability ledgers as durable company memory."],
      metrics: [{ name: "blocked_work_age_hours", target: "decreasing", source: "task_ledger" }, { name: "evidence_complete_rate", target: "100% for completed actions", source: "artifact_ledger" }],
    },
  };
  const selected = task.kind.startsWith("growth.improve.") ? outputs["growth.experiment_portfolio"] : (outputs[task.kind] || outputs["strategy.operating_plan"]);
  return { ...selected, ...common };
}

class RulesModelProvider {
  constructor() { this.name = "rules"; }
  async generate(input) { return buildRulesOutput(input.task, input.company, input.memories || []); }
}

class AnthropicModelProvider {
  constructor(options = {}) {
    this.name = "anthropic";
    const Anthropic = require("@anthropic-ai/sdk");
    this.client = options.client || new Anthropic({ apiKey: options.apiKey || process.env.ANTHROPIC_API_KEY });
    this.model = options.model || process.env.CYVX_COMPANY_MODEL || "claude-sonnet-4-5";
  }

  async generate(input) {
    const prompt = JSON.stringify({
      instruction: "Return only valid JSON with summary, decisions[], actions[], risks[], evidence_required[], and metrics[{name,target,source}]. Never claim an external action, market fact, payment, customer result, or deployment occurred without supplied evidence.",
      role: input.task.role,
      task: { kind: input.task.kind, title: input.task.title, input: parseJson(input.task.input, {}) },
      company: input.company,
      durable_memories: input.memories,
    });
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 2400,
      temperature: 0.2,
      messages: [{ role: "user", content: prompt }],
    });
    const text = response.content.filter((part) => part.type === "text").map((part) => part.text).join("\n").trim();
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    return parseJson(fenced ? fenced[1] : text, null);
  }
}

class ClaudeCliModelProvider {
  constructor(options = {}) {
    this.name = "claude-cli";
    this.command = options.command || process.env.CYVX_CLAUDE_COMMAND || "claude";
    this.timeoutMs = integer(options.timeoutMs || process.env.CYVX_CLAUDE_TIMEOUT_MS || 120000, "claude timeout", 1000, 600000);
  }

  async generate(input) {
    const prompt = JSON.stringify({
      instruction: "Return only JSON with summary, decisions, actions, risks, evidence_required, metrics. Do not claim unverified external outcomes.",
      role: input.task.role,
      task: input.task,
      company: input.company,
      durable_memories: input.memories,
    });
    const result = spawnSync(this.command, ["--print", "--output-format", "json", prompt], {
      encoding: "utf8", timeout: this.timeoutMs, maxBuffer: 4 * 1024 * 1024,
    });
    if (result.error) throw new RuntimeError("MODEL_PROVIDER_ERROR", result.error.message, 502);
    if (result.status !== 0) throw new RuntimeError("MODEL_PROVIDER_ERROR", boundedString(result.stderr, "claude stderr", 4000) || `Claude CLI exited ${result.status}`, 502);
    const envelope = parseJson(result.stdout, null);
    return parseJson(envelope?.result || envelope?.content || result.stdout, envelope);
  }
}

function createModelProvider(options = {}) {
  if (options.provider && typeof options.provider.generate === "function") return options.provider;
  const selected = String(options.name || process.env.CYVX_COMPANY_MODEL_PROVIDER || (process.env.ANTHROPIC_API_KEY ? "anthropic" : "rules")).trim().toLowerCase();
  if (selected === "rules") return new RulesModelProvider();
  if (selected === "anthropic") {
    if (!options.apiKey && !process.env.ANTHROPIC_API_KEY) throw new RuntimeError("MODEL_PROVIDER_NOT_READY", "ANTHROPIC_API_KEY is required for the Anthropic provider", 503);
    return new AnthropicModelProvider(options);
  }
  if (selected === "claude-cli") return new ClaudeCliModelProvider(options);
  throw new RuntimeError("MODEL_PROVIDER_UNSUPPORTED", `Unsupported model provider ${selected}`, 422);
}

class AutonomousCompanyRuntime {
  constructor(runtime, options = {}) {
    if (!runtime?.db) throw new Error("A CYVX mission runtime with a database is required");
    this.runtime = runtime;
    this.db = runtime.db;
    this.logger = options.logger || runtime.logger || runtime.store?.logger || console;
    this.operator = options.operator || new CompanyOperator(runtime, options.operatorOptions || {
      workspaceRoot: options.companyWorkspaceRoot,
      intelligenceStatePath: options.intelligenceStatePath,
    });
    this.model = createModelProvider(options.model || {});
    this.workerId = options.workerId || `acr-${process.pid}-${crypto.randomBytes(4).toString("hex")}`;
    this.leaseMs = integer(options.leaseMs || 60000, "leaseMs", 5000, 600000);
    ensureSchema(this.db);
  }

  emit(companyId, organizationId, type, payload = {}) {
    const event = { id: id("acrevt"), organization_id: organizationId, company_id: companyId, type, payload, created_at: now() };
    this.db.prepare("INSERT INTO acr_events(id,organization_id,company_id,type,payload,created_at) VALUES(?,?,?,?,?,?)")
      .run(event.id, organizationId, companyId, type, JSON.stringify(payload), event.created_at);
    const line = { level: "info", event: type, company_id: companyId, organization_id: organizationId, ...payload };
    if (typeof this.logger.info === "function") this.logger.info(line); else if (typeof this.logger.log === "function") this.logger.log(line);
    return event;
  }

  requireTeam(companyId, auth) {
    const row = this.db.prepare("SELECT * FROM acr_teams WHERE company_id=? AND organization_id=?").get(companyId, auth.organization_id);
    if (!row) throw new RuntimeError("COMPANY_RUNTIME_NOT_FOUND", "Autonomous company runtime not found", 404);
    return row;
  }

  createCompany(input, auth) {
    const created = this.operator.createCompany(input, auth);
    const timestamp = now();
    const teamId = id("acrteam");
    this.db.prepare("INSERT INTO acr_teams(id,organization_id,company_id,name,status,model_provider,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)")
      .run(teamId, auth.organization_id, created.company.id, `${created.company.name} Agent Team`, "planned", this.model.name, timestamp, timestamp);
    const insert = this.db.prepare("INSERT INTO acr_agents(id,organization_id,company_id,role,label,purpose,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)");
    for (const definition of AGENT_DEFINITIONS) {
      insert.run(id("acrag"), auth.organization_id, created.company.id, definition.role, definition.label, definition.purpose, "ready", timestamp, timestamp);
    }
    this.emit(created.company.id, auth.organization_id, "company_runtime.created", { team_id: teamId, model_provider: this.model.name, agents: AGENT_DEFINITIONS.length });
    return this.getCompany(created.company.id, auth);
  }

  approveCompany(companyId, input, auth) {
    this.requireTeam(companyId, auth);
    const approved = this.operator.approveCompany(companyId, input || { decision_reason: "Approved for autonomous company runtime" }, auth);
    this.db.prepare("UPDATE acr_teams SET status='active',updated_at=? WHERE company_id=? AND organization_id=?").run(now(), companyId, auth.organization_id);
    this.seedTasks(companyId, auth);
    this.emit(companyId, auth.organization_id, "company_runtime.approved", { mission_status: approved.mission?.status || null });
    return this.getCompany(companyId, auth);
  }

  seedTasks(companyId, auth) {
    this.requireTeam(companyId, auth);
    const agents = this.db.prepare("SELECT * FROM acr_agents WHERE company_id=? AND organization_id=?").all(companyId, auth.organization_id);
    const byRole = new Map(agents.map((agent) => [agent.role, agent]));
    const insert = this.db.prepare(`INSERT OR IGNORE INTO acr_tasks(
      id,organization_id,company_id,agent_id,role,kind,title,status,priority,dependencies,input,attempts,max_attempts,run_after,created_at,updated_at
    ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    const timestamp = now();
    for (const definition of AGENT_DEFINITIONS) {
      const agent = byRole.get(definition.role);
      if (!agent) throw new RuntimeError("AGENT_TEAM_INVALID", `Missing ${definition.role} agent`, 500);
      insert.run(id("acrtask"), auth.organization_id, companyId, agent.id, definition.role, definition.task,
        `${definition.label}: ${definition.purpose}`, "pending", definition.priority, JSON.stringify(definition.depends_on), "{}", 0, 3, timestamp, timestamp, timestamp);
    }
    return this.listTasks(companyId, auth);
  }

  listTasks(companyId, auth) {
    this.requireTeam(companyId, auth);
    return this.db.prepare("SELECT * FROM acr_tasks WHERE company_id=? AND organization_id=? ORDER BY priority DESC,created_at")
      .all(companyId, auth.organization_id).map((row) => ({ ...row, dependencies: parseJson(row.dependencies, []), input: parseJson(row.input, {}), output: parseJson(row.output, null) }));
  }

  listCompanies(auth) {
    const rows = this.db.prepare("SELECT * FROM acr_teams WHERE organization_id=? ORDER BY updated_at DESC").all(auth.organization_id);
    return rows.map((team) => {
      const counts = this.db.prepare("SELECT status,COUNT(*) AS count FROM acr_tasks WHERE company_id=? GROUP BY status").all(team.company_id);
      return { ...team, task_counts: Object.fromEntries(counts.map((row) => [row.status, Number(row.count)])) };
    });
  }

  dependenciesSatisfied(task) {
    const dependencies = parseJson(task.dependencies, []);
    if (!dependencies.length) return true;
    const rows = this.db.prepare(`SELECT kind,status FROM acr_tasks WHERE company_id=? AND kind IN (${dependencies.map(() => "?").join(",")})`)
      .all(task.company_id, ...dependencies);
    const states = new Map(rows.map((row) => [row.kind, row.status]));
    return dependencies.every((kind) => states.get(kind) === "completed");
  }

  releaseExpiredLeases(companyId) {
    const timestamp = now();
    this.db.prepare("UPDATE acr_tasks SET status='pending',lease_owner=NULL,lease_until=NULL,updated_at=? WHERE company_id=? AND status='running' AND lease_until<?")
      .run(timestamp, companyId, timestamp);
  }

  claimTask(companyId, auth) {
    this.releaseExpiredLeases(companyId);
    const candidates = this.db.prepare("SELECT * FROM acr_tasks WHERE company_id=? AND organization_id=? AND status='pending' AND run_after<=? ORDER BY priority DESC,created_at LIMIT 50")
      .all(companyId, auth.organization_id, now());
    const task = candidates.find((candidate) => this.dependenciesSatisfied(candidate));
    if (!task) return null;
    const leaseUntil = new Date(Date.now() + this.leaseMs).toISOString();
    const updated = this.db.prepare("UPDATE acr_tasks SET status='running',lease_owner=?,lease_until=?,attempts=attempts+1,updated_at=? WHERE id=? AND status='pending'")
      .run(this.workerId, leaseUntil, now(), task.id);
    if (!updated.changes) return null;
    this.db.prepare("UPDATE acr_agents SET status='running',updated_at=? WHERE id=?").run(now(), task.agent_id);
    return this.db.prepare("SELECT * FROM acr_tasks WHERE id=?").get(task.id);
  }

  recentMemories(companyId, limit = 20) {
    return this.db.prepare("SELECT role,kind,content,content_sha256,created_at FROM acr_memories WHERE company_id=? ORDER BY created_at DESC LIMIT ?")
      .all(companyId, integer(limit, "memory limit", 1, 100)).map((row) => ({ ...row, content: parseJson(row.content, row.content) }));
  }

  writeArtifact(companyGraph, task, output) {
    const root = ensureInside(companyGraph.company.workspace_path, path.join(companyGraph.company.workspace_path, "company-runtime"));
    const directory = ensureInside(root, path.join(root, safeFilePart(task.role)));
    fs.mkdirSync(directory, { recursive: true });
    const target = ensureInside(directory, path.join(directory, `${safeFilePart(task.kind)}.json`));
    const document = {
      schema_version: 1,
      generated_at: now(),
      company_id: companyGraph.company.id,
      company_name: companyGraph.company.name,
      outcome_contract: companyGraph.contract,
      agent: { role: task.role, task_id: task.id, kind: task.kind },
      output,
      truth_boundary: "This artifact records generated decisions and proposed actions. External execution and business outcomes require separate provider or measurement evidence.",
    };
    const body = `${JSON.stringify(document, null, 2)}\n`;
    atomicWrite(target, body);
    return { path: target, sha256: sha256(body), bytes: Buffer.byteLength(body) };
  }

  completeTask(task, output, artifact, auth) {
    const timestamp = now();
    this.db.prepare("UPDATE acr_tasks SET status='completed',output=?,artifact_path=?,artifact_sha256=?,lease_owner=NULL,lease_until=NULL,error=NULL,completed_at=?,updated_at=? WHERE id=?")
      .run(JSON.stringify(output), artifact.path, artifact.sha256, timestamp, timestamp, task.id);
    this.db.prepare("UPDATE acr_agents SET status='ready',completed_tasks=completed_tasks+1,updated_at=? WHERE id=?").run(timestamp, task.agent_id);
    const memory = { summary: output.summary, decisions: output.decisions, actions: output.actions, metrics: output.metrics, artifact_sha256: artifact.sha256 };
    const memoryBody = canonicalJson(memory);
    this.db.prepare("INSERT INTO acr_memories(id,organization_id,company_id,role,kind,content,content_sha256,source_task_id,created_at) VALUES(?,?,?,?,?,?,?,?,?)")
      .run(id("acrmem"), auth.organization_id, task.company_id, task.role, "task_output", JSON.stringify(memory), sha256(memoryBody), task.id, timestamp);
    this.emit(task.company_id, auth.organization_id, "company_runtime.task_completed", { task_id: task.id, role: task.role, kind: task.kind, artifact_sha256: artifact.sha256, artifact_bytes: artifact.bytes });
  }

  failTask(task, error, auth) {
    const attempts = Number(task.attempts || 0);
    const terminal = attempts >= Number(task.max_attempts || 3);
    const status = terminal ? "failed" : "pending";
    const retryAt = new Date(Date.now() + Math.min(300000, 1000 * (2 ** Math.max(1, attempts)))).toISOString();
    this.db.prepare("UPDATE acr_tasks SET status=?,run_after=?,lease_owner=NULL,lease_until=NULL,error=?,updated_at=? WHERE id=?")
      .run(status, retryAt, boundedString(error?.stack || error?.message || error, "task error", 8000), now(), task.id);
    this.db.prepare("UPDATE acr_agents SET status=?,failed_tasks=failed_tasks+1,updated_at=? WHERE id=?").run(terminal ? "failed" : "ready", now(), task.agent_id);
    this.emit(task.company_id, auth.organization_id, terminal ? "company_runtime.task_failed" : "company_runtime.task_retry_scheduled", { task_id: task.id, role: task.role, kind: task.kind, attempts, error: error?.message || String(error) });
  }

  async runTick(companyId, auth) {
    const team = this.requireTeam(companyId, auth);
    if (team.status !== "active") return { status: "blocked", phase: "runtime", summary: `Team status is ${team.status}` };
    const companyGraph = this.operator.getCompany(companyId, auth);
    const incompleteActivation = companyGraph.actions.some((action) => action.status !== "completed");
    if (incompleteActivation) {
      const result = this.operator.runTick(companyId, auth);
      this.db.prepare("UPDATE acr_teams SET last_tick_at=?,updated_at=? WHERE company_id=?").run(now(), now(), companyId);
      this.emit(companyId, auth.organization_id, "company_runtime.operator_tick", { status: result.status, summary: result.summary });
      return { status: result.status, phase: "operator_activation", operator: result };
    }
    const task = this.claimTask(companyId, auth);
    if (!task) {
      const remaining = this.db.prepare("SELECT COUNT(*) AS count FROM acr_tasks WHERE company_id=? AND status IN ('pending','running')").get(companyId);
      if (Number(remaining.count) === 0) this.db.prepare("UPDATE acr_teams SET status='completed',last_tick_at=?,updated_at=? WHERE company_id=?").run(now(), now(), companyId);
      return { status: Number(remaining.count) === 0 ? "idle" : "blocked", phase: "agent_execution", summary: Number(remaining.count) === 0 ? "All scheduled agent work is complete" : "Tasks are waiting for dependencies or retry time" };
    }
    try {
      const currentGraph = this.operator.getCompany(companyId, auth);
      const output = normalizeModelOutput(await this.model.generate({ task: { ...task, input: parseJson(task.input, {}) }, company: currentGraph, memories: this.recentMemories(companyId) }), task);
      const artifact = this.writeArtifact(currentGraph, task, output);
      this.completeTask(task, output, artifact, auth);
      this.db.prepare("UPDATE acr_teams SET last_tick_at=?,updated_at=? WHERE company_id=?").run(now(), now(), companyId);
      return { status: "completed", phase: "agent_execution", task_id: task.id, role: task.role, kind: task.kind, artifact };
    } catch (error) {
      this.failTask(task, error, auth);
      return { status: "failed", phase: "agent_execution", task_id: task.id, role: task.role, error: error.message };
    }
  }

  async runToIdle(companyId, auth, maximumTicks = 100) {
    const limit = integer(maximumTicks, "maximum_ticks", 1, 500);
    const ticks = [];
    for (let index = 0; index < limit; index += 1) {
      const tick = await this.runTick(companyId, auth);
      ticks.push(tick);
      if (tick.status === "idle") break;
      if (tick.status === "blocked" && tick.phase === "agent_execution") break;
    }
    return { ticks, company: this.getCompany(companyId, auth) };
  }

  queueTask(companyId, input, auth) {
    this.requireTeam(companyId, auth);
    const role = boundedString(input.role, "role", 40, true).toLowerCase();
    if (!ROLE_NAMES.has(role)) throw new RuntimeError("VALIDATION_ERROR", `Unsupported role ${role}`, 422);
    const agent = this.db.prepare("SELECT * FROM acr_agents WHERE company_id=? AND organization_id=? AND role=?").get(companyId, auth.organization_id, role);
    const kind = boundedString(input.kind || `${role}.custom.${Date.now()}`, "kind", 120, true);
    const timestamp = now();
    const taskId = id("acrtask");
    this.db.prepare(`INSERT INTO acr_tasks(id,organization_id,company_id,agent_id,role,kind,title,status,priority,dependencies,input,attempts,max_attempts,run_after,created_at,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(taskId, auth.organization_id, companyId, agent.id, role, kind, boundedString(input.title || kind, "title", 500, true), "pending",
        integer(input.priority ?? 50, "priority", 0, 1000), JSON.stringify(boundedArray(input.dependencies || [], "dependencies", 20)),
        JSON.stringify(input.input || {}), 0, integer(input.max_attempts ?? 3, "max_attempts", 1, 10), input.run_after ? new Date(input.run_after).toISOString() : timestamp, timestamp, timestamp);
    this.emit(companyId, auth.organization_id, "company_runtime.task_queued", { task_id: taskId, role, kind });
    return this.db.prepare("SELECT * FROM acr_tasks WHERE id=?").get(taskId);
  }

  recordOutcome(companyId, input, auth) {
    this.requireTeam(companyId, auth);
    const metricName = boundedString(input.metric_name, "metric_name", 80, true);
    const value = finiteNumber(input.value, "value");
    const unit = boundedString(input.unit || "count", "unit", 40, true);
    const source = boundedString(input.source || "operator", "source", 200, true);
    const observed = boundedString(input.observed_result, "observed_result", 2000, true);
    const learning = boundedString(input.learning, "learning", 4000, true);
    const hypothesis = boundedString(input.next_hypothesis, "next_hypothesis", 4000, true);
    const timestamp = now();
    const metricId = id("acrmetric");
    this.db.prepare("INSERT INTO acr_metrics(id,organization_id,company_id,name,value,unit,source,evidence,recorded_at) VALUES(?,?,?,?,?,?,?,?,?)")
      .run(metricId, auth.organization_id, companyId, metricName, value, unit, source, JSON.stringify(input.evidence || {}), timestamp);
    const learningId = id("acrlearn");
    this.db.prepare("INSERT INTO acr_learnings(id,organization_id,company_id,metric_name,observed_result,learning,next_hypothesis,source_metric_id,created_at) VALUES(?,?,?,?,?,?,?,?,?)")
      .run(learningId, auth.organization_id, companyId, metricName, observed, learning, hypothesis, metricId, timestamp);
    const memory = { metric_name: metricName, value, unit, observed_result: observed, learning, next_hypothesis: hypothesis };
    this.db.prepare("INSERT INTO acr_memories(id,organization_id,company_id,role,kind,content,content_sha256,source_task_id,created_at) VALUES(?,?,?,?,?,?,?,?,?)")
      .run(id("acrmem"), auth.organization_id, companyId, "growth", "measured_learning", JSON.stringify(memory), sha256(canonicalJson(memory)), null, timestamp);
    const iteration = this.queueTask(companyId, {
      role: "growth", kind: `growth.improve.${metricName}.${Date.now()}`, title: `Improve ${metricName} from measured outcome`, priority: 110,
      input: { measured_outcome: memory, instruction: "Create the next bounded experiment from the measured result and durable learning." },
    }, auth);
    this.db.prepare("UPDATE acr_teams SET status='active',updated_at=? WHERE company_id=?").run(timestamp, companyId);
    this.emit(companyId, auth.organization_id, "company_runtime.outcome_recorded", { metric_id: metricId, learning_id: learningId, next_task_id: iteration.id });
    return { metric_id: metricId, learning_id: learningId, next_task: iteration };
  }

  registerIntegration(companyId, input, auth) {
    this.requireTeam(companyId, auth);
    const name = boundedString(input.name, "name", 100, true);
    const kind = boundedString(input.kind || "webhook", "kind", 80, true);
    const url = normalizeUrl(input.url);
    const secretEnv = boundedString(input.secret_env, "secret_env", 100, true);
    if (!/^[A-Z][A-Z0-9_]{2,99}$/.test(secretEnv)) throw new RuntimeError("VALIDATION_ERROR", "secret_env must be an uppercase environment variable name", 422);
    const allowed = boundedArray(input.allowed_event_types || [], "allowed_event_types", 50);
    if (!allowed.length) throw new RuntimeError("VALIDATION_ERROR", "allowed_event_types must contain at least one event", 422);
    const timestamp = now();
    const integrationId = id("acrint");
    this.db.prepare(`INSERT INTO acr_integrations(id,organization_id,company_id,name,kind,url,secret_env,allowed_event_types,timeout_ms,enabled,created_at,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(integrationId, auth.organization_id, companyId, name, kind, url, secretEnv, JSON.stringify(allowed), integer(input.timeout_ms ?? 15000, "timeout_ms", 1000, 120000), input.enabled === false ? 0 : 1, timestamp, timestamp);
    this.emit(companyId, auth.organization_id, "company_runtime.integration_registered", { integration_id: integrationId, name, kind, allowed_event_types: allowed });
    return { id: integrationId, name, kind, url, secret_env: secretEnv, allowed_event_types: allowed, enabled: input.enabled !== false };
  }

  listIntegrations(companyId, auth) {
    this.requireTeam(companyId, auth);
    return this.db.prepare("SELECT id,name,kind,url,secret_env,allowed_event_types,timeout_ms,enabled,created_at,updated_at FROM acr_integrations WHERE company_id=? AND organization_id=? ORDER BY name")
      .all(companyId, auth.organization_id).map((row) => ({ ...row, enabled: Boolean(row.enabled), allowed_event_types: parseJson(row.allowed_event_types, []) }));
  }

  async dispatchIntegration(companyId, integrationId, input, auth) {
    this.requireTeam(companyId, auth);
    const integration = this.db.prepare("SELECT * FROM acr_integrations WHERE id=? AND company_id=? AND organization_id=? AND enabled=1").get(integrationId, companyId, auth.organization_id);
    if (!integration) throw new RuntimeError("INTEGRATION_NOT_FOUND", "Enabled integration not found", 404);
    const eventType = boundedString(input.event_type, "event_type", 120, true);
    const allowed = parseJson(integration.allowed_event_types, []);
    if (!allowed.includes(eventType)) throw new RuntimeError("INTEGRATION_EVENT_DENIED", `Event ${eventType} is not allowed for this integration`, 403);
    const payload = input.payload && typeof input.payload === "object" ? input.payload : {};
    const bodyObject = { schema_version: 1, event_id: id("acrext"), event_type: eventType, company_id: companyId, occurred_at: now(), payload };
    const body = canonicalJson(bodyObject);
    const requestHash = sha256(body);
    const idempotencyKey = boundedString(input.idempotency_key || requestHash, "idempotency_key", 200, true);
    const existing = this.db.prepare("SELECT * FROM acr_deliveries WHERE company_id=? AND integration_id=? AND idempotency_key=?").get(companyId, integrationId, idempotencyKey);
    if (existing) return { ...existing, reused: true };
    const secret = process.env[integration.secret_env];
    if (!secret || secret.length < 24) throw new RuntimeError("INTEGRATION_SECRET_NOT_READY", `${integration.secret_env} must contain at least 24 characters`, 503);
    const deliveryId = id("acrdlv");
    this.db.prepare("INSERT INTO acr_deliveries(id,organization_id,company_id,integration_id,event_type,idempotency_key,status,request_sha256,created_at) VALUES(?,?,?,?,?,?,?,?,?)")
      .run(deliveryId, auth.organization_id, companyId, integrationId, eventType, idempotencyKey, "pending", requestHash, now());
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), Number(integration.timeout_ms));
    try {
      const signature = crypto.createHmac("sha256", secret).update(body).digest("hex");
      const response = await fetch(integration.url, {
        method: "POST",
        headers: { "content-type": "application/json", "x-cyvx-event": eventType, "x-cyvx-signature": `sha256=${signature}`, "idempotency-key": idempotencyKey },
        body,
        signal: controller.signal,
      });
      const responseBody = boundedString(await response.text(), "integration response", 8000);
      const delivered = response.ok;
      this.db.prepare("UPDATE acr_deliveries SET status=?,response_status=?,response_body=?,error=?,completed_at=? WHERE id=?")
        .run(delivered ? "delivered" : "failed", response.status, responseBody, delivered ? null : `HTTP ${response.status}`, now(), deliveryId);
      this.emit(companyId, auth.organization_id, delivered ? "company_runtime.integration_delivered" : "company_runtime.integration_failed", { delivery_id: deliveryId, integration_id: integrationId, event_type: eventType, response_status: response.status });
      return this.db.prepare("SELECT * FROM acr_deliveries WHERE id=?").get(deliveryId);
    } catch (error) {
      this.db.prepare("UPDATE acr_deliveries SET status='failed',error=?,completed_at=? WHERE id=?").run(boundedString(error.message, "integration error", 4000), now(), deliveryId);
      this.emit(companyId, auth.organization_id, "company_runtime.integration_failed", { delivery_id: deliveryId, integration_id: integrationId, event_type: eventType, error: error.message });
      return this.db.prepare("SELECT * FROM acr_deliveries WHERE id=?").get(deliveryId);
    } finally {
      clearTimeout(timeout);
    }
  }

  getCompany(companyId, auth) {
    const team = this.requireTeam(companyId, auth);
    const operator = this.operator.getCompany(companyId, auth);
    const agents = this.db.prepare("SELECT * FROM acr_agents WHERE company_id=? AND organization_id=? ORDER BY role").all(companyId, auth.organization_id);
    const tasks = this.listTasks(companyId, auth);
    const memories = this.recentMemories(companyId, 30);
    const metrics = this.db.prepare("SELECT * FROM acr_metrics WHERE company_id=? AND organization_id=? ORDER BY recorded_at DESC LIMIT 100").all(companyId, auth.organization_id).map((row) => ({ ...row, evidence: parseJson(row.evidence, {}) }));
    const learnings = this.db.prepare("SELECT * FROM acr_learnings WHERE company_id=? AND organization_id=? ORDER BY created_at DESC LIMIT 50").all(companyId, auth.organization_id);
    const events = this.db.prepare("SELECT * FROM acr_events WHERE company_id=? AND organization_id=? ORDER BY created_at DESC LIMIT 100").all(companyId, auth.organization_id).map((row) => ({ ...row, payload: parseJson(row.payload, {}) }));
    return { team, operator, agents, tasks, memories, metrics, learnings, integrations: this.listIntegrations(companyId, auth), events };
  }
}

module.exports = {
  AGENT_DEFINITIONS,
  TASK_STATES,
  AutonomousCompanyRuntime,
  RulesModelProvider,
  AnthropicModelProvider,
  ClaudeCliModelProvider,
  createModelProvider,
  ensureSchema,
};
