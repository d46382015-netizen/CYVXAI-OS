"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  serviceKeyRole,
  requireServiceKey,
  randomPassword,
  deterministicAgentEmail,
  decodeJwtPayload
} = require("../core/integrations/supabase-service-runtime");
const { SupabaseAgentIdentityIssuer } = require("../core/integrations/supabase-agent-identity");
const { stableJson, sha256, requireFields, cleanFileName } = require("../core/integrations/supabase-persistence-adapter");
const { normalizeSingle } = require("../scripts/bootstrap-cyvx-supabase");

function token(payload) {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${header}.${body}.signature`;
}

function fakeAgentQuery(agent) {
  return {
    select() { return this; },
    eq() { return this; },
    maybeSingle: async () => ({ data: agent, error: null })
  };
}

test("service key validation accepts secret and service-role JWT formats", () => {
  assert.equal(serviceKeyRole("sb_secret_example"), "service_role");
  const jwt = token({ role: "service_role" });
  assert.equal(serviceKeyRole(jwt), "service_role");
  assert.equal(serviceKeyRole(token({ role: "anon" })), "anon");
  assert.equal(requireServiceKey({ SUPABASE_SECRET_KEY: "sb_secret_example" }), "sb_secret_example");
  assert.throws(() => requireServiceKey({ SUPABASE_SECRET_KEY: "sb_publishable_example" }), /not a service-role secret/);
});

test("agent identities are deterministic and generated passwords are strong", () => {
  const first = deterministicAgentEmail("org-1", "agent-1");
  const second = deterministicAgentEmail("org-1", "agent-1");
  const other = deterministicAgentEmail("org-1", "agent-2");
  assert.equal(first, second);
  assert.notEqual(first, other);
  assert.match(first, /^agent-[a-f0-9]{32}@agents\.cyvx\.invalid$/);
  const password = randomPassword();
  assert.ok(password.length >= 40);
  assert.match(password, /Aa1!$/);
});

test("agent issuer binds organization, agent, and token version claims", async () => {
  const organizationId = "11111111-1111-4111-8111-111111111111";
  const agentId = "agent-001";
  const accessToken = token({
    app_metadata: {
      organization_id: organizationId,
      agent_id: agentId,
      agent_token_version: 7
    }
  });
  const fakeService = {
    createServiceClient() {
      return { from: () => fakeAgentQuery({ id: agentId, organization_id: organizationId, status: "active", token_version: 7, name: "Agent" }) };
    },
    async ensureUser(input) {
      assert.equal(input.appMetadata.organization_id, organizationId);
      assert.equal(input.appMetadata.agent_id, agentId);
      assert.equal(input.appMetadata.agent_token_version, 7);
      return { user: { id: "auth-user-1" }, created: true };
    },
    async signInWithPassword() {
      return { session: { access_token: accessToken, refresh_token: "refresh", expires_at: 123, expires_in: 3600, token_type: "bearer" } };
    }
  };
  const result = await new SupabaseAgentIdentityIssuer({ service: fakeService }).issue({ organizationId, agentId });
  assert.equal(result.organization_id, organizationId);
  assert.equal(result.agent_id, agentId);
  assert.equal(result.token_version, 7);
  assert.equal(result.auth_user_id, "auth-user-1");
  assert.deepEqual(decodeJwtPayload(result.access_token).app_metadata, {
    organization_id: organizationId,
    agent_id: agentId,
    agent_token_version: 7
  });
});

test("agent issuer refuses inactive or missing agents", async () => {
  const service = {
    createServiceClient() {
      return { from: () => fakeAgentQuery({ id: "agent", organization_id: "org", status: "paused", token_version: 1 }) };
    }
  };
  await assert.rejects(
    () => new SupabaseAgentIdentityIssuer({ service }).issue({ organizationId: "org", agentId: "agent" }),
    (error) => error.code === "AGENT_NOT_ACTIVE"
  );
});

test("persistence hashing is deterministic and field validation fails closed", () => {
  const left = stableJson({ b: 2, a: { z: 1, y: [3, 2, 1] } });
  const right = stableJson({ a: { y: [3, 2, 1], z: 1 }, b: 2 });
  assert.equal(left, right);
  assert.equal(sha256(left), sha256(right));
  assert.throws(() => requireFields({ id: "x" }, ["id", "organization_id"], "mission"), /mission\.organization_id is required/);
  assert.equal(cleanFileName("../../proof report?.json"), "..-..-proof-report-.json");
});

test("bootstrap normalizes PostgREST composite responses", () => {
  assert.deepEqual(normalizeSingle([{ id: "org-1" }]), { id: "org-1" });
  assert.deepEqual(normalizeSingle({ id: "org-2" }), { id: "org-2" });
  assert.equal(normalizeSingle([]), null);
});
