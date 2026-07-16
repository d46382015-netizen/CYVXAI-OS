"use strict";

const DEFAULT_POLICY = Object.freeze({
  mode: "approve_by_default",
  auto_approve_risks: ["low"],
  require_explicit_digest_risks: ["medium", "high"],
  auto_verify_mode: "full",
});

function approvalPolicy(config = {}, env = process.env) {
  const configured = config.approval_policy && typeof config.approval_policy === "object" ? config.approval_policy : {};
  const policy = {
    mode: String(configured.mode || DEFAULT_POLICY.mode).trim().toLowerCase(),
    auto_approve_risks: normalizeRisks(configured.auto_approve_risks || DEFAULT_POLICY.auto_approve_risks),
    require_explicit_digest_risks: normalizeRisks(configured.require_explicit_digest_risks || DEFAULT_POLICY.require_explicit_digest_risks),
    auto_verify_mode: normalizeVerifyMode(configured.auto_verify_mode || DEFAULT_POLICY.auto_verify_mode),
  };
  const override = env.CYVX_TOPOLOGY_APPROVE_BY_DEFAULT;
  if (override !== undefined && override !== null && override !== "") {
    policy.mode = booleanValue(override, true) ? "approve_by_default" : "explicit_approval";
  }
  return policy;
}

function stagePolicy(config, stageId, env = process.env) {
  const stage = (config.stages || []).find((item) => item.id === stageId);
  if (!stage) {
    const error = new Error(`Unknown topology stage: ${stageId}`);
    error.code = "TOPOLOGY_STAGE_NOT_FOUND";
    throw error;
  }
  const policy = approvalPolicy(config, env);
  const risk = String(stage.risk || "high").toLowerCase();
  const autoApproved = policy.mode === "approve_by_default" && policy.auto_approve_risks.includes(risk) && !policy.require_explicit_digest_risks.includes(risk);
  return {
    stage,
    risk,
    mode: policy.mode,
    auto_approved: autoApproved,
    approval_required: !autoApproved,
    default_verify_mode: autoApproved ? policy.auto_verify_mode : "quick",
  };
}

function annotatePlan(plan, config, env = process.env) {
  const decision = stagePolicy(config, plan.stage.id, env);
  return {
    ...plan,
    stage: {
      ...plan.stage,
      approval_required: decision.approval_required,
      approval_mode: decision.mode,
      auto_approved: decision.auto_approved,
    },
    approval: {
      ...plan.approval,
      mode: decision.mode,
      auto_approved: decision.auto_approved,
      explicit_digest_required: decision.approval_required,
    },
  };
}

function resolveApproval(topology, stageId, providedDigest, options = {}) {
  const plan = options.plan || topology.plan(stageId, { persist: true });
  const decision = stagePolicy(topology.config, stageId, options.env || process.env);
  const explicitDigest = String(providedDigest || "").trim();
  const digest = explicitDigest || (decision.auto_approved ? String(plan.approval.digest || "") : "");
  return {
    plan: annotatePlan(plan, topology.config, options.env || process.env),
    digest,
    verify_mode: options.verifyMode || decision.default_verify_mode,
    decision: {
      mode: decision.mode,
      risk: decision.risk,
      auto_approved: Boolean(!explicitDigest && decision.auto_approved),
      approval_source: explicitDigest ? "explicit_digest" : decision.auto_approved ? "policy" : "missing",
      approval_required: decision.approval_required,
    },
  };
}

function normalizeRisks(values) {
  return [...new Set((Array.isArray(values) ? values : []).map((value) => String(value).trim().toLowerCase()).filter((value) => ["low", "medium", "high"].includes(value)))];
}

function normalizeVerifyMode(value) {
  const mode = String(value || "full").trim().toLowerCase();
  return ["none", "quick", "full"].includes(mode) ? mode : "full";
}

function booleanValue(value, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  return [true, "true", "1", "yes", "on"].includes(typeof value === "string" ? value.toLowerCase() : value);
}

module.exports = {
  DEFAULT_POLICY,
  annotatePlan,
  approvalPolicy,
  resolveApproval,
  stagePolicy,
};
