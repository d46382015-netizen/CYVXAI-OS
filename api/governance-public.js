"use strict";

const crypto = require("node:crypto");
const http = require("node:http");
const { createGovernanceRuntime } = require("./governance");
const { SupabasePublicConfig } = require("../core/integrations/supabase-public-config");

function sendJson(res, status, payload, correlationId) {
  const body = Buffer.from(`${JSON.stringify({ ...payload, correlation_id: correlationId })}\n`);
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("content-length", body.length);
  res.setHeader("cache-control", "no-store");
  res.setHeader("x-content-type-options", "nosniff");
  res.end(body);
}

function createPublicGovernanceHandler(options = {}) {
  if (typeof options.baseHandle !== "function") throw new TypeError("baseHandle is required");
  const publicConfig = options.publicConfig || new SupabasePublicConfig({ repoRoot: options.repoRoot, env: options.env });

  return function handle(req, res) {
    const url = new URL(req.url, "http://cyvx.local");
    if (req.method === "GET" && url.pathname === "/api/v1/runtime/public-config") {
      const correlationId = String(req.headers["x-correlation-id"] || crypto.randomUUID()).slice(0, 128);
      const supabase = publicConfig.resolve();
      return sendJson(res, 200, {
        ok: true,
        integrations: { supabase },
        timestamp: new Date().toISOString()
      }, correlationId);
    }
    return options.baseHandle(req, res);
  };
}

function createPublicGovernanceServer(runtime, options = {}) {
  const handler = createPublicGovernanceHandler({
    baseHandle: runtime.handle,
    repoRoot: runtime.repoRoot,
    env: options.env,
    publicConfig: options.publicConfig
  });
  const server = http.createServer(handler);
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
  const server = createPublicGovernanceServer(runtime);
  const port = Number(process.env.CYVX_GOVERNANCE_PORT || 8790);
  const host = String(process.env.CYVX_GOVERNANCE_HOST || "127.0.0.1");
  const address = await server.listen(port, host);
  const supabase = new SupabasePublicConfig({ repoRoot: runtime.repoRoot }).resolve();
  runtime.logger.write("info", "governance.started", {
    host: address.address,
    port: address.port,
    db_path: runtime.dbPath,
    supabase_ready: supabase.ready,
    supabase_key_fingerprint: supabase.publishable_key_fingerprint
  });
  process.stdout.write(`${JSON.stringify({
    ok: true,
    service: "cyvx-autonomous-governance",
    url: `http://${host}:${address.port}/governance`,
    public_config_url: `http://${host}:${address.port}/api/v1/runtime/public-config`,
    supabase_ready: supabase.ready,
    supabase_missing: supabase.missing,
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
  sendJson
};
