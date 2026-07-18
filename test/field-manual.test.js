"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const {
  POSTS,
  TRIGGERS,
  createStore,
  validateEmail,
  resolveTrigger,
  verifyLemonSignature,
  renderSlideSvg,
  renderAllAssets,
  buildDownloadAsset,
  parseLemonPurchase,
  syncLeadToKit,
} = require("../services/content-growth");
const { createFieldManualServer } = require("../services/content-growth/server");

function tempDirectory() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "cyvx-field-manual-"));
}

test("catalog defines three launch posts with eight production slides", () => {
  assert.equal(POSTS.length, 3);
  assert.deepEqual(POSTS.map((post) => post.id), ["POST_001", "POST_002", "POST_003"]);
  assert.ok(POSTS.every((post) => post.slides.length === 8));
  assert.equal(Object.keys(TRIGGERS).length, 3);
});

test("validation and trigger routing reject malformed input", () => {
  assert.equal(validateEmail(" Operator@Example.com "), "operator@example.com");
  assert.equal(validateEmail("broken"), null);
  assert.equal(resolveTrigger(" secure ").intent, "SECURITY");
  assert.equal(resolveTrigger("unknown"), null);
});

test("carousel renderer produces exact vertical SVG assets", () => {
  const svg = renderSlideSvg(POSTS[1], POSTS[1].slides[0], 0);
  assert.match(svg, /width="1080" height="1350"/);
  assert.match(svg, /#00FF66/);
  assert.match(svg, /SECURE \/ 015/);
});

test("asset build creates 24 slides, two PDFs, and one ZIP", () => {
  const output = tempDirectory();
  const manifest = renderAllAssets(output);
  assert.equal(manifest.files.length, 27);
  assert.equal(fs.readFileSync(path.join(output, "downloads", "CYVX_Operator_Readiness_Assessment.pdf")).subarray(0, 4).toString("utf8"), "%PDF");
  const zip = fs.readFileSync(path.join(output, "downloads", "Mobile_Website_Starter_Files.zip"));
  assert.equal(zip.readUInt32LE(0), 0x04034b50);
});

test("durable store deduplicates leads and calculates operating telemetry", () => {
  const store = createStore({ directory: tempDirectory() });
  const lead = { email: "a@example.com", source: "POST_001", keyword: "MANUAL", intent_tag: "GENERAL_OPERATOR" };
  assert.equal(store.recordLead(lead).duplicate, false);
  assert.equal(store.recordLead(lead).duplicate, true);
  store.recordTelemetry({ post_id: "POST_001", reach: 1000 });
  store.recordPurchase({ external_id: "order:1", email: "a@example.com", amount_cents: 2900 });
  const metrics = store.metrics();
  assert.equal(metrics.leads, 1);
  assert.equal(metrics.revenue_cents, 2900);
  assert.equal(metrics.lead_capture_efficiency_pct, 0.1);
  assert.equal(metrics.system_monetization_velocity_usd_per_1000_reach, 29);
  assert.equal(metrics.operational_conversion_ratio_pct, 100);
});

test("Lemon Squeezy signature verification uses raw-body HMAC", () => {
  const raw = Buffer.from('{"ok":true}');
  const secret = "production-secret";
  const signature = crypto.createHmac("sha256", secret).update(raw).digest("hex");
  assert.equal(verifyLemonSignature(raw, signature, secret), true);
  assert.equal(verifyLemonSignature(raw, "bad", secret), false);
});

test("Lemon purchase parser extracts order telemetry", () => {
  const purchase = parseLemonPurchase({
    meta: { event_name: "order_created", custom_data: { source: "POST_001" } },
    data: { id: "42", attributes: { user_email: "buyer@example.com", total: 2900, currency: "USD" } },
  }, "order_created");
  assert.equal(purchase.external_id, "order_created:42");
  assert.equal(purchase.amount_cents, 2900);
  assert.equal(purchase.email, "buyer@example.com");
});

test("Kit v4 provider upserts subscriber and applies mapped interest tag", async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    return { ok: true, status: 200, text: async () => JSON.stringify({ subscriber: { id: 99, email_address: "lead@example.com" } }) };
  };
  const result = await syncLeadToKit({ email: "lead@example.com", first_name: "Lead", intent_tag: "SECURITY" }, {
    apiKey: "kit-key",
    tagIds: { SECURITY: "123" },
    fetchImpl,
  });
  assert.equal(result.skipped, false);
  assert.equal(calls.length, 2);
  assert.match(calls[0].url, /\/v4\/subscribers$/);
  assert.match(calls[1].url, /\/v4\/tags\/123\/subscribers$/);
  assert.equal(calls[0].options.headers["X-Kit-Api-Key"], "kit-key");
});

test("HTTP runtime captures a lead and serves its real download", async (t) => {
  const runtime = createFieldManualServer({ port: 0, dataDirectory: tempDirectory(), manychatSecret: "mc-secret", logger: { error() {} } });
  const address = await runtime.start();
  t.after(() => runtime.close());
  const base = `http://127.0.0.1:${address.port}`;
  const response = await fetch(`${base}/api/v1/webhooks/manychat`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-cyvx-webhook-secret": "mc-secret" },
    body: JSON.stringify({ email: "operator@example.com", keyword: "DEPLOY", consent: false }),
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.asset, "Mobile_Website_Starter_Files.zip");
  const download = await fetch(`${base}${body.download_url}`);
  assert.equal(download.status, 200);
  assert.equal(Buffer.from(await download.arrayBuffer()).readUInt32LE(0), 0x04034b50);
});

test("download builder returns only approved trigger assets", () => {
  assert.match(buildDownloadAsset("CYVX_Operator_Readiness_Assessment.pdf").toString("utf8", 0, 4), /%PDF/);
  assert.equal(buildDownloadAsset("unknown.exe"), null);
});
