"use strict";

const MAX_KEYS = 100;
const MAX_STRING = 2_000;

function validatePayload(kind, value) {
  assertObject(value, kind);
  assertCollectionSize(value, kind);

  if (kind === "workload") validateWorkload(value);
  else if (kind === "action") validateAction(value);
  else if (kind === "outcome") validateOutcome(value);
  else throw invalidPayload(`unsupported payload kind: ${kind}`);

  return value;
}

function validateWorkload(value) {
  optionalString(value, "id", 200);
  optionalString(value, "tenant", 200);
  optionalString(value, "name", 240);
  optionalNumber(value, "cpu_request", { min: 0.001, max: 1_000_000 });
  optionalNumber(value, "mem_request_mb", { min: 1, max: 1_000_000_000 });
  optionalNumber(value, "net_request_mb", { min: 0, max: 1_000_000_000 });
  optionalNumber(value, "replicas", { min: 1, max: 10_000, integer: true });
  optionalNumber(value, "target_latency_ms", { min: 1, max: 86_400_000 });
  optionalNumber(value, "target_availability", { min: 0, max: 1 });
  optionalObject(value, "constraints", 100);
}

function validateAction(value) {
  requiredString(value, "type", 80);
  if (!["scale_up", "scale_down", "migrate"].includes(value.type)) {
    throw invalidPayload("action.type must be scale_up, scale_down, or migrate", "type");
  }
  requiredString(value, "workload_id", 200);
  optionalString(value, "node_id", 200);
  optionalNumber(value, "replicas", { min: 1, max: 10_000, integer: true });

  if ((value.type === "scale_up" || value.type === "scale_down") && value.replicas == null) {
    throw invalidPayload("action.replicas is required for scale actions", "replicas");
  }
  if (value.type === "migrate" && !String(value.node_id || "").trim()) {
    throw invalidPayload("action.node_id is required for migrate", "node_id");
  }
}

function validateOutcome(value) {
  optionalString(value, "mission", 500);
  optionalString(value, "expectedOutcome", MAX_STRING);
  optionalString(value, "expected_outcome", MAX_STRING);
  optionalString(value, "actualOutcome", MAX_STRING);
  optionalString(value, "actual_outcome", MAX_STRING);
  optionalString(value, "success", 100);
  optionalString(value, "status", 100);
  if (value.succeeded != null && typeof value.succeeded !== "boolean") {
    throw invalidPayload("outcome.succeeded must be boolean", "succeeded");
  }
}

function assertObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw invalidPayload(`${label} payload must be a JSON object`);
  }
}

function assertCollectionSize(value, label) {
  const keys = Object.keys(value);
  if (keys.length > MAX_KEYS) throw invalidPayload(`${label} payload exceeds ${MAX_KEYS} top-level fields`);
}

function requiredString(object, key, maxLength) {
  if (typeof object[key] !== "string" || !object[key].trim()) {
    throw invalidPayload(`${key} is required and must be a non-empty string`, key);
  }
  optionalString(object, key, maxLength);
}

function optionalString(object, key, maxLength = MAX_STRING) {
  if (object[key] == null) return;
  if (typeof object[key] !== "string") throw invalidPayload(`${key} must be a string`, key);
  if (object[key].length > maxLength) throw invalidPayload(`${key} exceeds ${maxLength} characters`, key);
}

function optionalNumber(object, key, options = {}) {
  if (object[key] == null) return;
  if (typeof object[key] !== "number" || !Number.isFinite(object[key])) {
    throw invalidPayload(`${key} must be a finite number`, key);
  }
  if (options.integer && !Number.isInteger(object[key])) throw invalidPayload(`${key} must be an integer`, key);
  if (options.min != null && object[key] < options.min) throw invalidPayload(`${key} must be at least ${options.min}`, key);
  if (options.max != null && object[key] > options.max) throw invalidPayload(`${key} must be at most ${options.max}`, key);
}

function optionalObject(object, key, maxKeys) {
  if (object[key] == null) return;
  if (!object[key] || typeof object[key] !== "object" || Array.isArray(object[key])) {
    throw invalidPayload(`${key} must be an object`, key);
  }
  if (Object.keys(object[key]).length > maxKeys) throw invalidPayload(`${key} exceeds ${maxKeys} fields`, key);
}

function invalidPayload(message, field = null) {
  const error = new Error(message);
  error.code = "INVALID_PAYLOAD";
  error.statusCode = 422;
  error.field = field;
  return error;
}

module.exports = { invalidPayload, validatePayload };
