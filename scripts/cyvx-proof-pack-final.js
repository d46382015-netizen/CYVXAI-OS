#!/usr/bin/env node
"use strict";
const fs = require("fs");

const data = JSON.parse(fs.readFileSync("data/campaigns/real-proof-10/records.json","utf8"));
const completed = data.records.filter(r => r.status === "completed").length;
const avgTrust = Math.round(
  data.records.reduce((a,r)=>a+(r.trust_after || r.trust_before || 0),0) / data.records.length
);

const report = `# CYVX Proof Pack

## Summary
Completed Records: ${completed}/${data.records.length}

Average Trust After: ${avgTrust}

## Claim
CYVX can convert reality inputs into predictions, missions, outcomes, learning, and trust updates.

## Evidence
${data.records.map(r => `### ${r.id}: ${r.reality}
- Mission: ${r.mission}
- Actual Outcome: ${r.actual_outcome}
- Trust: ${r.trust_before} → ${r.trust_after}
- Status: ${r.status}
`).join("\n")}

## Next Action
Use this proof pack as the first public/product demo evidence base.
`;

fs.writeFileSync("docs/evidence/CYVX_FINAL_PROOF_PACK.md", report);
console.log(report);
