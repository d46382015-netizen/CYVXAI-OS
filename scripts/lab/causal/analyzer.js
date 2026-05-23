const fs = require("fs");

function load() {
  return JSON.parse(
    fs.readFileSync("/root/scripts/lab/latest_trace.json", "utf8")
  );
}

function findFirstDivergence(events) {
  const stateMap = new Map();

  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    const key = `${e.type}:${e.nodeId || "unknown"}`;

    if (!stateMap.has(key)) {
      stateMap.set(key, e.value);
      continue;
    }

    const prev = stateMap.get(key);

    if (JSON.stringify(prev) !== JSON.stringify(e.value)) {
      return {
        index: i,
        event: e,
        previous: prev
      };
    }
  }

  return null;
}

function buildCausalChain(events, startIndex) {
  const chain = [];

  for (let i = startIndex; i >= 0; i--) {
    const e = events[i];

    chain.push({
      step: i,
      type: e.type,
      node: e.nodeId,
      value: e.value,
      ts: e.ts
    });

    if (e.type === "invoke") break;
  }

  return chain.reverse();
}

function detectInvariantViolation(events) {
  for (const e of events) {
    if (e.type === "fail") {
      return {
        type: "operation failure",
        node: e.nodeId,
        reason: e.error || "unknown"
      };
    }
  }
  return null;
}

function analyze() {
  const trace = load();
  const events = trace.events || [];

  const divergence = findFirstDivergence(events);
  const failure = detectInvariantViolation(events);

  const chain = divergence
    ? buildCausalChain(events, divergence.index)
    : [];

  return {
    summary: {
      totalEvents: events.length,
      hasFailure: !!failure,
      hasDivergence: !!divergence
    },
    failure,
    divergence,
    causalChain: chain
  };
}

module.exports = { analyze };
