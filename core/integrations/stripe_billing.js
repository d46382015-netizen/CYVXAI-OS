"use strict";

const crypto = require("node:crypto");
const { truthy } = require("../security/production_guard");

class StripeBilling {
  constructor(options = {}) {
    this.env = options.env || process.env;
    this.data = options.dataClient || null;
    this.queue = options.queue || null;
    this.webhookSecret = String(options.webhookSecret || this.env.CYVX_STRIPE_WEBHOOK_SECRET || "").trim();
    this.secretKey = String(options.secretKey || this.env.STRIPE_SECRET_KEY || "").trim();
    this.pricePlans = parseJson(options.pricePlans || this.env.CYVX_STRIPE_PRICE_PLANS, {});
    this.toleranceSeconds = positive(options.toleranceSeconds || this.env.CYVX_STRIPE_WEBHOOK_TOLERANCE_SECONDS, 300);
    this.enabled = options.enabled ?? truthy(this.env.CYVX_BILLING_ENABLED);
    this.required = options.required ?? truthy(this.env.CYVX_REQUIRE_BILLING);
    this.metrics = { received: 0, verified: 0, rejected: 0, queued: 0, processed: 0, ignored: 0, failures: 0, last_event_at: null, last_error: null };
  }

  configured() { return Boolean(this.webhookSecret && this.data && this.data.configured()); }

  verify(rawBody, signatureHeader, nowSeconds = Math.floor(Date.now() / 1000)) {
    const parts = parseSignature(signatureHeader);
    if (!parts.timestamp || !parts.signatures.length) throw coded("STRIPE_SIGNATURE_MALFORMED", 400, "Stripe-Signature header is malformed.");
    if (Math.abs(nowSeconds - parts.timestamp) > this.toleranceSeconds) throw coded("STRIPE_SIGNATURE_EXPIRED", 400, "Stripe webhook timestamp is outside the accepted tolerance.");
    const expected = crypto.createHmac("sha256", this.webhookSecret).update(`${parts.timestamp}.${rawBody}`).digest("hex");
    if (!parts.signatures.some((value) => safeHexEqual(value, expected))) throw coded("STRIPE_SIGNATURE_INVALID", 400, "Stripe webhook signature is invalid.");
    return true;
  }

  async receive(rawBody, signatureHeader) {
    this.metrics.received += 1;
    if (!this.enabled) return { ok: true, disabled: true };
    if (!this.webhookSecret) {
      this.metrics.rejected += 1;
      throw coded("STRIPE_WEBHOOK_UNCONFIGURED", 503, "Stripe webhook verification is not configured.");
    }
    try {
      this.verify(rawBody, signatureHeader);
      this.metrics.verified += 1;
      const event = JSON.parse(String(rawBody));
      const normalized = normalizeStripeEvent(event, this.pricePlans);
      this.metrics.last_event_at = new Date().toISOString();
      await this.#record(normalized, rawBody);
      if (this.queue && this.queue.configured()) {
        await this.queue.send("billing.stripe", normalized, { tenantId: normalized.tenant_id, metadata: { provider: "stripe", event_id: normalized.event_id } });
        this.metrics.queued += 1;
        return { ok: true, queued: true, event_id: normalized.event_id };
      }
      const result = await this.process(normalized);
      return { ok: true, queued: false, event_id: normalized.event_id, result };
    } catch (error) {
      this.metrics.failures += 1;
      this.metrics.last_error = error.message;
      throw error;
    }
  }

  async process(event) {
    const normalized = normalizeStripeEvent(event, this.pricePlans);
    if (!normalized.tenant_id) {
      this.metrics.ignored += 1;
      return { ignored: true, reason: "tenant_metadata_missing" };
    }
    if (/^customer\.subscription\./.test(normalized.type)) {
      await this.data.upsert("cyvx_subscriptions", {
        provider: "stripe",
        provider_subscription_id: normalized.subscription_id,
        provider_customer_id: normalized.customer_id,
        tenant_id: normalized.tenant_id,
        status: normalized.status || "unknown",
        plan_key: normalized.plan_key || "unknown",
        price_id: normalized.price_id,
        current_period_end: normalized.current_period_end,
        cancel_at_period_end: normalized.cancel_at_period_end,
        updated_at: new Date().toISOString(),
      }, { onConflict: "provider,provider_subscription_id", returnRepresentation: false });
      const active = ["active", "trialing", "past_due"].includes(normalized.status);
      await this.data.upsert("cyvx_entitlements", {
        tenant_id: normalized.tenant_id,
        entitlement_key: "plan",
        entitlement_value: normalized.plan_key || "unknown",
        active,
        source: "stripe",
        source_reference: normalized.subscription_id,
        expires_at: normalized.current_period_end,
        updated_at: new Date().toISOString(),
      }, { onConflict: "tenant_id,entitlement_key", returnRepresentation: false });
      await this.#syncPlanFlags(normalized.tenant_id, normalized.plan_key, active);
      this.metrics.processed += 1;
      return { processed: true, kind: "subscription", active, plan_key: normalized.plan_key };
    }
    if (normalized.type === "checkout.session.completed" && normalized.customer_id) {
      await this.data.upsert("cyvx_billing_customers", {
        provider: "stripe",
        provider_customer_id: normalized.customer_id,
        tenant_id: normalized.tenant_id,
        user_id: normalized.user_id,
        updated_at: new Date().toISOString(),
      }, { onConflict: "provider,provider_customer_id", returnRepresentation: false });
      this.metrics.processed += 1;
      return { processed: true, kind: "customer" };
    }
    this.metrics.ignored += 1;
    return { ignored: true, reason: "event_not_actionable", type: normalized.type };
  }

  async entitlements(tenantId) {
    if (!tenantId) throw coded("TENANT_REQUIRED", 422, "Tenant ID is required.");
    const query = `select=entitlement_key,entitlement_value,active,expires_at,updated_at&tenant_id=eq.${encodeURIComponent(tenantId)}&order=entitlement_key.asc`;
    return this.data.select("cyvx_entitlements", query);
  }

  snapshot() {
    return {
      configured: this.configured(),
      enabled: this.enabled,
      required: this.required,
      price_plans: Object.keys(this.pricePlans),
      tolerance_seconds: this.toleranceSeconds,
      metrics: { ...this.metrics },
    };
  }

  async #record(event, rawBody) {
    if (!this.data || !this.data.configured()) {
      if (this.required) throw coded("BILLING_DATA_UNCONFIGURED", 503, "Billing persistence is not configured.");
      return;
    }
    await this.data.upsert("cyvx_webhook_events", {
      provider: "stripe",
      event_id: event.event_id,
      event_type: event.type,
      tenant_id: event.tenant_id,
      payload_sha256: crypto.createHash("sha256").update(String(rawBody)).digest("hex"),
      payload_summary: event,
      received_at: new Date().toISOString(),
      status: "received",
    }, { onConflict: "provider,event_id", returnRepresentation: false });
  }

  async #syncPlanFlags(tenantId, planKey, active) {
    const paid = active && planKey && planKey !== "free" && planKey !== "unknown";
    await this.data.upsert("cyvx_feature_flags", {
      flag_key: "paid_operations.enabled",
      flag_type: "boolean",
      flag_value: paid,
      enabled: true,
      tenant_id: tenantId,
      environment: String(this.env.CYVX_ENV || this.env.NODE_ENV || "production"),
      updated_at: new Date().toISOString(),
    }, { onConflict: "flag_key,environment,tenant_id", returnRepresentation: false });
  }
}

function normalizeStripeEvent(event, pricePlans = {}) {
  if (event && event.event_id && event.type && !event.data) return event;
  const source = event && typeof event === "object" ? event : {};
  const object = source.data && source.data.object && typeof source.data.object === "object" ? source.data.object : {};
  const item = object.items && object.items.data && object.items.data[0] || object.lines && object.lines.data && object.lines.data[0] || {};
  const price = item.price || object.price || {};
  const metadata = { ...(object.metadata || {}), ...(source.data && source.data.object && source.data.object.subscription_details && source.data.object.subscription_details.metadata || {}) };
  const customerId = idValue(object.customer);
  const subscriptionId = idValue(object.subscription) || (/^customer\.subscription\./.test(source.type || "") ? object.id : null);
  const priceId = idValue(price) || idValue(object.price);
  return {
    event_id: String(source.id || source.event_id || ""),
    type: String(source.type || "unknown"),
    created_at: source.created ? new Date(Number(source.created) * 1000).toISOString() : source.created_at || new Date().toISOString(),
    livemode: Boolean(source.livemode),
    tenant_id: String(metadata.tenant_id || metadata.cyvx_tenant_id || "") || null,
    user_id: String(metadata.user_id || metadata.cyvx_user_id || "") || null,
    customer_id: customerId,
    subscription_id: subscriptionId,
    status: String(object.status || "") || null,
    price_id: priceId,
    plan_key: String(metadata.plan_key || pricePlans[priceId] || "") || null,
    current_period_end: object.current_period_end ? new Date(Number(object.current_period_end) * 1000).toISOString() : null,
    cancel_at_period_end: Boolean(object.cancel_at_period_end),
    mode: object.mode || null,
  };
}

function parseSignature(value) {
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

function idValue(value) { return typeof value === "string" ? value : value && value.id ? String(value.id) : null; }
function parseJson(value, fallback) { if (value && typeof value === "object") return value; try { return value ? JSON.parse(value) : fallback; } catch { return fallback; } }
function positive(value, fallback) { const parsed = Number(value); return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback; }
function coded(code, statusCode, message) { const error = new Error(message); error.code = code; error.statusCode = statusCode; return error; }

module.exports = { StripeBilling, normalizeStripeEvent, parseSignature, safeHexEqual };
