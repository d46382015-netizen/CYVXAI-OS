#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const file = path.resolve(__dirname, "../test/venture-revenue-engine.test.js");
let source = fs.readFileSync(file, "utf8");
const search = '  async createCheckoutSession(input) { this.sessions.push(input); return { id: `cs_test_${this.sessions.length}`, url: `https://checkout.stripe.test/${this.sessions.length}`, payment_status: "unpaid", expires_at: new Date(Date.now() + 3600000).toISOString() }; }';
const replacement = '  async createCheckoutSession(input) { if (!this.configured()) throw Object.assign(new Error("Stripe is not configured"), { code: "STRIPE_UNCONFIGURED", status: 503 }); this.sessions.push(input); return { id: `cs_test_${this.sessions.length}`, url: `https://checkout.stripe.test/${this.sessions.length}`, payment_status: "unpaid", expires_at: new Date(Date.now() + 3600000).toISOString() }; }';
if (!source.includes(replacement)) {
  const count = source.split(search).length - 1;
  if (count !== 1) throw new Error(`Expected exactly one Stripe test-double match, found ${count}`);
  source = source.replace(search, replacement);
  fs.writeFileSync(file, source);
}
process.stdout.write(`${JSON.stringify({ ok: true, file })}\n`);