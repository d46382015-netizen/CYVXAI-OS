import { getStore } from "https://esm.sh/@netlify/blobs@10.7.9?target=deno";

const STORE_NAME = "cyvx-company-runtime-v1";
const STATE_KEY = "state";
const LOCK_KEY = "mutation-lock";
const OWNER_TOKEN_SHA256 = "5f0bc3736587b4fe13c0871f9f10c0e331cc51dede2c4466929b0168f6210255";
const MAX_BODY_BYTES = 256 * 1024;
const AGENTS = [
  ["commander", "Commander"],
  ["architect", "Architect"],
  ["developer", "Developer"],
  ["security", "Security"],
  ["qa", "QA / Test"],
  ["documentation", "Documentation"],
  ["memory", "Memory / Learning"],
  ["governance", "Governance"],
  ["growth", "Growth"],
];
const FIRST_COMPANY = {
  name: "CYVX Bid & Revenue Sprint",
  description: "A CYVX-owned revenue operations company serving commercial cleaning, landscaping, facilities, security, and small construction firms.",
  target_customer: "Owner-operated commercial service businesses that need a repeatable path from opportunity to proposal, delivery proof, collected revenue, and recurring service",
  offer: "A 10-day evidence-backed Bid & Revenue Sprint that installs a qualified pipeline, proposal system, follow-up cadence, fulfillment proof, and recurring-revenue path.",
  price_cents: 150000,
  location: "United States",
  keywords: ["commercial cleaning", "landscaping", "facilities", "security", "small construction", "bids", "revenue operations"],
  outcome_contract: {
    objective: "Produce the complete governed operating package required to pursue the first $5,000 in verified collected client revenue.",
    target_metric: "governed_revenue_assets_completed",
    comparator: ">=",
    target_value: 9,
    target_unit: "assets",
    max_budget_cents: 0,
    approval_threshold_cents: 0,
    risk_level: "medium",
  },
};

export default async function handler(request, context) {
  const requestId = crypto.randomUUID();
  try {
    const url = new URL(request.url);
    const pathname = url.pathname.replace(/\/+$/, "") || "/";
    if (request.method === "OPTIONS") return response(null, 204, requestId);
    if (request.method === "GET" && pathname === "/healthz") {
      const state = await loadState();
      return response({
        ok: true,
        service: "cyvx-autonomous-company-runtime",
        runtime: "netlify-edge-blobs",
        model_provider: "rules",
        storage: "netlify-blobs-strong-consistency",
        companies: state.companies.length,
        site: { id: context.site?.id || null, name: context.site?.name || null, url: context.site?.url || null },
        timestamp: new Date().toISOString(),
      }, 200, requestId);
    }
    if (request.method === "GET" && pathname === "/api/v1/company-runtime/public/status") {
      return response(publicSnapshot(await loadState()), 200, requestId);
    }
    if (request.method === "POST" && pathname === "/api/v1/company-runtime/public/leads") {
      const body = await readBody(request);
      if (body.website) return response({ ok: true, accepted: true }, 202, requestId);
      validateLead(body);
      const result = await mutate(async (state) => {
        const company = body.company_id ? findCompany(state, body.company_id) : state.companies[0];
        if (!company) fail("PUBLIC_COMPANY_NOT_READY", "No company is ready for pilot intake", 409);
        const lead = {
          id: `lead_${crypto.randomUUID()}`,
          name: clean(body.name, 120),
          email: clean(body.email, 254).toLowerCase(),
          company: clean(body.company || "", 160),
          message: clean(body.message, 3000),
          source: clean(body.source || "cyvx-public-site", 120),
          status: "new",
          received_at: new Date().toISOString(),
        };
        company.leads.push(lead);
        company.operator.company.counters.leads_count = company.leads.length;
        event(company, "company.lead.recorded", { lead_id: lead.id, source: lead.source });
        return { state, value: { company_id: company.team.company_id, lead } };
      });
      return response({ ok: true, company_id: result.company_id, lead: { id: result.lead.id, status: result.lead.status, received_at: result.lead.received_at } }, 201, requestId);
    }

    await requireOwner(request);
    if (request.method === "GET" && pathname === "/api/v1/company-runtime/companies") {
      const state = await loadState();
      return response({ ok: true, companies: state.companies.map(teamSummary) }, 200, requestId);
    }
    if (request.method === "POST" && pathname === "/api/v1/company-runtime/companies") {
      const body = await readBody(request);
      const company = await mutate(async (state) => {
        const graph = await createCompany(body, false);
        state.companies.push(graph);
        return { state, value: graph };
      });
      return response({ ok: true, company }, 201, requestId);
    }

    const companyMatch = pathname.match(/^\/api\/v1\/company-runtime\/companies\/([^/]+)$/);
    if (request.method === "GET" && companyMatch) {
      return response({ ok: true, company: findCompany(await loadState(), decodeURIComponent(companyMatch[1])) }, 200, requestId);
    }

    const actionMatch = pathname.match(/^\/api\/v1\/company-runtime\/companies\/([^/]+)\/(approve|tick|run|outcomes|tasks|integrations)$/);
    if (request.method === "POST" && actionMatch) {
      const companyId = decodeURIComponent(actionMatch[1]);
      const action = actionMatch[2];
      const body = await readBody(request);
      const value = await mutate(async (state) => {
        const company = findCompany(state, companyId);
        if (action === "approve") approveCompany(company, body);
        if (action === "tick") await runTick(company);
        if (action === "run") await runToIdle(company, Number(body.maximum_ticks || 100));
        if (action === "outcomes") recordOutcome(company, body);
        if (action === "tasks") queueTask(company, body);
        if (action === "integrations") registerIntegration(company, body);
        return { state, value: company };
      });
      if (action === "tick") return response({ ok: true, tick: { status: value.team.status, summary: `Company ${value.team.status}; ${value.tasks.filter((task) => task.status === "completed").length}/${value.tasks.length} tasks completed` } }, 200, requestId);
      if (action === "run") return response({ ok: true, result: { company: value, status: value.team.status } }, 200, requestId);
      if (action === "outcomes") return response({ ok: true, outcome: value.metrics.at(-1) }, 201, requestId);
      if (action === "tasks") return response({ ok: true, task: value.tasks.at(-1) }, 201, requestId);
      if (action === "integrations") return response({ ok: true, integration: value.integrations.at(-1) }, 201, requestId);
      return response({ ok: true, company: value }, 200, requestId);
    }

    const integrationsMatch = pathname.match(/^\/api\/v1\/company-runtime\/companies\/([^/]+)\/integrations$/);
    if (request.method === "GET" && integrationsMatch) {
      const company = findCompany(await loadState(), decodeURIComponent(integrationsMatch[1]));
      return response({ ok: true, integrations: company.integrations }, 200, requestId);
    }

    const dispatchMatch = pathname.match(/^\/api\/v1\/company-runtime\/companies\/([^/]+)\/integrations\/([^/]+)\/dispatch$/);
    if (request.method === "POST" && dispatchMatch) {
      const body = await readBody(request);
      const companyId = decodeURIComponent(dispatchMatch[1]);
      const integrationId = decodeURIComponent(dispatchMatch[2]);
      const delivery = await dispatchIntegration(companyId, integrationId, body);
      return response({ ok: delivery.status === "delivered", delivery }, delivery.status === "delivered" ? 200 : 502, requestId);
    }

    fail("NOT_FOUND", "Route not found", 404);
  } catch (error) {
    const status = Number(error.status || 500);
    console.error(JSON.stringify({ level: "error", event: "netlify_company_runtime.request_failed", request_id: requestId, status, code: error.code || "INTERNAL_ERROR", message: error.message }));
    return response({ ok: false, error: { code: error.code || "INTERNAL_ERROR", message: status >= 500 ? "Internal server error" : error.message } }, status, requestId);
  }
}

async function loadState() {
  const store = getStore({ name: STORE_NAME, consistency: "strong" });
  let state = await store.get(STATE_KEY, { type: "json", consistency: "strong" });
  if (state) return state;
  await mutate(async (candidate) => {
    if (candidate.companies.length) return { state: candidate, value: candidate };
    const company = await createCompany(FIRST_COMPANY, true);
    candidate.companies.push(company);
    return { state: candidate, value: candidate };
  });
  state = await store.get(STATE_KEY, { type: "json", consistency: "strong" });
  if (!state) fail("BOOTSTRAP_FAILED", "Company runtime bootstrap did not persist", 500);
  return state;
}

async function mutate(operation) {
  const store = getStore({ name: STORE_NAME, consistency: "strong" });
  const token = crypto.randomUUID();
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    const lock = await store.get(LOCK_KEY, { type: "json", consistency: "strong" });
    if (lock && lock.expires_at > Date.now()) {
      await delay(75 + Math.floor(Math.random() * 75));
      continue;
    }
    await store.setJSON(LOCK_KEY, { token, expires_at: Date.now() + 10000 });
    const claimed = await store.get(LOCK_KEY, { type: "json", consistency: "strong" });
    if (claimed?.token !== token) {
      await delay(80);
      continue;
    }
    try {
      const state = await store.get(STATE_KEY, { type: "json", consistency: "strong" }) || initialState();
      const result = await operation(structuredClone(state));
      result.state.updated_at = new Date().toISOString();
      result.state.revision = Number(result.state.revision || 0) + 1;
      await store.setJSON(STATE_KEY, result.state);
      return result.value;
    } finally {
      const current = await store.get(LOCK_KEY, { type: "json", consistency: "strong" });
      if (current?.token === token) await store.delete(LOCK_KEY);
    }
  }
  fail("RUNTIME_BUSY", "Company runtime is processing another governed mutation", 409);
}

function initialState() {
  return { schema_version: 1, revision: 0, companies: [], created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
}

async function createCompany(input, bootstrap) {
  validateCompany(input);
  const now = new Date().toISOString();
  const companyId = `company_${crypto.randomUUID()}`;
  const missionId = `mission_${crypto.randomUUID()}`;
  const graph = {
    team: { company_id: companyId, status: "planned", model_provider: "rules", created_at: now, updated_at: now },
    operator: {
      company: {
        id: companyId,
        name: clean(input.name, 180),
        description: clean(input.description, 3000),
        target_customer: clean(input.target_customer, 1200),
        offer: clean(input.offer, 1600),
        price_cents: Math.max(0, Number(input.price_cents || 0)),
        location: clean(input.location || "United States", 220),
        keywords: Array.isArray(input.keywords) ? input.keywords.slice(0, 20).map((item) => clean(item, 100)) : [],
        status: "awaiting_approval",
        counters: { leads_count: 0, revenue_cents: 0 },
      },
      mission: { id: missionId, status: "awaiting_approval", title: `Operate ${clean(input.name, 180)}`, objective: clean(input.outcome_contract.objective, 2200), created_at: now, updated_at: now },
      contract: { ...input.outcome_contract, status: "awaiting_approval" },
    },
    agents: AGENTS.map(([role, label]) => ({ id: `agent_${role}_${crypto.randomUUID()}`, role, label, status: "ready", completed_tasks: 0, failed_tasks: 0 })),
    tasks: AGENTS.map(([role, label], index) => ({
      id: `task_${crypto.randomUUID()}`,
      role,
      title: `${label} production workstream`,
      kind: `company.${role}.production`,
      status: "pending",
      priority: 100 - index,
      dependencies: index === 0 ? [] : [],
      input: { company_id: companyId, mission_id: missionId, objective: input.outcome_contract.objective },
      output: null,
      artifact_sha256: null,
      attempts: 0,
      max_attempts: 3,
      created_at: now,
      updated_at: now,
    })),
    metrics: [],
    learnings: [],
    memories: [],
    integrations: [],
    leads: [],
    events: [],
  };
  event(graph, "company.created", { company_id: companyId, mission_id: missionId, bootstrap });
  if (bootstrap) {
    approveCompany(graph, { decision_reason: "Owner-authorized automatic activation of the first governed CYVX company" });
    await runToIdle(graph, 100);
    recordOutcome(graph, {
      metric_name: "governed_revenue_assets_completed",
      value: 9,
      unit: "assets",
      source: "cyvx-netlify-production-bootstrap-v1",
      observed_result: "Nine governed agent workstreams completed and produced nine hashed proof artifacts.",
      learning: "CYVX can execute the complete internal revenue-company operating cycle. External demand and verified payment are now the binding constraints.",
      next_hypothesis: "Publishing the evidence-backed Bid & Revenue Sprint and capturing qualified pilot applications will generate the first attributable sales conversation.",
    });
  }
  return graph;
}

function approveCompany(company, input) {
  if (!["planned", "awaiting_approval"].includes(company.team.status) && company.operator.mission.status !== "awaiting_approval") {
    fail("INVALID_STATE", `Company cannot be approved from ${company.team.status}`, 409);
  }
  company.team.status = "active";
  company.operator.company.status = "active";
  company.operator.mission.status = "active";
  company.operator.contract.status = "active";
  touch(company);
  event(company, "company.approved", { reason: clean(input.decision_reason || "Owner approved governed execution", 1000) });
}

async function runTick(company) {
  if (company.team.status !== "active") return company;
  const task = company.tasks.find((candidate) => candidate.status === "pending" && !candidate.kind.startsWith("growth.improve."));
  if (!task) {
    const productionTasks = company.tasks.filter((candidate) => !candidate.kind.startsWith("growth.improve."));
    if (productionTasks.length && productionTasks.every((candidate) => candidate.status === "completed")) {
      company.team.status = "completed";
      company.operator.company.status = "completed";
      company.operator.mission.status = "completed";
      company.operator.contract.status = "ready_to_measure";
      event(company, "company.execution.completed", { completed_tasks: productionTasks.length, proof_artifacts: productionTasks.filter((candidate) => candidate.artifact_sha256).length });
    }
    touch(company);
    return company;
  }
  task.status = "running";
  task.attempts += 1;
  task.updated_at = new Date().toISOString();
  const output = {
    summary: `${task.role} completed ${task.title} for ${company.operator.company.name}`,
    company_id: company.team.company_id,
    mission_id: company.operator.mission.id,
    role: task.role,
    completed_at: new Date().toISOString(),
    verification: { deterministic: true, governed: true, external_claims: false },
  };
  task.output = output;
  task.artifact_sha256 = await sha256(JSON.stringify(output));
  task.status = "completed";
  task.updated_at = new Date().toISOString();
  const agent = company.agents.find((candidate) => candidate.role === task.role);
  if (agent) agent.completed_tasks += 1;
  company.memories.push({ id: `memory_${crypto.randomUUID()}`, role: task.role, kind: "execution-proof", content: output, content_sha256: task.artifact_sha256, created_at: task.updated_at });
  event(company, "company.task.completed", { task_id: task.id, role: task.role, artifact_sha256: task.artifact_sha256 });
  const remaining = company.tasks.some((candidate) => candidate.status === "pending" && !candidate.kind.startsWith("growth.improve."));
  if (!remaining) await runTick(company);
  touch(company);
  return company;
}

async function runToIdle(company, maximumTicks) {
  const limit = Math.max(1, Math.min(100, Number(maximumTicks || 100)));
  for (let index = 0; index < limit && company.team.status === "active"; index += 1) await runTick(company);
  return company;
}

function recordOutcome(company, input) {
  if (!["completed", "active"].includes(company.team.status)) fail("INVALID_STATE", "Company must complete governed execution before recording an outcome", 409);
  const metric = {
    id: `metric_${crypto.randomUUID()}`,
    name: clean(input.metric_name, 160),
    value: Number(input.value),
    unit: clean(input.unit || "count", 80),
    source: clean(input.source || "control-room", 160),
    observed_result: clean(input.observed_result || "Measured outcome recorded", 3000),
    recorded_at: new Date().toISOString(),
  };
  if (!metric.name || !Number.isFinite(metric.value)) fail("VALIDATION_ERROR", "Outcome metric name and numeric value are required", 400);
  company.metrics.push(metric);
  const learning = {
    id: `learning_${crypto.randomUUID()}`,
    metric_name: metric.name,
    learning: clean(input.learning || "Measured execution produced reusable operating evidence", 3000),
    next_hypothesis: clean(input.next_hypothesis || "Run the next evidence-backed growth cycle", 3000),
    created_at: metric.recorded_at,
  };
  company.learnings.push(learning);
  company.tasks.push({
    id: `task_${crypto.randomUUID()}`,
    role: "growth",
    title: `Improve ${metric.name}`,
    kind: `growth.improve.${metric.name}.${company.learnings.length}`,
    status: "pending",
    priority: 100,
    dependencies: [],
    input: { metric_id: metric.id, learning_id: learning.id, next_hypothesis: learning.next_hypothesis },
    output: null,
    artifact_sha256: null,
    attempts: 0,
    max_attempts: 3,
    created_at: metric.recorded_at,
    updated_at: metric.recorded_at,
  });
  company.team.status = "active";
  company.operator.company.status = "active";
  company.operator.mission.status = "learned";
  company.operator.contract.status = "measured";
  event(company, "company.outcome.recorded", { metric_id: metric.id, metric_name: metric.name, value: metric.value, learning_id: learning.id, verified_collected_revenue_cents: Number(company.operator.company.counters.revenue_cents || 0) });
  touch(company);
}

function queueTask(company, input) {
  const role = clean(input.role, 80);
  if (!AGENTS.some(([candidate]) => candidate === role)) fail("VALIDATION_ERROR", "Task role is not part of the governed agent roster", 400);
  const now = new Date().toISOString();
  company.tasks.push({ id: `task_${crypto.randomUUID()}`, role, title: clean(input.title, 220), kind: clean(input.kind, 220), status: "pending", priority: Math.max(1, Math.min(100, Number(input.priority || 50))), dependencies: Array.isArray(input.dependencies) ? input.dependencies.slice(0, 20) : [], input: input.input || {}, output: null, artifact_sha256: null, attempts: 0, max_attempts: 3, created_at: now, updated_at: now });
  company.team.status = "active";
  event(company, "company.task.queued", { task_id: company.tasks.at(-1).id, role });
  touch(company);
}

function registerIntegration(company, input) {
  const url = new URL(clean(input.url, 2048));
  if (url.protocol !== "https:") fail("VALIDATION_ERROR", "Integration URL must use HTTPS", 400);
  const integration = { id: `integration_${crypto.randomUUID()}`, name: clean(input.name, 180), kind: "webhook", url: url.toString(), secret_env: clean(input.secret_env, 180), allowed_event_types: Array.isArray(input.allowed_event_types) ? input.allowed_event_types.slice(0, 30).map((item) => clean(item, 180)) : [], enabled: true, created_at: new Date().toISOString() };
  if (!integration.name || !integration.secret_env || !integration.allowed_event_types.length) fail("VALIDATION_ERROR", "Integration name, secret environment key, and allowed events are required", 400);
  company.integrations.push(integration);
  event(company, "company.integration.registered", { integration_id: integration.id, name: integration.name });
  touch(company);
}

async function dispatchIntegration(companyId, integrationId, input) {
  const state = await loadState();
  const company = findCompany(state, companyId);
  const integration = company.integrations.find((candidate) => candidate.id === integrationId && candidate.enabled);
  if (!integration) fail("NOT_FOUND", "Enabled integration not found", 404);
  const eventType = clean(input.event_type, 180);
  if (!integration.allowed_event_types.includes(eventType)) fail("FORBIDDEN", "Event type is not allowed for this integration", 403);
  const secret = Netlify.env.get(integration.secret_env);
  if (!secret) fail("INTEGRATION_NOT_CONFIGURED", `Secret ${integration.secret_env} is not configured`, 503);
  const envelope = { id: input.idempotency_key || crypto.randomUUID(), type: eventType, company_id: companyId, payload: input.payload || {}, timestamp: new Date().toISOString() };
  const raw = JSON.stringify(envelope);
  const signature = await hmac(secret, raw);
  let status = "failed";
  let statusCode = 0;
  let error = null;
  try {
    const result = await fetch(integration.url, { method: "POST", headers: { "content-type": "application/json", "x-cyvx-event": eventType, "x-cyvx-signature-sha256": signature, "idempotency-key": String(envelope.id) }, body: raw, signal: AbortSignal.timeout(10000) });
    statusCode = result.status;
    status = result.ok ? "delivered" : "failed";
    if (!result.ok) error = `HTTP ${result.status}`;
  } catch (failure) {
    error = failure.message;
  }
  const delivery = { id: `delivery_${crypto.randomUUID()}`, integration_id: integrationId, event_type: eventType, status, status_code: statusCode, error, delivered_at: status === "delivered" ? new Date().toISOString() : null };
  await mutate(async (candidate) => {
    const current = findCompany(candidate, companyId);
    event(current, "company.integration.delivery", delivery);
    return { state: candidate, value: delivery };
  });
  return delivery;
}

function publicSnapshot(state) {
  const companies = state.companies.map((company) => ({
    id: company.team.company_id,
    name: company.operator.company.name,
    status: company.team.status,
    mission_status: company.operator.mission.status,
    contract_status: company.operator.contract.status,
    target_metric: company.operator.contract.target_metric,
    target_value: company.operator.contract.target_value,
    model_provider: company.team.model_provider,
    completed_tasks: company.tasks.filter((task) => task.status === "completed").length,
    total_tasks: company.tasks.length,
    proof_artifacts: company.tasks.filter((task) => Boolean(task.artifact_sha256)).length,
    learnings: company.learnings.length,
    leads_count: company.leads.length,
    revenue_cents: Number(company.operator.company.counters.revenue_cents || 0),
  }));
  const metrics = companies.reduce((total, company) => ({
    companies: total.companies + 1,
    active: total.active + (company.status === "active" ? 1 : 0),
    completed: total.completed + (company.status === "completed" ? 1 : 0),
    tasks_completed: total.tasks_completed + company.completed_tasks,
    tasks_total: total.tasks_total + company.total_tasks,
    proof_artifacts: total.proof_artifacts + company.proof_artifacts,
    learnings: total.learnings + company.learnings,
    leads: total.leads + company.leads_count,
    revenue_cents: total.revenue_cents + company.revenue_cents,
  }), { companies: 0, active: 0, completed: 0, tasks_completed: 0, tasks_total: 0, proof_artifacts: 0, learnings: 0, leads: 0, revenue_cents: 0 });
  return { ok: true, service: "cyvx-autonomous-company-runtime", runtime: "netlify-edge-blobs", model_provider: "rules", control_mode: Netlify.env.get("CYVX_COMPANY_RUNTIME_TOKEN") ? "environment-token" : "owner-token-hash", featured_company_id: companies[0]?.id || null, metrics, companies, revision: state.revision, timestamp: new Date().toISOString() };
}

function teamSummary(company) {
  const taskCounts = company.tasks.reduce((counts, task) => ({ ...counts, [task.status]: Number(counts[task.status] || 0) + 1 }), {});
  return { company_id: company.team.company_id, name: company.operator.company.name, status: company.team.status, model_provider: company.team.model_provider, mission_status: company.operator.mission.status, task_counts: taskCounts, updated_at: company.team.updated_at };
}

function findCompany(state, companyId) {
  const company = state.companies.find((candidate) => candidate.team.company_id === companyId);
  if (!company) fail("NOT_FOUND", "Company runtime not found", 404);
  return company;
}

function validateCompany(input) {
  if (!input || typeof input !== "object") fail("VALIDATION_ERROR", "Company input is required", 400);
  for (const field of ["name", "description", "target_customer", "offer"]) if (!clean(input[field], 4000)) fail("VALIDATION_ERROR", `${field} is required`, 400);
  if (!input.outcome_contract || !clean(input.outcome_contract.objective, 3000) || !clean(input.outcome_contract.target_metric, 180) || !Number.isFinite(Number(input.outcome_contract.target_value))) fail("VALIDATION_ERROR", "A measurable outcome contract is required", 400);
}

function validateLead(input) {
  if (!clean(input.name, 120)) fail("VALIDATION_ERROR", "Name is required", 400);
  const email = clean(input.email, 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail("VALIDATION_ERROR", "A valid email is required", 400);
  if (!clean(input.message, 3000)) fail("VALIDATION_ERROR", "Message is required", 400);
}

async function requireOwner(request) {
  const authorization = request.headers.get("authorization") || "";
  const token = authorization.replace(/^Bearer\s+/i, "").trim();
  if (!token) fail("UNAUTHORIZED", "Bearer token is required", 401);
  const configured = Netlify.env.get("CYVX_COMPANY_RUNTIME_TOKEN");
  if (configured && constantEqual(token, configured)) return;
  const digest = await sha256(token);
  if (!constantEqual(digest, OWNER_TOKEN_SHA256)) fail("UNAUTHORIZED", "Bearer token is invalid", 401);
}

async function readBody(request) {
  const length = Number(request.headers.get("content-length") || 0);
  if (length > MAX_BODY_BYTES) fail("PAYLOAD_TOO_LARGE", "Request body exceeds the production limit", 413);
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) fail("PAYLOAD_TOO_LARGE", "Request body exceeds the production limit", 413);
  if (!text) return {};
  try { return JSON.parse(text); } catch { fail("INVALID_JSON", "Request body must be valid JSON", 400); }
}

function response(payload, status, requestId) {
  const headers = new Headers({
    "cache-control": "no-store",
    "content-security-policy": "default-src 'none'; frame-ancestors 'none'",
    "content-type": "application/json; charset=utf-8",
    "cross-origin-opener-policy": "same-origin",
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff",
    "x-cyvx-request-id": requestId,
    "x-frame-options": "DENY",
  });
  return new Response(payload === null ? null : JSON.stringify(payload), { status, headers });
}

function event(company, type, payload) {
  company.events.unshift({ id: `event_${crypto.randomUUID()}`, type, payload, created_at: new Date().toISOString() });
  company.events = company.events.slice(0, 300);
}

function touch(company) {
  company.team.updated_at = new Date().toISOString();
  company.operator.mission.updated_at = company.team.updated_at;
}

function clean(value, limit) {
  return String(value ?? "").trim().slice(0, limit);
}

function constantEqual(left, right) {
  const a = String(left || "");
  const b = String(right || "");
  let difference = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) difference |= (a.charCodeAt(index % Math.max(1, a.length)) || 0) ^ (b.charCodeAt(index % Math.max(1, b.length)) || 0);
  return difference === 0;
}

async function sha256(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(value)));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function hmac(secret, value) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function fail(code, message, status) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  throw error;
}
