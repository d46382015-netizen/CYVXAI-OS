"use strict";

const { hash, now } = require("../../../core/lib/cyxv");

class ExecutionGraph {
  constructor() {
    this.events = [];
    this.states = new Map();
    this.edges = [];
    this.timelines = new Map();
  }

  appendEvent(event = {}) {
    const normalized = {
      id: event.id || hash({ type: event.type || "event", at: now(), payload: event.payload || null }),
      type: event.type || "event",
      payload: event.payload || {},
      causationId: event.causationId || null,
      correlationId: event.correlationId || null,
      at: event.at || now(),
    };
    this.events.push(normalized);
    return normalized;
  }

  addState(id, state) {
    this.states.set(id, state);
    return state;
  }

  addEdge(from, to, type = "causal") {
    const edge = { from, to, type, at: now() };
    this.edges.push(edge);
    return edge;
  }

  addTimeline(id, eventIds = []) {
    this.timelines.set(id, [...eventIds]);
    return this.timelines.get(id);
  }

  getTimeline(id = "main") {
    return this.timelines.get(id) || this.events;
  }

  snapshot() {
    return {
      events: [...this.events],
      states: [...this.states.entries()].map(([id, state]) => ({ id, state })),
      edges: [...this.edges],
      timelines: [...this.timelines.entries()].map(([id, timeline]) => ({ id, timeline })),
      hash: hash({ events: this.events, states: [...this.states.entries()], edges: this.edges, timelines: [...this.timelines.entries()] }),
    };
  }
}

module.exports = {
  ExecutionGraph,
};
