#!/usr/bin/env node
"use strict";

const fs = require("node:fs");

async function main(env = process.env) {
  const targets = resolveTargets(env);
  if (!targets.length) throw coded("CYVX_UPTIME_TARGETS_MISSING", "configure CYVX_PRODUCTION_URL, CYVX_STAGING_URL, or CYVX_UPTIME_TARGETS");
  const results = [];
  for (const target of targets) results.push(await checkTarget(target, env));
  const failed = results.filter((item) => !item.ok);
  const report = {
    ok: failed.length === 0,
    checked_at: new Date().toISOString(),
    slo: { availability_target: 0.999, ready_latency_target_ms: 2000 },
    results,
    failed: failed.map((item) => item.name),
  };
  const output = env.CYVX_UPTIME_OUTPUT || "/tmp/cyvx-uptime-report.json";
  fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (failed.length) {
    await notifyIncident(report, env);
    process.exitCode = 1;
  }
  return report;
}

async function checkTarget(target, env = process.env) {
  const checks = [];
  for (const endpoint of ["/healthz", "/readyz"]) {
    const started = performance.now();
    try {
      const response = await fetch(`${target.url}${endpoint}`, {
        headers: { "user-agent": "CYVX-Uptime/7.1" },
        signal: AbortSignal.timeout(Number(env.CYVX_UPTIME_TIMEOUT_MS || 10_000)),
      });
      const latencyMs = Number((performance.now() - started).toFixed(2));
      let body = null;
      try { body = await response.json(); } catch { body = { parse_error: true }; }
      checks.push({ endpoint, ok: response.ok && body && body.ok !== false, status: response.status, latency_ms: latencyMs, body });
    } catch (error) {
      checks.push({ endpoint, ok: false, status: 0, latency_ms: Number((performance.now() - started).toFixed(2)), error: error.message });
    }
  }
  return {
    name: target.name,
    url: target.url,
    ok: checks.every((item) => item.ok),
    checks,
  };
}

function resolveTargets(env) {
  const targets = [];
  if (env.CYVX_UPTIME_TARGETS) {
    const parsed = JSON.parse(env.CYVX_UPTIME_TARGETS);
    if (!Array.isArray(parsed)) throw coded("CYVX_UPTIME_TARGETS_INVALID", "CYVX_UPTIME_TARGETS must be a JSON array");
    for (const item of parsed) if (item && item.name && item.url) targets.push(normalizeTarget(item.name, item.url));
  }
  if (env.CYVX_STAGING_URL) targets.push(normalizeTarget("staging", env.CYVX_STAGING_URL));
  if (env.CYVX_PRODUCTION_URL) targets.push(normalizeTarget("production", env.CYVX_PRODUCTION_URL));
  return dedupe(targets);
}

function normalizeTarget(name, value) {
  const parsed = new URL(String(value));
  if (parsed.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(parsed.hostname)) {
    throw coded("CYVX_UPTIME_TARGET_INSECURE", `${name} uptime target must use HTTPS`);
  }
  return { name: String(name), url: parsed.toString().replace(/\/$/, "") };
}

async function notifyIncident(report, env) {
  const webhook = String(env.CYVX_INCIDENT_WEBHOOK_URL || "");
  if (!webhook) return;
  const response = await fetch(webhook, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      source: "CYVXAI-OS uptime monitor",
      severity: "critical",
      title: `CYVX uptime failure: ${report.failed.join(", ")}`,
      report,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw coded("CYVX_INCIDENT_NOTIFICATION_FAILED", `incident webhook failed with HTTP ${response.status}`);
}

function dedupe(items) {
  const seen = new Set();
  return items.filter((item) => {
    const key = `${item.name}:${item.url}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function coded(code, message) { const error = new Error(message); error.code = code; return error; }

if (require.main === module) main().catch((error) => {
  process.stderr.write(`${JSON.stringify({ ok: false, code: error.code || "UPTIME_CHECK_FAILED", error: error.message })}\n`);
  process.exit(1);
});

module.exports = { checkTarget, main, resolveTargets };
