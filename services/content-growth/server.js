"use strict";

const http = require("node:http");
const {
  POSTS,
  TRIGGERS,
  createStore,
  validateEmail,
  resolveTrigger,
  verifySharedSecret,
  verifyLemonSignature,
  syncLeadToKit,
  renderSlideSvg,
  buildDownloadAsset,
  parseLemonPurchase,
} = require("./index");
const { sendJson, sendBuffer, readRawBody, parseJson, clientIp, createRateLimiter } = require("./http-utils");
const { publicConfig, landingHtml } = require("./ui");

function createFieldManualServer(options = {}) {
  const config = {
    host: options.host || process.env.CYVX_FIELD_HOST || "127.0.0.1",
    port: Number(options.port ?? process.env.CYVX_FIELD_PORT ?? 3080),
    publicBaseUrl: options.publicBaseUrl || process.env.CYVX_FIELD_PUBLIC_BASE_URL || "",
    dataDirectory: options.dataDirectory || process.env.CYVX_FIELD_DATA_DIR,
    manychatSecret: options.manychatSecret ?? process.env.CYVX_MANYCHAT_WEBHOOK_SECRET ?? "",
    adminToken: options.adminToken ?? process.env.CYVX_FIELD_ADMIN_TOKEN ?? "",
    lemonSecret: options.lemonSecret ?? process.env.LEMONSQUEEZY_WEBHOOK_SECRET ?? "",
    checkoutUrl: options.checkoutUrl ?? process.env.LEMONSQUEEZY_CHECKOUT_URL ?? "",
    kitApiKey: options.kitApiKey ?? process.env.KIT_API_KEY ?? "",
    kitTagIds: options.kitTagIds || {
      GENERAL_OPERATOR: process.env.KIT_TAG_GENERAL_OPERATOR,
      SECURITY: process.env.KIT_TAG_SECURITY,
      MOBILE_BUILD: process.env.KIT_TAG_MOBILE_BUILD,
    },
    fetchImpl: options.fetchImpl,
    logger: options.logger || console,
  };
  const store = options.store || createStore({ directory: config.dataDirectory });
  const allowLead = createRateLimiter({ windowMs: 60_000, max: 12 });

  function absoluteDownload(asset) {
    const local = `/downloads/${encodeURIComponent(asset)}`;
    return config.publicBaseUrl ? `${config.publicBaseUrl.replace(/\/$/, "")}${local}` : local;
  }

  function requireAdmin(request, response) {
    if (!config.adminToken || verifySharedSecret(request.headers["x-admin-token"], config.adminToken)) return true;
    sendJson(response, 401, { ok: false, error: "Unauthorized" });
    return false;
  }

  async function captureLead(body, channel) {
    if (body.website) return { accepted: true, suppressed: true, asset: null, download_url: null };
    const email = validateEmail(body.email || body.system_email);
    if (!email) {
      const error = new Error("A valid email address is required");
      error.status = 422;
      throw error;
    }
    const trigger = resolveTrigger(body.keyword || body.intent_tag || "MANUAL");
    if (!trigger) {
      const error = new Error("Unsupported content keyword");
      error.status = 422;
      throw error;
    }
    const lead = {
      email,
      first_name: String(body.first_name || "").trim().slice(0, 80) || null,
      consent: body.consent === true || body.email_marketing_consent === true || body.consent === "true",
      keyword: trigger.keyword,
      intent_tag: trigger.intent,
      pillar: trigger.pillar,
      source: trigger.source,
      channel,
      external_subscriber_id: body.subscriber_id || body.user_id || null,
      post_id: body.post_id || trigger.source,
    };
    const saved = store.recordLead(lead);
    let kit = { skipped: true, reason: saved.duplicate ? "duplicate" : "consent not granted" };
    if (!saved.duplicate && lead.consent) {
      try {
        kit = await syncLeadToKit(lead, { apiKey: config.kitApiKey, tagIds: config.kitTagIds, fetchImpl: config.fetchImpl });
      } catch (error) {
        config.logger.error(JSON.stringify({ event: "field_manual.kit_sync_failed", email_domain: String(email).split("@")[1] || "unknown", error: error.message }));
        kit = { skipped: false, failed: true, error: error.message };
      }
    }
    return {
      accepted: true,
      duplicate: saved.duplicate,
      lead_id: saved.lead && saved.lead.id,
      intent_tag: trigger.intent,
      source: trigger.source,
      asset: trigger.asset,
      download_url: absoluteDownload(trigger.asset),
      reply: trigger.reply,
      kit,
    };
  }

  const server = http.createServer(async (request, response) => {
    const requestId = request.headers["x-request-id"] || `req_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    response.setHeader("X-Request-Id", requestId);
    response.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    response.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    response.setHeader("Content-Security-Policy", "default-src 'self'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    try {
      const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);
      if (request.method === "GET" && url.pathname === "/") return sendBuffer(response, 200, Buffer.from(landingHtml(config)), "text/html; charset=utf-8", { "Cache-Control": "public, max-age=300" });
      if (request.method === "GET" && url.pathname === "/health") return sendJson(response, 200, { ok: true, service: "cyvx-field-manual", version: 1, triggers: Object.keys(TRIGGERS) });
      if (request.method === "GET" && url.pathname === "/api/v1/config") return sendJson(response, 200, { ok: true, ...publicConfig(config) });
      if (request.method === "GET" && url.pathname === "/api/v1/posts") return sendJson(response, 200, { ok: true, posts: POSTS });

      const slideMatch = url.pathname.match(/^\/api\/v1\/posts\/(POST_\d{3})\/slides\/(\d+)\.svg$/);
      if (request.method === "GET" && slideMatch) {
        const post = POSTS.find((item) => item.id === slideMatch[1]);
        const index = Number(slideMatch[2]) - 1;
        if (!post || !post.slides[index]) return sendJson(response, 404, { ok: false, error: "Slide not found" });
        return sendBuffer(response, 200, Buffer.from(renderSlideSvg(post, post.slides[index], index)), "image/svg+xml; charset=utf-8", { "Cache-Control": "public, max-age=3600" });
      }

      const downloadMatch = url.pathname.match(/^\/downloads\/([^/]+)$/);
      if (request.method === "GET" && downloadMatch) {
        const filename = decodeURIComponent(downloadMatch[1]);
        const trigger = Object.values(TRIGGERS).find((item) => item.asset === filename);
        if (!trigger) return sendJson(response, 404, { ok: false, error: "Asset not found" });
        const asset = buildDownloadAsset(filename);
        return sendBuffer(response, 200, asset, filename.endsWith(".pdf") ? "application/pdf" : "application/zip", {
          "Content-Disposition": `attachment; filename="${filename}"`,
          "Cache-Control": "private, max-age=300",
        });
      }

      if (request.method === "POST" && url.pathname === "/api/v1/leads") {
        const ip = clientIp(request);
        if (!allowLead(ip)) return sendJson(response, 429, { ok: false, error: "Rate limit exceeded" }, { "Retry-After": "60" });
        const result = await captureLead(parseJson(await readRawBody(request)), "landing_page");
        return sendJson(response, 201, { ok: true, ...result });
      }

      if (request.method === "POST" && url.pathname === "/api/v1/webhooks/manychat") {
        if (!verifySharedSecret(request.headers["x-cyvx-webhook-secret"], config.manychatSecret)) return sendJson(response, 401, { ok: false, error: "Invalid webhook secret" });
        const result = await captureLead(parseJson(await readRawBody(request)), "manychat");
        return sendJson(response, 200, { ok: true, ...result });
      }

      if (request.method === "POST" && url.pathname === "/api/v1/webhooks/lemonsqueezy") {
        const raw = await readRawBody(request);
        if (!verifyLemonSignature(raw, request.headers["x-signature"], config.lemonSecret)) return sendJson(response, 401, { ok: false, error: "Invalid webhook signature" });
        const payload = parseJson(raw);
        const eventName = String(request.headers["x-event-name"] || (payload.meta && payload.meta.event_name) || "unknown");
        const saved = store.recordPurchase(parseLemonPurchase(payload, eventName));
        return sendJson(response, 200, { ok: true, duplicate: saved.duplicate, purchase_id: saved.purchase && saved.purchase.id });
      }

      if (request.method === "POST" && url.pathname === "/api/v1/telemetry") {
        if (!requireAdmin(request, response)) return;
        const body = parseJson(await readRawBody(request));
        const reach = Number(body.reach || 0);
        if (!Number.isFinite(reach) || reach < 0) return sendJson(response, 422, { ok: false, error: "reach must be a non-negative number" });
        const telemetry = store.recordTelemetry({
          post_id: String(body.post_id || "UNKNOWN").slice(0, 80),
          reach,
          dm_starts: Number(body.dm_starts || 0),
          keyword_comments: Number(body.keyword_comments || 0),
        });
        return sendJson(response, 201, { ok: true, telemetry });
      }

      if (request.method === "GET" && url.pathname === "/api/v1/metrics") {
        if (!requireAdmin(request, response)) return;
        return sendJson(response, 200, { ok: true, metrics: store.metrics() });
      }
      return sendJson(response, 404, { ok: false, error: "Not found" });
    } catch (error) {
      config.logger.error(JSON.stringify({ event: "field_manual.request_failed", request_id: requestId, method: request.method, url: request.url, error: error.message }));
      return sendJson(response, error.status || 500, { ok: false, error: error.status && error.status < 500 ? error.message : "Internal server error", request_id: requestId });
    }
  });

  return {
    config,
    store,
    server,
    start() {
      return new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(config.port, config.host, () => {
          server.off("error", reject);
          const address = server.address();
          resolve({ host: config.host, port: address && typeof address === "object" ? address.port : config.port });
        });
      });
    },
    close() { return new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); },
  };
}

module.exports = { createFieldManualServer };
