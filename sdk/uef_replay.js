"use strict";

const { hash } = require("../core/lib/cyxv");

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
  const byId = new Map();

  for (const event of ordered) {
    byId.set(event.id, event);
    if (event.type === "SET" || event.type === "STATE") {
      if (event.key != null) {
        state[event.key] = event.value;
      } else {
        state[event.id] = event.value;
      }
    } else if (event.type === "CALL") {
      state.last_call = event.value ?? null;
    } else if (event.type === "RETURN") {
      state.last_return = event.value ?? null;
    } else if (event.type === "ERROR") {
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
    eventIndex: Object.fromEntries(ordered.map((event, index) => [event.id, index])),
    hash: hash({ state, ordered, causalEdges }),
  };
}

module.exports = {
  replay,
  sortEvents,
};
