"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { Readable } = require("node:stream");
const test = require("node:test");
const { mapGitHubEvent } = require("../core/integrations/github_control_plane/mapper");
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

function silentLogger() {
  return { info() {}, warn() {}, error() {} };
}
