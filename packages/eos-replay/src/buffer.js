"use strict";

class RingBuffer {
  constructor(size = 10_000) {
    const capacity = Number(size);
    this.size = Number.isFinite(capacity) && capacity > 0 ? Math.floor(capacity) : 10_000;
    this.buffer = new Array(this.size);
    this.writeIndex = 0;
  }

  push(event) {
    this.buffer[this.writeIndex % this.size] = event;
    this.writeIndex += 1;
    return this.writeIndex;
  }

  drain() {
    const batch = [];
    const limit = Math.min(this.writeIndex, this.size);
    for (let index = 0; index < limit; index += 1) {
      const item = this.buffer[index];
      if (item) batch.push(item);
    }
    this.buffer = new Array(this.size);
    this.writeIndex = 0;
    return batch;
  }
}

module.exports = {
  RingBuffer,
};
