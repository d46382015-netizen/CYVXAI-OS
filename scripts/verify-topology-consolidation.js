#!/usr/bin/env node
"use strict";
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createTopologyConsolidation } = require("../services/topology-consolidation");

const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), "cyvx-topology-verify-"));
try {
  const topology = createTopologyConsolidation({ dataRoot, requireClean: false });
  const scan = topology.scan();
  if (!scan.graph || !Array.isArray(scan.graph.nodes) || !Array.isArray(scan.graph.edges)) throw new Error("Dependency graph contract is incomplete");
  if (!Array.isArray(topology.config.stages) || topology.config.stages.length < 3) throw new Error("At least three governed migration stages are required");
  const seenSources = new Set();
  const reports = [];
  for (const stage of topology.config.stages) {
    const plan = topology.plan(stage.id, { persist: false });
    for (const move of plan.moves) {
      if (seenSources.has(move.source)) throw new Error(`Duplicate source across topology stages: ${move.source}`);
      seenSources.add(move.source);
      if (move.blocked_reasons.includes("source_is_protected")) throw new Error(`Protected root selected for movement: ${move.source}`);
      if (move.blocked_reasons.includes("invalid_nested_target")) throw new Error(`Invalid topology target: ${move.source} -> ${move.target}`);
    }
    if (!/^[a-f0-9]{64}$/.test(plan.approval.digest)) throw new Error(`Stage ${stage.id} did not produce a SHA-256 approval digest`);
    if (!/^[a-f0-9]{64}$/.test(plan.baseline.tree_digest)) throw new Error(`Stage ${stage.id} did not produce a baseline tree digest`);
    reports.push({ stage_id: stage.id, active_moves: plan.summary.active_moves, already_applied: plan.moves.filter((move) => move.already_applied).length, blocked_moves: plan.summary.blocked_moves, files_to_move: plan.summary.files_to_move, references: plan.summary.module_edges_affected + plan.summary.text_references_affected, approval_digest: plan.approval.digest });
  }
  const blocked = reports.filter((report) => report.blocked_moves > 0);
  if (blocked.length) throw new Error(`Blocked topology stages detected: ${blocked.map((item) => item.stage_id).join(", ")}`);
  process.stdout.write(`${JSON.stringify({ ok: true, service: "cyvx-topology-consolidation", graph: { nodes: scan.graph.nodes.length, edges: scan.graph.edges.length, unresolved: scan.graph.unresolved.length }, stages: reports }, null, 2)}\n`);
} finally {
  fs.rmSync(dataRoot, { recursive: true, force: true });
}
