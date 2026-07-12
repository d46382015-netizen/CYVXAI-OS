"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { SupabasePublicConfig } = require("../core/integrations/supabase-public-config");
const { createPublicGovernanceHandler } = require("../api/governance-public");

function temporaryRepo(config) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cyvx-public-config-"));
  fs.mkdirSync(path.join(root, "config"), { recursive: true });
  fs.writeFileSync(path.join(root, "config", "public-runtime.json"), JSON.stringify(config));
  return root;
}

test("publishable key remains inactive until a valid project URL exists", () => {
  const root = temporaryRepo({ supabase: { publishable_key: "sb_publishable_abcdefghijklmnopqrstuvwxyz123456", url: "" } });
  const result = new SupabasePublicConfig({ repoRoot: root, env: {} }).resolve();
  assert.equal(result.configured.publishable_key, true);
  assert.equal(result.valid.publishable_key, true);
  assert.equal(result.ready, false);
  assert.deepEqual(result.missing, ["url"]);
  assert.equal(result.client, null);
});

test("environment URL activates a validated browser client configuration", () => {
  const root = temporaryRepo({ supabase: { publishable_key: "sb_publishable_abcdefghijklmnopqrstuvwxyz123456", url: "" } });
  const result = new SupabasePublicConfig({
    repoRoot: root,
    env: { SUPABASE_URL: "https://project-ref.supabase.co" }
  }).resolve();
  assert.equal(result.ready, true);
  assert.equal(result.client.url, "https://project-ref.supabase.co");
  assert.match(result.client.publishable_key, /^sb_publishable_/);
  assert.equal(result.publishable_key_fingerprint.length, 16);
});

test("public runtime endpoint is no-cache and delegates every other route", async () => {
  let delegated = false;
  const handler = createPublicGovernanceHandler({
    baseHandle(req, res) {
      delegated = true;
      res.statusCode = 204;
      res.end();
    },
    publicConfig: {
      resolve() {
        return { provider: "supabase", ready: false, missing: ["url"], client: null };
      }
    }
  });
  const server = http.createServer(handler);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    const configResponse = await fetch(`http://127.0.0.1:${address.port}/api/v1/runtime/public-config`);
    const body = await configResponse.json();
    assert.equal(configResponse.status, 200);
    assert.equal(configResponse.headers.get("cache-control"), "no-store");
    assert.equal(body.integrations.supabase.ready, false);
    assert.equal(delegated, false);

    const fallback = await fetch(`http://127.0.0.1:${address.port}/healthz`);
    assert.equal(fallback.status, 204);
    assert.equal(delegated, true);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
