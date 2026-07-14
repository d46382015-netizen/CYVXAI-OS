#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");

function patch(file, replacements) {
  let source = fs.readFileSync(file, "utf8");
  for (const [search, replacement, label] of replacements) {
    if (source.includes(replacement)) continue;
    const count = source.split(search).length - 1;
    if (count !== 1) throw new Error(`${label}: expected one match, found ${count}`);
    source = source.replace(search, replacement);
  }
  fs.writeFileSync(file, source);
}

patch(path.resolve(__dirname, "../services/revenue/engine.js"), [
  [
    '      const price = integer(profile.price_cents || 0, "price_cents", 0, 100_000_000);',
    '      const price = integer(profile.price_cents || profile.metadata && profile.metadata.price_cents || 0, "price_cents", 0, 100_000_000);',
    "preserve migrated venture price",
  ],
  [
    '        objective: `Collect at least ${(revenueTarget / 100).toFixed(2)} ${String(input.currency || "usd").toUpperCase()} in verified customer revenue for ${name}.`,',
    '        objective: `Collect at least ${(revenueTarget / 100).toFixed(2)} ${String(input.currency || "usd").toUpperCase()} in customer revenue supported by provider verification or owner payment evidence for ${name}.`,',
    "accurate outcome language",
  ],
  [
    '      verified_revenue_cents: Math.round(Number(this.db.prepare("SELECT coalesce(sum(amount_cents),0) AS total FROM revenue_payments WHERE status=\'paid\'").get().total)),',
    '      recorded_revenue_cents: Math.round(Number(this.db.prepare("SELECT coalesce(sum(amount_cents),0) AS total FROM revenue_payments WHERE status=\'paid\'").get().total)),\n      verified_revenue_cents: Math.round(Number(this.db.prepare("SELECT coalesce(sum(amount_cents),0) AS total FROM revenue_payments WHERE status=\'paid\' AND verification=\'provider_verified\'").get().total)),\n      owner_attested_revenue_cents: Math.round(Number(this.db.prepare("SELECT coalesce(sum(amount_cents),0) AS total FROM revenue_payments WHERE status=\'paid\' AND verification=\'owner_attested\'").get().total)),',
    "split revenue verification health",
  ],
]);

patch(path.resolve(__dirname, "../ui/revenue-engine.html"), [
  [
    '<div class="metric"><span>Verified revenue</span><strong>${money(m.revenue_cents)}</strong></div>',
    '<div class="metric"><span>Recorded revenue</span><strong>${money(m.revenue_cents)}</strong></div>',
    "accurate dashboard revenue label",
  ],
]);

process.stdout.write(`${JSON.stringify({ ok: true })}\n`);