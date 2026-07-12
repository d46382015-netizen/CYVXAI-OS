"use strict";

const crypto = require("node:crypto");
const { createClient } = require("@supabase/supabase-js");
const { SupabasePublicConfig } = require("./supabase-public-config");

function serviceKeyRole(value) {
  const key = String(value || "").trim();
  if (key.startsWith("sb_secret_")) return "service_role";
  const parts = key.split(".");
  if (parts.length !== 3) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    return String(payload.role || "") || null;
  } catch {
    return null;
  }
}

function requireServiceKey(env = process.env) {
  const value = String(env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!value) {
    const error = new Error("SUPABASE_SECRET_KEY is required for privileged Supabase operations");
    error.code = "SUPABASE_SECRET_KEY_REQUIRED";
    error.status = 503;
    throw error;
  }
  if (serviceKeyRole(value) !== "service_role") {
    const error = new Error("Configured Supabase key is not a service-role secret");
    error.code = "SUPABASE_SECRET_KEY_INVALID";
    error.status = 503;
    throw error;
  }
  return value;
}

function randomPassword(bytes = 36) {
  return `${crypto.randomBytes(bytes).toString("base64url")}Aa1!`;
}

function deterministicAgentEmail(organizationId, agentId) {
  const digest = crypto.createHash("sha256").update(`${organizationId}:${agentId}`).digest("hex").slice(0, 32);
  return `agent-${digest}@agents.cyvx.invalid`;
}

function decodeJwtPayload(token) {
  const parts = String(token || "").split(".");
  if (parts.length !== 3) return null;
  try {
    return JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

class SupabaseServiceRuntime {
  constructor(options = {}) {
    this.repoRoot = options.repoRoot;
    this.env = options.env || process.env;
    this.logger = options.logger || { write() {} };
    this.config = options.config || new SupabasePublicConfig({ repoRoot: this.repoRoot, env: this.env });
    this.secretKey = options.secretKey || null;
    this.client = options.client || null;
  }

  resolvePublicConfig() {
    const resolved = this.config.resolve();
    if (!resolved.ready || !resolved.client) {
      const error = new Error(`Supabase public configuration is not ready: ${resolved.missing.join(", ")}`);
      error.code = "SUPABASE_NOT_READY";
      error.status = 503;
      throw error;
    }
    return resolved.client;
  }

  createServiceClient() {
    if (this.client) return this.client;
    const publicConfig = this.resolvePublicConfig();
    const secretKey = this.secretKey || requireServiceKey(this.env);
    this.client = createClient(publicConfig.url, secretKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false
      },
      global: {
        headers: { "x-client-info": "cyvxai-os-service-runtime" }
      }
    });
    return this.client;
  }

  createAccessTokenClient(accessToken) {
    const token = String(accessToken || "").trim();
    if (!token) {
      const error = new Error("A Supabase access token is required");
      error.code = "SUPABASE_ACCESS_TOKEN_REQUIRED";
      error.status = 401;
      throw error;
    }
    const publicConfig = this.resolvePublicConfig();
    return createClient(publicConfig.url, publicConfig.publishable_key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false
      },
      global: {
        headers: {
          authorization: `Bearer ${token}`,
          "x-client-info": "cyvxai-os-scoped-runtime"
        }
      }
    });
  }

  createPasswordClient() {
    const publicConfig = this.resolvePublicConfig();
    return createClient(publicConfig.url, publicConfig.publishable_key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false
      },
      global: {
        headers: { "x-client-info": "cyvxai-os-token-issuer" }
      }
    });
  }

  async findUserByEmail(email, options = {}) {
    const target = String(email || "").trim().toLowerCase();
    if (!target) return null;
    const client = this.createServiceClient();
    const pageSize = Math.min(1000, Math.max(50, Number(options.pageSize || 200)));
    const maximumPages = Math.max(1, Number(options.maximumPages || 50));
    for (let page = 1; page <= maximumPages; page += 1) {
      const { data, error } = await client.auth.admin.listUsers({ page, perPage: pageSize });
      if (error) throw error;
      const users = data && Array.isArray(data.users) ? data.users : [];
      const match = users.find((user) => String(user.email || "").toLowerCase() === target);
      if (match) return match;
      if (users.length < pageSize) return null;
    }
    const error = new Error("Supabase Auth user search exceeded the configured page limit");
    error.code = "SUPABASE_USER_SEARCH_LIMIT";
    throw error;
  }

  async ensureUser(input = {}) {
    const email = String(input.email || "").trim().toLowerCase();
    const password = String(input.password || "");
    if (!email || !password) throw new TypeError("email and password are required");
    const client = this.createServiceClient();
    const existing = await this.findUserByEmail(email);
    const attributes = {
      email,
      password,
      email_confirm: true,
      app_metadata: input.appMetadata || {},
      user_metadata: input.userMetadata || {}
    };
    if (existing) {
      const { data, error } = await client.auth.admin.updateUserById(existing.id, attributes);
      if (error) throw error;
      return { user: data.user, created: false };
    }
    const { data, error } = await client.auth.admin.createUser(attributes);
    if (error) throw error;
    return { user: data.user, created: true };
  }

  async signInWithPassword(email, password) {
    const client = this.createPasswordClient();
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw error;
    if (!data || !data.session || !data.session.access_token) {
      const missing = new Error("Supabase did not return an access token");
      missing.code = "SUPABASE_SESSION_MISSING";
      throw missing;
    }
    return data;
  }
}

module.exports = {
  SupabaseServiceRuntime,
  requireServiceKey,
  serviceKeyRole,
  randomPassword,
  deterministicAgentEmail,
  decodeJwtPayload
};
