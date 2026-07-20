"use strict";

const fs = require("node:fs");
const path = require("node:path");
const base = require("./public");

const UI_ROOT = path.join(__dirname, "..", "ui");
const EXPERIENCE_ROUTES = new Map([
  ["/", "public.html"],
  ["/public", "public.html"],
  ["/public/", "public.html"],
  ["/control", "index.html"],
  ["/control/", "index.html"],
]);

async function createPublicRuntime(options = {}) {
  const runtime = await base.createPublicRuntime(options);
  const server = runtime.publicServer;
  const listeners = server.listeners("request");
  if (listeners.length !== 1) {
    throw new Error(`Expected one public request listener, received ${listeners.length}`);
  }
  const delegate = listeners[0];
  server.removeListener("request", delegate);
  server.on("request", (req, res) => {
    const url = new URL(req.url, "http://cyvx.public");
    const fileName = routePublicExperience(req.method, url.pathname);
    if (fileName) return serveExperience(res, fileName, req.method === "HEAD");
    return delegate(req, res);
  });
  return runtime;
}

function routePublicExperience(method, pathname) {
  if (method !== "GET" && method !== "HEAD") return null;
  return EXPERIENCE_ROUTES.get(String(pathname || "")) || null;
}

function serveExperience(res, fileName, headOnly = false) {
  const filePath = path.join(UI_ROOT, fileName);
  if (!filePath.startsWith(UI_ROOT) || !fs.existsSync(filePath)) {
    res.statusCode = 404;
    res.setHeader("content-type", "text/plain; charset=utf-8");
    return res.end("CYVX experience unavailable\n");
  }
  const stat = fs.statSync(filePath);
  res.statusCode = 200;
  res.setHeader("content-type", "text/html; charset=utf-8");
  res.setHeader("content-length", stat.size);
  res.setHeader("cache-control", "no-cache");
  res.setHeader("x-content-type-options", "nosniff");
  res.setHeader("x-frame-options", "SAMEORIGIN");
  res.setHeader("referrer-policy", "strict-origin-when-cross-origin");
  if (headOnly) return res.end();
  return fs.createReadStream(filePath).pipe(res);
}

module.exports = { ...base, createPublicRuntime, routePublicExperience, serveExperience };
