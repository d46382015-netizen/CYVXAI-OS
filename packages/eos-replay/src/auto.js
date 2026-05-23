"use strict";

const { Sampler } = require("./sampling");
const { RingBuffer } = require("./buffer");
const { BatchProcessor } = require("./batcher");
const { MultiSink, FileSink, KafkaSink, S3Sink } = require("./sinks");
const { toOTel } = require("./otel");
const { register } = require("../register");
const { createRecorder } = require("../recorder");

class AutoUEF {
  constructor(recorder, options = {}) {
    this.recorder = recorder;
    this.options = options;
    this.sampler = options.sampler || new Sampler(options.sampleRate || 1.0);
    this.buffer = options.buffer || new RingBuffer(options.bufferSize || 10_000);
    if (this.recorder && typeof this.recorder.transport !== "function") {
      this.recorder.transport = (event) => {
        this.buffer.push(event);
      };
    }
    this.sink = options.sink || this.buildSink(options);
    this.processor = options.processor || new BatchProcessor(this.buffer, this.sink, options.flushIntervalMs || 2_000);
    this.registration = null;
    this.attached = false;
  }

  buildSink(options = {}) {
    const sinks = [];
    if (options.filePath) sinks.push(new FileSink(options.filePath));
    if (options.producer) sinks.push(new KafkaSink(options.producer, options.kafkaTopic || "uef-events"));
    if (options.uploadFn) sinks.push(new S3Sink(options.uploadFn));
    if (options.otel === true) {
      sinks.push(new FileSink({
        write: (data) => {
          const batch = JSON.parse(data);
          for (const event of batch) {
            if (typeof options.otelSink === "function") {
              options.otelSink(toOTel(event));
            }
          }
        },
      }));
    }

    if (sinks.length === 0) {
      sinks.push(new FileSink(options.outputStream || process.stdout));
    }

    return new MultiSink(sinks);
  }

  attach() {
    if (this.attached) return this;
    this.attachProcessHooks();
    this.attachLoadMonitor();
    this.attachHttpHooks();
    this.attached = true;
    return this;
  }

  emit(event) {
    if (!this.sampler.shouldSample()) return null;
    return typeof this.recorder.emit === "function"
      ? this.recorder.emit(event.type || "EVENT", event)
      : event;
  }

  attachLoadMonitor() {
    this.loadTimer = setInterval(() => {
      const mem = process.memoryUsage().heapUsed / 1024 / 1024;
      this.sampler.adjust(mem / 500);
    }, this.options.loadSampleIntervalMs || 3_000);

    if (typeof this.loadTimer.unref === "function") {
      this.loadTimer.unref();
    }
  }

  attachProcessHooks() {
    const emitError = (kind, err) => {
      this.emit({
        type: "ERROR",
        kind,
        message: err && err.message ? err.message : String(err),
        fatal: kind === "uncaughtException",
        meta: { kind },
      });
    };

    process.on("uncaughtException", (err) => emitError("uncaughtException", err));
    process.on("unhandledRejection", (err) => emitError("unhandledRejection", err));
  }

  attachHttpHooks() {
    if (this.options.autoHttp === false) return;
    this.registration = register({
      recorder: this.recorder,
      sampleRate: this.options.sampleRate,
    });
  }

  stop() {
    if (this.registration) {
      this.registration.restore();
      this.registration = null;
    }
    if (this.processor) this.processor.stop();
    if (this.loadTimer) clearInterval(this.loadTimer);
    return this;
  }
}

function auto(options = {}) {
  const recorder = options.recorder || createRecorder(options);
  const agent = new AutoUEF(recorder, options);
  agent.attach();
  return recorder;
}

module.exports = {
  AutoUEF,
  auto,
};
