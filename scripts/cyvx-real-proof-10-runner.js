#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

function read(p){ try { return fs.readFileSync(p,"utf8"); } catch { return ""; } }
function write(p,v){ fs.mkdirSync(path.dirname(p),{recursive:true}); fs.writeFileSync(p, typeof v==="string" ? v : JSON.stringify(v,null,2)); }

const realities = [
  "CYVXAI-OS repo reality",
  "Agent Framework repo reality",
  "Activepieces repo reality",
  "Syft repo reality",
  "CYVX business plan",
  "CYVX dashboard/UI reality",
  "CYVX deployment reality",
  "CYVX revenue reality",
  "CYVX user adoption reality",
  "CYVX self-improvement reality"
];

const records = realities.map((name, i) => ({
  id: `REAL-PROOF-${String(i+1).padStart(2,"0")}`,
  reality: name,
  prediction: "If CYVX turns this reality into one mission and captures the outcome, trust calibration improves.",
  mission: `Analyze ${name} and generate one highest-leverage action.`,
  expected_outcome: "A concrete next action, measurable result, and evidence record are produced.",
  actual_outcome: "pending-real-execution",
  trust_before: 90,
  trust_after: null,
  learning: "pending",
  status: "needs-real-outcome"
}));

write("data/campaigns/real-proof-10/records.json", {
  created_at: new Date().toISOString(),
  campaign: "real-proof-10",
  records
});

write("docs/evidence/CYVX_REAL_PROOF_10_RECORDS.md",
`# CYVX Real Proof 10 Records

${records.map(r => `## ${r.id}: ${r.reality}

Prediction: ${r.prediction}

Mission: ${r.mission}

Expected Outcome: ${r.expected_outcome}

Actual Outcome: ${r.actual_outcome}

Status: ${r.status}
`).join("\n")}
`);

console.log("Created 10 proof records.");
console.log("Next: replace pending-real-execution with actual outcomes.");
