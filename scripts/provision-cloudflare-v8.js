#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const API = "https://api.cloudflare.com/client/v4";

async function main(argv = process.argv.slice(2), env = process.env) {
  const args = parseArgs(argv);
  const manifestPath = path.resolve(args.manifest || path.join(__dirname, "..", "ops", "cloudflare", "cyvx-edge-policy.json"));
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const apply = Boolean(args.apply);
  const token = String(env.CLOUDFLARE_API_TOKEN || "").trim();
  const zoneId = String(env.CLOUDFLARE_ZONE_ID || "").trim();
  const originSecret = String(env.CYVX_EDGE_ORIGIN_SECRET || "").trim();
  if (originSecret.length < 32) throw coded("EDGE_SECRET_INVALID", "CYVX_EDGE_ORIGIN_SECRET must contain at least 32 characters.");
  if (apply && (!token || !zoneId)) throw coded("CLOUDFLARE_CREDENTIALS_REQUIRED", "CLOUDFLARE_API_TOKEN and CLOUDFLARE_ZONE_ID are required with --apply.");

  const phases = Object.entries(manifest.phases || {}).map(([phase, rules]) => ({
    phase,
    rules: renderRules(rules, originSecret),
  }));

  if (!apply) {
    const preview = { ok: true, apply: false, zone_id: zoneId || null, manifest: manifestPath, phases: phases.map((item) => ({ phase: item.phase, rules: redactRules(item.rules) })) };
    process.stdout.write(`${JSON.stringify(preview, null, 2)}\n`);
    return preview;
  }

  const results = [];
  for (const item of phases) results.push(await upsertPhase({ token, zoneId, phase: item.phase, rules: item.rules, fetch: globalThis.fetch }));
  const output = { ok: results.every((item) => item.ok), apply: true, zone_id: zoneId, results };
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  return output;
}

async function upsertPhase(options) {
  const endpoint = `${API}/zones/${encodeURIComponent(options.zoneId)}/rulesets/phases/${encodeURIComponent(options.phase)}/entrypoint`;
  const existingResponse = await request(endpoint, { token: options.token, fetch: options.fetch, allow404: true });
  const existing = existingResponse && existingResponse.result || null;
  const retained = existing && Array.isArray(existing.rules) ? existing.rules.filter((rule) => !String(rule.ref || "").startsWith("cyvx-")) : [];
  const payload = {
    name: existing && existing.name || `CYVX ${options.phase}`,
    description: "Managed by CYVXAI OS integration baseline v8",
    kind: "zone",
    phase: options.phase,
    rules: [...retained, ...options.rules],
  };
  let response;
  if (existing && existing.id) {
    response = await request(`${API}/zones/${encodeURIComponent(options.zoneId)}/rulesets/${encodeURIComponent(existing.id)}`, {
      token: options.token,
      fetch: options.fetch,
      method: "PUT",
      body: payload,
    });
  } else {
    response = await request(`${API}/zones/${encodeURIComponent(options.zoneId)}/rulesets`, {
      token: options.token,
      fetch: options.fetch,
      method: "POST",
      body: payload,
    });
  }
  return {
    ok: Boolean(response && response.success),
    phase: options.phase,
    ruleset_id: response && response.result && response.result.id || null,
    managed_rules: options.rules.map((rule) => rule.ref),
  };
}

async function request(url, options = {}) {
  const response = await options.fetch(url, {
    method: options.method || "GET",
    headers: {
      authorization: `Bearer ${options.token}`,
      accept: "application/json",
      "content-type": "application/json",
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(20_000),
  });
  if (options.allow404 && response.status === 404) return null;
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.success === false) throw coded("CLOUDFLARE_API_FAILED", `Cloudflare API failed with HTTP ${response.status}: ${JSON.stringify(body.errors || body.messages || body).slice(0, 1000)}`);
  return body;
}

function renderRules(rules, originSecret) {
  return (Array.isArray(rules) ? rules : []).map((rule) => JSON.parse(JSON.stringify(rule).replaceAll("__CYVX_EDGE_ORIGIN_SECRET__", originSecret)));
}

function redactRules(rules) {
  return JSON.parse(JSON.stringify(rules).replaceAll(/("x-cyvx-edge-secret"\s*:\s*\{[^}]*"value"\s*:\s*")[^"]+("[^}]*\})/g, "$1[redacted]$2"));
}

function parseArgs(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith("--")) continue;
    const [key, inline] = item.slice(2).split("=", 2);
    if (inline !== undefined) result[key] = inline;
    else if (argv[index + 1] && !argv[index + 1].startsWith("--")) result[key] = argv[++index];
    else result[key] = true;
  }
  return result;
}

function coded(code, message) { const error = new Error(message); error.code = code; return error; }

if (require.main === module) main().catch((error) => {
  process.stderr.write(`${JSON.stringify({ ok: false, code: error.code || "CLOUDFLARE_PROVISION_FAILED", error: error.message })}\n`);
  process.exit(1);
});

module.exports = { main, parseArgs, redactRules, renderRules, request, upsertPhase };
