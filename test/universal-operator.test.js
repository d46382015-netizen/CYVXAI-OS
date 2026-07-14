"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { createMissionRuntime } = require("../runtime/missions");
const { CompanyOperator } = require("../services/operator");
const {
  UniversalOperator, UNIVERSAL_ENTITY_TYPES, buildUniversalActionPlan, normalizeUniversalContract,
} = require("../services/operator/universal");
const {
  createUniversalOperatorRuntime, createUniversalOperatorHttpServer,
} = require("../services/operator/universal-server");

function fixture() {
  const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), "cyvx-universal-operator-"));
  const runtime = createMissionRuntime({ dataRoot, allowLocalAuth: true });
  runtime.logger = runtime.logger || runtime.store.logger;
  const legacy = new CompanyOperator(runtime, {
    workspaceRoot: path.join(dataRoot, "companies"),
    intelligenceStatePath: path.join(dataRoot, "intelligence", "minnesota", "state.json"),
  });
  const operator = new UniversalOperator(runtime, {
    legacy,
    universalWorkspaceRoot: path.join(dataRoot, "entities"),
    platformStatePath: path.join(dataRoot, "platform-state.json"),
  });
  const auth = { user_id: "admin-local", organization_id: "default", role: "admin", correlation_id: "universal-test" };
  return { dataRoot, runtime, legacy, operator, auth };
}

function entityInput(entityType = "personal", overrides = {}) {
  const defaultMetric = UNIVERSAL_ENTITY_TYPES[entityType].default_metric;
  return {
    entity_type: entityType,
    name: `${entityType} test entity`,
    description: `Current reality for a ${entityType} entity with measurable constraints and resources.`,
    subject: `The people, customers, participants, or system served by ${entityType}.`,
    operating_system: `A governed ${entityType} operating system that measures outcomes and records evidence.`,
    location: "Minnesota",
    resources: ["time", "skills", "authorized data"],
    constraints: ["zero initial budget", "external actions require approval"],
    stakeholders: ["owner", "operator"],
    channels: ["mobile workspace"],
    keywords: ["automation", "measurement", "coordination"],
    visibility: "private",
    outcome_contract: {
      objective: `Achieve a measurable outcome for the ${entityType} entity`,
      target_metric: defaultMetric,
      comparator: ">=",
      target_value: 1,
      target_unit: defaultMetric.endsWith("_cents") ? "cents" : "count",
      max_budget_cents: 0,
      approval_threshold_cents: 0,
      risk_level: "medium",
    },
    ...overrides,
  };
}

function ventureInput() {
  return {
    entity_type: "venture",
    name: "Universal Venture Adapter",
    description: "Evidence-backed revenue operations for service businesses.",
    subject: "Minnesota service businesses",
    operating_system: "Find, qualify, and convert high-fit contract opportunities.",
    target_customer: "Minnesota service businesses",
    offer: "Install an owned bid and revenue system.",
    price_cents: 150000,
    location: "Minnesota",
    keywords: ["contracts", "facilities", "proposals"],
    visibility: "public",
    outcome_contract: {
      objective: "Generate one qualified lead",
      target_metric: "lead_count",
      comparator: ">=",
      target_value: 1,
      target_unit: "count",
      max_budget_cents: 0,
      approval_threshold_cents: 0,
      risk_level: "medium",
    },
  };
}

async function jsonRequest(base, pathname, options = {}) {
  const response = await fetch(`${base}${pathname}`, {
    ...options,
    headers: { "content-type": "application/json", ...(options.headers || {}) },
  });
  const payload = await response.json();
  return { response, payload };
}

test("universal registry exposes all operating modes and composes domain-specific plans", () => {
  assert.deepEqual(Object.keys(UNIVERSAL_ENTITY_TYPES), [
    "personal", "household", "creator", "venture", "commerce", "production",
    "distribution", "enterprise", "marketplace", "institution", "portfolio",
  ]);
  const contract = normalizeUniversalContract(entityInput("production").outcome_contract, "production");
  const plan = buildUniversalActionPlan({
    id: "production-1", entity_type: "production", entity_kind: "producer", name: "Factory Alpha",
    description: "Factory reality", profile: entityInput("production"),
  }, contract);
  assert.ok(plan.some((item) => item.type === "production.capacity_model"));
  assert.ok(plan.some((item) => item.type === "production.quality_system"));
  assert.ok(plan.some((item) => item.type === "production.flow_map"));
  assert.equal(plan[0].type, "entity.profile");
  assert.equal(plan.at(-1).type, "measurement.baseline");
});

test("personal entity activates through mission, evidence, RealityOS, outcome, and capability layers", () => {
  const { runtime, operator, auth } = fixture();
  try {
    const created = operator.createEntity(entityInput("personal"), auth);
    assert.equal(created.entity.entity_type, "personal");
    assert.equal(created.entity.status, "awaiting_approval");
    assert.equal(created.mission.status, "awaiting_approval");
    assert.ok(created.actions.some((item) => item.type === "personal.action_system"));

    const approved = operator.approveEntity(created.entity.id, { decision_reason: "Owner approved" }, auth);
    assert.equal(approved.entity.status, "active");
    assert.equal(approved.mission.status, "queued");

    const result = operator.runToIdle(created.entity.id, auth, 40);
    const activated = result.entity;
    assert.equal(activated.entity.activation_status, "learned");
    assert.equal(activated.mission.status, "learned");
    assert.ok(activated.actions.every((item) => item.status === "completed"));
    assert.ok(activated.evidence.length >= activated.actions.length);
    assert.ok(activated.reality_graph.entity);
    assert.ok(activated.reality_graph.missions.some((item) => item.id === activated.mission.id));
    assert.ok(activated.reality_graph.capabilities.length >= 1);

    assert.equal(fs.existsSync(path.join(activated.entity.workspace_path, "entity.json")), true);
    assert.equal(fs.existsSync(path.join(activated.entity.workspace_path, "reality", "snapshot.json")), true);
    assert.equal(fs.existsSync(path.join(activated.entity.workspace_path, "plans", "outcome-plan.md")), true);
    assert.equal(fs.existsSync(path.join(activated.entity.workspace_path, "public", "index.html")), true);

    const evidence = runtime.evidence.verify(auth, { mission_id: activated.mission.id });
    assert.equal(evidence.valid, true);
  } finally {
    runtime.close();
  }
});

test("production and distribution adapters create useful connected operating artifacts", () => {
  const { runtime, operator, auth } = fixture();
  try {
    const production = operator.createEntity(entityInput("production", {
      name: "Factory Alpha",
      description: "A production cell needs capacity, quality, traceability, and material-flow control.",
      resources: ["two production lines", "warehouse", "quality team"],
      constraints: ["2% defect ceiling", "single-shift capacity"],
      outcome_contract: { ...entityInput("production").outcome_contract, target_metric: "units_produced", target_value: 10000 },
    }), auth);
    operator.approveEntity(production.entity.id, { decision_reason: "Approve factory model" }, auth);
    const productionResult = operator.runToIdle(production.entity.id, auth, 40).entity;
    const capacity = productionResult.actions.find((item) => item.type === "production.capacity_model");
    const quality = productionResult.actions.find((item) => item.type === "production.quality_system");
    assert.equal(capacity.status, "completed");
    assert.equal(quality.status, "completed");
    assert.equal(fs.existsSync(capacity.output.artifact_path), true);
    assert.match(fs.readFileSync(quality.output.artifact_path, "utf8"), /traceability/);

    const distribution = operator.createEntity(entityInput("distribution", {
      name: "Regional Distribution Network",
      description: "A multi-node distribution system needs inventory, routing, and delivery controls.",
      resources: ["warehouse A", "warehouse B", "40 stores"],
      constraints: ["98% availability", "limited vehicle capacity"],
      outcome_contract: { ...entityInput("distribution").outcome_contract, target_metric: "on_time_delivery_rate", target_value: 98, target_unit: "percent" },
    }), auth);
    operator.approveEntity(distribution.entity.id, { decision_reason: "Approve network model" }, auth);
    const distributionResult = operator.runToIdle(distribution.entity.id, auth, 40).entity;
    assert.ok(distributionResult.actions.some((item) => item.type === "distribution.network_model" && item.status === "completed"));
    assert.ok(distributionResult.actions.some((item) => item.type === "distribution.inventory_policy" && item.status === "completed"));
  } finally {
    runtime.close();
  }
});

test("legacy company operator is migrated into the universal venture adapter without data loss", () => {
  const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), "cyvx-universal-migration-"));
  const runtime = createMissionRuntime({ dataRoot, allowLocalAuth: true });
  runtime.logger = runtime.logger || runtime.store.logger;
  const auth = { user_id: "admin-local", organization_id: "default", role: "admin", correlation_id: "migration-test" };
  try {
    const legacy = new CompanyOperator(runtime, {
      workspaceRoot: path.join(dataRoot, "companies"),
      intelligenceStatePath: path.join(dataRoot, "intelligence.json"),
    });
    const company = legacy.createCompany({
      name: "Existing Company",
      description: "Existing durable company data.",
      target_customer: "Existing customers",
      offer: "Existing offer",
      price_cents: 50000,
      location: "Minnesota",
      keywords: ["existing"],
      outcome_contract: ventureInput().outcome_contract,
    }, auth);
    legacy.approveCompany(company.company.id, { decision_reason: "Approved" }, auth);
    legacy.runToIdle(company.company.id, auth, 20);

    const universal = new UniversalOperator(runtime, {
      legacy,
      universalWorkspaceRoot: path.join(dataRoot, "entities"),
      platformStatePath: path.join(dataRoot, "platform-state.json"),
    });
    const entities = universal.listEntities(auth);
    const migrated = entities.find((item) => item.id === company.company.id);
    assert.ok(migrated);
    assert.equal(migrated.entity_type, "venture");
    assert.equal(migrated.adapter_type, "venture");
    assert.equal(migrated.activation_status, "learned");
    assert.equal(migrated.workspace_path, company.company.workspace_path);

    const graph = universal.getEntity(migrated.id, auth);
    assert.equal(graph.adapter.legacy_compatible, true);
    assert.equal(graph.mission.status, "learned");
    assert.ok(graph.actions.every((item) => item.status === "completed"));
    assert.ok(graph.reality_graph.entity);
  } finally {
    runtime.close();
  }
});

test("generic metrics complete outcome contracts and record RealityOS outcomes", () => {
  const { runtime, operator, auth } = fixture();
  try {
    const created = operator.createEntity(entityInput("institution", {
      outcome_contract: { ...entityInput("institution").outcome_contract, target_metric: "participants_served", target_value: 25 },
    }), auth);
    operator.approveEntity(created.entity.id, { decision_reason: "Approved" }, auth);
    operator.runToIdle(created.entity.id, auth, 40);
    const result = operator.recordMetric(created.entity.id, {
      name: "participants_served", value: 25, unit: "count", source: "verified_program_record",
    }, auth);
    assert.equal(result.evaluation.outcome, "achieved");
    assert.equal(result.entity.entity.status, "completed");
    assert.equal(result.entity.contract.status, "achieved");
    assert.ok(result.entity.reality_graph.outcomes.some((item) => item.actual_outcome.value === 25));
  } finally {
    runtime.close();
  }
});

test("universal relationships are persisted and mirrored into the RealityOS graph", () => {
  const { runtime, operator, auth } = fixture();
  try {
    const producer = operator.createEntity(entityInput("production", { name: "Producer" }), auth);
    const distributor = operator.createEntity(entityInput("distribution", { name: "Distributor" }), auth);
    const relationships = operator.createRelationship({
      from_entity_id: producer.entity.id,
      to_entity_id: distributor.entity.id,
      relation: "supplies",
      strength: 0.9,
      metadata: { product: "finished goods" },
    }, auth);
    assert.equal(relationships.length, 1);
    const graph = operator.getEntity(producer.entity.id, auth);
    assert.equal(graph.relationships[0].relation, "supplies");
    assert.ok(graph.reality_graph.relationships.some((item) => item.relation === "supplies"));
  } finally {
    runtime.close();
  }
});

test("HTTP v2 universal API and v1 company API operate together", async () => {
  const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), "cyvx-universal-http-"));
  const runtime = createMissionRuntime({ dataRoot, allowLocalAuth: true });
  runtime.logger = runtime.logger || runtime.store.logger;
  const operatorRuntime = createUniversalOperatorRuntime({
    runtime,
    workspaceRoot: path.join(dataRoot, "companies"),
    universalWorkspaceRoot: path.join(dataRoot, "entities"),
    platformStatePath: path.join(dataRoot, "platform-state.json"),
    intelligenceStatePath: path.join(dataRoot, "intelligence.json"),
  });
  const server = createUniversalOperatorHttpServer(operatorRuntime);
  const address = await server.listen(0, "127.0.0.1");
  const base = `http://127.0.0.1:${address.port}`;
  try {
    const authResponse = await jsonRequest(base, "/api/v1/operator/auth/token", {
      method: "POST", body: JSON.stringify({ organization_id: "default", user_id: "admin-local" }),
    });
    assert.equal(authResponse.response.status, 200);
    const headers = { authorization: `Bearer ${authResponse.payload.token}` };

    const types = await jsonRequest(base, "/api/v2/operator/entity-types");
    assert.equal(types.response.status, 200);
    assert.ok(types.payload.entity_types.production);

    const creation = await jsonRequest(base, "/api/v2/operator/entities", {
      method: "POST", headers, body: JSON.stringify(entityInput("portfolio")),
    });
    assert.equal(creation.response.status, 201);
    const entityId = creation.payload.operator.entity.id;

    const approval = await jsonRequest(base, `/api/v2/operator/entities/${entityId}/approve`, {
      method: "POST", headers, body: JSON.stringify({ decision_reason: "HTTP approval" }),
    });
    assert.equal(approval.response.status, 200);

    const execution = await jsonRequest(base, `/api/v2/operator/entities/${entityId}/run`, {
      method: "POST", headers, body: JSON.stringify({ maximum_ticks: 40 }),
    });
    assert.equal(execution.response.status, 200);
    assert.equal(execution.payload.result.entity.mission.status, "learned");

    const workspace = await fetch(`${base}${execution.payload.result.entity.entity.public_path}`);
    assert.equal(workspace.status, 200);
    assert.match(await workspace.text(), /CYVX loop/);

    const legacyList = await jsonRequest(base, "/api/v1/operator/companies", { headers });
    assert.equal(legacyList.response.status, 200);
    assert.ok(Array.isArray(legacyList.payload.companies));

    const universalList = await jsonRequest(base, "/api/v2/operator/entities", { headers });
    assert.equal(universalList.response.status, 200);
    assert.ok(universalList.payload.entities.some((item) => item.id === entityId));
  } finally {
    await server.close();
    runtime.close();
  }
});