"use strict";

const crypto = require("node:crypto");

const LIFECYCLE = Object.freeze([
  "observe",
  "understand",
  "recall",
  "plan",
  "execute",
  "verify",
  "learn",
]);

const STAGE_STATES = new Set(["pending", "running", "completed", "failed", "skipped"]);

function now() {
  return new Date().toISOString();
}

function clone(value) {
  if (value === undefined) return undefined;
  return structuredClone(value);
}

function boundedString(value, name, maximum = 2000, required = false) {
  const output = String(value ?? "").trim();
  if (required && !output) throw new TypeError(`${name} is required`);
  if (output.length > maximum) throw new TypeError(`${name} exceeds ${maximum} characters`);
  return output;
}

function positiveInteger(value, name, minimum = 0, maximum = Number.MAX_SAFE_INTEGER) {
  const output = Number(value);
  if (!Number.isInteger(output) || output < minimum || output > maximum) {
    throw new TypeError(`${name} must be an integer from ${minimum} to ${maximum}`);
  }
  return output;
}

function normalizePermissions(value) {
  const source = Array.isArray(value) ? value : [];
  return [...new Set(source.map((permission) => boundedString(permission, "permission", 120, true)))].sort();
}

class ExecutionContext {
  constructor(input = {}) {
    this.run_id = boundedString(input.run_id || `core_${crypto.randomUUID().replace(/-/g, "")}`, "run_id", 120, true);
    this.organization_id = boundedString(input.organization_id || "default", "organization_id", 120, true);
    this.user_id = boundedString(input.user_id || "system", "user_id", 120, true);
    this.role = boundedString(input.role || "agent", "role", 40, true);
    this.correlation_id = boundedString(input.correlation_id || this.run_id, "correlation_id", 160, true);
    this.causation_id = input.causation_id ? boundedString(input.causation_id, "causation_id", 160, true) : null;
    this.request = clone(input.request || {});
    this.permissions = normalizePermissions(input.permissions || []);
    this.metadata = clone(input.metadata || {});
    this.started_at = input.started_at || now();
    this.updated_at = this.started_at;
    this.completed_at = null;
    this.status = "running";
    this.failure = null;
    this.current_stage = null;
    this.state = {};
    this.stage_outputs = {};
    this.capability_results = [];
    this.budget = {
      max_capability_invocations: positiveInteger(input.budget?.max_capability_invocations ?? 100, "max_capability_invocations", 1, 10000),
      max_duration_ms: positiveInteger(input.budget?.max_duration_ms ?? 300000, "max_duration_ms", 1000, 86400000),
      capability_invocations: 0,
    };
    this.stages = Object.fromEntries(LIFECYCLE.map((name) => [name, {
      name,
      status: "pending",
      started_at: null,
      completed_at: null,
      duration_ms: null,
      error: null,
    }]));
  }

  hasPermission(permission) {
    return this.permissions.includes("*") || this.permissions.includes(permission);
  }

  requirePermission(permission) {
    if (!this.hasPermission(permission)) {
      const error = new Error(`Permission ${permission} is required`);
      error.code = "CORE_PERMISSION_DENIED";
      error.status = 403;
      throw error;
    }
  }

  startStage(name) {
    if (!LIFECYCLE.includes(name)) throw new TypeError(`Unknown lifecycle stage ${name}`);
    const stage = this.stages[name];
    if (stage.status !== "pending") throw new Error(`Stage ${name} cannot start from ${stage.status}`);
    const index = LIFECYCLE.indexOf(name);
    const incompletePrior = LIFECYCLE.slice(0, index).find((prior) => !["completed", "skipped"].includes(this.stages[prior].status));
    if (incompletePrior) throw new Error(`Stage ${name} cannot start before ${incompletePrior}`);
    stage.status = "running";
    stage.started_at = now();
    this.current_stage = name;
    this.updated_at = stage.started_at;
    return clone(stage);
  }

  completeStage(name, output) {
    const stage = this.stages[name];
    if (!stage || stage.status !== "running") throw new Error(`Stage ${name} is not running`);
    stage.status = "completed";
    stage.completed_at = now();
    stage.duration_ms = Math.max(0, Date.parse(stage.completed_at) - Date.parse(stage.started_at));
    this.stage_outputs[name] = clone(output);
    this.state[name] = clone(output);
    this.current_stage = null;
    this.updated_at = stage.completed_at;
    return clone(stage);
  }

  failStage(name, error) {
    const stage = this.stages[name];
    if (!stage || !STAGE_STATES.has(stage.status)) throw new Error(`Unknown stage ${name}`);
    if (stage.status === "completed") throw new Error(`Completed stage ${name} cannot fail`);
    stage.status = "failed";
    stage.started_at = stage.started_at || now();
    stage.completed_at = now();
    stage.duration_ms = Math.max(0, Date.parse(stage.completed_at) - Date.parse(stage.started_at));
    stage.error = {
      code: String(error?.code || "CORE_STAGE_FAILED").slice(0, 120),
      message: String(error?.message || error || "Stage failed").slice(0, 4000),
    };
    this.status = "failed";
    this.failure = clone(stage.error);
    this.current_stage = null;
    this.completed_at = stage.completed_at;
    this.updated_at = stage.completed_at;
    return clone(stage);
  }

  consumeCapabilityInvocation() {
    this.budget.capability_invocations += 1;
    if (this.budget.capability_invocations > this.budget.max_capability_invocations) {
      const error = new Error("Capability invocation budget exceeded");
      error.code = "CORE_BUDGET_EXCEEDED";
      error.status = 429;
      throw error;
    }
    if (Date.now() - Date.parse(this.started_at) > this.budget.max_duration_ms) {
      const error = new Error("Execution duration budget exceeded");
      error.code = "CORE_BUDGET_EXCEEDED";
      error.status = 408;
      throw error;
    }
  }

  recordCapability(result) {
    this.capability_results.push(clone(result));
    this.updated_at = now();
  }

  complete() {
    if (this.status === "failed") return this.snapshot();
    const incomplete = LIFECYCLE.find((stage) => this.stages[stage].status !== "completed");
    if (incomplete) throw new Error(`Cannot complete run before ${incomplete}`);
    this.status = "completed";
    this.completed_at = now();
    this.updated_at = this.completed_at;
    return this.snapshot();
  }

  snapshot() {
    return clone({
      run_id: this.run_id,
      organization_id: this.organization_id,
      user_id: this.user_id,
      role: this.role,
      correlation_id: this.correlation_id,
      causation_id: this.causation_id,
      request: this.request,
      permissions: this.permissions,
      metadata: this.metadata,
      started_at: this.started_at,
      updated_at: this.updated_at,
      completed_at: this.completed_at,
      status: this.status,
      failure: this.failure,
      current_stage: this.current_stage,
      state: this.state,
      stage_outputs: this.stage_outputs,
      capability_results: this.capability_results,
      budget: this.budget,
      stages: this.stages,
    });
  }
}

module.exports = {
  LIFECYCLE,
  STAGE_STATES,
  ExecutionContext,
  boundedString,
  positiveInteger,
  normalizePermissions,
};
