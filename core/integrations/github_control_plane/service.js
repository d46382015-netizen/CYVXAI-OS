"use strict";

const { mapGitHubEvent } = require("./mapper");
const { readRawBody, sha256, verifyWebhookSignature } = require("./signature");

function createGitHubWebhookService(options = {}) {
  const secret = options.secret || "";
  const store = options.store;
  const platform = options.platform;
  const logger = options.logger || console;
  const maxBodyBytes = Number(options.maxBodyBytes || 1_000_000);
  const scheduler = options.scheduler || ((task) => setImmediate(task));
  const maxAttempts = Math.max(1, Number(options.maxAttempts || 5));
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

    scheduleDelivery(deliveryId);
    return sendJson(res, 202, {
      ok: true,
      duplicate: false,
      delivery_id: deliveryId,
      event,
      status: "accepted",
    });
  }

  function scheduleDelivery(deliveryId) {
    scheduler(() => {
      processDelivery(deliveryId).catch((error) => {
        log(logger, "error", "github_webhook_scheduler_failed", {
          delivery_id: deliveryId,
          error: error.message,
        });
      });
    });
  }

  async function processDelivery(deliveryId) {
    const delivery = store.get(deliveryId);
    if (!delivery) {
      const error = new Error(`unknown GitHub delivery: ${deliveryId}`);
      error.code = "DELIVERY_NOT_FOUND";
      error.statusCode = 404;
      throw error;
    }
    if (delivery.status === "completed") return delivery;
    if (Number(delivery.attempts || 0) >= maxAttempts) {
      const error = new Error(`delivery exceeded ${maxAttempts} processing attempts`);
      error.code = "DELIVERY_ATTEMPTS_EXHAUSTED";
      error.statusCode = 409;
      throw error;
    }

    const processing = store.markProcessing(deliveryId);
    try {
      const mapping = mapGitHubEvent({
        event: processing.event,
        delivery_id: deliveryId,
        payload: processing.payload,
        platform,
      });
      const completed = store.complete(deliveryId, mapping);
      log(logger, "info", "github_webhook_completed", {
        delivery_id: deliveryId,
        event: processing.event,
        repository: processing.repository,
        created: mapping.created.length,
        attempts: completed.attempts,
      });
      return completed;
    } catch (error) {
      const failed = store.fail(deliveryId, error);
      log(logger, "error", "github_webhook_failed", {
        delivery_id: deliveryId,
        event: processing.event,
        repository: processing.repository,
        attempts: failed.attempts,
        error: error.message,
      });
      throw error;
    }
  }

  async function retry(deliveryId) {
    const record = store.get(deliveryId);
    if (!record) {
      const error = new Error(`unknown GitHub delivery: ${deliveryId}`);
      error.code = "DELIVERY_NOT_FOUND";
      error.statusCode = 404;
      throw error;
    }
    if (record.status === "completed") return record;
    return processDelivery(deliveryId);
  }

  function health() {
    return {
      configured: Boolean(secret),
      max_body_bytes: maxBodyBytes,
      max_attempts: maxAttempts,
      asynchronous_processing: true,
      store: store.health(),
    };
  }

  return { handle, health, processDelivery, retry, scheduleDelivery };
}

function stringHeader(req, name) {
  const value = req.headers[name];
  return Array.isArray(value) ? String(value[0] || "") : String(value || "");
}

function sendJson(res, status, body, headers = {}) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.setHeader("x-content-type-options", "nosniff");
  for (const [name, value] of Object.entries(headers)) res.setHeader(name, value);
  res.end(JSON.stringify(body));
}

function log(logger, level, message, fields) {
  const entry = JSON.stringify(Object.assign({ message, timestamp: new Date().toISOString() }, fields || {}));
  const writer = logger && typeof logger[level] === "function" ? logger[level].bind(logger) : console.log;
  writer(entry);
}

module.exports = { createGitHubWebhookService, sendJson };
