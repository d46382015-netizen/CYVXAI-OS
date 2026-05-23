"use strict";

class BatchProcessor {
  constructor(buffer, writer, interval = 2_000) {
    if (!buffer || typeof buffer.drain !== "function") {
      throw new TypeError("BatchProcessor requires a buffer with drain()");
    }
    if (!writer || typeof writer.write !== "function") {
      throw new TypeError("BatchProcessor requires a writer with write()");
    }

    this.buffer = buffer;
    this.writer = writer;
    this.interval = Number(interval) > 0 ? Number(interval) : 2_000;
    this.timer = setInterval(() => this.flush(), this.interval);
    if (typeof this.timer.unref === "function") {
      this.timer.unref();
    }
  }

  flush() {
    const batch = this.buffer.drain();
    if (batch.length === 0) return 0;
    this.writer.write(JSON.stringify(batch) + "\n");
    return batch.length;
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}

module.exports = {
  BatchProcessor,
};
