"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const test = require("node:test");
const { AuthorizationPolicy } = require("../core/security/authorization_policy");
const { EdgeGuard } = require("../core/security/edge_guard");
const { IdentityGateway } = require("../core/security/identity_gateway");
const { inspectProductionSecurity } = require("../core/security/production_guard");
const { attachContext, isProtectedApi } = require("../api/integrated-production");

const TENANT = "11111111-1111-4111-8111-111111111111";
const OTHER_TENANT = "22222222-2222-4222-8222-222222222222";
const JWT_SECRET = "integration-test-jwt-secret-that-is-at-least-32-characters";

test("authorization policy enforces role, tenant, and aal2", () => {
  const policy = new AuthorizationPolicy({ requireMfaForPrivileged: true });
  const operator = { authenticated: true, kind: "user", user_id: "u1", tenant_id: TENANT, role: "operator", roles: ["operator"], aal: "aal1" };
  assert.equal(policy.can(operator, "integrations:read", { tenantId: TENANT }), true);
  assert.equal(policy.can(operator, "actions:execute", { tenantId: TENANT }), false);
  assert.throws(() => policy.require(operator, "actions:execute", { tenantId: TENANT }), { code: "MFA_REQUIRED" });
  assert.throws(() => policy.require({ ...operator, aal: "aal2" }, "integrations:read", { tenantId: OTHER_TENANT }), { code: "TENANT_ACCESS_DENIED" });
  assert.doesNotThrow(() => policy.require({ ...operator, aal: "aal2" }, "actions:execute", { tenantId: TENANT }));
});

test("identity gateway verifies HS256 token and derives trusted tenant context", async () => {
  const now = Math.floor(Date.now() / 1000);
  const gateway = new IdentityGateway({
    env: {
      CYVX_REQUIRE_IDENTITY: "true",
      CYVX_OIDC_ISSUER: "https://identity.example.test/auth/v1",
      CYVX_OIDC_AUDIENCE: "authenticated",
      CYVX_OIDC_JWT_SECRET: JWT_SECRET,
    },
    clock: () => now * 1000,
  });
  const token = signJwt({
    iss: "https://identity.example.test/auth/v1",
    aud: "authenticated",
    sub: "33333333-3333-4333-8333-333333333333",
    exp: now + 600,
    iat: now,
    aal: "aal2",
    app_metadata: { tenant_id: TENANT, role: "admin" },
  }, JWT_SECRET);
  const context = await gateway.verifyToken(token);
  assert.equal(context.authenticated, true);
  assert.equal(context.tenant_id, TENANT);
  assert.deepEqual(context.roles, ["admin"]);
  assert.equal(context.aal, "aal2");
});

test("identity gateway rejects tokens without a trusted tenant", async () => {
  const now = Math.floor(Date.now() / 1000);
  const gateway = new IdentityGateway({
    env: {
      CYVX_OIDC_ISSUER: "https://identity.example.test/auth/v1",
      CYVX_OIDC_AUDIENCE: "authenticated",
      CYVX_OIDC_JWT_SECRET: JWT_SECRET,
    },
    clock: () => now * 1000,
  });
  const token = signJwt({ iss: "https://identity.example.test/auth/v1", aud: "authenticated", sub: "user", exp: now + 600, iat: now }, JWT_SECRET);
  await assert.rejects(() => gateway.verifyToken(token), { code: "JWT_TENANT_REQUIRED" });
});

test("edge guard blocks direct-origin requests but permits liveness", () => {
  const secret = "trusted-edge-secret-that-is-at-least-32-characters";
  const guard = new EdgeGuard({ env: { CYVX_REQUIRE_EDGE: "true", CYVX_EDGE_ORIGIN_SECRET: secret } });
  assert.equal(guard.allow({ headers: {} }, new URL("https://origin/healthz")), true);
  assert.equal(guard.allow({ headers: {} }, new URL("https://origin/readyz")), false);
  assert.equal(guard.allow({ headers: { "x-cyvx-edge-secret": secret } }, new URL("https://origin/readyz")), true);
  assert.throws(() => guard.require({ headers: {} }, new URL("https://origin/api/v1/actions")), { code: "TRUSTED_EDGE_REQUIRED" });
});

test("gateway removes spoofed identity headers before adding trusted context", () => {
  const req = { headers: { "x-cyvx-user-id": "attacker", "x-cyvx-tenant-id": OTHER_TENANT, "x-cyvx-role": "owner", "x-cyvx-aal": "aal2" } };
  attachContext(req, { authenticated: false });
  assert.equal(req.headers["x-cyvx-user-id"], undefined);
  attachContext(req, { authenticated: true, user_id: "verified", tenant_id: TENANT, role: "viewer", aal: "aal1" });
  assert.equal(req.headers["x-cyvx-user-id"], "verified");
  assert.equal(req.headers["x-cyvx-tenant-id"], TENANT);
  assert.equal(req.headers["x-cyvx-role"], "viewer");
});

test("gateway classifies public callbacks separately from protected APIs", () => {
  assert.equal(isProtectedApi("/api/public/status"), false);
  assert.equal(isProtectedApi("/api/webhooks/stripe"), false);
  assert.equal(isProtectedApi("/api/github/webhook"), false);
  assert.equal(isProtectedApi("/api/v1/integrations/status"), true);
  assert.equal(isProtectedApi("/api/v1/actions"), true);
});

test("full integration requirement fails closed without provider credentials", () => {
  const result = inspectProductionSecurity({ NODE_ENV: "production", CYVX_REQUIRE_INTEGRATIONS: "true" });
  assert.equal(result.ok, false);
  for (const key of ["CYVX_OIDC_ISSUER", "CYVX_SERVICE_TENANT_ID", "CYVX_EDGE_ORIGIN_SECRET", "CYVX_QUEUE_WORKER", "LANGFUSE_OTLP_ENDPOINT", "SENTRY_DSN", "CYVX_EMAIL_PROVIDER"]) {
    assert.ok(result.failed.includes(key), `expected ${key} to fail closed`);
  }
});

function signJwt(payload, secret) {
  const header = { alg: "HS256", typ: "JWT" };
  const encodedHeader = base64url(JSON.stringify(header));
  const encodedPayload = base64url(JSON.stringify(payload));
  const signature = crypto.createHmac("sha256", secret).update(`${encodedHeader}.${encodedPayload}`).digest("base64url");
  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

function base64url(value) { return Buffer.from(String(value)).toString("base64url"); }
