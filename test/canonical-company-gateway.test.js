"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { createPublicRuntime } = require("../api/public-company");
const { AUTH_SECRET } = require("./mission-runtime-helpers");

function freePort() {
  return new Promise((resolve, reject) => {
    const server = http.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const port = server.address().port;
      server.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

async function uniquePorts(count) {
  const ports = new Set();
  while (ports.size < count) ports.add(await freePort());
  return [...ports];
}

function companyInput() {
  return {
    name: "CYVX Canonical Company",
    description: "A durable autonomous company operated through the canonical CYVX public gateway.",
    target_customer: "Operators who need measurable governed execution",
    offer: "Install a production mission-to-outcome operating capability.",
    price_cents: 250000,
    location: "United States",
    keywords: ["production", "governance", "growth"],
    outcome_contract: {
      objective: "Produce a complete verified operating plan",
      target_metric: "completed_tasks",
      comparator: ">=",
      target_value: 9,
      target_unit: "count",
      max_budget_cents: 0,
      approval_threshold_cents: 0,
      risk_level: "medium",
    },
  };
}

async function request(base, pathname, options = {}) {
  const response = await fetch(`${base}${pathname}`, options);
  const contentType = response.headers.get("content-type") || "";
  const body = contentType.includes("application/json") ? await response.json() : await response.text();
  return { response, body };
}

function authorized(token, method = "GET", body) {
  return {
    method,
    headers: { authorization: `Bearer ${token}`, ...(body === undefined ? {} : { "content-type": "application/json" }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  };
}

test("canonical CYVX runtime serves the cinematic site and every company control action", async (t) => {
  const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), "cyvx-canonical-company-"));
  const token = "canonical-company-test-token-that-is-long-enough";
  const [port, cyvxGatewayPort, cyvxApiPort, sparkPort, cyvxLegacyGatewayPort] = await uniquePorts(5);
  const runtime = await createPublicRuntime({
    port,
    host: "127.0.0.1",
    cyvxGatewayPort,
    cyvxApiPort,
    sparkPort,
    cyvxLegacyGatewayPort,
    dataRoot,
    authSecret: AUTH_SECRET,
    allowLocalAuth: true,
    companyRuntimeToken: token,
    companyAutoTick: false,
    companyModel: { name: "rules" },
    env: {
      ...process.env,
      NODE_ENV: "test",
      CYVX_ENV: "test",
      CYVX_ALLOW_INSECURE_LOCAL: "true",
      CYVX_DATA_ROOT: dataRoot,
    },
  });
  t.after(async () => {
    await runtime.close();
    fs.rmSync(dataRoot, { recursive: true, force: true });
  });

  await runtime.listen();
  const base = `http://127.0.0.1:${port}`;

  const publicPage = await request(base, "/");
  assert.equal(publicPage.response.status, 200);
  assert.match(publicPage.body, /Reality becomes/);
  assert.match(publicPage.body, /Start a production pilot/);

  const controlRoom = await request(base, "/control-room");
  assert.equal(controlRoom.response.status, 200);
  assert.match(controlRoom.body, /Autonomous Company Control Room/);
  assert.match(controlRoom.body, /Run to idle/);

  const controlAlias = await request(base, "/control");
  assert.equal(controlAlias.response.status, 200);
  assert.match(controlAlias.body, /Operate the company/);

  const unauthorized = await request(base, "/api/v1/company-runtime/companies", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(companyInput()) });
  assert.equal(unauthorized.response.status, 401);

  const created = await request(base, "/api/v1/company-runtime/companies", authorized(token, "POST", companyInput()));
  assert.equal(created.response.status, 201);
  const companyId = created.body.company.team.company_id;
  assert.ok(companyId);

  const approved = await request(base, `/api/v1/company-runtime/companies/${companyId}/approve`, authorized(token, "POST", { decision_reason: "Canonical operator approval" }));
  assert.equal(approved.response.status, 200);
  assert.equal(approved.body.company.team.status, "active");

  const completed = await request(base, `/api/v1/company-runtime/companies/${companyId}/run`, authorized(token, "POST", { maximum_ticks: 100 }));
  assert.equal(completed.response.status, 200);
  assert.equal(completed.body.result.company.team.status, "completed");

  const status = await request(base, "/api/v1/company-runtime/public/status");
  assert.equal(status.response.status, 200);
  assert.equal(status.body.featured_company_id, companyId);
  assert.equal(status.body.metrics.tasks_completed, 9);
  assert.equal(status.body.metrics.proof_artifacts, 9);

  const missionStatus = await request(base, "/api/public/status");
  assert.equal(missionStatus.response.status, 200);
  assert.equal(missionStatus.body.ok, true);

  const spark = await request(base, "/spark");
  assert.equal(spark.response.status, 200);
});
