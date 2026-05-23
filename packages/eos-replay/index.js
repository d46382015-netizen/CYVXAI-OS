"use strict";

const { createRecorder, ReplayRecorder } = require("./recorder");
const { replay, sortEvents } = require("./replay");
const { register } = require("./register");

function instrument(fn, options = {}) {
  if (typeof fn !== "function") {
    throw new TypeError("instrument(fn, options) requires a function");
  }

  const recorder = options.recorder || createRecorder(options);

  const wrapped = async function instrumented(...args) {
    const start = Date.now();
    recorder.call({ name: fn.name || "anonymous", args }, { caused_by: options.caused_by || [] });
    try {
      const result = await fn.apply(this, args);
      recorder.ret({ name: fn.name || "anonymous", result }, { latency_ms: Date.now() - start });
      return result;
    } catch (error) {
      recorder.error({ name: fn.name || "anonymous", message: error.message }, { latency_ms: Date.now() - start });
      throw error;
    }
  };

  wrapped.recorder = recorder;
  return wrapped;
}

module.exports = {
  createRecorder,
  ReplayRecorder,
  replay,
  sortEvents,
  instrument,
  register,
};
