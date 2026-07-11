"use strict";

const crypto = require("node:crypto");

function createIntegrationRouter(hub, options = {}) {
  if (!hub) throw new Error("Integration hub is required.");
  const maxBodyBytes = Number(options.maxBodyBytes || process.env.CYVX_INTEGRATION_BODY_LIMIT || 512 * 1024);

  return {
    isPublicPath(pathname) {
      return pathname === "/api/webhooks/stripe";
    },

    async handlePublic(req, res, url) {
      if (url.pathname !== "/api/webhooks/stripe") return false;
      if (req.method !== "POST") return sendJson(res, 405, { ok: false, error: "method_not_allowed" }, { allow: "POST" });
      const raw = await readRawLimited(req, maxBodyBytes);
      const result = await hub.billing.receive(raw.toString("utf8"), req.headers["stripe-signature"] || "");
      sendJson(res, 200, result);
      return true;
    },

    async handleProtected(req, res, url, context) {
      const pathname = url.pathname;
      if (!pathname.startsWith("/api/v1/integrations")) return false;

      if (req.method === "GET" && pathname === "/api/v1/integrations/me") {
        hub.policy.require(context, "integrations:read");
        sendJson(res, 200, { ok: true, identity: sanitizeIdentity(context) });
        return true;
      }

      if (req.method === "GET" && pathname === "/api/v1/integrations/status") {
        hub.policy.require(context, "integrations:read");
        sendJson(res, 200, { ok: true, integrations: hub.snapshot() });
        return true;
      }

      if (req.method === "POST" && pathname === "/api/v1/integrations/probe") {
        hub.policy.require(context, "integrations:write", { requireMfa: true });
        sendJson(res, 200, { ok: true, integrations: await hub.probe() });
        return true;
      }

      if (req.method === "GET" && pathname === "/api/v1/integrations/flags") {
        hub.policy.require(context, "flags:read");
        sendJson(res, 200, { ok: true, flags: hub.flags.list({ tenantId: context.tenant_id }) });
        return true;
      }

      const flagMatch = pathname.match(/^\/api\/v1\/integrations\/flags\/([^/]+)$/);
      if (req.method === "POST" && flagMatch) {
        hub.policy.require(context, "flags:write", { requireMfa: true });
        const body = await readJsonLimited(req, maxBodyBytes);
        const row = await hub.flags.setFlag(decodeURIComponent(flagMatch[1]), body.value, {
          enabled: body.enabled,
          tenantId: tenantFor(context, body.tenant_id),
          environment: body.environment,
          updatedBy: context.user_id,
        });
        sendJson(res, 200, { ok: true, flag: row });
        return true;
      }

      if (req.method === "POST" && pathname === "/api/v1/integrations/jobs") {
        hub.policy.require(context, "jobs:write");
        const body = await readJsonLimited(req, maxBodyBytes);
        const result = await hub.queue.send(body.type, body.payload, {
          tenantId: tenantFor(context, body.tenant_id),
          delaySeconds: body.delay_seconds,
          traceId: body.trace_id || traceId(req),
          metadata: { requested_by: context.user_id },
        });
        sendJson(res, 202, result);
        return true;
      }

      if (req.method === "POST" && pathname === "/api/v1/integrations/email") {
        hub.policy.require(context, "email:send", { requireMfa: true });
        if (!hub.flags.getBooleanValue("email.enabled", false, { tenantId: context.tenant_id })) throw forbidden("EMAIL_DISABLED", "Email delivery is disabled by feature flag.");
        const body = await readJsonLimited(req, maxBodyBytes);
        const result = await hub.queue.send("email.send", body, {
          tenantId: context.tenant_id,
          traceId: traceId(req),
          metadata: { requested_by: context.user_id },
        });
        sendJson(res, 202, result);
        return true;
      }

      if (req.method === "POST" && pathname === "/api/v1/integrations/analytics") {
        hub.policy.require(context, "analytics:write");
        if (!hub.flags.getBooleanValue("analytics.enabled", false, { tenantId: context.tenant_id })) return sendJson(res, 202, { ok: true, disabled: true });
        const body = await readJsonLimited(req, maxBodyBytes);
        const result = await hub.queue.send("analytics.capture", {
          event: body.event,
          distinct_id: context.user_id,
          properties: body.properties,
        }, { tenantId: context.tenant_id, traceId: traceId(req) });
        sendJson(res, 202, result);
        return true;
      }

      if (req.method === "POST" && pathname === "/api/v1/integrations/ai/score") {
        hub.policy.require(context, "ai:score");
        const body = await readJsonLimited(req, maxBodyBytes);
        const result = await hub.queue.send("ai.score", body, { tenantId: context.tenant_id, traceId: body.trace_id || traceId(req) });
        sendJson(res, 202, result);
        return true;
      }

      if (req.method === "GET" && pathname === "/api/v1/integrations/entitlements") {
        hub.policy.require(context, "billing:read");
        const entitlements = await hub.billing.entitlements(context.tenant_id);
        sendJson(res, 200, { ok: true, tenant_id: context.tenant_id, entitlements });
        return true;
      }

      sendJson(res, 404, { ok: false, error: "integration_route_not_found" });
      return true;
    },
  };
}

async function readRawLimited(req, limitBytes) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > limitBytes) {
      const error = new Error(`payload exceeds ${limitBytes} bytes`);
      error.code = "PAYLOAD_TOO_LARGE";
      error.statusCode = 413;
      throw error;
    }
    chunks.push(buffer);
  }
  return Buffer.concat(chunks, size);
}

async function readJsonLimited(req, limitBytes) {
  const raw = await readRawLimited(req, limitBytes);
  if (!raw.length) return {};
  try {
    const value = JSON.parse(raw.toString("utf8"));
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("body must be an object");
    return value;
  } catch (cause) {
    const error = new Error("request body must be valid JSON object");
    error.code = "INVALID_JSON";
    error.statusCode = 400;
    error.cause = cause;
    throw error;
  }
}

function tenantFor(context, requested) {
  if (!requested) return context.tenant_id;
  if (context.kind === "service" && context.tenant_id === "*") return String(requested);
  if (String(requested) !== String(context.tenant_id)) throw forbidden("TENANT_ACCESS_DENIED", "Cross-tenant operations are not allowed.");
  return context.tenant_id;
}

function sanitizeIdentity(context) {
  return {
    authenticated: Boolean(context.authenticated),
    kind: context.kind,
    user_id: context.user_id,
    tenant_id: context.tenant_id,
    role: context.role,
    roles: context.roles,
    aal: context.aal,
    session_id: context.session_id || null,
  };
}

function traceId(req) {
  const header = String(req.headers.traceparent || "");
  const match = header.match(/^00-([a-f0-9]{32})-[a-f0-9]{16}-[a-f0-9]{2}$/i);
  return match ? match[1].toLowerCase() : crypto.randomBytes(16).toString("hex");
}

function sendJson(res, status, payload, headers = {}) {
  const body = Buffer.from(`${JSON.stringify(payload)}\n`);
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("content-length", body.length);
  res.setHeader("cache-control", "no-store");
  for (const [key, value] of Object.entries(headers)) res.setHeader(key, value);
  res.end(body);
  return true;
}

function forbidden(code, message) { const error = new Error(message); error.code = code; error.statusCode = 403; return error; }

module.exports = { createIntegrationRouter, readJsonLimited, readRawLimited, sanitizeIdentity, tenantFor, traceId };
