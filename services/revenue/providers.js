"use strict";

const crypto = require("node:crypto");
const { TransactionalEmail } = require("../../core/integrations/transactional_email");

class RevenueEmailProvider {
  constructor(options = {}) {
    this.client = options.client || new TransactionalEmail({
      env: options.env || process.env,
      fetch: options.fetch,
      required: false,
    });
  }

  configured() {
    return Boolean(this.client.enabled && this.client.configured());
  }

  snapshot() {
    return this.client.snapshot();
  }

  async send(message) {
    if (!this.configured()) throw coded("EMAIL_PROVIDER_UNCONFIGURED", 503, "A real Resend or Postmark provider must be configured before outreach can be sent.");
    const result = await this.client.send(message);
    if (!result || !result.ok) throw coded("EMAIL_DELIVERY_FAILED", 502, result && result.error || "The email provider did not confirm delivery.");
    return result;
  }
}

class StripeRevenueProvider {
  constructor(options = {}) {
    this.env = options.env || process.env;
    this.fetch = options.fetch || globalThis.fetch;
    this.secretKey = String(options.secretKey || this.env.STRIPE_SECRET_KEY || "").trim();
    this.webhookSecret = String(options.webhookSecret || this.env.CYVX_STRIPE_WEBHOOK_SECRET || "").trim();
    this.enabled = options.enabled ?? truthy(this.env.CYVX_BILLING_ENABLED);
    this.toleranceSeconds = positive(options.toleranceSeconds || this.env.CYVX_STRIPE_WEBHOOK_TOLERANCE_SECONDS, 300);
    this.metrics = { sessions_created: 0, webhooks_verified: 0, failures: 0, last_error: null };
  }

  configured() {
    return Boolean(this.enabled && this.secretKey && typeof this.fetch === "function");
  }

  webhookConfigured() {
    return Boolean(this.enabled && this.webhookSecret);
  }

  snapshot() {
    return {
      configured: this.configured(),
      webhook_configured: this.webhookConfigured(),
      enabled: this.enabled,
      metrics: { ...this.metrics },
    };
  }

  async createCheckoutSession(input = {}) {
    if (!this.configured()) throw coded("STRIPE_UNCONFIGURED", 503, "Stripe must be enabled with STRIPE_SECRET_KEY before a real checkout can be created.");
    const amount = integer(input.amount_cents, "amount_cents", 50, 100_000_000);
    const currency = String(input.currency || "usd").trim().toLowerCase();
    if (!/^[a-z]{3}$/.test(currency)) throw coded("VALIDATION_ERROR", 422, "currency must be a three-letter ISO code.");
    const successUrl = validUrl(input.success_url, "success_url");
    const cancelUrl = validUrl(input.cancel_url, "cancel_url");
    const name = clean(input.product_name, 120, true);
    const description = clean(input.description, 500, false);
    const metadata = sanitizeMetadata(input.metadata || {});
    const body = new URLSearchParams();
    body.set("mode", "payment");
    body.set("success_url", successUrl);
    body.set("cancel_url", cancelUrl);
    body.set("line_items[0][quantity]", "1");
    body.set("line_items[0][price_data][currency]", currency);
    body.set("line_items[0][price_data][unit_amount]", String(amount));
    body.set("line_items[0][price_data][product_data][name]", name);
    if (description) body.set("line_items[0][price_data][product_data][description]", description);
    if (input.customer_email) body.set("customer_email", cleanEmail(input.customer_email));
    body.set("payment_intent_data[description]", name);
    for (const [key, value] of Object.entries(metadata)) {
      body.set(`metadata[${key}]`, value);
      body.set(`payment_intent_data[metadata][${key}]`, value);
    }
    try {
      const response = await this.fetch("https://api.stripe.com/v1/checkout/sessions", {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.secretKey}`,
          "content-type": "application/x-www-form-urlencoded",
          "idempotency-key": clean(input.idempotency_key || crypto.randomUUID(), 255, true),
        },
        body: body.toString(),
        signal: AbortSignal.timeout(15_000),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.id || !payload.url) {
        throw coded("STRIPE_CHECKOUT_FAILED", 502, payload.error && payload.error.message || `Stripe returned HTTP ${response.status}.`);
      }
      this.metrics.sessions_created += 1;
      this.metrics.last_error = null;
      return {
        id: String(payload.id),
        url: String(payload.url),
        payment_status: String(payload.payment_status || "unpaid"),
        expires_at: payload.expires_at ? new Date(Number(payload.expires_at) * 1000).toISOString() : null,
      };
    } catch (error) {
      this.metrics.failures += 1;
      this.metrics.last_error = error.message;
      throw error;
    }
  }

  verifyWebhook(rawBody, signatureHeader, nowSeconds = Math.floor(Date.now() / 1000)) {
    if (!this.webhookConfigured()) throw coded("STRIPE_WEBHOOK_UNCONFIGURED", 503, "Stripe webhook verification is not configured.");
    const parsed = parseStripeSignature(signatureHeader);
    if (!parsed.timestamp || !parsed.signatures.length) throw coded("STRIPE_SIGNATURE_MALFORMED", 400, "Stripe-Signature header is malformed.");
    if (Math.abs(nowSeconds - parsed.timestamp) > this.toleranceSeconds) throw coded("STRIPE_SIGNATURE_EXPIRED", 400, "Stripe webhook timestamp is outside the accepted tolerance.");
    const expected = crypto.createHmac("sha256", this.webhookSecret).update(`${parsed.timestamp}.${rawBody}`).digest("hex");
    if (!parsed.signatures.some((value) => safeHexEqual(value, expected))) throw coded("STRIPE_SIGNATURE_INVALID", 400, "Stripe webhook signature is invalid.");
    this.metrics.webhooks_verified += 1;
    return true;
  }

  parseWebhook(rawBody, signatureHeader) {
    this.verifyWebhook(rawBody, signatureHeader);
    let event;
    try { event = JSON.parse(String(rawBody)); }
    catch { throw coded("INVALID_JSON", 400, "Stripe webhook body is invalid JSON."); }
    const object = event && event.data && event.data.object || {};
    const metadata = object.metadata || {};
    return {
      event_id: String(event.id || ""),
      type: String(event.type || "unknown"),
      livemode: Boolean(event.livemode),
      created_at: event.created ? new Date(Number(event.created) * 1000).toISOString() : new Date().toISOString(),
      checkout_session_id: String(object.id || "") || null,
      payment_intent_id: typeof object.payment_intent === "string" ? object.payment_intent : object.payment_intent && object.payment_intent.id || null,
      payment_status: String(object.payment_status || object.status || "unknown"),
      amount_total: Number(object.amount_total || object.amount_received || 0),
      currency: String(object.currency || "usd").toLowerCase(),
      customer_email: cleanEmail(object.customer_details && object.customer_details.email || object.customer_email || "", false),
      metadata: sanitizeMetadata(metadata),
      raw_type: String(event.type || "unknown"),
    };
  }
}

function parseStripeSignature(value) {
  const result = { timestamp: 0, signatures: [] };
  for (const part of String(value || "").split(",")) {
    const [key, raw] = part.split("=", 2);
    if (key === "t") result.timestamp = Number(raw);
    if (key === "v1" && raw) result.signatures.push(raw.trim());
  }
  return result;
}

function safeHexEqual(left, right) {
  if (!/^[a-f0-9]+$/i.test(String(left || "")) || !/^[a-f0-9]+$/i.test(String(right || ""))) return false;
  const a = Buffer.from(String(left), "hex");
  const b = Buffer.from(String(right), "hex");
  return a.length === b.length && a.length > 0 && crypto.timingSafeEqual(a, b);
}

function sanitizeMetadata(value) {
  const output = {};
  for (const [key, item] of Object.entries(value || {}).slice(0, 40)) {
    const cleanKey = String(key).replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 40);
    if (!cleanKey) continue;
    output[cleanKey] = String(item == null ? "" : item).slice(0, 500);
  }
  return output;
}

function validUrl(value, name) {
  let parsed;
  try { parsed = new URL(String(value || "")); }
  catch { throw coded("VALIDATION_ERROR", 422, `${name} must be a valid URL.`); }
  if (!/^https?:$/.test(parsed.protocol)) throw coded("VALIDATION_ERROR", 422, `${name} must use HTTP or HTTPS.`);
  return parsed.toString();
}

function cleanEmail(value, required = true) {
  const email = String(value || "").trim().toLowerCase().slice(0, 320);
  if (!email && !required) return null;
  if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email)) throw coded("VALIDATION_ERROR", 422, "A valid email address is required.");
  return email;
}

function clean(value, maximum, required) {
  const output = String(value || "").replace(/[\r\n]+/g, " ").trim();
  if (required && !output) throw coded("VALIDATION_ERROR", 422, "A required value is missing.");
  return output.slice(0, maximum);
}

function integer(value, name, minimum, maximum) {
  const output = Number(value);
  if (!Number.isInteger(output) || output < minimum || output > maximum) throw coded("VALIDATION_ERROR", 422, `${name} must be an integer from ${minimum} to ${maximum}.`);
  return output;
}

function positive(value, fallback) {
  const output = Number(value);
  return Number.isFinite(output) && output > 0 ? Math.floor(output) : fallback;
}

function truthy(value) { return /^(1|true|yes|on)$/i.test(String(value || "")); }
function coded(code, status, message) { const error = new Error(message); error.code = code; error.status = status; return error; }

module.exports = {
  RevenueEmailProvider,
  StripeRevenueProvider,
  parseStripeSignature,
  safeHexEqual,
  sanitizeMetadata,
};