#!/usr/bin/env node
"use strict";

const { createMissionRuntime } = require("../runtime/missions");
const { createUniversalOperatorRuntime } = require("../services/operator/universal-server");

function hasFlag(name) {
  return process.argv.includes(name);
}

function authFromEnvironment() {
  return {
    user_id: process.env.CYVX_OWNER_USER_ID || "admin-local",
    organization_id: process.env.CYVX_ORGANIZATION_ID || "default",
    role: "admin",
    correlation_id: `bid-sprint-bootstrap-${Date.now()}`,
  };
}

async function main() {
  const runtime = createMissionRuntime({ allowLocalAuth: true });
  const system = createUniversalOperatorRuntime({ runtime });
  const auth = authFromEnvironment();
  try {
    let graph;
    const existing = system.bidSprint.listSprints(auth)[0];
    if (existing) graph = system.bidSprint.getSprint(existing.id, auth);
    else graph = system.bidSprint.bootstrap({
      name: "CYVX Bid & Revenue Sprint",
      region: process.env.CYVX_BID_SPRINT_REGION || "Minnesota and nearby Upper Midwest markets",
      target_revenue_cents: 500_000,
      target_recurring_mrr_cents: 50_000,
      max_budget_cents: Number(process.env.CYVX_BID_SPRINT_MAX_BUDGET_CENTS || 0),
    }, auth);

    if (hasFlag("--approve") && graph.sprint.status === "awaiting_approval") {
      graph = system.bidSprint.approveAndLaunch(graph.sprint.id, {
        decision_reason: "Owner invoked the local bootstrap command to approve bounded internal activation. External actions remain separately approval-gated.",
      }, auth);
    }
    if (hasFlag("--tick") && graph.sprint.status !== "awaiting_approval") {
      system.bidSprint.tick(graph.sprint.id, auth);
      graph = system.bidSprint.getSprint(graph.sprint.id, auth);
    }

    process.stdout.write(`${JSON.stringify({
      ok: true,
      sprint: graph.sprint,
      metrics: graph.metrics,
      current_constraint: graph.current_constraint,
      next_best_action: graph.next_best_action,
      dashboard: "http://127.0.0.1:3020/bid-revenue-sprint",
      start_command: "npm run bid:sprint",
      verify_command: "npm run bid:sprint:verify",
    }, null, 2)}\n`);
  } finally {
    runtime.close();
  }
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`${JSON.stringify({ ok: false, code: error.code || null, error: error.message })}\n`);
    process.exit(1);
  });
}

module.exports = { main };
