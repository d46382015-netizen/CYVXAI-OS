"use strict";

const { RequestCounters } = require("./request_counters");
const { metricsText } = require("./metrics_text");
const { applySecurityHeaders, isSecureRequest, resolveRequestId } = require("./request_context");

class RuntimeControl {
  constructor(options = {}) {
    this.counters = options.counters || new RequestCounters(options);
    this.ready = false;
    this.stopping = false;
  }

  begin(req, res) {
    const requestId = resolveRequestId(req);
    const finish = this.counters.begin();
    req.cyvxRequestId = requestId;
    res.setHeader("x-request-id", requestId);
    applySecurityHeaders(res, isSecureRequest(req));
    res.once("finish", () => finish(res.statusCode));
    return requestId;
  }

  markReady(value = true) {
    this.ready = Boolean(value);
  }

  beginShutdown() {
    this.stopping = true;
    this.ready = false;
  }

  isReady() {
    return this.ready && !this.stopping;
  }

  isStopping() {
    return this.stopping;
  }

  snapshot() {
    return {
      ready: this.isReady(),
      shutting_down: this.stopping,
      metrics: this.counters.snapshot(),
    };
  }

  text() {
    return metricsText(this.counters.snapshot());
  }
}

module.exports = { RuntimeControl };
