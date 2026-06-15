"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { Readable } = require("node:stream");
const test = require("node:test");
const { PlatformKernel } = require("../core/platform");
const { GitHubAppClient } = require("../core/integrations/github_control_plane/app_auth");
const { GitHubAuthStore } = require("../core/integrations/github_control_plane/auth_store");
const { createCredentialCipher } = require("../core/integrations/github_control_plane/credential_crypto");
const { mapGitHubEvent } = require("../core/integrations/github_control_plane/mapper");
const { createOAuthStateService } = require("../core/integrations/github_control_plane/oauth_state");
const { createGitHubWebhookService } = require("../core/integrations/github_control_plane/service");
const { signWebhookBody, verifyWebhookSignature } = require("../core/integrations/github_control_plane/signature");
const { GitHubWebhookStore } = require("../core/integrations/github_control_plane/store");

const SECRET = "test-webhook-secret";

test("validates GitHub HMAC signatures with constant-length comparison", () => {
  const body = Buffer.from(JSON.stringify({ zen: "Keep it logically awesome." }));
  const signature = signWebhookBody(body, SECRET);
  assert.equal(verifyWebhookSignature(body, signature, SECRET), true);
  assert.equal(verifyWebhookSignature(Buffer.from("changed"), signature, SECRET), false);
  assert.equal(verifyWebhookSignature(body, "sha256=bad", SECRET), false);
  assert.equal(verifyWebhookSignature(body, null, SECRET), false);
});

test("persists webhook deliveries and rejects duplicate delivery IDs", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "cyvx-github-store-"));
  const filePath = path.join(directory, "deliveries.json");
  const store = new GitHubWebhookStore({ filePath });
  const first = store.accept({ delivery_id: "delivery-1", event: "push", payload: { ref: "refs/heads/main" } });
  const duplicate = store.accept({ delivery_id: "delivery-1", event: "push", payload: {} });
  assert.equal(first.duplicate, false);
  assert.equal(duplicate.duplicate, true);
  store.markProcessing("delivery-1");
  store.complete("delivery-1", { created: [{ kind: "observation", id: "obs-1" }] });

  const restarted = new GitHubWebhookStore({ filePath });
  assert.equal(restarted.get("delivery-1").status, "completed");
  assert.equal(restarted.health().completed_total, 1);
});

test("maps push, issue, and merged pull request events into CYVX primitives", () => {
  const calls = [];
  const platform = {
    createObservation(input) { calls.push(["observation", input]); return input; },
    createConstraint(input) { calls.push(["constraint", input]); return input; },
    recordOutcome(input) { calls.push(["outcome", input]); return input; },
  };

  const repository = { id: 7, full_name: "owner/repo", html_url: "https://github.com/owner/repo" };
  const push = mapGitHubEvent({
    event: "push",
    delivery_id: "push-1",
    platform,
    payload: { repository, ref: "refs/heads/main", before: "a", after: "b", commits: [{ id: "b" }] },
  });
  const issue = mapGitHubEvent({
    event: "issues",
    delivery_id: "issue-1",
    platform,
    payload: { action: "opened", repository, issue: { id: 9, number: 4, title: "Production outage", state: "open", labels: [{ name: "critical" }] } },
  });
  const merged = mapGitHubEvent({
    event: "pull_request",
    delivery_id: "pr-1",
    platform,
    payload: { action: "closed", repository, pull_request: { id: 10, number: 5, title: "Fix outage", merged: true, merge_commit_sha: "abc123" } },
  });

  assert.equal(push.created[0].kind, "observation");
  assert.equal(issue.created[0].kind, "constraint");
  assert.equal(merged.created[0].kind, "outcome");
  assert.equal(calls[1][1].severity, "critical");
  assert.equal(calls[2][1].actual_outcome.merge_commit_sha, "abc123");
  assert.equal(calls[0][1].metadata.delivery_id, "push-1");
});

test("persists mapped GitHub reality through PlatformKernel restart", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "cyvx-platform-github-"));
  const filePath = path.join(directory, "platform.json");
  const platform = new PlatformKernel({ filePath });
  mapGitHubEvent({
    event: "push",
    delivery_id: "persistent-push-1",
    platform,
    payload: {
      ref: "refs/heads/main",
      before: "before-sha",
      after: "after-sha",
      repository: { id: 22, full_name: "owner/persistent-repo" },
      commits: [{ id: "after-sha" }],
    },
  });

  const restarted = new PlatformKernel({ filePath });
  const observation = restarted.observations().find((item) => item.id === "github-observation-persistent-push-1");
  assert.ok(observation);
  assert.equal(observation.metadata.delivery_id, "persistent-push-1");
  assert.equal(observation.observed_state.after, "after-sha");
});

test("accepts a signed webhook once and acknowledges duplicate redelivery", async () => {
  const store = new GitHubWebhookStore();
  const created = [];
  const platform = {
    createObservation(input) { created.push(input); return input; },
    createConstraint(input) { created.push(input); return input; },
    recordOutcome(input) { created.push(input); return input; },
  };
  const service = createGitHubWebhookService({ secret: SECRET, store, platform, logger: silentLogger() });
  const payload = {
    ref: "refs/heads/main",
    after: "abc",
    repository: { id: 1, full_name: "owner/repo" },
    commits: [{ id: "abc" }],
  };
  const raw = Buffer.from(JSON.stringify(payload));
  const headers = {
    "x-hub-signature-256": signWebhookBody(raw, SECRET),
    "x-github-delivery": "delivery-http-1",
    "x-github-event": "push",
  };

  const first = await invoke(service, raw, headers);
  const duplicate = await invoke(service, raw, headers);
  assert.equal(first.statusCode, 202);
  assert.equal(first.body.duplicate, false);
  assert.equal(duplicate.statusCode, 202);
  assert.equal(duplicate.body.duplicate, true);
  assert.equal(created.length, 1);
});

test("rejects invalid signatures and oversized bodies", async () => {
  const store = new GitHubWebhookStore();
  const platform = { createObservation() {}, createConstraint() {}, recordOutcome() {} };
  const service = createGitHubWebhookService({ secret: SECRET, store, platform, maxBodyBytes: 5, logger: silentLogger() });

  const invalid = await invoke(service, Buffer.from("{}"), {
    "x-hub-signature-256": "sha256=" + "0".repeat(64),
    "x-github-delivery": "invalid-1",
    "x-github-event": "push",
  });
  assert.equal(invalid.statusCode, 401);

  const raw = Buffer.from("123456");
  const oversized = await invoke(service, raw, {
    "x-hub-signature-256": signWebhookBody(raw, SECRET),
    "x-github-delivery": "large-1",
    "x-github-event": "push",
  });
  assert.equal(oversized.statusCode, 413);
});

test("creates a valid GitHub App JWT and normalizes escaped private-key newlines", () => {
  const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  const escaped = privateKey.replace(/\n/g, "\\n");
  const nowMs = Date.parse("2026-06-15T07:00:00Z");
  const client = new GitHubAppClient({ appId: "3853563", privateKey: escaped, now: () => nowMs, fetch: async () => null });
  const jwt = client.createJwt();
  const [header, payload, signature] = jwt.split(".");
  const decodedHeader = JSON.parse(Buffer.from(header, "base64url").toString("utf8"));
  const decodedPayload = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  assert.equal(decodedHeader.alg, "RS256");
  assert.equal(decodedPayload.iss, "3853563");
  assert.ok(decodedPayload.exp > decodedPayload.iat);
  assert.equal(crypto.verify("RSA-SHA256", Buffer.from(`${header}.${payload}`), publicKey, Buffer.from(signature, "base64url")), true);
});

test("caches installation tokens until the safety window", async () => {
  const { privateKey } = crypto.generateKeyPairSync("rsa", {
    modulusLength: 2048,
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  let nowMs = Date.parse("2026-06-15T07:00:00Z");
  let calls = 0;
  const fetch = async () => {
    calls += 1;
    return mockResponse(201, {
      token: `installation-token-${calls}`,
      expires_at: new Date(nowMs + 60 * 60 * 1000).toISOString(),
      permissions: { contents: "read" },
    });
  };
  const client = new GitHubAppClient({ appId: "3853563", privateKey, fetch, now: () => nowMs, safetySeconds: 120 });
  const first = await client.getInstallationToken(123);
  const second = await client.getInstallationToken(123);
  assert.equal(first.from_cache, false);
  assert.equal(second.from_cache, true);
  assert.equal(calls, 1);
  nowMs += 59 * 60 * 1000;
  const refreshed = await client.getInstallationToken(123);
  assert.equal(refreshed.from_cache, false);
  assert.equal(calls, 2);
});

test("encrypts GitHub user tokens with authenticated encryption", () => {
  const cipher = createCredentialCipher("0123456789abcdef0123456789abcdef");
  const envelope = cipher.encrypt("secret-user-token", "github-user:dakota");
  assert.notEqual(envelope.ciphertext, "secret-user-token");
  assert.equal(cipher.decrypt(envelope, "github-user:dakota"), "secret-user-token");
  assert.throws(() => cipher.decrypt(envelope, "github-user:other"));
});

test("issues expiring one-time OAuth states and rejects replay and tampering", () => {
  let nowMs = Date.parse("2026-06-15T07:00:00Z");
  const store = new GitHubAuthStore();
  const stateService = createOAuthStateService({
    secret: "state-secret-state-secret-state-secret-123",
    store,
    now: () => nowMs,
    ttlSeconds: 60,
  });
  const issued = stateService.issue({ user_id: "dakota", return_to: "/settings/github" });
  const verified = stateService.verify(issued.state);
  assert.equal(verified.user_id, "dakota");
  assert.equal(verified.return_to, "/settings/github");
  assert.throws(() => stateService.verify(issued.state), /already been used/);

  const tampered = issued.state.slice(0, -1) + (issued.state.endsWith("A") ? "B" : "A");
  assert.throws(() => stateService.verify(tampered), /signature is invalid/);

  const expiredStore = new GitHubAuthStore();
  const expiredService = createOAuthStateService({
    secret: "state-secret-state-secret-state-secret-123",
    store: expiredStore,
    now: () => nowMs,
    ttlSeconds: 60,
  });
  const expiring = expiredService.issue({ user_id: "dakota" });
  nowMs += 61_000;
  assert.throws(() => expiredService.verify(expiring.state), /expired/);
});

async function invoke(service, body, headers) {
  const req = Readable.from([body]);
  req.method = "POST";
  req.headers = headers;
  const response = {
    statusCode: 200,
    headers: {},
    setHeader(name, value) { this.headers[String(name).toLowerCase()] = value; },
    end(value) { this.rawBody = String(value || ""); },
  };
  await service.handle(req, response);
  return { statusCode: response.statusCode, body: JSON.parse(response.rawBody), headers: response.headers };
}

function mockResponse(status, payload) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: String(status),
    async text() { return JSON.stringify(payload); },
  };
}

function silentLogger() {
  return { info() {}, warn() {}, error() {} };
}
