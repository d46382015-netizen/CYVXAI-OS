"use strict";

const { hash } = require("./recorder");

function sortEvents(events = []) {
  return [...events].sort((left, right) => {
    if (left.ts !== right.ts) return Number(left.ts) - Number(right.ts);
    if ((left.sequence ?? 0) !== (right.sequence ?? 0)) return Number(left.sequence ?? 0) - Number(right.sequence ?? 0);
    return String(left.id || "").localeCompare(String(right.id || ""));
  });
}

function replay(events = [], seedState = {}) {
  const ordered = sortEvents(events);
  const state = { ...seedState };
  const causalEdges = [];
  const causalMap = new Map();
  const history = [];

  for (const event of ordered) {
    history.push(event);
    causalMap.set(event.id, event);

    if (event.type === "SET" || event.type === "STATE") {
      if (event.key != null) {
        state[event.key] = event.value;
      } else {
        state[event.id] = event.value;
      }
    }

    if (event.type === "CALL") {
      state.last_call = event.value ?? null;
    }
    if (event.type === "RETURN") {
      state.last_return = event.value ?? null;
    }
    if (event.type === "ERROR") {
      state.last_error = event.value ?? null;
    }

    for (const causeId of event.caused_by || []) {
      causalEdges.push({ from: causeId, to: event.id, type: "causal" });
    }
  }

  return {
    state,
    events: ordered,
    causalEdges,
    causalMap: Object.fromEntries(causalMap.entries()),
    hash: hash({ state, ordered, causalEdges }),
    history,
  };
}

module.exports = {
  sortEvents,
  replay,
};
