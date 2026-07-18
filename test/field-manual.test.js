"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");

const { loadCatalog, validateCatalog } = require("../apps/field-manual/lib/catalog");
const { createStore } = require("../apps/field-manual/lib/store");
const { buildAll } = require("../apps/field-manual/lib/pipeline");
const { createFieldManualServer } = require("../apps/field-manual/server");

function tempDir(name) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `${name}-`));
}

function request(port, method, requestPath, body) {
  return new Promise((resolve, reject) => {
    const raw = body ? JSON.stringify(body) : "";
    const req = http.request({
      host: "127.0.0.1",
      port,
      method,
      path: requestPath,
      headers: raw ? {
        "content-type": "application/json",
        "content-length": Buffer.byteLength(raw)
      } : {}
    }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        resolve({ status: res.statusCode, headers: res.headers, body: text ? JSON.parse(text) : null });
      });
    });
    req.on("error", reject);
    if (raw) req.write(raw);
    req.end();
  });
}

test("launch catalog contains 30 complete, unique, approved modules", () => {
  const catalog = loadCatalog();
  const result = validateCatalog(catalog);
  assert.deepEqual(result.errors, []);
  assert.equal(result.ok, true);
  assert.equal(catalog.posts.length, 30);
  assert.equal(new Set(catalog.posts.map((post) => post.slug)).size, 30);
  assert.equal(catalog.posts.reduce((total, post) => total + post.slides.length, 0), 210);
  assert.deepEqual(
    Object.fromEntries(catalog.brand.pillars.map((pillar) => [
      pillar.id,
      catalog.posts.filter((post) => post.pillar === pillar.id).length
    ])),
    { secure: 5, build: 5, sell: 5, operate: 4, own: 4, capital: 4, web3: 3 }
  );
});

test("production pipeline renders every slide and a hashed manifest", async () => {
  const outDir = tempDir("cyvx-field-manual-build");
  const result = await buildAll({ outDir });
  assert.equal(result.manifest.post_count, 30);
  const slideFiles = result.manifest.files.filter((file) => file.path.endsWith(".svg"));
  assert.equal(slideFiles.length, 210);
  assert.ok(result.manifest.files.every((file) => /^[a-f0-9]{64}$/.test(file.sha256)));
  assert.ok(fs.existsSync(path.join(outDir, "downloads", "operator-starter-manual.html")));
  assert.ok(fs.existsSync(path.join(outDir, "posts", "build-private-wireguard-vpn", "slide-01.svg")));
  const svg = fs.readFileSync(path.join(outDir, "posts", "build-private-wireguard-vpn", "slide-01.svg"), "utf8");
  assert.match(svg, /width="1080" height="1350"/);
  assert.match(svg, /CYVX FIELD MANUAL/);
});

test("lead storage validates consent, deduplicates records, and redacts responses", () => {
  const store = createStore({ baseDir: tempDir("cyvx-field-manual-store") });
  assert.throws(() => store.captureLead({ email: "invalid", consent: true }), /valid email/i);
  assert.throws(() => store.captureLead({ email: "person@example.com", consent: false }), /consent/i);
  const first = store.captureLead({ email: "Person@Example.com", name: "Operator", consent: true, source: "test" });
  const second = store.captureLead({ email: "person@example.com", name: "Operator", consent: true, source: "test" });
  assert.equal(first.existing, false);
  assert.equal(second.existing, true);
  assert.match(first.email, /^pe\*\*\*@example\.com$/);
  assert.equal(store.summary().leads, 1);
  assert.throws(() => store.captureEvent({ type: "arbitrary.event" }), /unsupported/i);
  store.captureEvent({ type: "post.view", post_slug: "build-private-wireguard-vpn" });
  assert.equal(store.summary().event_counts["post.view"], 1);
});

test("HTTP runtime serves health, catalog, and lead conversion APIs", async (t) => {
  const store = createStore({ baseDir: tempDir("cyvx-field-manual-http") });
  const server = createFieldManualServer({ store });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const port = server.address().port;

  const health = await request(port, "GET", "/api/health");
  assert.equal(health.status, 200);
  assert.equal(health.body.ok, true);
  assert.equal(health.body.post_count, 30);

  const posts = await request(port, "GET", "/api/posts?pillar=secure");
  assert.equal(posts.status, 200);
  assert.equal(posts.body.count, 5);

  const lead = await request(port, "POST", "/api/leads", {
    email: "launch@example.com",
    name: "Launch Operator",
    interest: "build",
    consent: true,
    source: "test-suite"
  });
  assert.equal(lead.status, 201);
  assert.equal(lead.body.ok, true);
  assert.equal(lead.body.download_url, "/downloads/operator-starter-manual.html");

  const unauthorized = await request(port, "GET", "/api/metrics");
  assert.equal(unauthorized.status, 401);
});
