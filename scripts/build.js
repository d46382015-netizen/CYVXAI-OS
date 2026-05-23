/**
 * CYVX — Autonomous Infrastructure Intelligence
 * © 2026 Dakota Lee Jonsgaard. All rights reserved.
 * Creator & Architect: Dakota Lee Jonsgaard
 * https://cyvx.ai | dakota@cyvx.ai
 *
 * This software is the exclusive intellectual property
 * of Dakota Lee Jonsgaard. Unauthorized use prohibited.
 */
"use strict";

const { execFileSync } = require("node:child_process");

const FILES = [
  "./api/index.js",
  "./core/controller.js",
  "./ui/app.js",
  "./ui/server.js",
  "./scripts/cluster-demo.js",
  "./scripts/health-check.js",
  "./scripts/raft_cluster_runtime.js",
  "./scripts/raft_cluster_start.js",
  "./scripts/raft_oracle.js",
  "./scripts/raft_workload_guard.js",
  "./scripts/raft_validation_suite.js",
  "./scripts/raft_failure_drill.js",
  "./scripts/raft_chaos_continuous.js",
  "./scripts/raft_node_server.js",
  "./core/eip/graph/execution_graph.js",
  "./core/eip/graph/graph_guard.js",
  "./core/eip/replay/replay_engine.js",
  "./core/eip/causal/causal_engine.js",
  "./core/eip/consistency_check.js",
  "./core/eip/bootstrap.js",
  "./core/eip/eip_policy.js",
  "./core/eip/index.js",
  "./sdk/uef_recorder.js",
  "./sdk/uef_replay.js",
  "./sdk/index.js",
  "./scripts/uef_check.js",
  "./packages/eos-replay/recorder.js",
  "./packages/eos-replay/replay.js",
  "./packages/eos-replay/index.js",
  "./packages/eos-replay/production.js",
  "./packages/eos-replay/host.js",
  "./packages/eos-replay/query.js",
  "./packages/eos-replay/plugins/http.js",
  "./packages/eos-replay/plugins/ci.js",
  "./packages/eos-replay/adapters/next.js",
  "./packages/eos-replay/register.js",
  "./scripts/eos_replay_check.js",
  "./scripts/eos_replay_v31_check.js",
];

for (const file of FILES) {
  execFileSync(process.execPath, ["--check", file], { stdio: "inherit" });
}

console.log("CYVX build checks passed.");

