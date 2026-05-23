"use strict";

const { createRecorder, ReplayRecorder } = require("./recorder");
const { replay, sortEvents } = require("./replay");
const { register } = require("./register");
const { UEFHost, createUEF } = require("./host");
const { queryEvents } = require("./query");
const { withUEF } = require("./adapters/next");
const httpPlugin = require("./plugins/http");
const ciPlugin = require("./plugins/ci");
const { Sampler } = require("./src/sampling");
const { RingBuffer } = require("./src/buffer");
const { BatchProcessor } = require("./src/batcher");
const { MultiSink, FileSink, KafkaSink, S3Sink } = require("./src/sinks");
const { toOTel } = require("./src/otel");
const { AutoUEF, auto } = require("./src/auto");

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
  UEFHost,
  createUEF,
  queryEvents,
  Sampler,
  RingBuffer,
  BatchProcessor,
  MultiSink,
  FileSink,
  KafkaSink,
  S3Sink,
  toOTel,
  AutoUEF,
  auto,
  withUEF,
  httpPlugin,
  ciPlugin,
};
