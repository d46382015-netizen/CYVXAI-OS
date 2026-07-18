"use strict";

const http = require("node:http");

const FIELD_MANUAL_PREFIX = "/field-manual";

function isFieldManualPath(pathname) {
  return pathname === FIELD_MANUAL_PREFIX || pathname === `${FIELD_MANUAL_PREFIX}/` || pathname.startsWith(`${FIELD_MANUAL_PREFIX}/`);
}

function rewriteFieldManualPath(url) {
  let pathname = url.pathname.slice(FIELD_MANUAL_PREFIX.length) || "/";
  if (!pathname.startsWith("/")) pathname = `/${pathname}`;
  return pathname + url.search;
}

function resolveFieldManualPublicBaseUrl(env = process.env, override = "") {
  const explicit = String(override || env.CYVX_FIELD_PUBLIC_BASE_URL || "").trim();
  if (explicit) return explicit.replace(/\/$/, "");
  const appBase = String(env.APP_BASE_URL || env.CYVX_PUBLIC_BASE_URL || "").trim().replace(/\/$/, "");
  return appBase ? `${appBase}${FIELD_MANUAL_PREFIX}` : "";
}

function proxyFieldManual(request, response, port, targetPath) {
  const upstream = http.request({
    host: "127.0.0.1",
    port,
    method: request.method,
    path: targetPath,
    headers: { ...request.headers, host: `127.0.0.1:${port}` },
  }, (upstreamResponse) => {
    response.writeHead(upstreamResponse.statusCode || 502, upstreamResponse.headers);
    upstreamResponse.pipe(response);
  });

  upstream.on("error", () => {
    if (response.headersSent) return response.destroy();
    const body = Buffer.from(`${JSON.stringify({ ok: false, error: "FIELD_MANUAL_UNAVAILABLE" })}\n`);
    response.statusCode = 502;
    response.setHeader("content-type", "application/json; charset=utf-8");
    response.setHeader("content-length", body.length);
    response.end(body);
  });
  request.pipe(upstream);
}

function mountFieldManual(publicServer, fieldManualPort) {
  if (!publicServer || typeof publicServer.listeners !== "function") throw new Error("publicServer is required");
  const requestHandlers = publicServer.listeners("request");
  if (requestHandlers.length !== 1) throw new Error("Expected exactly one public request handler before mounting Field Manual");
  const baseHandler = requestHandlers[0];
  publicServer.removeAllListeners("request");
  publicServer.on("request", (request, response) => {
    const url = new URL(request.url, "http://cyvx.public");
    if (isFieldManualPath(url.pathname)) return proxyFieldManual(request, response, fieldManualPort, rewriteFieldManualPath(url));
    return baseHandler(request, response);
  });
  return publicServer;
}

module.exports = {
  FIELD_MANUAL_PREFIX,
  isFieldManualPath,
  rewriteFieldManualPath,
  resolveFieldManualPublicBaseUrl,
  proxyFieldManual,
  mountFieldManual,
};
