"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { annotatePlan, resolveApproval, stagePolicy } = require("../services/topology-consolidation/approval-policy");

function config() {
  return {
    approval_policy: {
      mode: "approve_by_default",
      auto_approve_risks: ["low"],
      require_explicit_digest_risks: ["medium", "high"],
      auto_verify_mode: "full",
    },
    stages: [
      { id: "low-stage", risk: "low" },
      { id: "medium-stage", risk: "medium" },
      { id: "high-stage", risk: "high" },
    ],
  };
}

function plan(stageId, risk) {
  return {
    ok: true,
    stage: { id: stageId, risk, approval_required: true },
    approval: { digest: "a".repeat(64) },
  };
}

test("low-risk stages approve by default with full verification", () => {
  const decision = stagePolicy(config(), "low-stage", {});
  assert.equal(decision.auto_approved, true);
  assert.equal(decision.approval_required, false);
  assert.equal(decision.default_verify_mode, "full");
});

test("medium-risk and high-risk stages retain explicit approval", () => {
  assert.equal(stagePolicy(config(), "medium-stage", {}).approval_required, true);
  assert.equal(stagePolicy(config(), "high-stage", {}).approval_required, true);
});

test("environment can restore explicit approval for every stage", () => {
  const decision = stagePolicy(config(), "low-stage", { CYVX_TOPOLOGY_APPROVE_BY_DEFAULT: "false" });
  assert.equal(decision.auto_approved, false);
  assert.equal(decision.approval_required, true);
});

test("resolveApproval generates the exact digest only for eligible low-risk work", () => {
  const topology = {
    config: config(),
    plan(stageId) { return plan(stageId, stageId === "low-stage" ? "low" : "medium"); },
  };
  const low = resolveApproval(topology, "low-stage", "", { env: {} });
  assert.equal(low.digest, "a".repeat(64));
  assert.equal(low.verify_mode, "full");
  assert.equal(low.decision.auto_approved, true);
  assert.equal(low.decision.approval_source, "policy");

  const medium = resolveApproval(topology, "medium-stage", "", { env: {} });
  assert.equal(medium.digest, "");
  assert.equal(medium.decision.approval_required, true);
});

test("explicit digests remain authoritative", () => {
  const topology = {
    config: config(),
    plan(stageId) { return plan(stageId, "medium"); },
  };
  const explicit = "b".repeat(64);
  const resolved = resolveApproval(topology, "medium-stage", explicit, { env: {}, verifyMode: "quick" });
  assert.equal(resolved.digest, explicit);
  assert.equal(resolved.verify_mode, "quick");
  assert.equal(resolved.decision.approval_source, "explicit_digest");
});

test("annotated plans expose the effective policy", () => {
  const annotated = annotatePlan(plan("low-stage", "low"), config(), {});
  assert.equal(annotated.stage.approval_required, false);
  assert.equal(annotated.stage.auto_approved, true);
  assert.equal(annotated.approval.explicit_digest_required, false);
});
