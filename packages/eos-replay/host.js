"use strict";

const { EventEmitter } = require("node:events");
const { createRecorder } = require("./recorder");
const { replay, sortEvents } = require("./replay");
const { queryEvents } = require("./query");

class UEFHost extends EventEmitter {
  constructor(options = {}) {
    super();
    this.recorder = options.recorder || createRecorder(options);
    this.plugins = [];
    this.name = options.name || "uef";
    this.meta = options.meta || {};
  }

  use(plugin, pluginOptions = {}) {
    if (!plugin || typeof plugin.install !== "function") {
      throw new TypeError("UEF plugins must expose install(uef, options)");
    }
    if (this.plugins.some((entry) => entry.name === plugin.name)) {
      return this;
    }
    plugin.install(this, pluginOptions);
    this.plugins.push({ name: plugin.name || "anonymous", plugin });
    return this;
  }

  dispatch(name, payload = {}) {
    this.emit(name, payload);
    return payload;
  }

  record(event = {}) {
    if (typeof this.recorder.emit !== "function") {
      throw new TypeError("UEF recorder does not support emit()");
    }
    const recorded = this.recorder.emit(event.type || "EVENT", event);
    this.emit("event", recorded);
    this.emit(String(event.type || "event").toLowerCase(), recorded);
    return recorded;
  }

  emitEvent(event = {}) {
    return this.record(event);
  }

  snapshot() {
    return this.recorder.snapshot();
  }

  query(filters = {}) {
    return queryEvents(this.snapshot().events, filters);
  }

  replay(filters = {}) {
    const result = replay(this.snapshot().events);
    if (!filters || Object.keys(filters).length === 0) return result;
    return {
      ...result,
      events: queryEvents(result.events, filters),
      causalEdges: result.causalEdges.filter((edge) => {
        if (filters.trace_id || filters.run_id) {
          const eventIds = new Set(queryEvents(result.events, filters).map((event) => event.id));
          return eventIds.has(edge.from) || eventIds.has(edge.to);
        }
        return true;
      }),
    };
  }

  timeline() {
    return sortEvents(this.snapshot().events);
  }
}

function createUEF(options = {}) {
  return new UEFHost(options);
}

module.exports = {
  UEFHost,
  createUEF,
};
