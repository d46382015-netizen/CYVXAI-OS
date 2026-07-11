"use strict";

const { truthy } = require("../security/production_guard");

class TransactionalEmail {
  constructor(options = {}) {
    this.env = options.env || process.env;
    this.fetch = options.fetch || globalThis.fetch;
    this.provider = String(options.provider || this.env.CYVX_EMAIL_PROVIDER || inferProvider(this.env)).trim().toLowerCase();
    this.from = String(options.from || this.env.CYVX_EMAIL_FROM || "").trim();
    this.replyTo = String(options.replyTo || this.env.CYVX_EMAIL_REPLY_TO || "").trim();
    this.resendKey = String(options.resendKey || this.env.RESEND_API_KEY || "").trim();
    this.postmarkToken = String(options.postmarkToken || this.env.POSTMARK_SERVER_TOKEN || "").trim();
    this.enabled = options.enabled ?? truthy(this.env.CYVX_EMAIL_ENABLED);
    this.required = options.required ?? truthy(this.env.CYVX_REQUIRE_EMAIL);
    this.metrics = { attempted: 0, delivered: 0, dropped: 0, failures: 0, last_delivery_at: null, last_error: null };
  }

  configured() {
    if (!this.from || typeof this.fetch !== "function") return false;
    if (this.provider === "resend") return Boolean(this.resendKey);
    if (this.provider === "postmark") return Boolean(this.postmarkToken);
    return false;
  }

  async send(message = {}) {
    this.metrics.attempted += 1;
    if (!this.enabled) { this.metrics.dropped += 1; return { ok: false, disabled: true }; }
    if (!this.configured()) {
      this.metrics.dropped += 1;
      if (this.required) throw coded("EMAIL_UNCONFIGURED", "Transactional email is required but not configured.");
      return { ok: false, skipped: true };
    }
    const normalized = normalizeMessage(message, { from: this.from, replyTo: this.replyTo });
    try {
      const result = this.provider === "resend" ? await this.#resend(normalized) : await this.#postmark(normalized);
      this.metrics.delivered += 1;
      this.metrics.last_delivery_at = new Date().toISOString();
      this.metrics.last_error = null;
      return { ok: true, provider: this.provider, id: result.id || result.MessageID || null };
    } catch (error) {
      this.metrics.failures += 1;
      this.metrics.last_error = error.message;
      if (this.required) throw error;
      return { ok: false, provider: this.provider, error: error.message };
    }
  }

  snapshot() {
    return {
      configured: this.configured(),
      enabled: this.enabled,
      required: this.required,
      provider: this.provider || null,
      from_domain: emailDomain(this.from),
      reply_to_configured: Boolean(this.replyTo),
      metrics: { ...this.metrics },
    };
  }

  async #resend(message) {
    const response = await this.fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${this.resendKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        from: message.from,
        to: message.to,
        cc: message.cc.length ? message.cc : undefined,
        bcc: message.bcc.length ? message.bcc : undefined,
        reply_to: message.replyTo || undefined,
        subject: message.subject,
        html: message.html || undefined,
        text: message.text || undefined,
        headers: message.headers,
        tags: message.tags,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`Resend delivery failed with HTTP ${response.status}: ${await safeText(response)}`);
    return response.json();
  }

  async #postmark(message) {
    const response = await this.fetch("https://api.postmarkapp.com/email", {
      method: "POST",
      headers: { "x-postmark-server-token": this.postmarkToken, accept: "application/json", "content-type": "application/json" },
      body: JSON.stringify({
        From: message.from,
        To: message.to.join(","),
        Cc: message.cc.join(",") || undefined,
        Bcc: message.bcc.join(",") || undefined,
        ReplyTo: message.replyTo || undefined,
        Subject: message.subject,
        HtmlBody: message.html || undefined,
        TextBody: message.text || undefined,
        Headers: Object.entries(message.headers).map(([Name, Value]) => ({ Name, Value })),
        Tag: message.tags[0] && message.tags[0].value || undefined,
        MessageStream: this.env.POSTMARK_MESSAGE_STREAM || "outbound",
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`Postmark delivery failed with HTTP ${response.status}: ${await safeText(response)}`);
    return response.json();
  }
}

function normalizeMessage(message, defaults) {
  const to = normalizeAddresses(message.to);
  if (!to.length) throw coded("EMAIL_RECIPIENT_REQUIRED", "At least one valid recipient is required.");
  const subject = cleanHeader(message.subject, 300);
  if (!subject) throw coded("EMAIL_SUBJECT_REQUIRED", "Email subject is required.");
  const html = message.html ? String(message.html).slice(0, 500_000) : "";
  const text = message.text ? String(message.text).slice(0, 200_000) : "";
  if (!html && !text) throw coded("EMAIL_BODY_REQUIRED", "Email text or HTML body is required.");
  return {
    from: cleanHeader(message.from || defaults.from, 320),
    replyTo: cleanHeader(message.replyTo || defaults.replyTo, 320),
    to,
    cc: normalizeAddresses(message.cc),
    bcc: normalizeAddresses(message.bcc),
    subject,
    html,
    text,
    headers: sanitizeHeaders(message.headers),
    tags: normalizeTags(message.tags),
  };
}

function normalizeAddresses(value) {
  const values = Array.isArray(value) ? value : value ? [value] : [];
  return [...new Set(values.map((item) => cleanHeader(item, 320)).filter((item) => /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(extractEmail(item))))].slice(0, 50);
}

function extractEmail(value) {
  const match = String(value || "").match(/<([^>]+)>/);
  return (match ? match[1] : value).trim();
}

function sanitizeHeaders(value) {
  const output = {};
  for (const [key, item] of Object.entries(value || {}).slice(0, 20)) {
    if (!/^[A-Za-z0-9-]{1,80}$/.test(key) || /^(authorization|cookie|x-api-key)$/i.test(key)) continue;
    output[key] = cleanHeader(item, 1000);
  }
  return output;
}

function normalizeTags(value) {
  return (Array.isArray(value) ? value : []).slice(0, 10).map((item) => {
    if (typeof item === "string") return { name: "category", value: cleanHeader(item, 100) };
    return { name: cleanHeader(item && item.name || "category", 100), value: cleanHeader(item && item.value || "", 100) };
  }).filter((item) => item.name && item.value);
}

function cleanHeader(value, limit) { return String(value || "").replace(/[\r\n]+/g, " ").trim().slice(0, limit); }
function inferProvider(env) { if (env.RESEND_API_KEY) return "resend"; if (env.POSTMARK_SERVER_TOKEN) return "postmark"; return ""; }
function emailDomain(value) { const email = extractEmail(value); return email.includes("@") ? email.split("@").pop() : null; }
function coded(code, message) { const error = new Error(message); error.code = code; return error; }
async function safeText(response) { try { return (await response.text()).slice(0, 500); } catch { return ""; } }

module.exports = { TransactionalEmail, cleanHeader, normalizeAddresses, normalizeMessage };
