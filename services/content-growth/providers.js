"use strict";

const crypto = require("node:crypto");

function constantTimeEqual(a, b) {
  const left = Buffer.from(String(a || ""), "utf8");
  const right = Buffer.from(String(b || ""), "utf8");
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function verifySharedSecret(received, expected) {
  if (!expected) return true;
  return constantTimeEqual(received, expected);
}

function verifyLemonSignature(rawBody, signature, secret) {
  if (!secret || !signature || !rawBody) return false;
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  return constantTimeEqual(signature, expected);
}

async function kitRequest(endpoint, options, config = {}) {
  const fetchImpl = config.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== "function") throw new Error("fetch is unavailable");
  const response = await fetchImpl(`https://api.kit.com${endpoint}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "X-Kit-Api-Key": config.apiKey,
      ...(options && options.headers ? options.headers : {}),
    },
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const error = new Error(`Kit API request failed with ${response.status}`);
    error.status = response.status;
    error.body = body;
    throw error;
  }
  return body;
}

async function syncLeadToKit(lead, config = {}) {
  if (!config.apiKey) return { skipped: true, reason: "KIT_API_KEY is not configured" };
  const created = await kitRequest("/v4/subscribers", {
    method: "POST",
    body: JSON.stringify({ email_address: lead.email, first_name: lead.first_name || undefined }),
  }, config);
  const tagId = config.tagIds && config.tagIds[lead.intent_tag];
  if (tagId) {
    await kitRequest(`/v4/tags/${encodeURIComponent(tagId)}/subscribers`, {
      method: "POST",
      body: JSON.stringify({ email_address: lead.email }),
    }, config);
  }
  return { skipped: false, subscriber: created.subscriber || null, tag_id: tagId || null };
}

function parseLemonPurchase(payload, eventName) {
  const attributes = payload && payload.data && payload.data.attributes ? payload.data.attributes : {};
  const meta = payload && payload.meta ? payload.meta : {};
  const externalId = `${eventName}:${payload && payload.data ? payload.data.id : attributes.identifier || "unknown"}`;
  const refunded = /refund/i.test(eventName) || attributes.refunded === true;
  return {
    external_id: externalId,
    event_name: eventName,
    email: attributes.user_email || attributes.customer_email || null,
    customer_id: attributes.customer_id || null,
    product_id: attributes.first_order_item && attributes.first_order_item.product_id ? attributes.first_order_item.product_id : attributes.product_id || null,
    amount_cents: refunded ? 0 : Number(attributes.total || attributes.total_usd || 0),
    currency: attributes.currency || "USD",
    refunded,
    custom_data: meta.custom_data || {},
    raw_identifier: attributes.identifier || null,
  };
}

module.exports = { verifySharedSecret, verifyLemonSignature, syncLeadToKit, parseLemonPurchase, kitRequest };
