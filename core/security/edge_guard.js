"use strict";

const crypto = require("node:crypto");
const { truthy } = require("./production_guard");

const DEFAULT_BYPASS_PATHS = new Set(["/health", "/healthz", "/livez"]);

class EdgeGuard {
  constructor(options = {}) {
    this.env = options.env || process.env;
    this.required = options.required ?? truthy(this.env.CYVX_REQUIRE_EDGE);
    this.secret = String(options.secret || this.env.CYVX_EDGE_ORIGIN_SECRET || "").trim();
    this.headerName = String(options.headerName || this.env.CYVX_EDGE_ORIGIN_HEADER || "x-cyvx-edge-secret").trim().toLowerCase();
    this.bypassPaths = new Set(options.bypassPaths || DEFAULT_BYPASS_PATHS);
  }

  configured() {
    return !this.required || this.secret.length >= 32;
  }

  allow(req, url) {
    const pathname = typeof url === "string" ? new URL(url, "http://cyvx.local").pathname : url && url.pathname || "/";
    if (!this.required || this.bypassPaths.has(pathname)) return true;
    const provided = String(req && req.headers && req.headers[this.headerName] || "").trim();
    return safeEqual(provided, this.secret);
  }

  require(req, url) {
    if (this.allow(req, url)) return true;
    const error = new Error("The request did not arrive through the trusted CYVX edge.");
    error.code = "TRUSTED_EDGE_REQUIRED";
    error.statusCode = 403;
    throw error;
  }

  snapshot() {
    return {
      required: this.required,
      configured: this.configured(),
      header: this.headerName,
      bypass_paths: [...this.bypassPaths],
    };
  }
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left || ""));
  const b = Buffer.from(String(right || ""));
  if (!a.length || a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

module.exports = { DEFAULT_BYPASS_PATHS, EdgeGuard, safeEqual };
