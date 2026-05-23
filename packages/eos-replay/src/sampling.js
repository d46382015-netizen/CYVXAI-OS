"use strict";

class Sampler {
  constructor(rate = 1.0) {
    this.rate = clampRate(rate);
  }

  shouldSample() {
    return Math.random() < this.rate;
  }

  adjust(load) {
    const value = Number(load);
    if (!Number.isFinite(value)) return this.rate;
    if (value > 0.8) this.rate = 0.1;
    else if (value > 0.5) this.rate = 0.5;
    else this.rate = 1.0;
    return this.rate;
  }
}

function clampRate(rate) {
  const value = Number(rate);
  if (!Number.isFinite(value)) return 1.0;
  return Math.max(0, Math.min(1, value));
}

module.exports = {
  Sampler,
};
