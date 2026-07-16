#!/usr/bin/env node
"use strict";

const { createTopologyConsolidation } = require("../services/topology-consolidation");
const { annotatePlan, resolveApproval } = require("../services/topology-consolidation/approval-policy");

function main(argv = process.argv.slice(2)) {
  const command = argv[0] || "scan";
  const topology = createTopologyConsolidation();
  const flags = parseFlags(argv.slice(1));
  let result;
  if (command === "scan") result = topology.scan();
  else if (command === "plan") {
    const stageId = flags._[0] || topology.config.stages[0].id;
    result = annotatePlan(topology.plan(stageId), topology.config, process.env);
  } else if (command === "apply") {
    const stageId = required(flags._[0], "stage id");
    const approval = resolveApproval(topology, stageId, flags.approve, {
      env: process.env,
      verifyMode: flags.verify,
    });
    result = topology.apply(stageId, {
      approvalDigest: approval.digest,
      verifyMode: approval.verify_mode,
      allowDirty: flags["allow-dirty"] === true,
    });
    result.approval_decision = approval.decision;
  } else if (command === "rollback") result = topology.rollback(required(flags._[0], "run id"));
  else if (command === "verify-run") result = topology.verifyRun(required(flags._[0], "run id"));
  else if (command === "runs") result = { ok: true, runs: topology.listRuns(flags.limit) };
  else if (command === "help" || flags.help) return help();
  else throw Object.assign(new Error(`Unknown command: ${command}`), { code: "TOPOLOGY_COMMAND_UNKNOWN" });
  process.stdout.write(`${JSON.stringify(result, null, flags.json ? 0 : 2)}\n`);
}

function parseFlags(args) {
  const result = { _: [] };
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    if (!value.startsWith("--")) { result._.push(value); continue; }
    const key = value.slice(2);
    const next = args[index + 1];
    if (!next || next.startsWith("--")) result[key] = true;
    else { result[key] = next; index += 1; }
  }
  return result;
}

function required(value, label) { if (!value) throw Object.assign(new Error(`${label} is required`), { code: "TOPOLOGY_ARGUMENT_REQUIRED" }); return value; }
function help() { process.stdout.write(`CYVX topology consolidation\n\nCommands:\n  scan\n  plan <stage>\n  apply <stage> [--approve <digest>] [--verify quick|full|none]\n  verify-run <run-id>\n  rollback <run-id>\n  runs [--limit 30]\n\nLow-risk stages approve by default and use full verification. Medium-risk and high-risk stages require the exact digest from plan. Set CYVX_TOPOLOGY_APPROVE_BY_DEFAULT=false to require explicit approval for every stage. Verification failure triggers automatic rollback.\n`); }

try { main(); }
catch (error) { process.stderr.write(`${JSON.stringify({ ok: false, error: error.code || "TOPOLOGY_ERROR", message: error.message, expected_digest: error.expected_digest || null }, null, 2)}\n`); process.exitCode = 1; }
