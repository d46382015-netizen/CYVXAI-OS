"use strict";

const crypto = require("node:crypto");
const path = require("node:path");
const base = require("./public");
const { AutonomousCompanyRuntime } = require("../services/company-runtime");
const { createAutonomousCompanyGateway } = require("../services/company-runtime/gateway");
const { createCompanyScheduler } = require("../services/company-runtime/scheduler");

function companyControlToken(missions, options = {}, env = process.env) {
  const explicit = String(options.companyRuntimeToken || env.CYVX_COMPANY_RUNTIME_TOKEN || "").trim();
  if (explicit) return explicit;
  return crypto.createHmac("sha256", missions.authSecret)
    .update("cyvx-autonomous-company-control-v1")
    .digest("base64url");
}

function companyRoute(request, pathname) {
  if (request.method === "GET" && (pathname === "/" || pathname === "/control-room" || pathname === "/control")) return true;
  return pathname === "/api/v1/company-runtime" || pathname.startsWith("/api/v1/company-runtime/");
}

async function createPublicRuntime(options = {}) {
  const runtime = await base.createPublicRuntime(options);
  const env = options.env || process.env;
  const production = String(options.nodeEnv || env.NODE_ENV || "").toLowerCase() === "production";
  runtime.missions.logger = runtime.missions.logger || runtime.missions.store?.logger;
  const companyRuntime = new AutonomousCompanyRuntime(runtime.missions, {
    companyWorkspaceRoot: options.companyWorkspaceRoot || env.CYVX_COMPANY_ROOT || path.join(runtime.missions.dataRoot, "companies"),
    intelligenceStatePath: options.intelligenceStatePath || env.CYVX_MN_STATE_FILE,
    leaseMs: Number(options.companyLeaseMs || env.CYVX_COMPANY_RUNTIME_LEASE_MS || 60000),
    model: options.companyModel || {
      name: env.CYVX_COMPANY_MODEL_PROVIDER,
      model: env.CYVX_COMPANY_MODEL,
      command: env.CYVX_CLAUDE_COMMAND,
      timeoutMs: env.CYVX_CLAUDE_TIMEOUT_MS,
    },
  });
  const companyGateway = createAutonomousCompanyGateway(companyRuntime, {
    environment: production ? "production" : String(env.NODE_ENV || "development"),
    token: companyControlToken(runtime.missions, options, env),
    bodyLimit: options.companyBodyLimit || env.CYVX_COMPANY_RUNTIME_BODY_LIMIT,
    leadBodyLimit: options.companyLeadBodyLimit || env.CYVX_COMPANY_RUNTIME_LEAD_BODY_LIMIT,
    leadRateLimit: options.companyLeadRateLimit || env.CYVX_COMPANY_RUNTIME_LEAD_RATE_LIMIT,
    publicOrganization: options.publicOrganization || env.CYVX_PUBLIC_ORGANIZATION,
  });
  const companyScheduler = createCompanyScheduler(companyRuntime, {
    enabled: options.companyAutoTick !== undefined ? options.companyAutoTick : env.CYVX_COMPANY_RUNTIME_AUTO_TICK !== "false",
    intervalMs: options.companyTickIntervalMs || env.CYVX_COMPANY_RUNTIME_TICK_INTERVAL_MS,
    logger: runtime.missions.logger,
  });

  const publicServer = runtime.publicServer;
  const listeners = publicServer.listeners("request");
  if (listeners.length !== 1) throw new Error(`Expected one canonical public request listener, received ${listeners.length}`);
  const delegate = listeners[0];
  publicServer.removeListener("request", delegate);
  publicServer.on("request", (request, response) => {
    const url = new URL(request.url || "/", "http://cyvx.public");
    if (!companyRoute(request, url.pathname)) return delegate(request, response);
    if (request.method === "GET" && url.pathname === "/control") request.url = `/control-room${url.search}`;
    return companyGateway.handle(request, response);
  });

  const closeBase = runtime.close.bind(runtime);
  runtime.companyRuntime = companyRuntime;
  runtime.companyGateway = companyGateway;
  runtime.companyScheduler = companyScheduler;
  runtime.close = async () => {
    companyScheduler.close();
    await closeBase();
  };
  return runtime;
}

module.exports = { ...base, createPublicRuntime, companyControlToken, companyRoute };
