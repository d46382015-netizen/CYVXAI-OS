"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const PUBLISHABLE_KEY_PATTERN = /^sb_publishable_[A-Za-z0-9_-]{20,}$/;

function sha256(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

function readConfig(repoRoot) {
  const file = path.join(repoRoot, "config", "public-runtime.json");
  if (!fs.existsSync(file)) return {};
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    const wrapped = new Error(`Invalid public runtime configuration: ${error.message}`);
    wrapped.code = "PUBLIC_CONFIG_INVALID";
    wrapped.status = 500;
    throw wrapped;
  }
}

function validUrl(value) {
  try {
    const url = new URL(String(value || ""));
    return url.protocol === "https:" && Boolean(url.hostname);
  } catch {
    return false;
  }
}

class SupabasePublicConfig {
  constructor(options = {}) {
    this.repoRoot = path.resolve(options.repoRoot || path.join(__dirname, "../.."));
    this.env = options.env || process.env;
  }

  resolve() {
    const fileConfig = readConfig(this.repoRoot);
    const configured = fileConfig.supabase || {};
    const publishableKey = String(
      this.env.SUPABASE_PUBLISHABLE_KEY ||
      this.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
      configured.publishable_key ||
      ""
    ).trim();
    const url = String(
      this.env.SUPABASE_URL ||
      this.env.NEXT_PUBLIC_SUPABASE_URL ||
      configured.url ||
      ""
    ).trim().replace(/\/$/, "");

    const keyValid = PUBLISHABLE_KEY_PATTERN.test(publishableKey);
    const urlValid = validUrl(url);
    const missing = [];
    if (!keyValid) missing.push("publishable_key");
    if (!urlValid) missing.push("url");

    return {
      provider: "supabase",
      ready: keyValid && urlValid,
      configured: {
        publishable_key: Boolean(publishableKey),
        url: Boolean(url)
      },
      valid: {
        publishable_key: keyValid,
        url: urlValid
      },
      missing,
      publishable_key_fingerprint: keyValid ? sha256(publishableKey).slice(0, 16) : null,
      client: keyValid && urlValid ? { url, publishable_key: publishableKey } : null
    };
  }
}

module.exports = {
  SupabasePublicConfig,
  PUBLISHABLE_KEY_PATTERN,
  validUrl
};
