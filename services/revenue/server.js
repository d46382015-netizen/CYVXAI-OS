"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { RuntimeError } = require("../../runtime/missions/base");

function createRevenueHttpRuntime(options = {}) {
  if (!options.runtime || !options.engine || !options.authenticate || !options.sendJson || !options.readBody || !options.match) {
    throw new Error("createRevenueHttpRuntime requires runtime, engine, authentication, and HTTP helpers");
  }
  const runtime = options.runtime;
  const engine = options.engine;
  const authenticate = options.authenticate;
  const sendJson = options.sendJson;
  const readBody = options.readBody;
  const match = options.match;
  const bodyLimit = Number(options.bodyLimit || process.env.CYVX_REVENUE_BODY_LIMIT || 512 * 1024);
  const publicBodyLimit = Number(options.publicBodyLimit || process.env.CYVX_REVENUE_PUBLIC_BODY_LIMIT || 32 * 1024);
  const webhookBodyLimit = Number(options.webhookBodyLimit || process.env.CYVX_REVENUE_WEBHOOK_BODY_LIMIT || 1024 * 1024);
  const uiFile = path.resolve(options.uiFile || path.join(runtime.repoRoot, "ui", "revenue-engine.html"));
  const limiter = createWindowLimiter({ limit: Number(process.env.CYVX_REVENUE_PUBLIC_RATE_LIMIT || 20), windowMs: 60_000 });

  function route(pathname) {
    return pathname === "/revenue" || pathname === "/operator/revenue" || pathname.startsWith("/v/") || pathname.startsWith("/api/v3/revenue/");
  }

  async function handle(req, res, url, context = {}) {
    if (!route(url.pathname)) return false;
    const correlationId = context.correlationId || "revenue";
    let params;

    if (req.method === "GET" && ["/revenue", "/operator/revenue"].includes(url.pathname)) {
      if (!fs.existsSync(uiFile)) throw new RuntimeError("UI_NOT_FOUND", "Revenue operator UI is unavailable.", 404);
      const body = fs.readFileSync(uiFile);
      res.statusCode = 200;
      res.setHeader("content-type", "text/html; charset=utf-8");
      res.setHeader("content-length", body.length);
      res.end(body);
      return true;
    }

    if (req.method === "GET" && url.pathname === "/api/v3/revenue/health") {
      sendJson(res, 200, { ok: true, revenue: engine.health() }, correlationId);
      return true;
    }

    if ((params = match(url.pathname, "/v/:slug")) && req.method === "GET") {
      return sendPage(res, engine.getPublicPage(params.slug, "revenue"));
    }
    if ((params = match(url.pathname, "/v/:slug/privacy")) && req.method === "GET") {
      return sendPage(res, engine.getPublicPage(params.slug, "privacy"));
    }
    if ((params = match(url.pathname, "/v/:slug/terms")) && req.method === "GET") {
      return sendPage(res, engine.getPublicPage(params.slug, "terms"));
    }
    if ((params = match(url.pathname, "/v/:slug/thank-you")) && req.method === "GET") {
      return sendPage(res, engine.getPublicPage(params.slug, "thank_you"));
    }

    if ((params = match(url.pathname, "/api/v3/revenue/ventures/:slug/leads")) && req.method === "POST") {
      limiter(publicKey(req, `lead:${params.slug}`));
      const input = await readBody(req, publicBodyLimit);
      sendJson(res, 201, { ok: true, lead: engine.captureInbound(params.slug, input) }, correlationId);
      return true;
    }

    if ((params = match(url.pathname, "/api/v3/revenue/ventures/:slug/checkout")) && req.method === "POST") {
      limiter(publicKey(req, `checkout:${params.slug}`));
      const input = await readBody(req, publicBodyLimit);
      const venture = engine.db.prepare("SELECT id FROM revenue_ventures WHERE slug=? AND status='active'").get(params.slug);
      if (!venture) throw new RuntimeError("NOT_FOUND", "Revenue venture not found.", 404);
      const checkout = await engine.createCheckout(venture.id, input, null);
      sendJson(res, 201, { ok: true, checkout }, correlationId);
      return true;
    }

    if ((params = match(url.pathname, "/api/v3/revenue/unsubscribe/:token")) && ["GET", "POST"].includes(req.method)) {
      const result = engine.unsubscribe(params.token);
      if (req.method === "GET") {
        const body = Buffer.from(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Unsubscribed</title><style>body{font-family:system-ui;background:#07111f;color:#eef7ff;margin:0}main{max-width:620px;margin:auto;padding:60px 20px}</style></head><body><main><h1>Unsubscribed</h1><p>This address will no longer receive campaign email from this CYVX venture.</p></main></body></html>`);
        res.statusCode = 200;
        res.setHeader("content-type", "text/html; charset=utf-8");
        res.setHeader("content-length", body.length);
        res.end(body);
      } else sendJson(res, 200, result, correlationId);
      return true;
    }

    if (url.pathname === "/api/v3/revenue/stripe/webhook" && req.method === "POST") {
      const raw = await readRawBody(req, webhookBodyLimit);
      const result = engine.processStripeWebhook(raw.toString("utf8"), req.headers["stripe-signature"]);
      sendJson(res, 200, { ok: true, result }, correlationId);
      return true;
    }

    const auth = authenticate(req);
    auth.correlation_id = correlationId;
    const input = ["GET", "HEAD"].includes(req.method) ? {} : await readBody(req, bodyLimit);

    if (url.pathname === "/api/v3/revenue/ventures" && req.method === "GET") {
      sendJson(res, 200, { ok: true, ventures: engine.listVentures(auth), health: engine.health() }, correlationId);
      return true;
    }
    if (url.pathname === "/api/v3/revenue/ventures" && req.method === "POST") {
      sendJson(res, 201, { ok: true, result: engine.createVenture(input, auth) }, correlationId);
      return true;
    }
    if ((params = match(url.pathname, "/api/v3/revenue/ventures/:id")) && req.method === "GET") {
      sendJson(res, 200, { ok: true, revenue: engine.getVenture(params.id, auth) }, correlationId);
      return true;
    }
    if ((params = match(url.pathname, "/api/v3/revenue/ventures/:id/activate")) && req.method === "POST") {
      sendJson(res, 200, { ok: true, revenue: engine.activate(params.id, input, auth) }, correlationId);
      return true;
    }
    if ((params = match(url.pathname, "/api/v3/revenue/ventures/:id/prospects/import")) && req.method === "POST") {
      sendJson(res, 201, { ok: true, result: engine.importProspects(params.id, input, auth) }, correlationId);
      return true;
    }
    if ((params = match(url.pathname, "/api/v3/revenue/ventures/:id/campaigns")) && req.method === "POST") {
      sendJson(res, 201, { ok: true, campaign: engine.createCampaign(params.id, input, auth) }, correlationId);
      return true;
    }
    if ((params = match(url.pathname, "/api/v3/revenue/campaigns/:id/approve")) && req.method === "POST") {
      sendJson(res, 200, { ok: true, campaign: engine.approveCampaign(params.id, auth) }, correlationId);
      return true;
    }
    if ((params = match(url.pathname, "/api/v3/revenue/campaigns/:id/run")) && req.method === "POST") {
      sendJson(res, 200, { ok: true, result: await engine.runCampaign(params.id, input, auth) }, correlationId);
      return true;
    }
    if ((params = match(url.pathname, "/api/v3/revenue/ventures/:id/deals")) && req.method === "POST") {
      sendJson(res, 201, { ok: true, deal: engine.createDeal(params.id, input, auth) }, correlationId);
      return true;
    }
    if ((params = match(url.pathname, "/api/v3/revenue/deals/:id/stage")) && req.method === "POST") {
      sendJson(res, 200, { ok: true, deal: engine.advanceDeal(params.id, input, auth) }, correlationId);
      return true;
    }
    if ((params = match(url.pathname, "/api/v3/revenue/deals/:id/checkout")) && req.method === "POST") {
      const deal = engine.requireDeal(params.id, auth.organization_id);
      sendJson(res, 201, { ok: true, checkout: await engine.createCheckout(deal.venture_id, { ...input, deal_id: deal.id }, auth) }, correlationId);
      return true;
    }
    if ((params = match(url.pathname, "/api/v3/revenue/ventures/:id/payments/manual")) && req.method === "POST") {
      sendJson(res, 201, { ok: true, payment: engine.recordManualPayment(params.id, input, auth) }, correlationId);
      return true;
    }
    if ((params = match(url.pathname, "/api/v3/revenue/fulfillments/:id/complete")) && req.method === "POST") {
      sendJson(res, 200, { ok: true, fulfillment: engine.completeFulfillment(params.id, input, auth) }, correlationId);
      return true;
    }
    if ((params = match(url.pathname, "/api/v3/revenue/ventures/:id/ledger/verify")) && req.method === "GET") {
      sendJson(res, 200, { ok: true, verification: engine.verifyLedger(params.id, auth) }, correlationId);
      return true;
    }

    throw new RuntimeError("NOT_FOUND", "Revenue route not found.", 404);
  }

  return { engine, handle, route, health: () => engine.health() };
}

function sendPage(res, page) {
  res.statusCode = 200;
  res.setHeader("content-type", "text/html; charset=utf-8");
  res.setHeader("content-length", page.content.length);
  res.end(page.content);
  return true;
}

function readRawBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let done = false;
    const fail = (error) => { if (done) return; done = true; reject(error); };
    req.on("data", (chunk) => {
      if (done) return;
      size += chunk.length;
      if (size > limit) return fail(new RuntimeError("REQUEST_TOO_LARGE", `Request body exceeds ${limit} bytes.`, 413));
      chunks.push(chunk);
    });
    req.on("end", () => { if (done) return; done = true; resolve(Buffer.concat(chunks)); });
    req.on("error", fail);
  });
}

function createWindowLimiter(options = {}) {
  const buckets = new Map();
  const limit = Math.max(1, Number(options.limit || 20));
  const windowMs = Math.max(1000, Number(options.windowMs || 60_000));
  return function enforce(key) {
    const timestamp = Date.now();
    const current = buckets.get(key);
    if (!current || timestamp - current.startedAt >= windowMs) {
      buckets.set(key, { count: 1, startedAt: timestamp });
      return;
    }
    if (current.count >= limit) throw new RuntimeError("RATE_LIMITED", "Public revenue endpoint rate limit exceeded.", 429);
    current.count += 1;
    if (buckets.size > 20_000) for (const [entry, bucket] of buckets) if (timestamp - bucket.startedAt >= windowMs) buckets.delete(entry);
  };
}

function publicKey(req, scope) {
  return `${scope}:${String(req.socket && req.socket.remoteAddress || "unknown")}`;
}

module.exports = {
  createRevenueHttpRuntime,
  readRawBody,
  createWindowLimiter,
};