"use strict";

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const UI_ROOT = path.join(__dirname, "..", "saas", "ui");

function createServer() {
  return http.createServer((req, res) => {
    const url = new URL(req.url, "http://localhost");
    if (req.method === "GET" && url.pathname === "/healthz") {
      return json(res, 200, { ok: true, service: "cyvx-saas", timestamp: new Date().toISOString() });
    }
    if (req.method === "GET" && url.pathname === "/readyz") {
      return json(res, 200, { ok: true, ready: true });
    }
    if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/console")) {
      return file(res, path.join(UI_ROOT, "index.html"));
    }
    if (req.method === "GET" && url.pathname.startsWith("/assets/")) {
      const name = path.basename(url.pathname);
      return file(res, path.join(UI_ROOT, name));
    }
    return json(res, 404, { ok: false, error: "not_found" });
  });
}

function file(res, target) {
  if (!fs.existsSync(target)) return json(res, 404, { ok: false, error: "asset_not_found" });
  const body = fs.readFileSync(target);
  const type = target.endsWith(".html") ? "text/html; charset=utf-8" : target.endsWith(".css") ? "text/css; charset=utf-8" : "application/javascript; charset=utf-8";
  res.statusCode = 200;
  res.setHeader("content-type", type);
  res.setHeader("content-length", body.length);
  res.setHeader("x-content-type-options", "nosniff");
  res.end(body);
}

function json(res, status, payload) {
  const body = Buffer.from(`${JSON.stringify(payload)}\n`);
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("content-length", body.length);
  res.end(body);
}

if (require.main === module) {
  const host = process.env.CYVX_SAAS_HOST || "127.0.0.1";
  const port = Number(process.env.CYVX_SAAS_PORT || 3300);
  const server = createServer();
  server.listen(port, host, () => console.log(`CYVX SaaS listening on http://${host}:${port}`));
}

module.exports = { createServer };
