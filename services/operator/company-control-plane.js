"use strict";

const { RuntimeError, now, id, sha256, canonical } = require("../../runtime/missions/base");

const TRUTH_STATES = Object.freeze([
  "idea", "researched", "validated", "launched", "operating",
  "revenue_producing", "repeatable", "scalable", "paused", "failed",
]);
const TRUTH_TRANSITIONS = Object.freeze({
  idea: new Set(["researched", "failed"]),
  researched: new Set(["validated", "failed"]),
  validated: new Set(["launched", "failed"]),
  launched: new Set(["operating", "failed"]),
  operating: new Set(["revenue_producing", "paused", "failed"]),
  revenue_producing: new Set(["repeatable", "paused", "failed"]),
  repeatable: new Set(["scalable", "paused", "failed"]),
  scalable: new Set(["paused", "failed"]),
  paused: new Set(["operating", "revenue_producing", "repeatable", "scalable", "failed"]),
  failed: new Set(["researched", "validated", "launched", "operating"]),
});
const CYCLE_PHASES = Object.freeze(["observe", "diagnose", "prioritize", "plan", "approve", "execute", "verify", "learn", "replan", "completed"]);
const EXPERIMENT_STATES = new Set(["planned", "running", "won", "lost", "inconclusive", "stopped"]);
const EFFECT_STATES = new Set(["reserved", "completed", "failed", "compensated"]);
const SAGA_STATES = new Set(["running", "completed", "failed", "compensating", "compensated"]);
const DEPLOYMENT_STATES = new Set(["planned", "deploying", "deployed", "proven", "degraded", "rolled_back", "failed"]);

function text(value, name, maximum = 1000, required = false) {
  const output = String(value ?? "").trim();
  if (required && !output) throw new RuntimeError("VALIDATION_ERROR", `${name} is required`, 422);
  if (output.length > maximum) throw new RuntimeError("VALIDATION_ERROR", `${name} exceeds ${maximum} characters`, 422);
  return output;
}

function number(value, name, minimum = 0, maximum = Number.MAX_SAFE_INTEGER) {
  const output = Number(value);
  if (!Number.isFinite(output) || output < minimum || output > maximum) {
    throw new RuntimeError("VALIDATION_ERROR", `${name} must be between ${minimum} and ${maximum}`, 422);
  }
  return output;
}

function integer(value, name, minimum = 0, maximum = Number.MAX_SAFE_INTEGER) {
  const output = Number(value);
  if (!Number.isInteger(output) || output < minimum || output > maximum) {
    throw new RuntimeError("VALIDATION_ERROR", `${name} must be an integer between ${minimum} and ${maximum}`, 422);
  }
  return output;
}

function array(value, name, maximum = 100) {
  if (value === undefined || value === null || value === "") return [];
  const source = Array.isArray(value) ? value : String(value).split(",");
  if (source.length > maximum) throw new RuntimeError("VALIDATION_ERROR", `${name} exceeds ${maximum} items`, 422);
  return [...new Set(source.map((item) => text(item, `${name} item`, 300, true)))];
}

function json(value, fallback = {}) {
  if (value === null || value === undefined || value === "") return fallback;
  if (typeof value === "object") return value;
  try { return JSON.parse(value); } catch { return fallback; }
}

function ensureCompanyControlSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS company_mission_compilations (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      mission_id TEXT NOT NULL,
      input_digest TEXT NOT NULL,
      contract TEXT NOT NULL,
      created_at TEXT NOT NULL,
      created_by TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_company_mission_compilations_entity
      ON company_mission_compilations(organization_id,entity_id,created_at DESC);

    CREATE TABLE IF NOT EXISTS company_truth_transitions (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      from_state TEXT,
      to_state TEXT NOT NULL,
      reason TEXT NOT NULL,
      evidence_id TEXT,
      created_at TEXT NOT NULL,
      created_by TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_company_truth_entity
      ON company_truth_transitions(organization_id,entity_id,created_at DESC);

    CREATE TABLE IF NOT EXISTS company_decisions (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      question TEXT NOT NULL,
      hypothesis TEXT NOT NULL,
      alternatives TEXT NOT NULL,
      selected_option TEXT NOT NULL,
      expected_outcome TEXT NOT NULL,
      confidence REAL NOT NULL,
      evidence_ids TEXT NOT NULL,
      actual_outcome TEXT,
      prediction_error REAL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      resolved_at TEXT,
      created_by TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_company_decisions_entity
      ON company_decisions(organization_id,entity_id,status,created_at DESC);

    CREATE TABLE IF NOT EXISTS company_experiments (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      name TEXT NOT NULL,
      hypothesis TEXT NOT NULL,
      audience TEXT NOT NULL,
      offer TEXT NOT NULL,
      channel TEXT NOT NULL,
      metric_name TEXT NOT NULL,
      baseline REAL NOT NULL,
      target REAL NOT NULL,
      budget_ceiling_cents INTEGER NOT NULL,
      spent_cents INTEGER NOT NULL DEFAULT 0,
      sample_threshold INTEGER NOT NULL,
      sample_size INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL,
      stop_condition TEXT NOT NULL,
      result TEXT,
      created_at TEXT NOT NULL,
      started_at TEXT,
      completed_at TEXT,
      created_by TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_company_experiments_entity
      ON company_experiments(organization_id,entity_id,status,created_at DESC);

    CREATE TABLE IF NOT EXISTS company_experiment_observations (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL,
      experiment_id TEXT NOT NULL,
      metric_value REAL NOT NULL,
      sample_count INTEGER NOT NULL,
      cost_cents INTEGER NOT NULL,
      evidence_id TEXT,
      notes TEXT,
      observed_at TEXT NOT NULL,
      created_by TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_company_experiment_observations
      ON company_experiment_observations(organization_id,experiment_id,observed_at);

    CREATE TABLE IF NOT EXISTS company_operating_cycles (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      phase TEXT NOT NULL,
      objective TEXT NOT NULL,
      baseline TEXT NOT NULL,
      plan TEXT NOT NULL,
      result TEXT,
      learning TEXT,
      started_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      completed_at TEXT,
      created_by TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_company_cycles_entity
      ON company_operating_cycles(organization_id,entity_id,updated_at DESC);

    CREATE TABLE IF NOT EXISTS company_action_registry (
      type TEXT PRIMARY KEY,
      capability TEXT NOT NULL,
      risk_level TEXT NOT NULL,
      requires_approval INTEGER NOT NULL,
      cost_model TEXT NOT NULL,
      evidence_type TEXT NOT NULL,
      compensation_type TEXT,
      enabled INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS company_effects (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      action_type TEXT NOT NULL,
      idempotency_key TEXT NOT NULL,
      input_digest TEXT NOT NULL,
      status TEXT NOT NULL,
      result TEXT,
      error TEXT,
      evidence_id TEXT,
      reserved_at TEXT NOT NULL,
      completed_at TEXT,
      UNIQUE(organization_id,idempotency_key)
    );
    CREATE INDEX IF NOT EXISTS idx_company_effects_entity
      ON company_effects(organization_id,entity_id,status,reserved_at DESC);

    CREATE TABLE IF NOT EXISTS company_sagas (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      name TEXT NOT NULL,
      status TEXT NOT NULL,
      context TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      completed_at TEXT
    );
    CREATE TABLE IF NOT EXISTS company_saga_steps (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL,
      saga_id TEXT NOT NULL,
      sequence INTEGER NOT NULL,
      action_type TEXT NOT NULL,
      effect_id TEXT,
      compensation_type TEXT,
      status TEXT NOT NULL,
      result TEXT,
      error TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(saga_id,sequence)
    );

    CREATE TABLE IF NOT EXISTS company_providers (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL,
      name TEXT NOT NULL,
      environment TEXT NOT NULL,
      supported_actions TEXT NOT NULL,
      required_secrets TEXT NOT NULL,
      status TEXT NOT NULL,
      last_success_at TEXT,
      last_failure_at TEXT,
      last_error TEXT,
      metadata TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(organization_id,name,environment)
    );

    CREATE TABLE IF NOT EXISTS company_deployments (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      provider_id TEXT,
      environment TEXT NOT NULL,
      commit_sha TEXT NOT NULL,
      base_url TEXT NOT NULL,
      health_url TEXT NOT NULL,
      expected_service TEXT,
      status TEXT NOT NULL,
      http_status INTEGER,
      observed_service TEXT,
      observed_version TEXT,
      verified_at TEXT,
      evidence TEXT,
      created_at TEXT NOT NULL,
      created_by TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_company_deployments_entity
      ON company_deployments(organization_id,entity_id,environment,created_at DESC);

    CREATE TABLE IF NOT EXISTS company_notifications (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL,
      entity_id TEXT,
      severity TEXT NOT NULL,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      dedupe_key TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      acknowledged_at TEXT,
      acknowledged_by TEXT,
      UNIQUE(organization_id,dedupe_key,status)
    );

    CREATE TABLE IF NOT EXISTS company_usage_events (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL,
      entity_id TEXT,
      metric TEXT NOT NULL,
      quantity REAL NOT NULL,
      unit TEXT NOT NULL,
      source TEXT NOT NULL,
      evidence_id TEXT,
      recorded_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_company_usage
      ON company_usage_events(organization_id,entity_id,metric,recorded_at DESC);

    CREATE TABLE IF NOT EXISTS company_slos (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL,
      entity_id TEXT,
      name TEXT NOT NULL,
      metric TEXT NOT NULL,
      comparator TEXT NOT NULL,
      target REAL NOT NULL,
      window_seconds INTEGER NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(organization_id,entity_id,name)
    );
    CREATE TABLE IF NOT EXISTS company_slo_observations (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL,
      slo_id TEXT NOT NULL,
      value REAL NOT NULL,
      good INTEGER NOT NULL,
      evidence_id TEXT,
      observed_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS company_vertical_packs (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      name TEXT NOT NULL,
      version TEXT NOT NULL,
      manifest TEXT NOT NULL,
      manifest_sha256 TEXT NOT NULL,
      status TEXT NOT NULL,
      installed_at TEXT NOT NULL,
      installed_by TEXT NOT NULL,
      UNIQUE(organization_id,entity_id,name,version)
    );
  `);
}

function seedActionRegistry(db) {
  const actions = [
    ["reality.refresh", "reality.model", "low", 0, "zero", "reality_snapshot", null],
    ["constraint.resolve", "plan.create", "low", 0, "zero", "constraint_resolution", null],
    ["experiment.launch", "experiment.run", "medium", 1, "bounded_budget", "experiment_receipt", "experiment.stop"],
    ["offer.publish", "artifact.write", "medium", 1, "provider_cost", "deployment_receipt", "deployment.rollback"],
    ["lead.capture", "lead.capture", "low", 0, "zero", "lead_receipt", null],
    ["checkout.create", "checkout.create", "medium", 1, "provider_cost", "checkout_receipt", "checkout.expire"],
    ["fulfillment.start", "fulfillment.execute", "medium", 1, "bounded_budget", "fulfillment_receipt", "fulfillment.cancel"],
    ["deployment.promote", "deployment.execute", "high", 1, "provider_cost", "deployment_proof", "deployment.rollback"],
  ];
  const statement = db.prepare(`INSERT INTO company_action_registry(
    type,capability,risk_level,requires_approval,cost_model,evidence_type,compensation_type,enabled,updated_at
  ) VALUES(?,?,?,?,?,?,?,?,?)
  ON CONFLICT(type) DO UPDATE SET capability=excluded.capability,risk_level=excluded.risk_level,
    requires_approval=excluded.requires_approval,cost_model=excluded.cost_model,evidence_type=excluded.evidence_type,
    compensation_type=excluded.compensation_type,updated_at=excluded.updated_at`);
  for (const action of actions) statement.run(...action, 1, now());
}

class CompanyControlPlane {
  constructor(runtime, options = {}) {
    if (!runtime || !runtime.db || !runtime.evidence) throw new Error("CompanyControlPlane requires a CYVX mission runtime");
    this.runtime = runtime;
    this.db = runtime.db;
    this.logger = runtime.logger || runtime.store.logger;
    this.fetch = options.fetch || globalThis.fetch;
    ensureCompanyControlSchema(this.db);
    seedActionRegistry(this.db);
  }

  assertRole(auth, roles = ["admin", "approver", "agent"]) {
    if (!auth || !roles.includes(auth.role)) throw new RuntimeError("PERMISSION_DENIED", "Role cannot perform this company-control action", 403);
  }

  requireEntity(entityId, auth) {
    const entity = this.db.prepare("SELECT * FROM operator_entities WHERE id=? AND organization_id=?")
      .get(text(entityId, "entity_id", 160, true), auth.organization_id);
    if (!entity) throw new RuntimeError("NOT_FOUND", "Operator entity not found", 404);
    return { ...entity, profile: json(entity.profile, {}), counters: json(entity.counters, {}) };
  }

  requireExperiment(experimentId, auth) {
    const row = this.db.prepare("SELECT * FROM company_experiments WHERE id=? AND organization_id=?")
      .get(experimentId, auth.organization_id);
    if (!row) throw new RuntimeError("NOT_FOUND", "Experiment not found", 404);
    return row;
  }

  compileMission(entityId, input = {}, auth) {
    this.assertRole(auth, ["admin", "approver"]);
    const entity = this.requireEntity(entityId, auth);
    const contractRow = this.db.prepare("SELECT * FROM operator_entity_contracts WHERE entity_id=? AND organization_id=?")
      .get(entity.id, auth.organization_id);
    if (!contractRow) throw new RuntimeError("NOT_FOUND", "Entity outcome contract not found", 404);
    const contract = json(contractRow.payload, {});
    const compiled = {
      schema_version: 1,
      entity: {
        id: entity.id, type: entity.entity_type, name: entity.name, description: entity.description,
        status: entity.status, visibility: entity.visibility,
      },
      outcome: {
        objective: contract.objective || contractRow.objective,
        target_metric: contract.target_metric || contractRow.target_metric,
        comparator: contract.comparator || contractRow.comparator,
        target_value: contract.target_value ?? contractRow.target_value,
        deadline: contract.deadline || contractRow.deadline,
      },
      authority: {
        max_budget_cents: contract.max_budget_cents ?? contractRow.max_budget_cents,
        approval_threshold_cents: contract.approval_threshold_cents ?? contractRow.approval_threshold_cents,
        risk_level: contract.risk_level || contractRow.risk_level,
        allowed_capabilities: contract.allowed_capabilities || [],
        prohibited_actions: contract.prohibited_actions || [],
      },
      customer: entity.profile.subject || entity.profile.target_customer || null,
      offer: entity.profile.operating_system || entity.profile.offer || null,
      constraints: entity.profile.constraints || [],
      resources: entity.profile.resources || [],
      channels: entity.profile.channels || [],
      success_conditions: array(input.success_conditions || [], "success_conditions"),
      failure_conditions: array(input.failure_conditions || [], "failure_conditions"),
      compiled_at: now(),
      compiled_by: auth.user_id,
    };
    const compilationId = id("company_mission");
    const digest = sha256(canonical(compiled));
    this.db.prepare(`INSERT INTO company_mission_compilations(
      id,organization_id,entity_id,mission_id,input_digest,contract,created_at,created_by
    ) VALUES(?,?,?,?,?,?,?,?)`).run(
      compilationId, auth.organization_id, entity.id, entity.mission_id, digest,
      canonical(compiled), compiled.compiled_at, auth.user_id,
    );
    this.log("company_control.mission_compiled", auth, { entity_id: entity.id, compilation_id: compilationId, digest });
    return { id: compilationId, digest, contract: compiled };
  }

  currentTruth(entityId, auth) {
    this.requireEntity(entityId, auth);
    const row = this.db.prepare(`SELECT * FROM company_truth_transitions
      WHERE organization_id=? AND entity_id=? ORDER BY created_at DESC LIMIT 1`)
      .get(auth.organization_id, entityId);
    return row || { entity_id: entityId, from_state: null, to_state: "idea", reason: "Initial state" };
  }

  transitionTruth(entityId, input = {}, auth) {
    this.assertRole(auth);
    this.requireEntity(entityId, auth);
    const current = this.currentTruth(entityId, auth);
    const fromState = current.to_state || "idea";
    const toState = text(input.to_state, "to_state", 40, true);
    if (!TRUTH_STATES.includes(toState)) throw new RuntimeError("VALIDATION_ERROR", "Unsupported truth state", 422);
    if (toState !== fromState && !TRUTH_TRANSITIONS[fromState]?.has(toState)) {
      throw new RuntimeError("INVALID_STATE", `Cannot move company truth from ${fromState} to ${toState}`, 409);
    }
    if (!input.evidence_id && !["idea", "paused", "failed"].includes(toState)) {
      throw new RuntimeError("EVIDENCE_REQUIRED", `Evidence is required to enter ${toState}`, 422);
    }
    if (input.evidence_id) this.runtime.evidence.get(auth, input.evidence_id);
    const row = {
      id: id("truth_transition"), organization_id: auth.organization_id, entity_id: entityId,
      from_state: fromState, to_state: toState, reason: text(input.reason, "reason", 1000, true),
      evidence_id: input.evidence_id || null, created_at: now(), created_by: auth.user_id,
    };
    this.db.prepare(`INSERT INTO company_truth_transitions(
      id,organization_id,entity_id,from_state,to_state,reason,evidence_id,created_at,created_by
    ) VALUES(?,?,?,?,?,?,?,?,?)`).run(...Object.values(row));
    this.log("company_control.truth_transitioned", auth, row);
    return row;
  }

  recordDecision(entityId, input = {}, auth) {
    this.assertRole(auth);
    this.requireEntity(entityId, auth);
    const row = {
      id: id("decision"), organization_id: auth.organization_id, entity_id: entityId,
      question: text(input.question, "question", 1000, true),
      hypothesis: text(input.hypothesis, "hypothesis", 2000, true),
      alternatives: canonical(array(input.alternatives, "alternatives", 20)),
      selected_option: text(input.selected_option, "selected_option", 1000, true),
      expected_outcome: text(input.expected_outcome, "expected_outcome", 2000, true),
      confidence: number(input.confidence ?? 0.5, "confidence", 0, 1),
      evidence_ids: canonical(array(input.evidence_ids, "evidence_ids", 50)),
      actual_outcome: null, prediction_error: null, status: "open",
      created_at: now(), resolved_at: null, created_by: auth.user_id,
    };
    for (const evidenceId of json(row.evidence_ids, [])) this.runtime.evidence.get(auth, evidenceId);
    this.db.prepare(`INSERT INTO company_decisions(
      id,organization_id,entity_id,question,hypothesis,alternatives,selected_option,expected_outcome,
      confidence,evidence_ids,actual_outcome,prediction_error,status,created_at,resolved_at,created_by
    ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(...Object.values(row));
    this.log("company_control.decision_recorded", auth, { entity_id: entityId, decision_id: row.id });
    return this.expandDecision(row);
  }

  resolveDecision(decisionId, input = {}, auth) {
    this.assertRole(auth);
    const decision = this.db.prepare("SELECT * FROM company_decisions WHERE id=? AND organization_id=?")
      .get(decisionId, auth.organization_id);
    if (!decision) throw new RuntimeError("NOT_FOUND", "Decision not found", 404);
    const actualOutcome = text(input.actual_outcome, "actual_outcome", 3000, true);
    const predictionError = number(input.prediction_error ?? Math.abs(Number(input.actual_value || 0) - Number(input.expected_value || 0)), "prediction_error", 0);
    const resolvedAt = now();
    this.db.prepare(`UPDATE company_decisions SET actual_outcome=?,prediction_error=?,status='resolved',resolved_at=?
      WHERE id=? AND organization_id=?`).run(actualOutcome, predictionError, resolvedAt, decisionId, auth.organization_id);
    return this.expandDecision({ ...decision, actual_outcome: actualOutcome, prediction_error: predictionError, status: "resolved", resolved_at: resolvedAt });
  }

  expandDecision(row) {
    return { ...row, alternatives: json(row.alternatives, []), evidence_ids: json(row.evidence_ids, []) };
  }

  createExperiment(entityId, input = {}, auth) {
    this.assertRole(auth);
    this.requireEntity(entityId, auth);
    const budget = integer(input.budget_ceiling_cents ?? 0, "budget_ceiling_cents");
    const row = {
      id: id("experiment"), organization_id: auth.organization_id, entity_id: entityId,
      name: text(input.name, "name", 200, true),
      hypothesis: text(input.hypothesis, "hypothesis", 2000, true),
      audience: text(input.audience, "audience", 1000, true),
      offer: text(input.offer, "offer", 1000, true),
      channel: text(input.channel, "channel", 200, true),
      metric_name: text(input.metric_name, "metric_name", 100, true),
      baseline: number(input.baseline ?? 0, "baseline"),
      target: number(input.target, "target"),
      budget_ceiling_cents: budget, spent_cents: 0,
      sample_threshold: integer(input.sample_threshold ?? 1, "sample_threshold", 1, 1_000_000),
      sample_size: 0, status: input.start === false ? "planned" : "running",
      stop_condition: text(input.stop_condition || "budget, sample threshold, target, or owner stop", "stop_condition", 1000, true),
      result: null, created_at: now(), started_at: input.start === false ? null : now(),
      completed_at: null, created_by: auth.user_id,
    };
    this.db.prepare(`INSERT INTO company_experiments(
      id,organization_id,entity_id,name,hypothesis,audience,offer,channel,metric_name,baseline,target,
      budget_ceiling_cents,spent_cents,sample_threshold,sample_size,status,stop_condition,result,
      created_at,started_at,completed_at,created_by
    ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(...Object.values(row));
    this.log("company_control.experiment_created", auth, { entity_id: entityId, experiment_id: row.id, budget_cents: budget });
    return row;
  }

  observeExperiment(experimentId, input = {}, auth) {
    this.assertRole(auth);
    const experiment = this.requireExperiment(experimentId, auth);
    if (!["planned", "running"].includes(experiment.status)) throw new RuntimeError("INVALID_STATE", "Experiment is not accepting observations", 409);
    const sampleCount = integer(input.sample_count ?? 1, "sample_count", 1, 1_000_000);
    const costCents = integer(input.cost_cents ?? 0, "cost_cents");
    if (experiment.spent_cents + costCents > experiment.budget_ceiling_cents) {
      throw new RuntimeError("BUDGET_EXCEEDED", "Observation would exceed experiment budget ceiling", 409);
    }
    if (input.evidence_id) this.runtime.evidence.get(auth, input.evidence_id);
    const observation = {
      id: id("experiment_observation"), organization_id: auth.organization_id, experiment_id,
      metric_value: number(input.metric_value, "metric_value"), sample_count: sampleCount, cost_cents: costCents,
      evidence_id: input.evidence_id || null, notes: text(input.notes || "", "notes", 2000),
      observed_at: now(), created_by: auth.user_id,
    };
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db.prepare(`INSERT INTO company_experiment_observations(
        id,organization_id,experiment_id,metric_value,sample_count,cost_cents,evidence_id,notes,observed_at,created_by
      ) VALUES(?,?,?,?,?,?,?,?,?,?)`).run(...Object.values(observation));
      this.db.prepare(`UPDATE company_experiments SET status='running',started_at=COALESCE(started_at,?),
        sample_size=sample_size+?,spent_cents=spent_cents+? WHERE id=? AND organization_id=?`)
        .run(observation.observed_at, sampleCount, costCents, experimentId, auth.organization_id);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    return { observation, experiment: this.requireExperiment(experimentId, auth) };
  }

  evaluateExperiment(experimentId, input = {}, auth) {
    this.assertRole(auth);
    const experiment = this.requireExperiment(experimentId, auth);
    const observations = this.db.prepare(`SELECT * FROM company_experiment_observations
      WHERE organization_id=? AND experiment_id=? ORDER BY observed_at`).all(auth.organization_id, experimentId);
    if (!observations.length) throw new RuntimeError("EVIDENCE_REQUIRED", "Experiment has no observations", 422);
    const weightedTotal = observations.reduce((sum, item) => sum + item.metric_value * item.sample_count, 0);
    const samples = observations.reduce((sum, item) => sum + item.sample_count, 0);
    const metric = weightedTotal / samples;
    let status = "inconclusive";
    if (metric >= experiment.target && samples >= experiment.sample_threshold) status = "won";
    else if (samples >= experiment.sample_threshold || experiment.spent_cents >= experiment.budget_ceiling_cents) status = "lost";
    if (input.status) {
      if (!EXPERIMENT_STATES.has(input.status)) throw new RuntimeError("VALIDATION_ERROR", "Invalid experiment status", 422);
      status = input.status;
    }
    const result = {
      metric_name: experiment.metric_name, weighted_metric: metric, baseline: experiment.baseline,
      target: experiment.target, sample_size: samples, spent_cents: experiment.spent_cents,
      delta_from_baseline: metric - experiment.baseline, evaluated_at: now(),
    };
    this.db.prepare(`UPDATE company_experiments SET status=?,result=?,sample_size=?,completed_at=?
      WHERE id=? AND organization_id=?`).run(status, canonical(result), samples, result.evaluated_at, experimentId, auth.organization_id);
    return { ...this.requireExperiment(experimentId, auth), result };
  }

  listActionTypes() {
    return this.db.prepare("SELECT * FROM company_action_registry WHERE enabled=1 ORDER BY risk_level,type").all();
  }

  rankNextActions(entityId, auth) {
    const entity = this.requireEntity(entityId, auth);
    const truth = this.currentTruth(entityId, auth).to_state || "idea";
    const openExperiments = this.db.prepare(`SELECT COUNT(*) count FROM company_experiments
      WHERE organization_id=? AND entity_id=? AND status IN ('planned','running')`).get(auth.organization_id, entityId).count;
    const unresolved = this.db.prepare(`SELECT COUNT(*) count FROM company_notifications
      WHERE organization_id=? AND entity_id=? AND status='open'`).get(auth.organization_id, entityId).count;
    const actions = this.listActionTypes().map((action) => {
      let score = 50;
      const reasons = [];
      if (truth === "idea" || truth === "researched") {
        if (action.type === "reality.refresh") { score += 45; reasons.push("truth requires stronger reality evidence"); }
        if (action.type === "constraint.resolve") { score += 35; reasons.push("constraints should be resolved before execution"); }
      }
      if (truth === "validated" && action.type === "offer.publish") { score += 45; reasons.push("validated company is ready to launch an owned offer"); }
      if (["launched", "operating"].includes(truth) && action.type === "lead.capture") { score += 45; reasons.push("operating system needs real demand evidence"); }
      if (openExperiments === 0 && ["validated", "launched", "operating"].includes(truth) && action.type === "experiment.launch") {
        score += 30; reasons.push("no active experiment is producing learning");
      }
      if (unresolved > 0 && action.type === "constraint.resolve") { score += Math.min(30, unresolved * 5); reasons.push("open operator notifications require resolution"); }
      if (action.requires_approval) score -= 5;
      const confidence = Math.max(0.1, Math.min(0.99, 0.55 + reasons.length * 0.1));
      return {
        type: action.type, capability: action.capability, risk_level: action.risk_level,
        requires_approval: Boolean(action.requires_approval), evidence_type: action.evidence_type,
        compensation_type: action.compensation_type, score, confidence,
        reasons: reasons.length ? reasons : ["available governed capability"],
      };
    }).sort((a, b) => b.score - a.score || a.type.localeCompare(b.type));
    return { entity: { id: entity.id, name: entity.name, status: entity.status }, truth_state: truth, actions };
  }

  startCycle(entityId, input = {}, auth) {
    this.assertRole(auth);
    this.requireEntity(entityId, auth);
    const existing = this.db.prepare(`SELECT id FROM company_operating_cycles WHERE organization_id=? AND entity_id=?
      AND phase!='completed' ORDER BY started_at DESC LIMIT 1`).get(auth.organization_id, entityId);
    if (existing) throw new RuntimeError("CYCLE_ACTIVE", "An operating cycle is already active", 409, { cycle_id: existing.id });
    const row = {
      id: id("operating_cycle"), organization_id: auth.organization_id, entity_id: entityId,
      phase: "observe", objective: text(input.objective, "objective", 2000, true),
      baseline: canonical(input.baseline || {}), plan: canonical(input.plan || {}),
      result: null, learning: null, started_at: now(), updated_at: now(), completed_at: null,
      created_by: auth.user_id,
    };
    this.db.prepare(`INSERT INTO company_operating_cycles(
      id,organization_id,entity_id,phase,objective,baseline,plan,result,learning,started_at,updated_at,completed_at,created_by
    ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(...Object.values(row));
    return this.expandCycle(row);
  }

  advanceCycle(cycleId, input = {}, auth) {
    this.assertRole(auth);
    const cycle = this.db.prepare("SELECT * FROM company_operating_cycles WHERE id=? AND organization_id=?")
      .get(cycleId, auth.organization_id);
    if (!cycle) throw new RuntimeError("NOT_FOUND", "Operating cycle not found", 404);
    const currentIndex = CYCLE_PHASES.indexOf(cycle.phase);
    if (currentIndex < 0 || cycle.phase === "completed") throw new RuntimeError("INVALID_STATE", "Operating cycle is already complete", 409);
    const requested = input.phase ? text(input.phase, "phase", 30, true) : CYCLE_PHASES[currentIndex + 1];
    if (requested !== CYCLE_PHASES[currentIndex + 1]) throw new RuntimeError("INVALID_STATE", `Next phase must be ${CYCLE_PHASES[currentIndex + 1]}`, 409);
    const timestamp = now();
    const result = input.result === undefined ? cycle.result : canonical(input.result);
    const learning = input.learning === undefined ? cycle.learning : canonical(input.learning);
    this.db.prepare(`UPDATE company_operating_cycles SET phase=?,result=?,learning=?,updated_at=?,completed_at=?
      WHERE id=? AND organization_id=?`).run(
      requested, result, learning, timestamp, requested === "completed" ? timestamp : null, cycleId, auth.organization_id,
    );
    return this.expandCycle(this.db.prepare("SELECT * FROM company_operating_cycles WHERE id=?").get(cycleId));
  }

  expandCycle(row) {
    return { ...row, baseline: json(row.baseline, {}), plan: json(row.plan, {}), result: json(row.result, null), learning: json(row.learning, null) };
  }

  reserveEffect(entityId, input = {}, auth) {
    this.assertRole(auth);
    this.requireEntity(entityId, auth);
    const actionType = text(input.action_type, "action_type", 100, true);
    const registered = this.db.prepare("SELECT * FROM company_action_registry WHERE type=? AND enabled=1").get(actionType);
    if (!registered) throw new RuntimeError("CAPABILITY_NOT_REGISTERED", "Action type is not registered", 422);
    const key = text(input.idempotency_key, "idempotency_key", 300, true);
    const digest = sha256(canonical(input.input || {}));
    const existing = this.db.prepare("SELECT * FROM company_effects WHERE organization_id=? AND idempotency_key=?")
      .get(auth.organization_id, key);
    if (existing) {
      if (existing.input_digest !== digest || existing.action_type !== actionType) {
        throw new RuntimeError("IDEMPOTENCY_CONFLICT", "Idempotency key is already bound to different input", 409);
      }
      return existing;
    }
    const row = {
      id: id("effect"), organization_id: auth.organization_id, entity_id: entityId, action_type: actionType,
      idempotency_key: key, input_digest: digest, status: "reserved", result: null, error: null,
      evidence_id: null, reserved_at: now(), completed_at: null,
    };
    this.db.prepare(`INSERT INTO company_effects(
      id,organization_id,entity_id,action_type,idempotency_key,input_digest,status,result,error,evidence_id,reserved_at,completed_at
    ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`).run(...Object.values(row));
    return row;
  }

  settleEffect(effectId, input = {}, auth) {
    this.assertRole(auth);
    const effect = this.db.prepare("SELECT * FROM company_effects WHERE id=? AND organization_id=?")
      .get(effectId, auth.organization_id);
    if (!effect) throw new RuntimeError("NOT_FOUND", "Effect not found", 404);
    const status = text(input.status, "status", 30, true);
    if (!EFFECT_STATES.has(status) || status === "reserved") throw new RuntimeError("VALIDATION_ERROR", "Effect status must be completed, failed, or compensated", 422);
    if (effect.status !== "reserved" && effect.status !== "failed") throw new RuntimeError("INVALID_STATE", `Effect cannot settle from ${effect.status}`, 409);
    if (input.evidence_id) this.runtime.evidence.get(auth, input.evidence_id);
    const timestamp = now();
    this.db.prepare(`UPDATE company_effects SET status=?,result=?,error=?,evidence_id=?,completed_at=?
      WHERE id=? AND organization_id=?`).run(
      status, input.result === undefined ? null : canonical(input.result), text(input.error || "", "error", 3000),
      input.evidence_id || null, timestamp, effectId, auth.organization_id,
    );
    return this.db.prepare("SELECT * FROM company_effects WHERE id=?").get(effectId);
  }

  createSaga(entityId, input = {}, auth) {
    this.assertRole(auth);
    this.requireEntity(entityId, auth);
    const row = {
      id: id("saga"), organization_id: auth.organization_id, entity_id: entityId,
      name: text(input.name, "name", 200, true), status: "running",
      context: canonical(input.context || {}), created_at: now(), updated_at: now(), completed_at: null,
    };
    this.db.prepare(`INSERT INTO company_sagas(
      id,organization_id,entity_id,name,status,context,created_at,updated_at,completed_at
    ) VALUES(?,?,?,?,?,?,?,?,?)`).run(...Object.values(row));
    return { ...row, context: json(row.context, {}) };
  }

  addSagaStep(sagaId, input = {}, auth) {
    this.assertRole(auth);
    const saga = this.db.prepare("SELECT * FROM company_sagas WHERE id=? AND organization_id=?").get(sagaId, auth.organization_id);
    if (!saga) throw new RuntimeError("NOT_FOUND", "Saga not found", 404);
    if (saga.status !== "running") throw new RuntimeError("INVALID_STATE", "Saga is not running", 409);
    const sequence = integer(input.sequence, "sequence", 1, 1000);
    const actionType = text(input.action_type, "action_type", 100, true);
    if (!this.db.prepare("SELECT 1 FROM company_action_registry WHERE type=? AND enabled=1").get(actionType)) {
      throw new RuntimeError("CAPABILITY_NOT_REGISTERED", "Saga action type is not registered", 422);
    }
    const row = {
      id: id("saga_step"), organization_id: auth.organization_id, saga_id: sagaId, sequence,
      action_type: actionType, effect_id: input.effect_id || null,
      compensation_type: text(input.compensation_type || "", "compensation_type", 100) || null,
      status: text(input.status || "completed", "status", 30, true),
      result: input.result === undefined ? null : canonical(input.result),
      error: text(input.error || "", "error", 3000), created_at: now(), updated_at: now(),
    };
    this.db.prepare(`INSERT INTO company_saga_steps(
      id,organization_id,saga_id,sequence,action_type,effect_id,compensation_type,status,result,error,created_at,updated_at
    ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`).run(...Object.values(row));
    if (row.status === "failed") this.db.prepare("UPDATE company_sagas SET status='failed',updated_at=? WHERE id=?").run(now(), sagaId);
    return row;
  }

  compensateSaga(sagaId, input = {}, auth) {
    this.assertRole(auth, ["admin", "approver"]);
    const saga = this.db.prepare("SELECT * FROM company_sagas WHERE id=? AND organization_id=?").get(sagaId, auth.organization_id);
    if (!saga) throw new RuntimeError("NOT_FOUND", "Saga not found", 404);
    if (!["failed", "running"].includes(saga.status)) throw new RuntimeError("INVALID_STATE", "Saga does not require compensation", 409);
    const steps = this.db.prepare(`SELECT * FROM company_saga_steps WHERE saga_id=? AND organization_id=?
      AND status='completed' ORDER BY sequence DESC`).all(sagaId, auth.organization_id);
    const uncompensated = steps.filter((step) => !step.compensation_type);
    if (uncompensated.length && input.force !== true) {
      throw new RuntimeError("COMPENSATION_GAP", "Completed saga steps lack compensation actions", 409, {
        step_ids: uncompensated.map((step) => step.id),
      });
    }
    const timestamp = now();
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db.prepare("UPDATE company_sagas SET status='compensating',updated_at=? WHERE id=?").run(timestamp, sagaId);
      for (const step of steps) {
        this.db.prepare("UPDATE company_saga_steps SET status='compensated',updated_at=? WHERE id=?")
          .run(timestamp, step.id);
        if (step.effect_id) {
          this.db.prepare(`UPDATE company_effects SET status='compensated',completed_at=?
            WHERE id=? AND organization_id=? AND status='completed'`).run(timestamp, step.effect_id, auth.organization_id);
        }
      }
      this.db.prepare("UPDATE company_sagas SET status='compensated',updated_at=?,completed_at=? WHERE id=?")
        .run(timestamp, timestamp, sagaId);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    return { ...saga, status: "compensated", completed_at: timestamp, compensated_steps: steps.length };
  }

  upsertProvider(input = {}, auth) {
    this.assertRole(auth, ["admin"]);
    const name = text(input.name, "name", 100, true);
    const environment = text(input.environment || "production", "environment", 40, true);
    const requiredSecrets = array(input.required_secrets, "required_secrets", 50);
    const missing = requiredSecrets.filter((key) => !String(process.env[key] || "").trim());
    const status = missing.length ? "unconfigured" : "ready";
    const existing = this.db.prepare("SELECT id FROM company_providers WHERE organization_id=? AND name=? AND environment=?")
      .get(auth.organization_id, name, environment);
    const providerId = existing?.id || id("provider");
    const timestamp = now();
    this.db.prepare(`INSERT INTO company_providers(
      id,organization_id,name,environment,supported_actions,required_secrets,status,last_success_at,last_failure_at,last_error,metadata,updated_at
    ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(organization_id,name,environment) DO UPDATE SET supported_actions=excluded.supported_actions,
      required_secrets=excluded.required_secrets,status=excluded.status,last_error=excluded.last_error,
      metadata=excluded.metadata,updated_at=excluded.updated_at`).run(
      providerId, auth.organization_id, name, environment, canonical(array(input.supported_actions, "supported_actions", 100)),
      canonical(requiredSecrets), status, null, missing.length ? timestamp : null,
      missing.length ? `Missing required secret names: ${missing.join(", ")}` : null,
      canonical(input.metadata || {}), timestamp,
    );
    return { ...this.db.prepare("SELECT * FROM company_providers WHERE id=?").get(providerId), missing_secret_names: missing };
  }

  listProviders(auth) {
    this.assertRole(auth);
    return this.db.prepare("SELECT * FROM company_providers WHERE organization_id=? ORDER BY name,environment")
      .all(auth.organization_id).map((row) => ({
        ...row, supported_actions: json(row.supported_actions, []), required_secrets: json(row.required_secrets, []),
        metadata: json(row.metadata, {}),
      }));
  }

  recordDeployment(entityId, input = {}, auth) {
    this.assertRole(auth, ["admin", "approver", "agent"]);
    this.requireEntity(entityId, auth);
    const status = text(input.status || "planned", "status", 30, true);
    if (!DEPLOYMENT_STATES.has(status)) throw new RuntimeError("VALIDATION_ERROR", "Invalid deployment status", 422);
    const baseUrl = new URL(text(input.base_url, "base_url", 1000, true));
    if (baseUrl.protocol !== "https:" && process.env.NODE_ENV === "production") {
      throw new RuntimeError("HTTPS_REQUIRED", "Production deployment base_url must use HTTPS", 422);
    }
    const healthUrl = input.health_url ? new URL(text(input.health_url, "health_url", 1000, true)) : new URL("/healthz", baseUrl);
    const row = {
      id: id("deployment"), organization_id: auth.organization_id, entity_id: entityId,
      provider_id: input.provider_id || null, environment: text(input.environment || "staging", "environment", 40, true),
      commit_sha: text(input.commit_sha, "commit_sha", 80, true),
      base_url: baseUrl.toString().replace(/\/$/, ""), health_url: healthUrl.toString(),
      expected_service: text(input.expected_service || "", "expected_service", 100) || null,
      status, http_status: null, observed_service: null, observed_version: null,
      verified_at: null, evidence: null, created_at: now(), created_by: auth.user_id,
    };
    this.db.prepare(`INSERT INTO company_deployments(
      id,organization_id,entity_id,provider_id,environment,commit_sha,base_url,health_url,expected_service,status,
      http_status,observed_service,observed_version,verified_at,evidence,created_at,created_by
    ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(...Object.values(row));
    return row;
  }

  async verifyDeployment(deploymentId, auth) {
    this.assertRole(auth);
    const deployment = this.db.prepare("SELECT * FROM company_deployments WHERE id=? AND organization_id=?")
      .get(deploymentId, auth.organization_id);
    if (!deployment) throw new RuntimeError("NOT_FOUND", "Deployment not found", 404);
    if (typeof this.fetch !== "function") throw new RuntimeError("FETCH_UNAVAILABLE", "Runtime fetch is unavailable", 500);
    let httpStatus = null;
    let payload = null;
    let errorMessage = null;
    try {
      const response = await this.fetch(deployment.health_url, { headers: { accept: "application/json" }, redirect: "follow" });
      httpStatus = response.status;
      const raw = await response.text();
      try { payload = JSON.parse(raw); } catch { payload = { body_digest: sha256(raw), body_bytes: Buffer.byteLength(raw) }; }
      if (!response.ok) errorMessage = `Health endpoint returned ${response.status}`;
    } catch (error) {
      errorMessage = error.message;
    }
    const observedService = payload?.service || payload?.name || null;
    const observedVersion = payload?.version || payload?.commit_sha || payload?.commit || null;
    const serviceOk = !deployment.expected_service || observedService === deployment.expected_service;
    const commitOk = !observedVersion || String(observedVersion).includes(deployment.commit_sha.slice(0, 7));
    const passed = httpStatus >= 200 && httpStatus < 300 && serviceOk && commitOk && payload?.ok !== false;
    const status = passed ? "proven" : "degraded";
    const verifiedAt = now();
    const evidence = {
      health_url: deployment.health_url, http_status: httpStatus, payload,
      expected_service: deployment.expected_service, expected_commit_sha: deployment.commit_sha,
      service_ok: serviceOk, commit_ok: commitOk, error: errorMessage, verified_at: verifiedAt,
    };
    this.db.prepare(`UPDATE company_deployments SET status=?,http_status=?,observed_service=?,observed_version=?,
      verified_at=?,evidence=? WHERE id=? AND organization_id=?`).run(
      status, httpStatus, observedService, observedVersion, verifiedAt, canonical(evidence), deploymentId, auth.organization_id,
    );
    if (!passed) this.notify({
      entity_id: deployment.entity_id, severity: "critical", type: "deployment.degraded",
      title: `Deployment proof failed for ${deployment.environment}`,
      body: errorMessage || `Health proof did not match service or commit at ${deployment.health_url}`,
      dedupe_key: `deployment:${deployment.id}:degraded`,
    }, auth);
    return { ...deployment, status, http_status: httpStatus, observed_service: observedService, observed_version: observedVersion, verified_at: verifiedAt, evidence };
  }

  notify(input = {}, auth) {
    this.assertRole(auth);
    if (input.entity_id) this.requireEntity(input.entity_id, auth);
    const severity = text(input.severity || "info", "severity", 20, true);
    if (!["info", "warning", "critical"].includes(severity)) throw new RuntimeError("VALIDATION_ERROR", "Invalid notification severity", 422);
    const dedupeKey = text(input.dedupe_key || sha256(canonical(input)).slice(0, 32), "dedupe_key", 200, true);
    const existing = this.db.prepare(`SELECT * FROM company_notifications
      WHERE organization_id=? AND dedupe_key=? AND status='open'`).get(auth.organization_id, dedupeKey);
    if (existing) return existing;
    const row = {
      id: id("notification"), organization_id: auth.organization_id, entity_id: input.entity_id || null,
      severity, type: text(input.type, "type", 100, true), title: text(input.title, "title", 300, true),
      body: text(input.body, "body", 3000, true), dedupe_key: dedupeKey, status: "open",
      created_at: now(), acknowledged_at: null, acknowledged_by: null,
    };
    this.db.prepare(`INSERT INTO company_notifications(
      id,organization_id,entity_id,severity,type,title,body,dedupe_key,status,created_at,acknowledged_at,acknowledged_by
    ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`).run(...Object.values(row));
    return row;
  }

  listNotifications(auth, entityId = null) {
    this.assertRole(auth);
    const rows = entityId
      ? this.db.prepare("SELECT * FROM company_notifications WHERE organization_id=? AND entity_id=? ORDER BY created_at DESC").all(auth.organization_id, entityId)
      : this.db.prepare("SELECT * FROM company_notifications WHERE organization_id=? ORDER BY created_at DESC").all(auth.organization_id);
    return rows;
  }

  acknowledgeNotification(notificationId, auth) {
    this.assertRole(auth);
    const timestamp = now();
    const result = this.db.prepare(`UPDATE company_notifications SET status='acknowledged',acknowledged_at=?,acknowledged_by=?
      WHERE id=? AND organization_id=? AND status='open'`).run(timestamp, auth.user_id, notificationId, auth.organization_id);
    if (!result.changes) throw new RuntimeError("NOT_FOUND", "Open notification not found", 404);
    return this.db.prepare("SELECT * FROM company_notifications WHERE id=?").get(notificationId);
  }

  meterUsage(entityId, input = {}, auth) {
    this.assertRole(auth);
    if (entityId) this.requireEntity(entityId, auth);
    if (input.evidence_id) this.runtime.evidence.get(auth, input.evidence_id);
    const row = {
      id: id("usage"), organization_id: auth.organization_id, entity_id: entityId || null,
      metric: text(input.metric, "metric", 100, true), quantity: number(input.quantity ?? 1, "quantity"),
      unit: text(input.unit || "count", "unit", 50, true), source: text(input.source, "source", 200, true),
      evidence_id: input.evidence_id || null, recorded_at: now(),
    };
    this.db.prepare(`INSERT INTO company_usage_events(
      id,organization_id,entity_id,metric,quantity,unit,source,evidence_id,recorded_at
    ) VALUES(?,?,?,?,?,?,?,?,?)`).run(...Object.values(row));
    return row;
  }

  defineSlo(entityId, input = {}, auth) {
    this.assertRole(auth, ["admin"]);
    if (entityId) this.requireEntity(entityId, auth);
    const comparator = text(input.comparator || ">=", "comparator", 2, true);
    if (!([">=", "<=", ">", "<", "="].includes(comparator))) throw new RuntimeError("VALIDATION_ERROR", "Invalid SLO comparator", 422);
    const existing = this.db.prepare("SELECT id FROM company_slos WHERE organization_id=? AND entity_id IS ? AND name=?")
      .get(auth.organization_id, entityId || null, text(input.name, "name", 100, true));
    const sloId = existing?.id || id("slo");
    const timestamp = now();
    this.db.prepare(`INSERT INTO company_slos(
      id,organization_id,entity_id,name,metric,comparator,target,window_seconds,enabled,created_at,updated_at
    ) VALUES(?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(organization_id,entity_id,name) DO UPDATE SET metric=excluded.metric,comparator=excluded.comparator,
      target=excluded.target,window_seconds=excluded.window_seconds,enabled=excluded.enabled,updated_at=excluded.updated_at`).run(
      sloId, auth.organization_id, entityId || null, text(input.name, "name", 100, true),
      text(input.metric, "metric", 100, true), comparator, number(input.target, "target"),
      integer(input.window_seconds || 3600, "window_seconds", 60, 31_536_000), input.enabled === false ? 0 : 1,
      timestamp, timestamp,
    );
    return this.db.prepare("SELECT * FROM company_slos WHERE id=?").get(sloId);
  }

  recordSloObservation(sloId, input = {}, auth) {
    this.assertRole(auth);
    const slo = this.db.prepare("SELECT * FROM company_slos WHERE id=? AND organization_id=? AND enabled=1").get(sloId, auth.organization_id);
    if (!slo) throw new RuntimeError("NOT_FOUND", "Enabled SLO not found", 404);
    const value = number(input.value, "value");
    const good = this.compare(value, slo.comparator, slo.target);
    if (input.evidence_id) this.runtime.evidence.get(auth, input.evidence_id);
    const row = {
      id: id("slo_observation"), organization_id: auth.organization_id, slo_id: sloId,
      value, good: good ? 1 : 0, evidence_id: input.evidence_id || null, observed_at: now(),
    };
    this.db.prepare(`INSERT INTO company_slo_observations(
      id,organization_id,slo_id,value,good,evidence_id,observed_at
    ) VALUES(?,?,?,?,?,?,?)`).run(...Object.values(row));
    if (!good) this.notify({
      entity_id: slo.entity_id, severity: "critical", type: "slo.breached",
      title: `SLO breached: ${slo.name}`,
      body: `${slo.metric} was ${value}; target is ${slo.comparator} ${slo.target}`,
      dedupe_key: `slo:${slo.id}:breached`,
    }, auth);
    return { ...row, good };
  }

  installVerticalPack(entityId, input = {}, auth) {
    this.assertRole(auth, ["admin"]);
    this.requireEntity(entityId, auth);
    const manifest = {
      schema_version: 1,
      name: text(input.name, "name", 100, true),
      version: text(input.version, "version", 40, true),
      entity_types: array(input.entity_types, "entity_types", 20),
      intelligence_sources: array(input.intelligence_sources, "intelligence_sources", 100),
      offers: array(input.offers, "offers", 100),
      workflows: array(input.workflows, "workflows", 100),
      metrics: array(input.metrics, "metrics", 100),
      policies: array(input.policies, "policies", 100),
      verification_commands: array(input.verification_commands, "verification_commands", 50),
    };
    if (!manifest.workflows.length || !manifest.metrics.length || !manifest.verification_commands.length) {
      throw new RuntimeError("PACK_INCOMPLETE", "Vertical pack requires workflows, metrics, and verification commands", 422);
    }
    const digest = sha256(canonical(manifest));
    const row = {
      id: id("vertical_pack"), organization_id: auth.organization_id, entity_id: entityId,
      name: manifest.name, version: manifest.version, manifest: canonical(manifest),
      manifest_sha256: digest, status: "installed", installed_at: now(), installed_by: auth.user_id,
    };
    this.db.prepare(`INSERT INTO company_vertical_packs(
      id,organization_id,entity_id,name,version,manifest,manifest_sha256,status,installed_at,installed_by
    ) VALUES(?,?,?,?,?,?,?,?,?,?)`).run(...Object.values(row));
    return { ...row, manifest };
  }

  verifyEvidence(entityId, auth) {
    const entity = this.requireEntity(entityId, auth);
    return this.runtime.evidence.verify(auth, { mission_id: entity.mission_id });
  }

  snapshot(entityId, auth) {
    const entity = this.requireEntity(entityId, auth);
    const count = (table, where = "entity_id=?") => this.db.prepare(`SELECT COUNT(*) count FROM ${table} WHERE organization_id=? AND ${where}`).get(auth.organization_id, entityId).count;
    const latestCycle = this.db.prepare(`SELECT * FROM company_operating_cycles
      WHERE organization_id=? AND entity_id=? ORDER BY updated_at DESC LIMIT 1`).get(auth.organization_id, entityId);
    const deployments = this.db.prepare(`SELECT * FROM company_deployments
      WHERE organization_id=? AND entity_id=? ORDER BY created_at DESC LIMIT 20`).all(auth.organization_id, entityId)
      .map((row) => ({ ...row, evidence: json(row.evidence, null) }));
    const experiments = this.db.prepare(`SELECT * FROM company_experiments
      WHERE organization_id=? AND entity_id=? ORDER BY created_at DESC LIMIT 20`).all(auth.organization_id, entityId)
      .map((row) => ({ ...row, result: json(row.result, null) }));
    const decisions = this.db.prepare(`SELECT * FROM company_decisions
      WHERE organization_id=? AND entity_id=? ORDER BY created_at DESC LIMIT 20`).all(auth.organization_id, entityId)
      .map((row) => this.expandDecision(row));
    const usage = this.db.prepare(`SELECT metric,unit,SUM(quantity) quantity,COUNT(*) events
      FROM company_usage_events WHERE organization_id=? AND entity_id=? GROUP BY metric,unit ORDER BY metric`)
      .all(auth.organization_id, entityId);
    return {
      schema_version: 1, generated_at: now(), entity, truth: this.currentTruth(entityId, auth),
      next_actions: this.rankNextActions(entityId, auth).actions.slice(0, 10),
      active_cycle: latestCycle ? this.expandCycle(latestCycle) : null,
      counts: {
        decisions: count("company_decisions"), experiments: count("company_experiments"),
        effects: count("company_effects"), sagas: count("company_sagas"),
        deployments: count("company_deployments"), notifications: count("company_notifications"),
        vertical_packs: count("company_vertical_packs"),
      },
      decisions, experiments, deployments, notifications: this.listNotifications(auth, entityId), usage,
      evidence_verification: this.verifyEvidence(entityId, auth),
    };
  }

  health() {
    const table = (name) => this.db.prepare(`SELECT COUNT(*) count FROM ${name}`).get().count;
    return {
      ok: true, service: "cyvx-company-control-plane", schema_version: 1,
      truth_transitions: table("company_truth_transitions"),
      decisions: table("company_decisions"), experiments: table("company_experiments"),
      cycles: table("company_operating_cycles"), effects: table("company_effects"),
      sagas: table("company_sagas"), providers: table("company_providers"),
      deployments: table("company_deployments"), notifications: table("company_notifications"),
      usage_events: table("company_usage_events"), slos: table("company_slos"),
      vertical_packs: table("company_vertical_packs"), action_types: table("company_action_registry"),
    };
  }

  compare(actual, comparator, target) {
    if (comparator === ">=") return actual >= target;
    if (comparator === "<=") return actual <= target;
    if (comparator === ">") return actual > target;
    if (comparator === "<") return actual < target;
    return actual === target;
  }

  log(event, auth, data) {
    this.logger.write("info", event, {
      organization_id: auth.organization_id, actor: auth.user_id,
      correlation_id: auth.correlation_id || null, ...data,
    });
  }
}

module.exports = {
  CompanyControlPlane,
  TRUTH_STATES,
  CYCLE_PHASES,
  ensureCompanyControlSchema,
};
