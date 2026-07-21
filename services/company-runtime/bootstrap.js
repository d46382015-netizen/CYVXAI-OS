"use strict";

const fs = require("node:fs");
const path = require("node:path");

const FIRST_COMPANY_NAME = "CYVX Bid & Revenue Sprint";
const FIRST_OUTCOME_SOURCE = "cyvx-first-company-activation-v1";

const FIRST_COMPANY_INPUT = Object.freeze({
  name: FIRST_COMPANY_NAME,
  description: "A CYVX-owned revenue operations company serving commercial cleaning, landscaping, facilities, security, and small construction firms.",
  target_customer: "Owner-operated commercial service businesses that need a repeatable path from opportunity to proposal, delivery proof, collected revenue, and recurring service",
  offer: "A 10-day evidence-backed Bid & Revenue Sprint that installs a qualified pipeline, proposal system, follow-up cadence, fulfillment proof, and recurring-revenue path.",
  price_cents: 150000,
  location: "United States",
  keywords: ["commercial cleaning", "landscaping", "facilities", "security", "small construction", "bids", "revenue operations"],
  outcome_contract: {
    objective: "Produce the complete governed operating package required to pursue the first $5,000 in verified collected client revenue.",
    target_metric: "governed_revenue_assets_completed",
    comparator: ">=",
    target_value: 9,
    target_unit: "assets",
    max_budget_cents: 0,
    approval_threshold_cents: 0,
    risk_level: "medium",
  },
});

function activationAuth(options = {}) {
  return options.auth || {
    user_id: "cyvx-first-company-activator",
    organization_id: options.organizationId || process.env.CYVX_PUBLIC_ORGANIZATION || "default",
    role: "admin",
    correlation_id: "cyvx-first-company-activation-v1",
  };
}

function activationEnabled(options = {}, env = process.env) {
  if (options.enabled !== undefined) return Boolean(options.enabled);
  if (String(env.CYVX_BOOTSTRAP_FIRST_COMPANY || "").toLowerCase() === "false") return false;
  if (String(env.CYVX_BOOTSTRAP_FIRST_COMPANY || "").toLowerCase() === "true") return true;
  return ["staging", "production"].includes(String(env.CYVX_ENV || "").toLowerCase());
}

function findFirstCompany(companyRuntime, auth) {
  for (const team of companyRuntime.listCompanies(auth)) {
    try {
      const graph = companyRuntime.getCompany(team.company_id, auth);
      if (graph.operator?.company?.name === FIRST_COMPANY_NAME) return graph;
    } catch {
      // A malformed unrelated company must not block recovery of the canonical first company.
    }
  }
  return null;
}

function activationMetrics(graph) {
  const tasks = Array.isArray(graph.tasks) ? graph.tasks : [];
  const completed = tasks.filter((task) => task.status === "completed");
  const artifacts = completed.filter((task) => Boolean(task.artifact_sha256));
  const outcome = (graph.metrics || []).find((metric) => metric.source === FIRST_OUTCOME_SOURCE) || null;
  return {
    completedTasks: completed.length,
    proofArtifacts: artifacts.length,
    artifactHashes: artifacts.map((task) => task.artifact_sha256),
    outcome,
  };
}

function writeReceipt(receiptPath, receipt) {
  if (!receiptPath) return;
  fs.mkdirSync(path.dirname(receiptPath), { recursive: true });
  const temporary = `${receiptPath}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(receipt, null, 2)}\n`, "utf8");
  fs.renameSync(temporary, receiptPath);
}

async function activateFirstCompany(companyRuntime, options = {}) {
  if (!companyRuntime?.createCompany || !companyRuntime?.runToIdle || !companyRuntime?.recordOutcome) {
    throw new Error("AutonomousCompanyRuntime is required for first-company activation");
  }
  const auth = activationAuth(options);
  const receiptPath = options.receiptPath || null;
  let graph = findFirstCompany(companyRuntime, auth);
  let created = false;
  let approved = false;
  let executed = false;
  let outcomeRecorded = false;

  if (!graph) {
    graph = companyRuntime.createCompany(FIRST_COMPANY_INPUT, auth);
    created = true;
  }

  if (graph.team.status === "planned") {
    graph = companyRuntime.approveCompany(graph.team.company_id, {
      decision_reason: "Owner-authorized activation of the first CYVX governed revenue company with zero external spend and evidence-required execution.",
    }, auth);
    approved = true;
  }

  let measured = activationMetrics(graph);
  if (!measured.outcome && graph.team.status === "active") {
    const execution = await companyRuntime.runToIdle(graph.team.company_id, auth, Number(options.maximumTicks || 100));
    graph = execution.company;
    executed = true;
    measured = activationMetrics(graph);
  }

  if (!measured.outcome) {
    if (graph.team.status !== "completed") {
      throw new Error(`First company did not reach idle; team status is ${graph.team.status}`);
    }
    if (measured.completedTasks < 9 || measured.proofArtifacts < 9) {
      throw new Error(`First company proof is incomplete: ${measured.completedTasks} completed tasks and ${measured.proofArtifacts} artifacts`);
    }
    const recorded = companyRuntime.recordOutcome(graph.team.company_id, {
      metric_name: "governed_revenue_assets_completed",
      value: measured.completedTasks,
      unit: "assets",
      source: FIRST_OUTCOME_SOURCE,
      observed_result: `${measured.completedTasks} governed agent workstreams completed and produced ${measured.proofArtifacts} hashed proof artifacts. This proves the revenue operating package exists; it does not claim a customer, payment, deployment, or collected revenue. Verified collected revenue remains $0 until external payment evidence is recorded.`,
      learning: "CYVX can create, approve, execute, prove, and learn from a complete internal revenue-company cycle autonomously. The next binding constraint is external demand capture and payment proof, not internal operating capability.",
      next_hypothesis: "Publishing the proof-led Bid & Revenue Sprint offer and capturing qualified pilot applications will create the first attributable sales conversation without cold outreach.",
      evidence: {
        company_id: graph.team.company_id,
        completed_task_ids: graph.tasks.filter((task) => task.status === "completed").map((task) => task.id),
        artifact_sha256: measured.artifactHashes,
        verified_collected_revenue_cents: 0,
        truth_boundary: "Internal production capability is verified. Customer acquisition and revenue remain unverified until outside-world evidence is attached.",
      },
    }, auth);
    outcomeRecorded = true;
    graph = companyRuntime.getCompany(graph.team.company_id, auth);
    measured = activationMetrics(graph);
    measured.outcome = graph.metrics.find((metric) => metric.id === recorded.metric_id) || measured.outcome;
  }

  if (!measured.outcome) throw new Error("First measured outcome was not persisted");

  const receipt = {
    schema_version: 1,
    activation_key: FIRST_OUTCOME_SOURCE,
    company_id: graph.team.company_id,
    company_name: graph.operator.company.name,
    mission_id: graph.operator.mission?.id || null,
    mission_status: graph.operator.mission?.status || null,
    team_status: graph.team.status,
    created,
    approved,
    executed_to_idle: executed,
    outcome_recorded: outcomeRecorded,
    reused: !created && !approved && !executed && !outcomeRecorded,
    model_provider: graph.team.model_provider,
    completed_tasks: measured.completedTasks,
    proof_artifacts: measured.proofArtifacts,
    measured_outcome: {
      id: measured.outcome.id,
      metric_name: measured.outcome.name,
      value: Number(measured.outcome.value),
      unit: measured.outcome.unit,
      source: measured.outcome.source,
      recorded_at: measured.outcome.recorded_at,
    },
    verified_collected_revenue_cents: Number(graph.operator.company?.counters?.revenue_cents || 0),
    next_improvement_task: graph.tasks.find((task) => task.kind.startsWith("growth.improve.governed_revenue_assets_completed."))?.id || null,
    truth_boundary: "The first governed internal company cycle and its evidence are verified. No customer, payment, or collected revenue is claimed by this activation.",
    activated_at: new Date().toISOString(),
  };
  writeReceipt(receiptPath, receipt);
  companyRuntime.emit(graph.team.company_id, auth.organization_id, "company_runtime.first_company_activation_verified", {
    completed_tasks: receipt.completed_tasks,
    proof_artifacts: receipt.proof_artifacts,
    measured_outcome_id: receipt.measured_outcome.id,
    next_improvement_task: receipt.next_improvement_task,
    reused: receipt.reused,
  });
  return receipt;
}

module.exports = {
  FIRST_COMPANY_INPUT,
  FIRST_COMPANY_NAME,
  FIRST_OUTCOME_SOURCE,
  activateFirstCompany,
  activationEnabled,
};
