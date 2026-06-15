"use strict";

function handleEdgeRoute(req, res, control) {
  const path = new URL(req.url, "http://localhost").pathname;
  if (path === "/healthz" || path === "/livez" || path === "/readyz") {
    const ready = control.isReady();
    sendJson(res, ready ? 200 : 503, { ok: ready, state: ready ? "ready" : "starting" });
    return true;
  }
  if (path === "/api/runtime/status") {
    sendJson(res, 200, {
      ok: true,
      runtime: control.snapshot(),
      node: process.version,
      platform: process.platform,
      architecture: process.arch,
    });
    return true;
  }
  if (path === "/api/runtime/metrics") {
    res.statusCode = 200;
    res.setHeader("content-type", "text/plain; version=0.0.4");
    res.setHeader("cache-control", "no-store");
    res.end(control.text());
    return true;
  }
  return false;
}

function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.end(JSON.stringify(body));
}

module.exports = { handleEdgeRoute, sendJson };
