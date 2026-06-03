#!/usr/bin/env node
"use strict";

const fs = require("fs");

const id = process.argv[2];
const outcome = process.argv.slice(3).join(" ");

if (!id || !outcome) {
  console.log('Usage: node scripts/cyvx-complete-proof-record.js REAL-PROOF-01 "actual outcome here"');
  process.exit(1);
}

const file = "data/campaigns/real-proof-10/records.json";
const data = JSON.parse(fs.readFileSync(file, "utf8"));
const record = data.records.find(r => r.id === id);

if (!record) {
  console.error("Record not found:", id);
  process.exit(1);
}

const success = /success|complete|done|built|generated|working|passed|fixed|created|pushed/i.test(outcome);

record.actual_outcome = outcome;
record.trust_after = success ? record.trust_before + 2 : record.trust_before - 2;
record.learning = success
  ? "Prediction produced a usable action and measurable evidence."
  : "Prediction needs refinement based on execution result.";
record.status = success ? "completed" : "needs-review";
record.completed_at = new Date().toISOString();

fs.writeFileSync(file, JSON.stringify(data, null, 2));

fs.writeFileSync(
  "docs/evidence/CYVX_REAL_PROOF_10_RECORDS.md",
  "# CYVX Real Proof 10 Records\n\n" +
  data.records.map(r => `## ${r.id}: ${r.reality}

Prediction: ${r.prediction}

Mission: ${r.mission}

Expected Outcome: ${r.expected_outcome}

Actual Outcome: ${r.actual_outcome}

Trust: ${r.trust_before} → ${r.trust_after}

Learning: ${r.learning}

Status: ${r.status}
`).join("\n")
);

console.log("Updated", id);
