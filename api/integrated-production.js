"use strict";

const http = require("node:http");
const net = require("node:net");
const { createProductionGateway: createLegacyGateway, buildReadiness } = require("./production");
const { createIntegrationRouter } = require("./integration_routes");
const { IntegrationHub } = require("../core/integrations/integration_hub");

async function createProductionGateway(options = {}) {
  const port = Number(options.port || process.env.CYVX_PORT || 3000);
  const host = options.host || process.env.CYVX_HOST || "0.0.0.0";
  const internalPort = Number(options.internalPort || process.env.CYVX_INTERNAL_PORT || port + 1);
  const legacyGatewayPort = Number(options.legacyGatewayPort || process.env.CYVX_LEGACY_GATEWAY_INTERNAL_PORT || internalPort + 100);
  if (new Set([port, internalPort, legacyGatewayPort]).size !== 3) throw new Error("CYVX integration, legacy gateway, and internal API ports must be distinct.");

  const integrations = options.integrations || new IntegrationHub({ env: options.env || process.env, telemetry: options.telemetry, fetch: options.fetch });
  integrations.assertConfiguration();
  const router = options.integrationRouter || createIntegrationRouter(integrations);
  const legacy = await createLegacyGateway({ ...options, port: legacyGatewayPort, internalPort, host: "127.0.0.1" });

  const gateway = http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://cyvx.integrated");
    setSecurityHeaders(res);
    try {
      integrations.edge.require(req, url);
      if (router.isPublicPath(url.pathname) && await router.handlePublic(req, res, url)) return;

      const context = await integrations.identity.resolve(req, { allowAnonymous: !isProtectedApi(url.pathname) });
      attachContext(req, context);
      if (await router.handleProtected(req, res, url, context)) return;

      if (isProtectedApi(url.pathname) && integrations.identity.required && !context.authenticated) {
        return sendJson(res, 401, { ok: false, error: "AUTHENTICATION_REQUIRED", message: "A valid CYVX identity is required." });
      }
      return proxyHttp(req, res, legacyGatewayPort, context);
    } catch (error) {
      await integrations.captureError(error, { operation: "integrated_gateway", path: url.pathname, method: req.method });
      return sendJson(res, error.statusCode || 500, { ok: false, error: error.code || "INTEGRATION_GATEWAY_ERROR", message: error.message });
    }
  });

  gateway.on("upgrade", async (req, socket, head) => {
    try {
      const url = new URL(req.url, "http://cyvx.integrated");
      integrations.edge.require(req, url);
      const context = await integrations.identity.resolve(req, { allowAnonymous: !isProtectedApi(url.pathname) });
      if (isProtectedApi(url.pathname) && integrations.identity.required && !context.authenticated) return socket.destroy();
      attachContext(req, context);
      proxyUpgrade(req, socket, head, legacyGatewayPort, context);
    } catch {
      socket.destroy();
    }
  });

  return {
    ...legacy,
    gateway,
    host,
    port,
    internalPort,
    legacyGatewayPort,
    integrations,
    integrationRouter: router,
    legacyGateway: legacy,
    async listen() {
      await legacy.listen();
      try { await listen(gateway, port, host); }
      catch (error) { await legacy.close(); throw error; }
      integrations.start();
      return this;
    },
    async close() {
      integrations.stop();
      await Promise.all([closeServer(gateway), legacy.close()]);
    },
  };
}

function isProtectedApi(pathname) {
  if (!String(pathname).startsWith("/api/")) return false;
  if (pathname.startsWith("/api/public/")) return false;
  if (pathname === "/api/webhooks/stripe") return false;
  if (pathname === "/api/github/webhook" || pathname === "/api/github/oauth/callback") return false;
  if (pathname.startsWith("/api/github/") || pathname === "/api/session/operator") return false;
  return true;
}

function attachContext(req, context) {
  if (!context || !context.authenticated) return;
  req.headers["x-cyvx-user-id"] = String(context.user_id || "");
  req.headers["x-cyvx-tenant-id"] = String(context.tenant_id || "");
  req.headers["x-cyvx-role"] = String(context.role || "");
  req.headers["x-cyvx-aal"] = String(context.aal || "aal1");
}

function proxyHttp(req, res, port, context) {
  const headers = { ...req.headers, host: `127.0.0.1:${port}` };
  if (context && context.authenticated && process.env.CYVX_API_KEY) headers["x-api-key"] = process.env.CYVX_API_KEY;
  delete headers["x-cyvx-edge-secret"];
  const upstream = http.request({ host: "127.0.0.1", port, method: req.method, path: req.url, headers }, (upstreamRes) => {
    res.writeHead(upstreamRes.statusCode || 502, upstreamRes.headers);
    upstreamRes.pipe(res);
  });
  upstream.on("error", (error) => {
    if (!res.headersSent) sendJson(res, 502, { ok: false, error: "UPSTREAM_UNAVAILABLE", message: error.message });
    else res.destroy(error);
  });
  req.pipe(upstream);
}

function proxyUpgrade(req, clientSocket, head, port, context) {
  const headersObject = { ...req.headers, host: `127.0.0.1:${port}` };
  if (context && context.authenticated && process.env.CYVX_API_KEY) headersObject["x-api-key"] = process.env.CYVX_API_KEY;
  delete headersObject["x-cyvx-edge-secret"];
  const upstream = net.connect(port, "127.0.0.1", () => {
    const headers = Object.entries(headersObject).map(([key, value]) => `${key}: ${value}`).join("\r\n");
    upstream.write(`${req.method} ${req.url} HTTP/${req.httpVersion}\r\n${headers}\r\n\r\n`);
    if (head && head.length) upstream.write(head);
    clientSocket.pipe(upstream).pipe(clientSocket);
  });
  upstream.on("error", () => clientSocket.destroy());
  clientSocket.on("error", () => upstream.destroy());
}

function listen(server, port, host) {
  return new Promise((resolve, reject) => {
    const onError = (error) => { server.off("listening", onListening); reject(error); };
    const onListening = () => { server.off("error", onError); resolve(); };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(port, host);
  });
}

function closeServer(server) {
  if (!server || !server.listening) return Promise.resolve();
  return new Promise((resolve) => server.close(resolve));
}

function setSecurityHeaders(res) {
  res.setHeader("x-content-type-options", "nosniff");
  res.setHeader("x-frame-options", "DENY");
  res.setHeader("referrer-policy", "no-referrer");
  res.setHeader("permissions-policy", "camera=(), microphone=(), geolocation=()");
}

function sendJson(res, status, payload) {
  const body = Buffer.from(`${JSON.stringify(payload)}\n`);
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("content-length", body.length);
  res.setHeader("cache-control", "no-store");
  res.end(body);
}

module.exports = { attachContext, buildReadiness, createProductionGateway, isProtectedApi };
