"use strict";

const { mapGitHubEvent } = require("./mapper");
const { readRawBody, sha256, verifyWebhookSignature } = require("./signature");

function createGitHubWebhookService(options = {}) {
  const secret = options.secret || "";
  const store = options.store;
  const platform = options.platform;
  const logger = options.logger || console;
  const maxBodyBytes = Number(options.maxBodyBytes || 1_000_000);
  if (!store) throw new Error("GitHubWebhookStore is required");
  if (!platform) throw new Error("PlatformKernel is required");

  async function handle(req, res) {
    if (req.method !== "POST") return sendJson(res, 405, { ok: false, error: "method_not_allowed" }, { allow: "POST" });
    if (!secret) return sendJson(res, 503, { ok: false, error: "github_webhook_not_configured" });

    let rawBody;
    try {
      rawBody = await readRawBody(req, { limitBytes: maxBodyBytes });
    } catch (error) {
      return sendJson(res, error.statusCode || 400, { ok: false, error: error.code || "invalid_request", message: error.message });
    }

    const signature = req.headers["x-hub-signature-256"];
    if (!verifyWebhookSignature(rawBody, signature, secret)) {
      log(logger, "warn", "github_webhook_rejected", { reason: "invalid_signature" });
      return sendJson(res, 401, { ok: false, error: "invalid_signature" });
    }

    const deliveryId = stringHeader(req, "x-github-delivery");
    const event = stringHeader(req, "x-github-event");
    if (!deliveryId || !event) {
      return sendJson(res, 400, { ok: false, error: "missing_github_headers" });
    }

    let payload;
    try {
      payload = rawBody.length ? JSON.parse(rawBody.toString("utf8")) : {};
    } catch (error) {
      return sendJson(res, 400, { ok: false, error: "invalid_json" });
    }

    const metadata = {
      delivery_id: deliveryId,
      event,
      action: payload.action || null,
      installation_id: payload.installation && payload.installation.id || null,
      repository_id: payload.repository && payload.repository.id || null,
      repository: payload.repository && (payload.repository.full_name || payload.repository.name) || null,
      sender: payload.sender && payload.sender.login || null,
      payload_sha256: sha256(rawBody),
      payload,
    };

    const accepted = store.accept(metadata);
    if (accepted.duplicate) {
      log(logger, "info", "github_webhook_duplicate", { delivery_id: deliveryId, event, status: accepted.delivery.status });
      return sendJson(res, 202, {
        ok: true,
        duplicate: true,
        delivery_id: deliveryId,
        status: accepted.delivery.status,
      });
    }

    store.markProcessing(deliveryId);
    try {
      const mapping = mapGitHubEvent({ event, delivery_id: deliveryId, payload, platform });
      store.complete(deliveryId, mapping);
      log(logger, "info", "github_webhook_completed", {
        delivery_id: deliveryId,
        event,
        repository: metadata.repository,
        created: mapping.created.length,
      });
      return sendJson(res, 202, {
        ok: true,
        duplicate: false,
        delivery_id: deliveryId,
        event,
        mapping: {
          created: mapping.created.map((item) => ({ kind: item.kind, id: item.id })),
          ignored: mapping.ignored,
          ignored_reason: mapping.ignored_reason,
        },
      });
    } catch (error) {
      store.fail(deliveryId, error);
      log(logger, "error", "github_webhook_failed", {
        delivery_id: deliveryId,
        event,
        repository: metadata.repository,
        error: error.message,
      });
      return sendJson(res, 500, { ok: false, error: "processing_failed", delivery_id: deliveryId });
    }
  }

  function health() {
    return {
      configured: Boolean(secret),
      max_body_bytes: maxBodyBytes,
      store: store.health(),
    };
  }

  return { handle, health };
}

function stringHeader(req, name) {
  const value = req.headers[name];
  return Array.isArray(value) ? String(value[0] || "") : String(value || "");
}

function sendJson(res, status, body, headers = {}) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  for (const [name, value] of Object.entries(headers)) res.setHeader(name, value);
  res.end(JSON.stringify(body));
}

function log(logger, level, message, fields) {
  const entry = JSON.stringify(Object.assign({ message, timestamp: new Date().toISOString() }, fields || {}));
  const writer = logger && typeof logger[level] === "function" ? logger[level].bind(logger) : console.log;
  writer(entry);
}

module.exports = { createGitHubWebhookService, sendJson };
