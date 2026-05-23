// © 2026 Dakota Lee Jonsgaard
"use strict";

const { response } = require("../shared/attribution");

class NaturalInterface {
  constructor(handlers = {}) {
    this.handlers = handlers;
  }

  interpret(command, context = {}) {
    const text = String(command || "").toLowerCase();
    let intent = "observe";
    const actions = [];

    if (text.includes("scale") && text.includes("api")) {
      intent = "scale-api";
      actions.push("assess traffic", "increase capacity", "verify latency");
    }
    if (text.includes("launch") && text.includes("japan")) {
      intent = "prepare-launch";
      actions.push("plan region capacity", "verify compliance", "stage deployment");
    }
    if (text.includes("bill") && text.includes("high")) {
      intent = "billing-investigation";
      actions.push("analyze spend", "surface top drivers", "suggest reductions");
    }
    if (text.includes("reliable")) {
      intent = "reliability-rebalance";
      actions.push("increase redundancy", "rebalance risk", "protect uptime");
    }
    if (text.includes("attacked")) {
      intent = "security-response";
      actions.push("activate security agents", "capture evidence", "report findings");
    }

    const result = {
      intent,
      actions,
      followUpQuestions: inferFollowUps(intent, context),
      explanation: explainIntent(intent, actions),
    };

    return response("natural-language-intent", result);
  }

  execute(command, context = {}) {
    const interpretation = this.interpret(command, context).data;
    const handler = this.handlers[interpretation.intent];
    if (typeof handler === "function") {
      return response("natural-language-execution", {
        ...interpretation,
        execution: handler({ command, context, interpretation }),
      });
    }
    return response("natural-language-execution", {
      ...interpretation,
      execution: "no-op",
    });
  }
}

function inferFollowUps(intent, context) {
  if (intent === "prepare-launch" && !context.region) return ["Which regions are in scope?"];
  if (intent === "scale-api" && !context.targetSlo) return ["What latency or error-rate target should we optimize for?"];
  return [];
}

function explainIntent(intent, actions) {
  if (actions.length === 0) return `The command was classified as ${intent}, but no concrete actions were inferred.`;
  return `The command maps to ${intent} because the language indicates ${actions.join(", ")}.`;
}

module.exports = {
  NaturalInterface,
};
