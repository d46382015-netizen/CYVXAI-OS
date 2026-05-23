// © 2026 Dakota Lee Jonsgaard
"use strict";

const { EventEmitter } = require("events");
const { response, withAttribution } = require("../shared/attribution");

class IntentEngine extends EventEmitter {
  constructor(options = {}) {
    super();
    this.history = [];
    this.options = {
      confidenceThreshold: 0.7,
      ...options,
    };
  }

  infer(signals = []) {
    const intents = [];
    const normalized = normalizeSignals(signals);

    const paymentSpike = normalized.find((signal) => signal.service === "payment" && signal.magnitude >= 8);
    const inventorySpike = normalized.find((signal) => signal.service === "inventory" && signal.magnitude >= 8);
    const trainingQueued = normalized.find((signal) => signal.service === "ml" && /training/i.test(signal.signal || "") && signal.queued >= 1);
    const databaseSpike = normalized.find((signal) => signal.service === "database" && signal.table === "user" && signal.magnitude >= 7);

    if (paymentSpike && inventorySpike) {
      intents.push({
        intent: "flash-sale-incoming",
        confidence: 0.93,
        why: "commerce and inventory demand are rising together",
        preposition: ["scale checkout", "raise inventory cache", "reserve burst capacity"],
      });
    }

    if (trainingQueued) {
      intents.push({
        intent: "model-release-soon",
        confidence: 0.88,
        why: "queued training jobs imply imminent model work",
        preposition: ["reserve GPUs", "warm feature stores", "increase artifact bandwidth"],
        horizonHours: 48,
      });
    }

    if (databaseSpike) {
      intents.push({
        intent: "viral-moment",
        confidence: 0.86,
        why: "read pressure on the user table suggests user growth or a spike in attention",
        preposition: ["scale reads", "protect caches", "watch auth and feed services"],
      });
    }

    if (intents.length === 0) {
      intents.push({
        intent: "stable-operations",
        confidence: 0.58,
        why: "no strong correlated signals crossed the threshold",
        preposition: ["maintain baseline capacity"],
      });
    }

    const result = intents.map((intent) => withAttribution(intent));
    this.history.push({ at: new Date().toISOString(), result });
    this.emit("intent", result);
    return response("intent-inference", { intents: result });
  }

  planResources(intents = []) {
    const plans = intents.map((intent) => {
      if (intent.intent === "flash-sale-incoming") {
        return {
          intent: intent.intent,
          actions: ["scale checkout", "pre-warm caches", "increase payment redundancy"],
          priority: "critical",
        };
      }
      if (intent.intent === "model-release-soon") {
        return {
          intent: intent.intent,
          actions: ["reserve GPUs", "stage artifacts", "notify release pipeline"],
          priority: "high",
        };
      }
      if (intent.intent === "viral-moment") {
        return {
          intent: intent.intent,
          actions: ["scale reads", "expand API capacity", "inspect bottlenecks"],
          priority: "high",
        };
      }
      return {
        intent: intent.intent,
        actions: intent.preposition || ["observe"],
        priority: "normal",
      };
    });

    return response("resource-plan", { plans });
  }
}

function normalizeSignals(signals) {
  return signals.map((signal) => ({
    service: signal.service,
    signal: signal.signal || signal.name || "",
    magnitude: Number(signal.magnitude || 0),
    queued: Number(signal.queued || 0),
    table: signal.table,
    ...signal,
  }));
}

module.exports = {
  IntentEngine,
};
