// © 2026 Dakota Lee Jonsgaard
"use strict";

const { response } = require("../shared/attribution");

class ExplanationEngine {
  explain(decision) {
    const explanation = {
      decisionId: decision.id || null,
      what: decision.action || decision.what || "unknown",
      why: decision.why || decision.reason || "The system selected the action based on current signals and guardrails.",
      debate: decision.debate || [],
      prediction: decision.prediction || null,
      outcome: decision.outcome || null,
      learned: decision.learned || "The system has updated its policy from this outcome.",
    };
    return response("decision-explanation", explanation);
  }
}

module.exports = {
  ExplanationEngine,
};
