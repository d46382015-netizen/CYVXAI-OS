"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { SupabasePublicConfig } = require("../core/integrations/supabase-public-config");
const { SupabaseRuntime, parseCookies, serializeCookie } = require("../core/integrations/supabase-runtime");
const { createPublicGovernanceHandler } = require("../api/governance-public");

function temporaryRepo(config) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cyvx-public-config-"));
  fs.mkdirSync(path.join(root, "config"), { recursive: true });
  fs.writeFileSync(path.join(root, "config", "public-runtime.json"), JSON.stringify(config));
  return root;
}

function fakeSupabase(overrides = {}) {
  return {
    status() { return { provider: "supabase", ready: true, project_url: "https://project-ref.supabase.co" }; },
    async refreshSession(req) { req.supabaseStatus = this.status(); return { ready: true, refreshed: false, user: null }; },
    async probe() { return { ok: true, status: "reachable", http_status: 200 }; },
    ...overrides
  };
}

async function withServer(handler, operation) {
  const server = http.createServer((req, res) => Promise.resolve(handler(req, res)).catch((error) => {
    res.statusCode = 500;
    res.end(error.message);
  }));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    return await operation(server.address());
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
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

test("checked-in Supabase project configuration is complete and valid", () => {
  const result = new SupabasePublicConfig({ repoRoot: path.join(__dirname, ".."), env: {} }).resolve();
  assert.equal(result.ready, true);
  assert.equal(result.client.url, "https://yokpfcbdvszdavohibkh.supabase.co");
  assert.match(result.client.publishable_key, /^sb_publishable_/);
  assert.equal(result.publishable_key_fingerprint.length, 16);
});

test("environment values override file configuration", () => {
  const root = temporaryRepo({ supabase: { publishable_key: "sb_publishable_abcdefghijklmnopqrstuvwxyz123456", url: "https://old.supabase.co" } });
  const result = new SupabasePublicConfig({
    repoRoot: root,
    env: {
      NEXT_PUBLIC_SUPABASE_URL: "https://project-ref.supabase.co",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_environmentoverride123456789"
    }
  }).resolve();
  assert.equal(result.ready, true);
  assert.equal(result.client.url, "https://project-ref.supabase.co");
  assert.equal(result.client.publishable_key, "sb_publishable_environmentoverride123456789");
});

test("server client is created with non-persistent server auth", () => {
  const root = temporaryRepo({ supabase: { publishable_key: "sb_publishable_abcdefghijklmnopqrstuvwxyz123456", url: "https://project-ref.supabase.co" } });
  const runtime = new SupabaseRuntime({ repoRoot: root, env: {} });
  const client = runtime.createClient();
  assert.ok(client.auth);
  assert.ok(client.from("todos"));
});

test("cookie parser and serializer preserve SSR session data", () => {
  assert.deepEqual(parseCookies("a=1; sb-token=hello%20world"), [
    { name: "a", value: "1" },
    { name: "sb-token", value: "hello world" }
  ]);
  const serialized = serializeCookie("sb-token", "hello world", { httpOnly: true, secure: true, sameSite: "lax", path: "/" });
  assert.match(serialized, /^sb-token=hello%20world;/);
  assert.match(serialized, /HttpOnly/);
  assert.match(serialized, /Secure/);
  assert.match(serialized, /SameSite=Lax/);
});

test("connectivity probe validates the Supabase auth endpoint without exposing the key", async () => {
  const root = temporaryRepo({ supabase: { publishable_key: "sb_publishable_abcdefghijklmnopqrstuvwxyz123456", url: "https://project-ref.supabase.co" } });
  let request;
  const runtime = new SupabaseRuntime({
    repoRoot: root,
    env: {},
    fetch: async (url, options) => {
      request = { url, options };
      return { ok: true, status: 200 };
    }
  });
  const report = await runtime.probe();
  assert.equal(report.ok, true);
  assert.equal(report.project_url, "https://project-ref.supabase.co");
  assert.equal(request.url, "https://project-ref.supabase.co/auth/v1/settings");
  assert.match(request.options.headers.apikey, /^sb_publishable_/);
  assert.equal(Object.prototype.hasOwnProperty.call(report, "publishable_key"), false);
});

test("public config and status endpoints are no-cache and other routes receive session middleware", async () => {
  let delegated = false;
  let refreshed = false;
  const supabase = fakeSupabase({
    async refreshSession(req) {
      refreshed = true;
      req.supabaseStatus = this.status();
      return { ready: true, refreshed: false, user: null };
    }
  });
  const handler = createPublicGovernanceHandler({
    baseHandle(req, res) {
      delegated = true;
      res.statusCode = 204;
      res.end();
    },
    publicConfig: {
      resolve() {
        return { provider: "supabase", ready: true, missing: [], client: { url: "https://project-ref.supabase.co", publishable_key: "sb_publishable_test" } };
      }
    },
    supabase
  });

  await withServer(handler, async (address) => {
    const configResponse = await fetch(`http://127.0.0.1:${address.port}/api/v1/runtime/public-config`);
    const configBody = await configResponse.json();
    assert.equal(configResponse.status, 200);
    assert.equal(configResponse.headers.get("cache-control"), "no-store");
    assert.equal(configBody.integrations.supabase.ready, true);
    assert.equal(delegated, false);
    assert.equal(refreshed, false);

    const statusResponse = await fetch(`http://127.0.0.1:${address.port}/api/v1/runtime/supabase/status`);
    const statusBody = await statusResponse.json();
    assert.equal(statusBody.supabase.ready, true);

    const fallback = await fetch(`http://127.0.0.1:${address.port}/healthz`);
    assert.equal(fallback.status, 204);
    assert.equal(refreshed, true);
    assert.equal(delegated, true);
  });
});

test("live probe endpoint requires authentication", async () => {
  const handler = createPublicGovernanceHandler({
    baseHandle(req, res) { res.statusCode = 204; res.end(); },
    publicConfig: { resolve() { return { provider: "supabase", ready: true, missing: [], client: {} }; } },
    supabase: fakeSupabase(),
    authenticate(req) {
      if (req.headers.authorization !== "Bearer valid") {
        const error = new Error("Bearer authentication is required");
        error.code = "AUTH_REQUIRED";
        error.status = 401;
        throw error;
      }
      return { user_id: "admin-local" };
    }
  });

  await withServer(handler, async (address) => {
    const denied = await fetch(`http://127.0.0.1:${address.port}/api/v1/integrations/supabase/probe`);
    assert.equal(denied.status, 401);

    const accepted = await fetch(`http://127.0.0.1:${address.port}/api/v1/integrations/supabase/probe`, {
      headers: { authorization: "Bearer valid" }
    });
    const body = await accepted.json();
    assert.equal(accepted.status, 200);
    assert.equal(body.report.status, "reachable");
  });
});
