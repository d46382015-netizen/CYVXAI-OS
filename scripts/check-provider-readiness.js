#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const PROVIDERS = Object.freeze({
  backup: {
    all: ["CYVX_BACKUP_STORAGE_URL", "CYVX_BACKUP_STORAGE_TOKEN", "CYVX_BACKUP_BUCKET", "CYVX_BACKUP_ENCRYPTION_KEY"],
  },
  uptime: {
    any: ["CYVX_PRODUCTION_URL", "CYVX_STAGING_URL", "CYVX_UPTIME_TARGETS"],
    optional: ["CYVX_INCIDENT_WEBHOOK_URL"],
  },
  staging_deploy: {
    all: ["CYVX_STAGING_RENDER_DEPLOY_HOOK_URL"],
  },
  cloudflare: {
    all: ["CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ZONE_ID", "CYVX_EDGE_ORIGIN_SECRET"],
  },
  supabase_deploy: {
    all: ["SUPABASE_ACCESS_TOKEN", "SUPABASE_DB_PASSWORD"],
  },
  production_canary: {
    all: ["SUPABASE_SECRET_KEY", "CYVX_OWNER_EMAIL", "CYVX_OWNER_PASSWORD"],
  },
  billing: {
    all: ["STRIPE_SECRET_KEY", "CYVX_STRIPE_WEBHOOK_SECRET"],
  },
  email: {
    all: ["CYVX_EMAIL_FROM"],
    any: ["RESEND_API_KEY", "POSTMARK_SERVER_TOKEN"],
  },
});

function configured(name, env) {
  return typeof env[name] === "string" && env[name].trim().length > 0;
}

function inspectProvider(name, spec, env) {
  const missingAll = (spec.all || []).filter((key) => !configured(key, env));
  const any = spec.any || [];
  const anySatisfied = any.length === 0 || any.some((key) => configured(key, env));
  const missingAny = anySatisfied ? [] : any;
  return {
    provider: name,
    ready: missingAll.length === 0 && missingAny.length === 0,
    missing_required: missingAll,
    missing_one_of: missingAny,
    optional_configured: (spec.optional || []).filter((key) => configured(key, env)),
  };
}

function inspect(env = process.env, scopes = Object.keys(PROVIDERS)) {
  const providers = scopes.map((name) => {
    if (!PROVIDERS[name]) throw new Error(`Unknown provider scope: ${name}`);
    return inspectProvider(name, PROVIDERS[name], env);
  });
  return {
    ok: providers.every((item) => item.ready),
    providers,
    checked_at: new Date().toISOString(),
  };
}

function parseArgs(argv) {
  const options = { scopes: [], strict: false, output: "" };
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i];
    if (item === "--scope") options.scopes.push(...String(argv[++i] || "").split(",").filter(Boolean));
    else if (item === "--strict") options.strict = true;
    else if (item === "--output") options.output = String(argv[++i] || "");
    else throw new Error(`Unknown argument: ${item}`);
  }
  return options;
}

if (require.main === module) {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = inspect(process.env, options.scopes.length ? options.scopes : Object.keys(PROVIDERS));
    const body = `${JSON.stringify(result, null, 2)}\n`;
    process.stdout.write(body);
    if (options.output) {
      const target = path.resolve(options.output);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, body, { mode: 0o600 });
    }
    if (options.strict && !result.ok) process.exitCode = 1;
  } catch (error) {
    process.stderr.write(`${JSON.stringify({ ok: false, error: error.message })}\n`);
    process.exitCode = 1;
  }
}

module.exports = { PROVIDERS, inspect, inspectProvider };
