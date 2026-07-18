"use strict";

const assert = require("node:assert/strict");
const http = require("node:http");
const test = require("node:test");
const {
  isFieldManualPath,
  rewriteFieldManualPath,
  resolveFieldManualPublicBaseUrl,
  mountFieldManual,
} = require("../services/content-growth/gateway");

function listen(server, port = 0) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      server.off("error", reject);
      resolve(server.address().port);
    });
  });
}

function close(server) {
  return new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

test("recognizes and rewrites Field Manual public routes", () => {
  assert.equal(isFieldManualPath("/field-manual"), true);
  assert.equal(isFieldManualPath("/field-manual/api/v1/posts"), true);
  assert.equal(isFieldManualPath("/field-manuals"), false);
  assert.equal(rewriteFieldManualPath(new URL("https://example.test/field-manual/api/v1/posts?limit=1")), "/api/v1/posts?limit=1");
  assert.equal(resolveFieldManualPublicBaseUrl({ APP_BASE_URL: "https://cyvx.example/" }), "https://cyvx.example/field-manual");
  assert.equal(resolveFieldManualPublicBaseUrl({ CYVX_FIELD_PUBLIC_BASE_URL: "https://field.example/" }), "https://field.example");
});

test("mounts Field Manual without replacing existing public routes", async (t) => {
  const upstream = http.createServer((request, response) => {
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({ upstream: true, path: request.url }));
  });
  const upstreamPort = await listen(upstream);

  const publicServer = http.createServer((request, response) => {
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({ base: true, path: request.url }));
  });
  mountFieldManual(publicServer, upstreamPort);
  const publicPort = await listen(publicServer);
  t.after(async () => Promise.all([close(publicServer), close(upstream)]));

  const fieldResponse = await fetch(`http://127.0.0.1:${publicPort}/field-manual/api/v1/posts?limit=1`);
  assert.equal(fieldResponse.status, 200);
  assert.deepEqual(await fieldResponse.json(), { upstream: true, path: "/api/v1/posts?limit=1" });

  const baseResponse = await fetch(`http://127.0.0.1:${publicPort}/healthz`);
  assert.equal(baseResponse.status, 200);
  assert.deepEqual(await baseResponse.json(), { base: true, path: "/healthz" });
});
