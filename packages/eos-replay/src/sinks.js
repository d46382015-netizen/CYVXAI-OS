"use strict";

const fs = require("node:fs");

class MultiSink {
  constructor(sinks = []) {
    this.sinks = Array.isArray(sinks) ? sinks.filter(Boolean) : [];
  }

  add(sink) {
    if (sink) this.sinks.push(sink);
    return this;
  }

  write(data) {
    for (const sink of this.sinks) {
      try {
        sink.write(data);
      } catch {
        // Best-effort isolation. Sink failures must not crash the host app.
      }
    }
  }
}

class FileSink {
  constructor(target) {
    this.target = target;
  }

  write(data) {
    if (!this.target) return;
    if (typeof this.target.write === "function") {
      this.target.write(data);
      return;
    }
    fs.appendFileSync(this.target, data);
  }
}

class KafkaSink {
  constructor(producer, topic = "uef-events") {
    this.producer = producer;
    this.topic = topic;
  }

  write(batch) {
    if (!this.producer || typeof this.producer.send !== "function") return;
    this.producer.send({
      topic: this.topic,
      messages: [{ value: typeof batch === "string" ? batch : JSON.stringify(batch) }],
    });
  }
}

class S3Sink {
  constructor(uploadFn) {
    this.uploadFn = uploadFn;
  }

  async write(batch) {
    if (typeof this.uploadFn !== "function") return;
    const payload = typeof batch === "string" ? batch : JSON.stringify(batch);
    await this.uploadFn(payload);
  }
}

module.exports = {
  MultiSink,
  FileSink,
  KafkaSink,
  S3Sink,
};
