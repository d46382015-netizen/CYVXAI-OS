"use strict";

const http = require("node:http");
const { renderMetrics } = require("./metrics");

function createServer(overview) {
  return http.createServer((req, res) => {
    const path = new URL(req.url, "http://localhost").pathname;
    if (req.method !== "GET") return json(res, 405, { ok: false, error: "method_not_allowed" });
    if (path === "/healthz" || path === "/livez") return json(res, 200, { ok: true, status: "ok" });
    const snapshot = overview();
    if (path === "/readyz") {
      const ready = ["production", "ready"].includes(snapshot.readiness.grade);
      return json(res, ready ? 200 : 503, { ok: ready, readiness: snapshot.readiness });
    }
    if (path === "/api/control-plane" || path === "/api/overview") return json(res, 200, { ok: true, data: snapshot });
    if (path === "/metrics") {
      res.statusCode = 200;
      res.setHeader("content-type", "text/plain; version=0.0.4; charset=utf-8");
      return res.end(renderMetrics(snapshot));
    }
    return json(res, 404, { ok: false, error: "not_found" });
  });
}

function json(res, status, payload) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.setHeader("x-content-type-options", "nosniff");
  res.end(`${JSON.stringify(payload)}\n`);
}

function listen(server, port) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
}

function close(server) {
  if (!server.listening) return Promise.resolve();
  return new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

module.exports = { close, createServer, listen };
