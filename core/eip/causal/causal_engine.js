"use strict";

function buildCausalEdges(events = []) {
  const edges = [];

  for (let index = 1; index < events.length; index += 1) {
    const previous = events[index - 1];
    const current = events[index];
    edges.push({
      from: previous?.id || previous?.eventId || `event-${index - 1}`,
      to: current?.id || current?.eventId || `event-${index}`,
      type: "temporal",
    });
  }

  return edges;
}

function minimalCauseChain(events = [], targetId = null) {
  if (!targetId) {
    return events.slice(-1);
  }
  const index = events.findIndex((event) => event.id === targetId || event.eventId === targetId);
  if (index < 0) return [];
  return events.slice(0, index + 1);
}

module.exports = {
  buildCausalEdges,
  minimalCauseChain,
};
