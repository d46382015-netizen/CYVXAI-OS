"use strict";

const crypto = require("node:crypto");
const { boundedString, positiveInteger } = require("./context");

const RISK_LEVELS = new Set(["low", "medium", "high", "critical"]);

function canonicalJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
}

function sha256(value) {
  return crypto.createHash("sha256").update(typeof value === "string" ? value : canonicalJson(value)).digest("hex");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeEvidence(evidence, output) {
  const source = Array.isArray(evidence) ? evidence : evidence ? [evidence] : [];
  const normalized = source.slice(0, 50).map((item, index) => {
    if (typeof item === "string") {
      return { type: "statement", value: boundedString(item, `evidence[${index}]`, 4000, true) };
    }
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new TypeError(`evidence[${index}] must be an object or string`);
    }
    return structuredClone(item);
  });
  normalized.push({
    type: "output_sha256",
    algorithm: "sha256",
    value: sha256(output),
  });
  return normalized;
}

class CapabilityError extends Error {
  constructor(code, message, status = 500, details = {}) {
    super(message);
    this.name = "CapabilityError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

class CapabilityRegistry {
  constructor(options = {}) {
    this.capabilities = new Map();
    this.logger = options.logger || console;
    this.onInvocation = typeof options.onInvocation === "function" ? options.onInvocation : null;
  }

  register(definition = {}) {
    const name = boundedString(definition.name, "capability.name", 160, true);
    if (!/^[a-z][a-z0-9_-]*(\.[a-z][a-z0-9_-]*)+$/.test(name)) {
      throw new TypeError("capability.name must be a dotted lowercase identifier");
    }
    if (this.capabilities.has(name)) throw new CapabilityError("CAPABILITY_EXISTS", `Capability ${name} is already registered`, 409);
    if (typeof definition.handler !== "function") throw new TypeError(`Capability ${name} requires a handler`);
    const riskLevel = boundedString(definition.risk_level || "medium", "capability.risk_level", 20, true);
    if (!RISK_LEVELS.has(riskLevel)) throw new TypeError(`Unsupported capability risk level ${riskLevel}`);
    const permission = boundedString(definition.permission || name, "capability.permission", 160, true);
    const capability = Object.freeze({
      name,
      version: boundedString(definition.version || "1.0.0", "capability.version", 40, true),
      description: boundedString(definition.description || name, "capability.description", 1000, true),
      permission,
      risk_level: riskLevel,
      timeout_ms: positiveInteger(definition.timeout_ms ?? 30000, "capability.timeout_ms", 100, 300000),
      retries: positiveInteger(definition.retries ?? 1, "capability.retries", 0, 5),
      idempotent: definition.idempotent !== false,
      validate: typeof definition.validate === "function" ? definition.validate : null,
      handler: definition.handler,
      metadata: structuredClone(definition.metadata || {}),
    });
    this.capabilities.set(name, capability);
    return this.describe(name);
  }

  unregister(name) {
    return this.capabilities.delete(String(name));
  }

  has(name) {
    return this.capabilities.has(String(name));
  }

  require(name) {
    const capability = this.capabilities.get(String(name));
    if (!capability) throw new CapabilityError("CAPABILITY_NOT_FOUND", `Capability ${name} is not registered`, 404);
    return capability;
  }

  describe(name) {
    const capability = this.require(name);
    return {
      name: capability.name,
      version: capability.version,
      description: capability.description,
      permission: capability.permission,
      risk_level: capability.risk_level,
      timeout_ms: capability.timeout_ms,
      retries: capability.retries,
      idempotent: capability.idempotent,
      metadata: structuredClone(capability.metadata),
    };
  }

  list() {
    return [...this.capabilities.keys()].sort().map((name) => this.describe(name));
  }

  async invoke(name, input, context, options = {}) {
    const capability = this.require(name);
    if (!context || typeof context.requirePermission !== "function") {
      throw new TypeError("A CYVX execution context is required");
    }
    context.requirePermission(capability.permission);
    context.consumeCapabilityInvocation();
    const invocationId = boundedString(options.invocation_id || `cap_${crypto.randomUUID().replace(/-/g, "")}`, "invocation_id", 120, true);
    const idempotencyKey = boundedString(options.idempotency_key || `${context.run_id}:${invocationId}`, "idempotency_key", 240, true);
    const payload = structuredClone(input ?? {});
    if (capability.validate) {
      const validation = await capability.validate(payload, context.snapshot());
      if (validation === false) throw new CapabilityError("CAPABILITY_INPUT_INVALID", `Input validation failed for ${name}`, 422);
    }
    const startedAt = new Date().toISOString();
    let lastError = null;
    let attempts = 0;
    for (let attempt = 0; attempt <= capability.retries; attempt += 1) {
      attempts = attempt + 1;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(new Error(`Capability ${name} timed out`)), capability.timeout_ms);
      try {
        const raw = await Promise.resolve(capability.handler(payload, {
          context: context.snapshot(),
          signal: controller.signal,
          invocation_id: invocationId,
          idempotency_key: idempotencyKey,
          attempt: attempts,
        }));
        const envelope = raw && typeof raw === "object" && !Array.isArray(raw) && (Object.hasOwn(raw, "output") || Object.hasOwn(raw, "evidence"))
          ? raw
          : { output: raw };
        const output = structuredClone(envelope.output ?? null);
        const result = {
          invocation_id: invocationId,
          idempotency_key: idempotencyKey,
          capability: capability.name,
          capability_version: capability.version,
          risk_level: capability.risk_level,
          status: "completed",
          attempts,
          started_at: startedAt,
          completed_at: new Date().toISOString(),
          duration_ms: Math.max(0, Date.now() - Date.parse(startedAt)),
          input_sha256: sha256(payload),
          output_sha256: sha256(output),
          output,
          evidence: normalizeEvidence(envelope.evidence, output),
          metrics: structuredClone(envelope.metrics || {}),
        };
        context.recordCapability(result);
        if (this.onInvocation) await this.onInvocation(result, context.snapshot());
        if (typeof this.logger.info === "function") this.logger.info({ event: "core.capability_completed", run_id: context.run_id, capability: name, invocation_id: invocationId, attempts, duration_ms: result.duration_ms });
        return result;
      } catch (error) {
        lastError = error;
        const retryable = attempt < capability.retries && error?.code !== "CORE_PERMISSION_DENIED" && error?.code !== "CAPABILITY_INPUT_INVALID";
        if (!retryable) break;
        await sleep(Math.min(5000, 250 * (2 ** attempt)));
      } finally {
        clearTimeout(timeout);
      }
    }
    const failed = {
      invocation_id: invocationId,
      idempotency_key: idempotencyKey,
      capability: capability.name,
      capability_version: capability.version,
      risk_level: capability.risk_level,
      status: "failed",
      attempts,
      started_at: startedAt,
      completed_at: new Date().toISOString(),
      duration_ms: Math.max(0, Date.now() - Date.parse(startedAt)),
      input_sha256: sha256(payload),
      error: {
        code: String(lastError?.code || "CAPABILITY_EXECUTION_FAILED").slice(0, 120),
        message: String(lastError?.message || lastError || "Capability execution failed").slice(0, 4000),
      },
    };
    context.recordCapability(failed);
    if (this.onInvocation) await this.onInvocation(failed, context.snapshot());
    if (typeof this.logger.error === "function") this.logger.error({ event: "core.capability_failed", run_id: context.run_id, capability: name, invocation_id: invocationId, attempts, error: failed.error.message });
    throw new CapabilityError(failed.error.code, failed.error.message, Number(lastError?.status || 500), { invocation: failed });
  }
}

module.exports = {
  RISK_LEVELS,
  CapabilityError,
  CapabilityRegistry,
  canonicalJson,
  sha256,
};
