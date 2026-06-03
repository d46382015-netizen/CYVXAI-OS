
"use strict";

const fs = require("fs");
const path = require("path");

function write(p, v) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, typeof v === "string" ? v : JSON.stringify(v, null, 2));
}

function readJson(p, fallback) {
  try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return fallback; }
}

function captureOutcome(payload) {
  const expected = payload.expectedOutcome || payload.expected_outcome || "Expected outcome not provided.";
  const actual = payload.actualOutcome || payload.actual_outcome || "";
  const success = String(payload.success || payload.status || "").toLowerCase();

  const succeeded =
    success.includes("success") ||
    success.includes("complete") ||
    success.includes("pass") ||
    success === "true" ||
    payload.succeeded === true;

  const trustDelta = succeeded ? 0.04 : -0.06;
  const previous = readJson("data/runtime/live-dashboard-state.json", { trust: 88 });
  const previousTrust = Number(previous.trust || 88);
  const trust = Math.max(0, Math.min(100, Math.round(previousTrust + trustDelta * 100)));

  const outcome = {
    id: "outcome-" + Date.now(),
    mission: payload.mission || "Current CYVX Mission",
    expected_outcome: expected,
    actual_outcome: actual,
    succeeded,
    trust_before: previousTrust,
    trust_after: trust,
    learning: succeeded
      ? "Mission outcome supported the prediction. Increase trust and reuse this pattern."
      : "Mission outcome did not fully match prediction. Reduce trust and inspect assumptions.",
    next_best_action: succeeded
      ? "Scale the proven loop and capture another real outcome."
      : "Refine the mission assumptions, rerun with tighter evidence, and update the constraint model.",
    created_at: new Date().toISOString()
  };

  write("data/outcomes/latest-captured-outcome.json", outcome);
  write("data/runtime/live-dashboard-state.json", {
    ...previous,
    health: "active",
    trust,
    topConstraint: outcome.succeeded
      ? "CYVX now has outcome evidence; next constraint is repeatability across more realities."
      : "CYVX needs tighter assumptions before increasing autonomy.",
    nextAction: outcome.next_best_action,
    latestOutcome: outcome
  });

  write("docs/evidence/CYVX_OUTCOME_CAPTURE.md",
`# CYVX Outcome Capture

Generated: ${outcome.created_at}

## Mission
${outcome.mission}

## Expected Outcome
${outcome.expected_outcome}

## Actual Outcome
${outcome.actual_outcome}

## Succeeded
${outcome.succeeded}

## Trust
${outcome.trust_before} → ${outcome.trust_after}

## Learning
${outcome.learning}

## Next Best Action
${outcome.next_best_action}
`);

  return outcome;
}

module.exports = { captureOutcome };
