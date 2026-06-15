"use strict";

function metricsText(snapshot) {
  const latency = snapshot.latency_ms || {};
  return [
    "# TYPE cyvx_runtime_up gauge",
    "cyvx_runtime_up 1",
    "# TYPE cyvx_runtime_uptime_seconds gauge",
    `cyvx_runtime_uptime_seconds ${safe(snapshot.uptime_seconds)}`,
    "# TYPE cyvx_http_requests_total counter",
    `cyvx_http_requests_total ${safe(snapshot.requests_total)}`,
    "# TYPE cyvx_http_inflight_requests gauge",
    `cyvx_http_inflight_requests ${safe(snapshot.inflight_requests)}`,
    "# TYPE cyvx_http_errors_total counter",
    `cyvx_http_errors_total ${safe(snapshot.errors_total)}`,
    "# TYPE cyvx_http_latency_p95_milliseconds gauge",
    `cyvx_http_latency_p95_milliseconds ${safe(latency.p95)}`,
  ].join("\n") + "\n";
}

function safe(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

module.exports = { metricsText };
