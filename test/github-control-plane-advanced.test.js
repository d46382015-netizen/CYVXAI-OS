"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { Readable } = require("node:stream");
const test = require("node:test");
const { GitHubAppIntegration } = require("../core/integrations/github_app_integration");
const { mapGitHubEvent } = require("../core/integrations/github_control_plane/mapper");
const { createGitHubWebhookService } = require("../core/integrations/github_control_plane/service");
const { signWebhookBody } = require("../core/integrations/github_control_plane/signature");
const { GitHubWebhookStore } = require("../core/integrations/github_control_plane/store");
const { createOperatorSession } = require("../core/security/operator_session");

const SECRET = "advanced-webhook-secret";

test("operator session issues an HttpOnly cookie and rejects tampering and expiry", () => {
  let nowMs = Date.parse("2026-06-15T07:00:00Z");
  const session = createOperatorSession({
    secret: "operator-session-secret-operator-session-secret",
    ownerUserId: "dakota",
    ttlSeconds: 300,
    now: () => nowMs,
  });
  const response = responseStub();
  const issued = session.issue(response, { secure: false });
  assert.equal(issued.user_id, "dakota");
  assert.match(response.headers["set-cookie"], /HttpOnly/);
  assert.match(response.headers["set-cookie"], /SameSite=Lax/);
  const cookie = response.headers["set-cookie"].split(";")[0];
  assert.equal(session.userId({ headers: { cookie } }), "dakota");

  const tampered = cookie.slice(0, -1) + (cookie.endsWith("A") ? "B" : "A");
  assert.equal(session.userId({ headers: { cookie: tampered } }), "");
  nowMs += 301_000;
  assert.equal(session.userId({ headers: { cookie } }), "");
});

test("repository intelligence uses the connected GitHub App installation token path", async () => {
  const calls = [];
  const appClient = {
    configured: () => true,
    health: () => ({ configured: true }),
    async requestInstallationJson(installationId, pathname, options) {
      calls.push({ installationId, pathname, options });
      return {
        id: 77,
        name: "CYVXAI-OS",
        full_name: "d46382015-netizen/CYVXAI-OS",
        default_branch: "main",
        owner: { login: "d46382015-netizen" },
      };
    },
  };
  const integration = new GitHubAppIntegration({
    appClient,
    installationIdProvider: () => 991,
  });
  const repository = await integration.repository({ owner: "d46382015-netizen", repo: "CYVXAI-OS" });
  assert.equal(repository.id, 77);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].installationId, 991);
  assert.equal(calls[0].pathname, "/repos/d46382015-netizen/CYVXAI-OS");
  const health = await integration.authenticationHealth();
  assert.equal(health.mode, "github_app_installation");
});

test("maps installation, pull request, review, closed issue, and successful check events", () => {
  const calls = [];
  const platform = {
    createCapability(input) { calls.push(["capability", input]); return input; },
    createMission(input) { calls.push(["mission", input]); return input; },
    createDecision(input) { calls.push(["decision", input]); return input; },
    createObservation(input) { calls.push(["observation", input]); return input; },
    createConstraint(input) { calls.push(["constraint", input]); return input; },
    recordOutcome(input) { calls.push(["outcome", input]); return input; },
  };
  const repository = { id: 1, full_name: "owner/repo", html_url: "https://github.com/owner/repo" };

  const installation = mapGitHubEvent({
    event: "installation",
    delivery_id: "install-1",
    platform,
    payload: { action: "created", installation: { id: 91, account: { login: "owner" }, permissions: { contents: "read" } } },
  });
  const mission = mapGitHubEvent({
    event: "pull_request",
    delivery_id: "pr-open-1",
    platform,
    payload: { action: "opened", repository, pull_request: { id: 22, number: 8, title: "Ship control plane", draft: false, html_url: "https://github.com/owner/repo/pull/8" } },
  });
  const decision = mapGitHubEvent({
    event: "pull_request_review",
    delivery_id: "review-1",
    platform,
    payload: { action: "submitted", repository, pull_request: { title: "Ship control plane", head: { sha: "abc" } }, review: { id: 3, state: "approved", body: "Looks good" } },
  });
  const closedIssue = mapGitHubEvent({
    event: "issues",
    delivery_id: "issue-close-1",
    platform,
    payload: { action: "closed", repository, issue: { id: 5, number: 4, title: "Repair route", state: "closed", closed_at: "2026-06-15T07:00:00Z" } },
  });
  const check = mapGitHubEvent({
    event: "check_suite",
    delivery_id: "check-1",
    platform,
    payload: { action: "completed", repository, check_suite: { id: 6, conclusion: "success", head_sha: "abc" } },
  });

  assert.equal(installation.created[0].kind, "capability");
  assert.equal(mission.created[0].kind, "mission");
  assert.equal(decision.created[0].kind, "decision");
  assert.equal(closedIssue.created[0].kind, "outcome");
  assert.equal(check.created[0].kind, "observation");
  assert.deepEqual(calls.map(([kind]) => kind), ["capability", "mission", "decision", "outcome", "observation"]);
});

test("webhook responds before processing and supports controlled retry", async () => {
  const store = new GitHubWebhookStore();
  let scheduled = null;
  let attempts = 0;
  const platform = {
    createObservation(input) {
      attempts += 1;
      if (attempts === 1) throw new Error("transient platform failure");
      return input;
    },
    createConstraint(input) { return input; },
    createCapability(input) { return input; },
    createMission(input) { return input; },
    createDecision(input) { return input; },
    recordOutcome(input) { return input; },
  };
  const service = createGitHubWebhookService({
    secret: SECRET,
    store,
    platform,
    scheduler(task) { scheduled = task; },
    logger: { info() {}, warn() {}, error() {} },
  });
  const payload = { ref: "refs/heads/main", after: "abc", repository: { id: 1, full_name: "owner/repo" }, commits: [{ id: "abc" }] };
  const raw = Buffer.from(JSON.stringify(payload));
  const result = await invokeWebhook(service, raw, {
    "x-hub-signature-256": signWebhookBody(raw, SECRET),
    "x-github-delivery": "async-delivery-1",
    "x-github-event": "push",
  });

  assert.equal(result.statusCode, 202);
  assert.equal(result.body.status, "accepted");
  assert.equal(store.get("async-delivery-1").status, "accepted");
  assert.equal(typeof scheduled, "function");
  scheduled();
  await flush();
  assert.equal(store.get("async-delivery-1").status, "failed");
  const retried = await service.retry("async-delivery-1");
  assert.equal(retried.status, "completed");
  assert.equal(retried.attempts, 2);
});

test("dashboard loads the real stylesheet and GitHub control plane assets", () => {
  const index = fs.readFileSync(path.join(__dirname, "..", "ui", "index.html"), "utf8");
  assert.match(index, /\.\/styles\.css/);
  assert.match(index, /github-control-plane\.css/);
  assert.match(index, /github-control-plane\.js/);
  assert.equal(fs.existsSync(path.join(__dirname, "..", "ui", "github-control-plane.js")), true);
  assert.equal(fs.existsSync(path.join(__dirname, "..", "ui", "github-control-plane.css")), true);
});

async function invokeWebhook(service, body, headers) {
  const req = Readable.from([body]);
  req.method = "POST";
  req.headers = headers;
  const response = responseStub();
  await service.handle(req, response);
  return { statusCode: response.statusCode, body: JSON.parse(response.rawBody), headers: response.headers };
}

function responseStub() {
  return {
    statusCode: 200,
    headers: {},
    setHeader(name, value) { this.headers[String(name).toLowerCase()] = value; },
    end(value) { this.rawBody = String(value || ""); },
  };
}

function flush() {
  return new Promise((resolve) => setImmediate(resolve));
}
