"use strict";

const { createClient } = require("@supabase/supabase-js");
const { createServerClient } = require("@supabase/ssr");
const { SupabasePublicConfig } = require("./supabase-public-config");

function parseCookies(header) {
  const cookies = [];
  for (const pair of String(header || "").split(";")) {
    const index = pair.indexOf("=");
    if (index < 1) continue;
    const name = pair.slice(0, index).trim();
    const rawValue = pair.slice(index + 1).trim();
    if (!name) continue;
    let value = rawValue;
    try { value = decodeURIComponent(rawValue); } catch { /* retain wire value */ }
    cookies.push({ name, value });
  }
  return cookies;
}

function serializeCookie(name, value, options = {}) {
  const parts = [`${name}=${encodeURIComponent(String(value || ""))}`];
  if (options.maxAge !== undefined) parts.push(`Max-Age=${Math.max(0, Number(options.maxAge) || 0)}`);
  if (options.domain) parts.push(`Domain=${options.domain}`);
  parts.push(`Path=${options.path || "/"}`);
  if (options.expires) parts.push(`Expires=${new Date(options.expires).toUTCString()}`);
  if (options.httpOnly) parts.push("HttpOnly");
  if (options.secure) parts.push("Secure");
  if (options.sameSite) {
    const sameSite = String(options.sameSite);
    parts.push(`SameSite=${sameSite.charAt(0).toUpperCase()}${sameSite.slice(1).toLowerCase()}`);
  }
  return parts.join("; ");
}

function appendSetCookie(res, value) {
  const existing = res.getHeader("set-cookie");
  const next = Array.isArray(existing) ? [...existing, value] : existing ? [existing, value] : [value];
  res.setHeader("set-cookie", next);
}

class SupabaseRuntime {
  constructor(options = {}) {
    this.repoRoot = options.repoRoot;
    this.env = options.env || process.env;
    this.logger = options.logger || { write() {} };
    this.fetch = options.fetch || globalThis.fetch;
    this.config = options.config || new SupabasePublicConfig({ repoRoot: this.repoRoot, env: this.env });
  }

  status() {
    const resolved = this.config.resolve();
    return {
      provider: resolved.provider,
      ready: resolved.ready,
      configured: resolved.configured,
      valid: resolved.valid,
      missing: resolved.missing,
      publishable_key_fingerprint: resolved.publishable_key_fingerprint,
      project_url: resolved.client ? resolved.client.url : null
    };
  }

  createClient() {
    const resolved = this.config.resolve();
    if (!resolved.ready || !resolved.client) {
      const error = new Error(`Supabase is not ready; missing or invalid: ${resolved.missing.join(", ")}`);
      error.code = "SUPABASE_NOT_READY";
      error.status = 503;
      throw error;
    }
    return createClient(resolved.client.url, resolved.client.publishable_key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false
      },
      global: {
        headers: { "x-client-info": "cyvxai-os-governance" }
      }
    });
  }

  createServerClient(req, res) {
    const resolved = this.config.resolve();
    if (!resolved.ready || !resolved.client) {
      const error = new Error(`Supabase is not ready; missing or invalid: ${resolved.missing.join(", ")}`);
      error.code = "SUPABASE_NOT_READY";
      error.status = 503;
      throw error;
    }
    return createServerClient(resolved.client.url, resolved.client.publishable_key, {
      cookies: {
        getAll() {
          return parseCookies(req.headers.cookie);
        },
        setAll(cookiesToSet) {
          for (const cookie of cookiesToSet || []) {
            appendSetCookie(res, serializeCookie(cookie.name, cookie.value, cookie.options));
          }
        }
      },
      global: {
        headers: { "x-client-info": "cyvxai-os-governance-ssr" }
      }
    });
  }

  async refreshSession(req, res) {
    const status = this.status();
    req.supabaseStatus = status;
    if (!status.ready) return { ready: false, user: null, refreshed: false };

    const client = this.createServerClient(req, res);
    req.supabase = client;
    const hasAuthCookie = parseCookies(req.headers.cookie).some(({ name }) => name.startsWith("sb-") || name.includes("supabase"));
    if (!hasAuthCookie) return { ready: true, user: null, refreshed: false };

    try {
      const { data, error } = await client.auth.getUser();
      if (error) {
        this.logger.write("warn", "supabase.session_refresh_failed", { message: error.message });
        return { ready: true, user: null, refreshed: false, error: error.message };
      }
      req.supabaseUser = data && data.user || null;
      return { ready: true, user: req.supabaseUser, refreshed: true };
    } catch (error) {
      this.logger.write("warn", "supabase.session_refresh_failed", { message: error.message });
      return { ready: true, user: null, refreshed: false, error: error.message };
    }
  }

  async probe(timeoutMs = 5000) {
    const resolved = this.config.resolve();
    if (!resolved.ready || !resolved.client) {
      return { ok: false, status: "not_configured", missing: resolved.missing };
    }
    if (typeof this.fetch !== "function") {
      return { ok: false, status: "fetch_unavailable" };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), Math.max(250, Number(timeoutMs) || 5000));
    const startedAt = Date.now();
    try {
      const response = await this.fetch(`${resolved.client.url}/auth/v1/settings`, {
        method: "GET",
        headers: {
          apikey: resolved.client.publishable_key,
          authorization: `Bearer ${resolved.client.publishable_key}`,
          "x-client-info": "cyvxai-os-probe"
        },
        signal: controller.signal
      });
      return {
        ok: response.ok,
        status: response.ok ? "reachable" : "rejected",
        http_status: response.status,
        latency_ms: Date.now() - startedAt,
        project_url: resolved.client.url,
        publishable_key_fingerprint: resolved.publishable_key_fingerprint
      };
    } catch (error) {
      return {
        ok: false,
        status: error.name === "AbortError" ? "timeout" : "unreachable",
        error: error.message,
        latency_ms: Date.now() - startedAt,
        project_url: resolved.client.url,
        publishable_key_fingerprint: resolved.publishable_key_fingerprint
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}

module.exports = {
  SupabaseRuntime,
  parseCookies,
  serializeCookie,
  appendSetCookie
};
