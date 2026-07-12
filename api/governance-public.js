"use strict";

const crypto = require("node:crypto");
const http = require("node:http");
const { createGovernanceRuntime } = require("./governance");
const { SupabasePublicConfig } = require("../core/integrations/supabase-public-config");
const { SupabaseRuntime } = require("../core/integrations/supabase-runtime");
const { verifyToken } = require("../runtime/missions/base");

function sendJson(res, status, payload, correlationId) {
  const body = Buffer.from(`${JSON.stringify({ ...payload, correlation_id: correlationId })}\n`);
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("content-length", body.length);
  res.setHeader("cache-control", "no-store");
  res.setHeader("x-content-type-options", "nosniff");
  res.end(body);
}

function sendError(res, error, correlationId) {
  const status = Number(error.status || 500);
  return sendJson(res, status, {
    ok: false,
    error: status >= 500 ? "INTERNAL_ERROR" : error.code || "REQUEST_FAILED",
    message: status >= 500 ? "An internal error occurred" : error.message
  }, correlationId);
}

function createPublicGovernanceHandler(options = {}) {
  if (typeof options.baseHandle !== "function") throw new TypeError("baseHandle is required");
  const publicConfig = options.publicConfig || new SupabasePublicConfig({ repoRoot: options.repoRoot, env: options.env });
  const supabase = options.supabase || new SupabaseRuntime({
    repoRoot: options.repoRoot,
    env: options.env,
    logger: options.logger,
    config: publicConfig,
    fetch: options.fetch
  });

  return async function handle(req, res) {
    const url = new URL(req.url, "http://cyvx.local");
    const correlationId = String(req.headers["x-correlation-id"] || crypto.randomUUID()).slice(0, 128);
    try {
      if (req.method === "GET" && url.pathname === "/api/v1/runtime/public-config") {
        return sendJson(res, 200, {
          ok: true,
          integrations: { supabase: publicConfig.resolve() },
          timestamp: new Date().toISOString()
        }, correlationId);
      }

      if (req.method === "GET" && url.pathname === "/api/v1/runtime/supabase/status") {
        return sendJson(res, 200, {
          ok: true,
          supabase: supabase.status(),
          timestamp: new Date().toISOString()
        }, correlationId);
      }

      if (req.method === "GET" && url.pathname === "/api/v1/integrations/supabase/probe") {
        if (typeof options.authenticate !== "function") {
          const error = new Error("Authentication is unavailable");
          error.code = "AUTH_UNAVAILABLE";
          error.status = 503;
          throw error;
        }
        options.authenticate(req);
        const report = await supabase.probe();
        return sendJson(res, report.ok ? 200 : 503, { ok: report.ok, report }, correlationId);
      }

      await supabase.refreshSession(req, res);
      return await Promise.resolve(options.baseHandle(req, res));
    } catch (error) {
      if (options.logger && typeof options.logger.write === "function") {
        options.logger.write(Number(error.status || 500) >= 500 ? "error" : "warn", "supabase.request_failed", {
          correlation_id: correlationId,
          code: error.code || "INTERNAL_ERROR",
          message: error.message
        });
      }
      if (!res.writableEnded) return sendError(res, error, correlationId);
      return undefined;
    }
  };
}

function createPublicGovernanceServer(runtime, options = {}) {
  const authenticate = options.authenticate || ((req) => {
    const header = String(req.headers.authorization || "");
    if (!header.startsWith("Bearer ")) {
      const error = new Error("Bearer authentication is required");
      error.code = "AUTH_REQUIRED";
      error.status = 401;
      throw error;
    }
    return verifyToken(header.slice(7), runtime.authSecret, runtime.db);
  });
  const handler = createPublicGovernanceHandler({
    baseHandle: runtime.handle,
    repoRoot: runtime.repoRoot,
    env: options.env,
    publicConfig: options.publicConfig,
    supabase: options.supabase,
    fetch: options.fetch,
    logger: runtime.logger,
    authenticate
  });
  const server = http.createServer((req, res) => {
    handler(req, res).catch((error) => {
      const correlationId = String(req.headers["x-correlation-id"] || crypto.randomUUID()).slice(0, 128);
      if (!res.writableEnded) sendError(res, error, correlationId);
    });
  });
  return {
    server,
    listen(port = 8790, host = "127.0.0.1") {
      return new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(port, host, () => resolve(server.address()));
      });
    },
    close() { return new Promise((resolve) => server.close(resolve)); }
  };
}

async function main() {
  const runtime = createGovernanceRuntime();
  const supabase = new SupabaseRuntime({ repoRoot: runtime.repoRoot, logger: runtime.logger });
  const server = createPublicGovernanceServer(runtime, { supabase });
  const port = Number(process.env.CYVX_GOVERNANCE_PORT || 8790);
  const host = String(process.env.CYVX_GOVERNANCE_HOST || "127.0.0.1");
  const address = await server.listen(port, host);
  const supabaseStatus = supabase.status();
  runtime.logger.write("info", "governance.started", {
    host: address.address,
    port: address.port,
    db_path: runtime.dbPath,
    supabase_ready: supabaseStatus.ready,
    supabase_project_url: supabaseStatus.project_url,
    supabase_key_fingerprint: supabaseStatus.publishable_key_fingerprint
  });
  process.stdout.write(`${JSON.stringify({
    ok: true,
    service: "cyvx-autonomous-governance",
    url: `http://${host}:${address.port}/governance`,
    public_config_url: `http://${host}:${address.port}/api/v1/runtime/public-config`,
    supabase_status_url: `http://${host}:${address.port}/api/v1/runtime/supabase/status`,
    supabase_probe_url: `http://${host}:${address.port}/api/v1/integrations/supabase/probe`,
    supabase_ready: supabaseStatus.ready,
    supabase_missing: supabaseStatus.missing,
    db_path: runtime.dbPath
  })}\n`);

  const shutdown = async (signal) => {
    runtime.logger.write("info", "governance.stopping", { signal });
    await server.close();
    runtime.close();
    process.exit(0);
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`${JSON.stringify({ ok: false, error: error.code || "START_FAILED", message: error.message })}\n`);
    process.exit(1);
  });
}

module.exports = {
  createPublicGovernanceHandler,
  createPublicGovernanceServer,
  sendJson,
  sendError
};
