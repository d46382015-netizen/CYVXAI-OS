"use strict";

const crypto = require("node:crypto");
const http = require("node:http");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const { createApiServer, wrap } = require("./index");
const { captureOutcome } = require("./outcome");
const { CyvxController } = require("../core/controller");
const { PlatformKernel } = require("../core/platform");
const { GitHubAppIntegration } = require("../core/integrations/github_app_integration");
const { GitHubAppClient } = require("../core/integrations/github_control_plane/app_auth");
const { GitHubAuthStore } = require("../core/integrations/github_control_plane/auth_store");
const { createCredentialCipher } = require("../core/integrations/github_control_plane/credential_crypto");
const { createGitHubOAuthService, sanitizeConnection } = require("../core/integrations/github_control_plane/oauth_service");
const { createOAuthStateService } = require("../core/integrations/github_control_plane/oauth_state");
const { GitHubWebhookStore } = require("../core/integrations/github_control_plane/store");
const { createGitHubWebhookService, sendJson } = require("../core/integrations/github_control_plane/service");
const { createOperatorSession } = require("../core/security/operator_session");
const { validatePayload } = require("../core/security/request_validation");

async function createProductionGateway(options = {}) {
  const publicPort = Number(options.port || process.env.CYVX_PORT || 3000);
  const host = options.host || process.env.CYVX_HOST || "0.0.0.0";
  const internalPort = Number(options.internalPort || process.env.CYVX_INTERNAL_PORT || publicPort + 1);
  const ownerUserId = String(process.env.CYVX_OWNER_ID || "").trim();
  if (publicPort === internalPort) throw new Error("CYVX_INTERNAL_PORT must differ from CYVX_PORT");

  const security = resolveSecurityConfig(options, host);
  assertRequiredSecurityConfiguration(security);

  const controller = options.controller || new CyvxController({
    port: publicPort,
    dbFile: process.env.CYVX_DB || undefined,
  });
  if (!options.controller) await controller.boot();

  const platformBackend = String(options.platformBackend || process.env.CYVX_PLATFORM_BACKEND || "sqlite").toLowerCase();
  const platformFile = platformBackend === "json"
    ? process.env.CYVX_PLATFORM_STATE || path.join(os.homedir(), ".cyvx", "platform-state.json")
    : process.env.CYVX_PLATFORM_DB || path.join(os.homedir(), ".cyvx", "platform.db");
  const platform = options.platform || new PlatformKernel({ filePath: platformFile });
  const store = options.webhookStore || new GitHubWebhookStore({
    filePath: process.env.CYVX_GITHUB_WEBHOOK_STORE || path.join(os.homedir(), ".cyvx", "github-webhooks.json"),
  });
  const webhook = options.webhookService || createGitHubWebhookService({
    secret: process.env.GITHUB_WEBHOOK_SECRET || "",
    store,
    platform,
    maxBodyBytes: Number(process.env.CYVX_GITHUB_WEBHOOK_MAX_BYTES || 1_000_000),
    maxAttempts: Number(process.env.CYVX_GITHUB_WEBHOOK_MAX_ATTEMPTS || 5),
  });

  const authStore = options.authStore || new GitHubAuthStore({
    filePath: process.env.CYVX_GITHUB_AUTH_STORE || path.join(os.homedir(), ".cyvx", "github-auth.json"),
  });
  const appClient = options.appClient || new GitHubAppClient({
    appId: process.env.GITHUB_APP_ID || "",
    privateKey: process.env.GITHUB_PRIVATE_KEY_PEM || "",
  });
  const stateService = options.stateService || createOAuthStateService({
    secret: process.env.GITHUB_OAUTH_STATE_SECRET || "",
    store: authStore,
  });
  const cipher = options.cipher === undefined ? safeCreateCredentialCipher(process.env.GITHUB_TOKEN_ENCRYPTION_KEY || "") : options.cipher;
  const operatorSession = options.operatorSession || createOperatorSession({
    secret: process.env.CYVX_OPERATOR_SESSION_SECRET || "",
    ownerUserId,
  });
  const oauth = options.oauthService || createGitHubOAuthService({
    clientId: process.env.GITHUB_CLIENT_ID || "",
    clientSecret: process.env.GITHUB_CLIENT_SECRET || "",
    appSlug: process.env.GITHUB_APP_SLUG || "",
    ownerUserId: "",
    stateService,
    authStore,
    cipher,
    appClient,
    authorizeRequest: (req) => Boolean(operatorSession.userId(req)),
  });

  const primaryConnection = () => ownerUserId ? authStore.getConnection(ownerUserId) : null;
  const githubFactory = options.githubFactory || (() => new GitHubAppIntegration({
    appClient,
    installationIdProvider: () => {
      const connection = primaryConnection();
      return connection && connection.installation_id || null;
    },
    fallbackOptions: {},
  }));

  assertRequiredGitHubConfiguration({ appClient, oauth, operatorSession, webhook });

  const { server: internalServer } = createApiServer(controller, { platform, githubFactory, apiKey: security.apiKey });
  const gateway = http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://localhost");
    try {
      if (url.pathname === "/healthz" || url.pathname === "/health") {
        return sendJson(res, 200, { ok: true, status: "ok" });
      }
      if (url.pathname === "/readyz") {
        const readiness = buildReadiness({ webhook, appClient, oauth, operatorSession, security, platform });
        return sendJson(res, readiness.ready ? 200 : 503, { ok: readiness.ready, readiness });
      }
      if (url.pathname === "/api/github/webhook") return webhook.handle(req, res);

      if (url.pathname === "/api/session/operator") {
        if (req.method === "GET") {
          const payload = operatorSession.verify(req);
          return sendJson(res, 200, {
            ok: true,
            authenticated: Boolean(payload),
            user_id: payload && payload.sub || null,
            expires_at: payload && payload.exp ? new Date(payload.exp * 1000).toISOString() : null,
            configured: operatorSession.configured(),
          });
        }
        if (req.method === "POST") {
          if (!hasApiKey(security) || !authorize(req, security)) return sendJson(res, 401, { ok: false, error: "invalid_operator_key" });
          const issued = operatorSession.issue(res, { secure: isSecureRequest(req) });
          return sendJson(res, 200, { ok: true, authenticated: true, ...issued });
        }
        if (req.method === "DELETE") {
          operatorSession.clear(res, isSecureRequest(req));
          return sendJson(res, 200, { ok: true, authenticated: false });
        }
        return sendJson(res, 405, { ok: false, error: "method_not_allowed" }, { allow: "GET, POST, DELETE" });
      }

      const sessionUserId = operatorSession.userId(req);
      if (sessionUserId) req.headers["x-cyvx-user-id"] = sessionUserId;

      if (url.pathname === "/api/github/install") return oauth.handleInstall(req, res, url);
      if (url.pathname === "/api/github/oauth/callback") return oauth.handleCallback(req, res, url);
      if (url.pathname === "/api/github/installations") return oauth.handleInstallations(req, res);
      if (url.pathname.startsWith("/api/github/installations/")) {
        const installationId = url.pathname.split("/").pop();
        return oauth.handleDisconnect(req, res, installationId);
      }

      if (url.pathname === "/api/github/status") {
        if (req.method !== "GET") return sendJson(res, 405, { ok: false, error: "method_not_allowed" }, { allow: "GET" });
        const authenticated = Boolean(sessionUserId);
        const connection = authenticated ? oauth.connectionForRequest(req) : null;
        const repositoryAuth = await githubFactory().authenticationHealth();
        return sendJson(res, 200, wrap({
          github: {
            authenticated,
            connection: authenticated ? sanitizeConnection(connection) : null,
            recent_deliveries: authenticated ? store.list({ limit: 12 }).map(sanitizeDelivery) : [],
            readiness: buildReadiness({ webhook, appClient, oauth, operatorSession, security, platform }),
            repository_auth: repositoryAuth,
          },
        }));
      }

      if (url.pathname === "/api/github/deliveries") {
        if (req.method !== "GET") return sendJson(res, 405, { ok: false, error: "method_not_allowed" }, { allow: "GET" });
        if (!operatorAuthorized(req, operatorSession, security)) return sendJson(res, 401, { ok: false, error: "operator_authentication_required" });
        const limit = Math.max(1, Math.min(100, Number(url.searchParams.get("limit") || 25)));
        return sendJson(res, 200, { ok: true, deliveries: store.list({ limit }).map(sanitizeDelivery) });
      }

      if (/^\/api\/github\/deliveries\/[^/]+\/retry$/.test(url.pathname)) {
        if (req.method !== "POST") return sendJson(res, 405, { ok: false, error: "method_not_allowed" }, { allow: "POST" });
        if (!operatorAuthorized(req, operatorSession, security)) return sendJson(res, 401, { ok: false, error: "operator_authentication_required" });
        const deliveryId = decodeURIComponent(url.pathname.split("/")[4]);
        const result = await webhook.retry(deliveryId);
        return sendJson(res, 200, { ok: true, delivery: sanitizeDelivery(result) });
      }

      if (url.pathname === "/api/github/control-plane/health") {
        if (req.method !== "GET") return sendJson(res, 405, { ok: false, error: "method_not_allowed" }, { allow: "GET" });
        return sendJson(res, 200, wrap({
          github_control_plane: {
            readiness: buildReadiness({ webhook, appClient, oauth, operatorSession, security, platform }),
            webhook: webhook.health(),
            app_auth: appClient.health(),
            oauth: oauth.health(),
            operator_session: operatorSession.health(),
            repository_auth: await githubFactory().authenticationHealth(),
          },
        }));
      }

      if (url.pathname === "/api/v1/workloads") {
        if (!authorize(req, security)) return sendJson(res, 401, wrap({ error: "unauthorized" }));
        if (req.method === "GET") return sendJson(res, 200, wrap({ workloads: controller.snapshot().cluster.workloads }));
        if (req.method === "POST") {
          const body = await readJsonLimited(req);
          validatePayload("workload", body);
          return sendJson(res, 200, wrap(controller.submitWorkload(body)));
        }
        return sendJson(res, 405, wrap({ error: "method_not_allowed" }), { allow: "GET, POST" });
      }

      if (url.pathname === "/api/v1/actions") {
        if (!authorize(req, security)) return sendJson(res, 401, wrap({ error: "unauthorized" }));
        if (req.method === "GET") return sendJson(res, 200, wrap({ actions: controller.actions }));
        if (req.method === "POST") {
          const body = await readJsonLimited(req);
          validatePayload("action", body);
          return sendJson(res, 200, wrap(controller.executeAction(body)));
        }
        return sendJson(res, 405, wrap({ error: "method_not_allowed" }), { allow: "GET, POST" });
      }

      if (url.pathname === "/api/outcome") {
        if (!authorize(req, security)) return sendJson(res, 401, wrap({ error: "unauthorized" }));
        if (req.method !== "POST") return sendJson(res, 405, wrap({ error: "method_not_allowed" }), { allow: "POST" });
        const body = await readJsonLimited(req);
        validatePayload("outcome", body);
        return sendJson(res, 200, { ok: true, outcome: captureOutcome(body) });
      }

      return proxyHttp(req, res, internalPort);
    } catch (error) {
      return sendJson(res, error.statusCode || 400, wrap({
        error: error.code || "invalid_request",
        message: error.message,
        field: error.field || null,
      }));
    }
  });

  gateway.on("upgrade", (req, socket, head) => {
    if (!operatorAuthorized(req, operatorSession, security)) return socket.destroy();
    return proxyUpgrade(req, socket, head, internalPort);
  });

  return {
    appClient,
    authStore,
    cipher,
    controller,
    gateway,
    githubFactory,
    host,
    internalPort,
    internalServer,
    oauth,
    operatorSession,
    platform,
    port: publicPort,
    security,
    stateService,
    store,
    webhook,
    async listen() {
      await listen(internalServer, internalPort, "127.0.0.1");
      await listen(gateway, publicPort, host);
      return this;
    },
    async close() {
      await Promise.all([closeServer(gateway), closeServer(internalServer)]);
      if (typeof controller.stop === "function") controller.stop();
      if (platform && platform.store && typeof platform.store.close === "function") platform.store.close();
    },
  };
}

function buildReadiness({ webhook, appClient, oauth, operatorSession, security = null, platform = null }) {
  const webhookReady = webhook.health().configured;
  const appReady = appClient.health().configured;
  const oauthReady = oauth.health().configured;
  const sessionReady = operatorSession.health().configured;
  const securityReady = security ? Boolean(security.apiKey) || (security.allowInsecureLocalhost && isLoopbackHost(security.host)) : true;
  const persistence = platform && platform.store && typeof platform.store.metadata === "function" ? platform.store.metadata() : null;
  const persistenceReady = !persistence || persistence.backend === "sqlite" || persistence.backend === "json";
  return {
    ready: webhookReady && appReady && oauthReady && sessionReady && securityReady && persistenceReady,
    webhook_ready: webhookReady,
    app_auth_ready: appReady,
    oauth_ready: oauthReady,
    operator_session_ready: sessionReady,
    security_ready: securityReady,
    persistence_ready: persistenceReady,
    persistence,
  };
}

function assertRequiredGitHubConfiguration(services) {
  if (String(process.env.CYVX_REQUIRE_GITHUB_APP || "").toLowerCase() !== "true") return;
  const readiness = buildReadiness(services);
  if (!readiness.ready) {
    const missing = Object.entries(readiness).filter(([key, value]) => key.endsWith("_ready") && !value).map(([key]) => key);
    throw new Error(`GitHub App production configuration is incomplete: ${missing.join(", ")}`);
  }
}

function resolveSecurityConfig(options = {}, host = "0.0.0.0") {
  const explicitAllow = options.allowInsecureLocalhost;
  return {
    apiKey: String(options.apiKey !== undefined ? options.apiKey : process.env.CYVX_API_KEY || "").trim(),
    allowInsecureLocalhost: explicitAllow !== undefined
      ? Boolean(explicitAllow)
      : String(process.env.CYVX_ALLOW_INSECURE_LOCALHOST || "").toLowerCase() === "true",
    host,
  };
}

function assertRequiredSecurityConfiguration(security) {
  if (security.apiKey) return true;
  if (security.allowInsecureLocalhost && isLoopbackHost(security.host)) return true;
  const error = new Error("CYVX_API_KEY is required for the production gateway; localhost-only bypass requires CYVX_ALLOW_INSECURE_LOCALHOST=true and a loopback bind");
  error.code = "PRODUCTION_AUTH_NOT_CONFIGURED";
  error.statusCode = 503;
  throw error;
}

function sanitizeDelivery(delivery) {
  if (!delivery) return null;
  return {
    delivery_id: delivery.delivery_id,
    event: delivery.event,
    action: delivery.action,
    installation_id: delivery.installation_id,
    repository_id: delivery.repository_id,
    repository: delivery.repository,
    sender: delivery.sender,
    payload_sha256: delivery.payload_sha256,
    status: delivery.status,
    attempts: delivery.attempts,
    duplicate_count: delivery.duplicate_count,
    mapping: delivery.mapping ? {
      created: Array.isArray(delivery.mapping.created) ? delivery.mapping.created.map((item) => ({ kind: item.kind, id: item.id })) : [],
      ignored: Boolean(delivery.mapping.ignored),
      ignored_reason: delivery.mapping.ignored_reason || null,
    } : null,
    error: delivery.error ? { code: delivery.error.code, message: delivery.error.message } : null,
    accepted_at: delivery.accepted_at,
    processing_started_at: delivery.processing_started_at || null,
    completed_at: delivery.completed_at || null,
    failed_at: delivery.failed_at || null,
    updated_at: delivery.updated_at,
  };
}

function safeCreateCredentialCipher(secret) {
  if (!String(secret || "").trim()) return null;
  try {
    return createCredentialCipher(secret);
  } catch (error) {
    console.error(JSON.stringify({
      message: "github_credential_cipher_unavailable",
      error: error.message,
      timestamp: new Date().toISOString(),
    }));
    return null;
  }
}

function proxyHttp(req, res, internalPort) {
  const upstream = http.request({
    host: "127.0.0.1",
    port: internalPort,
    method: req.method,
    path: req.url,
    headers: Object.assign({}, req.headers, { host: `127.0.0.1:${internalPort}` }),
  }, (upstreamRes) => {
    res.writeHead(upstreamRes.statusCode || 502, upstreamRes.headers);
    upstreamRes.pipe(res);
  });
  upstream.on("error", (error) => {
    if (!res.headersSent) sendJson(res, 502, wrap({ error: "upstream_unavailable", message: error.message }));
    else res.destroy(error);
  });
  req.pipe(upstream);
}

function proxyUpgrade(req, clientSocket, head, internalPort) {
  const upstream = net.connect(internalPort, "127.0.0.1", () => {
    const headers = Object.entries(req.headers).map(([key, value]) => `${key}: ${value}`).join("\r\n");
    upstream.write(`${req.method} ${req.url} HTTP/${req.httpVersion}\r\n${headers}\r\n\r\n`);
    if (head && head.length) upstream.write(head);
    clientSocket.pipe(upstream).pipe(clientSocket);
  });
  upstream.on("error", () => clientSocket.destroy());
  clientSocket.on("error", () => upstream.destroy());
}

async function readJsonLimited(req, limitBytes = 1_000_000) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > limitBytes) {
      const error = new Error(`payload exceeds ${limitBytes} bytes`);
      error.code = "PAYLOAD_TOO_LARGE";
      error.statusCode = 413;
      throw error;
    }
    chunks.push(buffer);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks, size).toString("utf8"));
  } catch (cause) {
    const error = new Error("request body must be valid JSON");
    error.code = "INVALID_JSON";
    error.statusCode = 400;
    error.cause = cause;
    throw error;
  }
}

function hasApiKey(security = resolveSecurityConfig()) {
  return Boolean(String(security.apiKey || "").trim());
}

function authorize(req, security = resolveSecurityConfig()) {
  const apiKey = String(security.apiKey || "");
  if (!apiKey) {
    return Boolean(security.allowInsecureLocalhost) && isLoopbackAddress(req && req.socket && req.socket.remoteAddress);
  }
  const header = req.headers["x-api-key"] || req.headers.authorization || "";
  const token = String(header).replace(/^Bearer\s+/i, "");
  return safeTokenEqual(token, apiKey);
}

function operatorAuthorized(req, operatorSession, security = resolveSecurityConfig()) {
  if (operatorSession.userId(req)) return true;
  return authorize(req, security);
}

function safeTokenEqual(left, right) {
  const a = Buffer.from(String(left || ""));
  const b = Buffer.from(String(right || ""));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function isLoopbackHost(host) {
  return ["127.0.0.1", "::1", "localhost"].includes(String(host || "").toLowerCase());
}

function isLoopbackAddress(address) {
  const normalized = String(address || "").replace(/^::ffff:/, "");
  return normalized === "127.0.0.1" || normalized === "::1";
}

function isSecureRequest(req) {
  const forwarded = String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim();
  return forwarded === "https" || Boolean(req.socket && req.socket.encrypted);
}

function listen(server, port, host) {
  return new Promise((resolve, reject) => {
    const onError = (error) => {
      server.off("listening", onListening);
      reject(error);
    };
    const onListening = () => {
      server.off("error", onError);
      resolve();
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(port, host);
  });
}

function closeServer(server) {
  if (!server || !server.listening) return Promise.resolve();
  return new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

async function main() {
  const runtime = await createProductionGateway();
  await runtime.listen();
  console.log(`CYVX production gateway listening on http://${runtime.host}:${runtime.port}`);
  console.log(`CYVX internal API listening on http://127.0.0.1:${runtime.internalPort}`);
  console.log(JSON.stringify(wrap({
    production_readiness: buildReadiness(runtime),
    github_control_plane: {
      readiness: buildReadiness(runtime),
      webhook: runtime.webhook.health(),
      app_auth: runtime.appClient.health(),
      oauth: runtime.oauth.health(),
      operator_session: runtime.operatorSession.health(),
    },
  }), null, 2));

  const shutdown = async (signal) => {
    console.log(`Received ${signal}; shutting down CYVX.`);
    await runtime.close();
    process.exit(0);
  };
  process.once("SIGINT", () => shutdown("SIGINT"));
  process.once("SIGTERM", () => shutdown("SIGTERM"));
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = {
  assertRequiredSecurityConfiguration,
  authorize,
  buildReadiness,
  createProductionGateway,
  hasApiKey,
  isLoopbackAddress,
  isLoopbackHost,
  operatorAuthorized,
  readJsonLimited,
  resolveSecurityConfig,
  safeCreateCredentialCipher,
  sanitizeDelivery,
};
