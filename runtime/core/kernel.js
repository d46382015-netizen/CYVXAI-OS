"use strict";

const crypto = require("node:crypto");
const path = require("node:path");
const { ExecutionContext, LIFECYCLE, boundedString, positiveInteger } = require("./context");
const { CapabilityRegistry, CapabilityError, sha256 } = require("./capability-registry");
const { registerBuiltinCapabilities } = require("./builtins");

const RUN_STATES = new Set(["running", "completed", "failed", "cancelled"]);
const REDACT_PATTERN = /(authorization|password|passwd|secret|token|api[_-]?key|private[_-]?key|cookie)/i;

function now() {
  return new Date().toISOString();
}

function parseJson(value, fallback = null) {
  if (value === null || value === undefined || value === "") return fallback;
  if (typeof value !== "string") return value;
  try { return JSON.parse(value); } catch { return fallback; }
}

function redact(value, depth = 0) {
  if (depth > 12) return "[MAX_DEPTH]";
  if (Array.isArray(value)) return value.slice(0, 500).map((entry) => redact(entry, depth + 1));
  if (!value || typeof value !== "object") return value;
  const output = {};
  for (const [key, entry] of Object.entries(value).slice(0, 500)) {
    output[key] = REDACT_PATTERN.test(key) ? "[REDACTED]" : redact(entry, depth + 1);
  }
  return output;
}

function checkedJson(value, name, maximumBytes = 2 * 1024 * 1024) {
  const body = JSON.stringify(redact(value));
  if (Buffer.byteLength(body) > maximumBytes) {
    const error = new Error(`${name} exceeds ${maximumBytes} bytes`);
    error.code = "CORE_PAYLOAD_TOO_LARGE";
    error.status = 413;
    throw error;
  }
  return body;
}

function ensureSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS core_runs (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      correlation_id TEXT NOT NULL,
      causation_id TEXT,
      idempotency_key TEXT,
      objective TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('running','completed','failed','cancelled')),
      request_json TEXT NOT NULL,
      context_json TEXT NOT NULL,
      error_json TEXT,
      started_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      completed_at TEXT,
      UNIQUE(organization_id,idempotency_key)
    );
    CREATE INDEX IF NOT EXISTS idx_core_runs_org_time ON core_runs(organization_id,started_at DESC);
    CREATE INDEX IF NOT EXISTS idx_core_runs_status ON core_runs(organization_id,status,updated_at DESC);

    CREATE TABLE IF NOT EXISTS core_stage_events (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL,
      run_id TEXT NOT NULL,
      stage TEXT NOT NULL,
      status TEXT NOT NULL,
      output_json TEXT,
      output_sha256 TEXT,
      error_json TEXT,
      started_at TEXT,
      completed_at TEXT,
      duration_ms INTEGER,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(run_id,stage)
    );
    CREATE INDEX IF NOT EXISTS idx_core_stage_run ON core_stage_events(run_id,created_at);

    CREATE TABLE IF NOT EXISTS core_capability_invocations (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL,
      run_id TEXT NOT NULL,
      capability TEXT NOT NULL,
      capability_version TEXT NOT NULL,
      risk_level TEXT NOT NULL,
      idempotency_key TEXT NOT NULL,
      status TEXT NOT NULL,
      attempts INTEGER NOT NULL,
      input_sha256 TEXT NOT NULL,
      output_sha256 TEXT,
      result_json TEXT NOT NULL,
      error_json TEXT,
      started_at TEXT NOT NULL,
      completed_at TEXT NOT NULL,
      duration_ms INTEGER NOT NULL,
      UNIQUE(organization_id,capability,idempotency_key)
    );
    CREATE INDEX IF NOT EXISTS idx_core_invocations_run ON core_capability_invocations(run_id,started_at);
    CREATE INDEX IF NOT EXISTS idx_core_invocations_reliability ON core_capability_invocations(organization_id,capability,status,completed_at DESC);

    CREATE TABLE IF NOT EXISTS core_learning_records (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL,
      run_id TEXT,
      subject TEXT NOT NULL,
      outcome TEXT NOT NULL,
      lesson TEXT NOT NULL,
      evidence TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_core_learning_org_time ON core_learning_records(organization_id,created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_core_learning_subject ON core_learning_records(organization_id,subject,created_at DESC);

    CREATE TABLE IF NOT EXISTS core_events (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL,
      run_id TEXT NOT NULL,
      type TEXT NOT NULL,
      payload TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_core_events_run ON core_events(run_id,created_at);
  `);
}

function valueAtPath(root, expression) {
  const parts = String(expression || "").split(".").filter(Boolean);
  let current = root;
  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== "object") return undefined;
    current = current[part];
  }
  return current;
}

function compare(actual, operator, expected) {
  switch (operator) {
    case "eq": return Object.is(actual, expected);
    case "neq": return !Object.is(actual, expected);
    case "gt": return Number(actual) > Number(expected);
    case "gte": return Number(actual) >= Number(expected);
    case "lt": return Number(actual) < Number(expected);
    case "lte": return Number(actual) <= Number(expected);
    case "includes": return typeof actual === "string" || Array.isArray(actual) ? actual.includes(expected) : false;
    case "exists": return expected === false ? actual === undefined : actual !== undefined;
    default: throw new TypeError(`Unsupported success criterion operator ${operator}`);
  }
}

class CoreRuntimeError extends Error {
  constructor(code, message, status = 500, details = {}) {
    super(message);
    this.name = "CoreRuntimeError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

class CyvxCore {
  constructor(options = {}) {
    if (!options.db) throw new TypeError("CYVX Core requires a durable database");
    this.db = options.db;
    this.logger = options.logger || console;
    this.workspaceRoot = path.resolve(options.workspaceRoot || process.cwd());
    this.maxRecall = positiveInteger(options.maxRecall ?? 20, "maxRecall", 1, 200);
    this.processors = options.processors || {};
    ensureSchema(this.db);

    this.registry = options.registry || new CapabilityRegistry({ logger: this.logger });
    const priorInvocationHook = this.registry.onInvocation;
    this.registry.onInvocation = async (result, snapshot) => {
      this.persistInvocation(result, snapshot);
      if (priorInvocationHook) await priorInvocationHook(result, snapshot);
    };
    if (options.registerBuiltins !== false) {
      const builtins = ["runtime.inspect", "filesystem.write", "filesystem.read", "learning.record"];
      if (!builtins.some((name) => this.registry.has(name))) {
        registerBuiltinCapabilities(this.registry, { db: this.db, workspaceRoot: this.workspaceRoot });
      }
    }
  }

  log(level, event, payload = {}) {
    const record = { event, timestamp: now(), ...payload };
    if (typeof this.logger.write === "function") this.logger.write(level, event, payload);
    else if (typeof this.logger[level] === "function") this.logger[level](record);
    else if (typeof this.logger.log === "function") this.logger.log(record);
  }

  emit(context, type, payload = {}) {
    const event = {
      id: `coreevt_${crypto.randomUUID().replace(/-/g, "")}`,
      organization_id: context.organization_id,
      run_id: context.run_id,
      type,
      payload: redact(payload),
      created_at: now(),
    };
    this.db.prepare("INSERT INTO core_events(id,organization_id,run_id,type,payload,created_at) VALUES(?,?,?,?,?,?)")
      .run(event.id, event.organization_id, event.run_id, event.type, JSON.stringify(event.payload), event.created_at);
    this.log("info", type, { organization_id: event.organization_id, run_id: event.run_id, ...event.payload });
    return event;
  }

  persistRun(context, idempotencyKey = null) {
    const snapshot = context.snapshot();
    const objective = boundedString(snapshot.request?.objective || snapshot.request?.goal || "CYVX Core request", "objective", 2000, true);
    this.db.prepare(`INSERT INTO core_runs(
      id,organization_id,user_id,correlation_id,causation_id,idempotency_key,objective,status,request_json,context_json,error_json,started_at,updated_at,completed_at
    ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET
      status=excluded.status,context_json=excluded.context_json,error_json=excluded.error_json,updated_at=excluded.updated_at,completed_at=excluded.completed_at`)
      .run(
        snapshot.run_id,
        snapshot.organization_id,
        snapshot.user_id,
        snapshot.correlation_id,
        snapshot.causation_id,
        idempotencyKey,
        objective,
        snapshot.status,
        checkedJson(snapshot.request, "request"),
        checkedJson(snapshot, "execution context"),
        snapshot.failure ? JSON.stringify(snapshot.failure) : null,
        snapshot.started_at,
        snapshot.updated_at,
        snapshot.completed_at,
      );
  }

  persistStage(context, name) {
    const stage = context.stages[name];
    const output = context.stage_outputs[name];
    const timestamp = now();
    this.db.prepare(`INSERT INTO core_stage_events(
      id,organization_id,run_id,stage,status,output_json,output_sha256,error_json,started_at,completed_at,duration_ms,created_at,updated_at
    ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(run_id,stage) DO UPDATE SET
      status=excluded.status,output_json=excluded.output_json,output_sha256=excluded.output_sha256,error_json=excluded.error_json,
      started_at=excluded.started_at,completed_at=excluded.completed_at,duration_ms=excluded.duration_ms,updated_at=excluded.updated_at`)
      .run(
        `corestage_${context.run_id}_${name}`,
        context.organization_id,
        context.run_id,
        name,
        stage.status,
        output === undefined ? null : checkedJson(output, `${name} output`),
        output === undefined ? null : sha256(redact(output)),
        stage.error ? JSON.stringify(stage.error) : null,
        stage.started_at,
        stage.completed_at,
        stage.duration_ms,
        timestamp,
        timestamp,
      );
  }

  persistInvocation(result, snapshot) {
    const error = result.error || null;
    this.db.prepare(`INSERT INTO core_capability_invocations(
      id,organization_id,run_id,capability,capability_version,risk_level,idempotency_key,status,attempts,input_sha256,output_sha256,result_json,error_json,started_at,completed_at,duration_ms
    ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(organization_id,capability,idempotency_key) DO UPDATE SET
      status=excluded.status,attempts=excluded.attempts,output_sha256=excluded.output_sha256,result_json=excluded.result_json,
      error_json=excluded.error_json,completed_at=excluded.completed_at,duration_ms=excluded.duration_ms`)
      .run(
        result.invocation_id,
        snapshot.organization_id,
        snapshot.run_id,
        result.capability,
        result.capability_version,
        result.risk_level,
        result.idempotency_key,
        result.status,
        Number(result.attempts || 0),
        result.input_sha256,
        result.output_sha256 || null,
        checkedJson(result, "capability result"),
        error ? JSON.stringify(error) : null,
        result.started_at,
        result.completed_at,
        Number(result.duration_ms || 0),
      );
  }

  async processStage(name, context) {
    context.startStage(name);
    this.persistStage(context, name);
    this.persistRun(context);
    this.emit(context, `core.stage.${name}.started`);
    try {
      const processor = this.processors[name] || this[`default_${name}`].bind(this);
      const output = await processor({ context, state: context.state, request: context.request, core: this });
      context.completeStage(name, output ?? {});
      this.persistStage(context, name);
      this.persistRun(context);
      this.emit(context, `core.stage.${name}.completed`, { duration_ms: context.stages[name].duration_ms, output_sha256: sha256(redact(output ?? {})) });
      return output;
    } catch (error) {
      context.failStage(name, error);
      this.persistStage(context, name);
      this.persistRun(context);
      this.emit(context, `core.stage.${name}.failed`, { code: error?.code || "CORE_STAGE_FAILED", error: error?.message || String(error) });
      throw error;
    }
  }

  async run(request = {}, principal = {}, options = {}) {
    if (!request || typeof request !== "object" || Array.isArray(request)) throw new CoreRuntimeError("CORE_REQUEST_INVALID", "CYVX Core request must be an object", 422);
    const objective = boundedString(request.objective || request.goal, "request.objective", 2000, true);
    const idempotencyKey = options.idempotency_key || request.idempotency_key || null;
    if (idempotencyKey) {
      const key = boundedString(idempotencyKey, "idempotency_key", 240, true);
      const prior = this.db.prepare("SELECT id,status FROM core_runs WHERE organization_id=? AND idempotency_key=?")
        .get(principal.organization_id || "default", key);
      if (prior) return { reused: true, run: this.getRun(prior.id, principal) };
    }
    const context = new ExecutionContext({
      request: { ...request, objective },
      organization_id: principal.organization_id || "default",
      user_id: principal.user_id || "system",
      role: principal.role || "agent",
      permissions: principal.permissions || [],
      correlation_id: options.correlation_id || principal.correlation_id,
      causation_id: options.causation_id || principal.causation_id,
      budget: options.budget || request.budget,
      metadata: options.metadata || {},
    });
    const normalizedKey = idempotencyKey ? boundedString(idempotencyKey, "idempotency_key", 240, true) : null;
    this.persistRun(context, normalizedKey);
    this.emit(context, "core.run.started", { objective });
    try {
      for (const stage of LIFECYCLE) await this.processStage(stage, context);
      context.complete();
      this.persistRun(context, normalizedKey);
      this.emit(context, "core.run.completed", { duration_ms: Date.parse(context.completed_at) - Date.parse(context.started_at), capability_invocations: context.capability_results.length });
      return { reused: false, run: this.getRun(context.run_id, principal) };
    } catch (error) {
      this.recordFailureLearning(context, error);
      this.persistRun(context, normalizedKey);
      const wrapped = error instanceof CoreRuntimeError || error instanceof CapabilityError
        ? error
        : new CoreRuntimeError(error?.code || "CORE_RUN_FAILED", error?.message || String(error), Number(error?.status || 500));
      wrapped.details = { ...(wrapped.details || {}), run_id: context.run_id };
      throw wrapped;
    }
  }

  async default_observe({ request }) {
    const operations = Array.isArray(request.operations) ? request.operations : request.capability ? [{ capability: request.capability, input: request.input || {} }] : [];
    return {
      objective: boundedString(request.objective, "request.objective", 2000, true),
      constraints: Array.isArray(request.constraints) ? request.constraints.slice(0, 100) : [],
      success_criteria: Array.isArray(request.success_criteria) ? request.success_criteria.slice(0, 100) : [],
      requested_operations: operations.length,
      observed_at: now(),
    };
  }

  async default_understand({ request }) {
    const operations = Array.isArray(request.operations) ? request.operations : request.capability ? [{ capability: request.capability }] : [];
    const capabilities = operations.map((operation) => boundedString(operation.capability, "operation.capability", 160, true));
    const risks = capabilities.map((name) => this.registry.require(name).risk_level);
    const rank = { low: 1, medium: 2, high: 3, critical: 4 };
    const risk_level = risks.sort((a, b) => rank[b] - rank[a])[0] || "low";
    return {
      intent: boundedString(request.intent || capabilities[0]?.split(".")[0] || "operate", "request.intent", 120, true),
      capabilities,
      risk_level,
      requires_approval: risk_level === "critical" || Boolean(request.requires_approval),
      assumptions: Array.isArray(request.assumptions) ? request.assumptions.slice(0, 100) : [],
    };
  }

  async default_recall({ context, request }) {
    const subject = boundedString(request.memory_subject || request.objective, "memory_subject", 240, true);
    const rows = this.db.prepare(`SELECT * FROM core_learning_records
      WHERE organization_id=? AND (subject=? OR lesson LIKE ?)
      ORDER BY created_at DESC LIMIT ?`).all(context.organization_id, subject, `%${subject.slice(0, 80)}%`, this.maxRecall);
    const reliability = this.db.prepare(`SELECT capability,
      COUNT(*) AS attempts,
      SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) AS successes,
      AVG(duration_ms) AS average_duration_ms
      FROM core_capability_invocations WHERE organization_id=? GROUP BY capability ORDER BY capability`).all(context.organization_id);
    return {
      subject,
      memories: rows.map((row) => ({ ...row, evidence: parseJson(row.evidence, {}) })),
      capability_reliability: reliability.map((row) => ({
        capability: row.capability,
        attempts: Number(row.attempts),
        successes: Number(row.successes),
        success_rate: Number(row.attempts) ? Number(row.successes) / Number(row.attempts) : null,
        average_duration_ms: row.average_duration_ms === null ? null : Number(row.average_duration_ms),
      })),
    };
  }

  async default_plan({ request }) {
    const source = Array.isArray(request.operations)
      ? request.operations
      : request.capability
        ? [{ id: "operation-1", capability: request.capability, input: request.input || {} }]
        : [];
    if (!source.length) throw new CoreRuntimeError("CORE_PLAN_EMPTY", "At least one capability operation is required", 422);
    const ids = new Set();
    const tasks = source.slice(0, 100).map((operation, index) => {
      if (!operation || typeof operation !== "object" || Array.isArray(operation)) throw new CoreRuntimeError("CORE_PLAN_INVALID", `Operation ${index} must be an object`, 422);
      const id = boundedString(operation.id || `operation-${index + 1}`, `operations[${index}].id`, 120, true);
      if (ids.has(id)) throw new CoreRuntimeError("CORE_PLAN_INVALID", `Duplicate operation id ${id}`, 422);
      ids.add(id);
      const capability = boundedString(operation.capability, `operations[${index}].capability`, 160, true);
      this.registry.require(capability);
      return {
        id,
        capability,
        input: structuredClone(operation.input || {}),
        depends_on: Array.isArray(operation.depends_on) ? operation.depends_on.map((entry) => boundedString(entry, "depends_on", 120, true)) : [],
        idempotency_key: operation.idempotency_key ? boundedString(operation.idempotency_key, "operation.idempotency_key", 240, true) : null,
      };
    });
    for (const task of tasks) {
      const missing = task.depends_on.find((dependency) => !ids.has(dependency));
      if (missing) throw new CoreRuntimeError("CORE_PLAN_INVALID", `Operation ${task.id} depends on unknown operation ${missing}`, 422);
      if (task.depends_on.includes(task.id)) throw new CoreRuntimeError("CORE_PLAN_INVALID", `Operation ${task.id} cannot depend on itself`, 422);
    }
    return { objective: request.objective, tasks, task_count: tasks.length, execution_mode: "dependency_ordered_sequential" };
  }

  async default_execute({ context, state }) {
    const tasks = state.plan?.tasks || [];
    const pending = new Map(tasks.map((task) => [task.id, task]));
    const completed = new Map();
    const ordered = [];
    while (pending.size) {
      const runnable = [...pending.values()].filter((task) => task.depends_on.every((dependency) => completed.has(dependency)));
      if (!runnable.length) throw new CoreRuntimeError("CORE_PLAN_CYCLE", "Capability plan contains a dependency cycle", 409);
      for (const task of runnable) {
        const result = await this.registry.invoke(task.capability, task.input, context, {
          invocation_id: `cap_${context.run_id}_${task.id}`.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 120),
          idempotency_key: task.idempotency_key || `${context.run_id}:${task.id}`,
        });
        completed.set(task.id, result);
        ordered.push({ task_id: task.id, ...result });
        pending.delete(task.id);
      }
    }
    return { status: "completed", completed_tasks: ordered.length, results: ordered };
  }

  async default_verify({ request, state }) {
    const results = state.execute?.results || [];
    const failures = results.filter((result) => result.status !== "completed");
    const missingEvidence = results.filter((result) => !Array.isArray(result.evidence) || !result.evidence.some((item) => item.type === "output_sha256"));
    const criteria = (Array.isArray(request.success_criteria) ? request.success_criteria : []).map((criterion, index) => {
      if (!criterion || typeof criterion !== "object") throw new CoreRuntimeError("CORE_CRITERION_INVALID", `Success criterion ${index} must be an object`, 422);
      const actual = valueAtPath(state, criterion.path);
      const passed = compare(actual, criterion.operator || "eq", criterion.value);
      return { path: criterion.path, operator: criterion.operator || "eq", expected: criterion.value, actual, passed };
    });
    const passed = failures.length === 0 && missingEvidence.length === 0 && criteria.every((criterion) => criterion.passed);
    if (!passed) throw new CoreRuntimeError("CORE_VERIFICATION_FAILED", "CYVX Core verification failed", 409, {
      failures: failures.map((result) => result.task_id),
      missing_evidence: missingEvidence.map((result) => result.task_id),
      criteria,
    });
    return {
      passed: true,
      capability_results_verified: results.length,
      evidence_records: results.reduce((count, result) => count + result.evidence.length, 0),
      criteria,
      verified_at: now(),
    };
  }

  async default_learn({ context, request, state }) {
    const recordId = `corelearn_${crypto.randomUUID().replace(/-/g, "")}`;
    const successful = state.execute?.results?.map((result) => result.capability) || [];
    const lesson = successful.length
      ? `Completed and verified ${successful.length} capability operations: ${successful.join(", ")}.`
      : "The run completed without capability operations.";
    const evidence = {
      run_id: context.run_id,
      verification: state.verify,
      stage_durations_ms: Object.fromEntries(LIFECYCLE.map((stage) => [stage, context.stages[stage].duration_ms])),
      capability_output_sha256: (state.execute?.results || []).map((result) => ({ capability: result.capability, sha256: result.output_sha256 })),
    };
    this.db.prepare("INSERT INTO core_learning_records(id,organization_id,run_id,subject,outcome,lesson,evidence,created_at) VALUES(?,?,?,?,?,?,?,?)")
      .run(recordId, context.organization_id, context.run_id, boundedString(request.memory_subject || request.objective, "learning subject", 240, true), "completed", lesson, JSON.stringify(evidence), now());
    return { learning_id: recordId, outcome: "completed", lesson, evidence };
  }

  recordFailureLearning(context, error) {
    const recordId = `corelearn_${crypto.randomUUID().replace(/-/g, "")}`;
    const failedStage = Object.values(context.stages).find((stage) => stage.status === "failed")?.name || context.current_stage || "unknown";
    const evidence = {
      run_id: context.run_id,
      failed_stage: failedStage,
      error: { code: error?.code || "CORE_RUN_FAILED", message: String(error?.message || error).slice(0, 4000) },
      completed_capabilities: context.capability_results.filter((result) => result.status === "completed").map((result) => ({ capability: result.capability, output_sha256: result.output_sha256 })),
    };
    this.db.prepare("INSERT INTO core_learning_records(id,organization_id,run_id,subject,outcome,lesson,evidence,created_at) VALUES(?,?,?,?,?,?,?,?)")
      .run(recordId, context.organization_id, context.run_id, boundedString(context.request.memory_subject || context.request.objective, "learning subject", 240, true), "failed", `Run failed during ${failedStage}: ${String(error?.message || error).slice(0, 3000)}`, JSON.stringify(evidence), now());
    this.emit(context, "core.learning.failure_recorded", { learning_id: recordId, failed_stage: failedStage });
    return recordId;
  }

  getRun(runId, principal = {}) {
    const organizationId = principal.organization_id || "default";
    const row = this.db.prepare("SELECT * FROM core_runs WHERE id=? AND organization_id=?").get(runId, organizationId);
    if (!row) throw new CoreRuntimeError("CORE_RUN_NOT_FOUND", "CYVX Core run not found", 404);
    if (!RUN_STATES.has(row.status)) throw new CoreRuntimeError("CORE_RUN_CORRUPT", `Unsupported run status ${row.status}`, 500);
    const stages = this.db.prepare("SELECT * FROM core_stage_events WHERE run_id=? AND organization_id=? ORDER BY created_at").all(runId, organizationId)
      .map((stage) => ({ ...stage, output: parseJson(stage.output_json), error: parseJson(stage.error_json) }));
    const invocations = this.db.prepare("SELECT * FROM core_capability_invocations WHERE run_id=? AND organization_id=? ORDER BY started_at").all(runId, organizationId)
      .map((invocation) => ({ ...invocation, result: parseJson(invocation.result_json), error: parseJson(invocation.error_json) }));
    const learning = this.db.prepare("SELECT * FROM core_learning_records WHERE run_id=? AND organization_id=? ORDER BY created_at").all(runId, organizationId)
      .map((record) => ({ ...record, evidence: parseJson(record.evidence, {}) }));
    const events = this.db.prepare("SELECT * FROM core_events WHERE run_id=? AND organization_id=? ORDER BY created_at").all(runId, organizationId)
      .map((event) => ({ ...event, payload: parseJson(event.payload, {}) }));
    return {
      id: row.id,
      organization_id: row.organization_id,
      user_id: row.user_id,
      correlation_id: row.correlation_id,
      causation_id: row.causation_id,
      idempotency_key: row.idempotency_key,
      objective: row.objective,
      status: row.status,
      request: parseJson(row.request_json, {}),
      context: parseJson(row.context_json, {}),
      error: parseJson(row.error_json),
      started_at: row.started_at,
      updated_at: row.updated_at,
      completed_at: row.completed_at,
      stages,
      invocations,
      learning,
      events,
    };
  }

  listRuns(principal = {}, options = {}) {
    const organizationId = principal.organization_id || "default";
    const limit = positiveInteger(options.limit ?? 50, "limit", 1, 200);
    const status = options.status ? boundedString(options.status, "status", 40, true) : null;
    if (status && !RUN_STATES.has(status)) throw new CoreRuntimeError("CORE_STATUS_INVALID", `Unsupported run status ${status}`, 422);
    const rows = status
      ? this.db.prepare("SELECT id,objective,status,user_id,correlation_id,started_at,updated_at,completed_at FROM core_runs WHERE organization_id=? AND status=? ORDER BY started_at DESC LIMIT ?").all(organizationId, status, limit)
      : this.db.prepare("SELECT id,objective,status,user_id,correlation_id,started_at,updated_at,completed_at FROM core_runs WHERE organization_id=? ORDER BY started_at DESC LIMIT ?").all(organizationId, limit);
    return rows;
  }
}

module.exports = {
  RUN_STATES,
  CoreRuntimeError,
  CyvxCore,
  ensureSchema,
  redact,
  checkedJson,
  valueAtPath,
  compare,
};
