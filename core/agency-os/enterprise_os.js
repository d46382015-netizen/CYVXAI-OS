"use strict";

const fs = require("node:fs");
const path = require("node:path");

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function iso() {
  return new Date().toISOString();
}

function normalizeRecord(type, input = {}) {
  const now = iso();
  const id = input.id || `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  return {
    id,
    type,
    title: input.title || input.name || `${type} record`,
    status: input.status || "active",
    priority: input.priority ?? 3,
    confidence: input.confidence ?? 0.7,
    createdAt: input.createdAt || now,
    updatedAt: input.updatedAt || now,
    ...input,
  };
}

function statePath(baseDir) {
  return path.join(baseDir || path.join(__dirname, "..", "..", "data", "agency-os"), "enterprise-state.json");
}

function collectionPath(baseDir, name) {
  return path.join(baseDir || path.join(__dirname, "..", "..", "data", "agency-os"), `${name}.json`);
}

function loadState(baseDir) {
  const file = statePath(baseDir);
  ensureDir(path.dirname(file));
  if (!fs.existsSync(file)) {
    const seed = {
      agency: { name: "CYVX Enterprise OS", mode: "autonomous" },
      goals: [],
      constraints: [],
      opportunities: [],
      missions: [],
      decisions: [],
      assets: [],
      predictions: [],
      outcomes: [],
      learning: [],
      approvals: [],
      auditEvents: [],
      agencyMemory: [],
      revenueEvents: [],
      metrics: { missions: 0, opportunities: 0, revenue: 0, confidence: 0.75 },
      updatedAt: iso(),
    };
    fs.writeFileSync(file, JSON.stringify(seed, null, 2));
    return seed;
  }
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function saveState(baseDir, state) {
  const file = statePath(baseDir);
  ensureDir(path.dirname(file));
  const next = { ...state, updatedAt: iso() };
  fs.writeFileSync(file, JSON.stringify(next, null, 2));
  return next;
}

function writeCollection(baseDir, name, values) {
  const file = collectionPath(baseDir, name);
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, JSON.stringify(values, null, 2));
  return values;
}

function listEnterpriseRecords(baseDir, collectionName) {
  const file = collectionPath(baseDir, collectionName);
  if (!fs.existsSync(file)) return [];
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function createEnterpriseRecord(baseDir, collectionName, input = {}) {
  const typeName = collectionName.replace(/_/g, "").replace(/s$/, "");
  const payload = normalizeRecord(typeName, input);
  const records = listEnterpriseRecords(baseDir, collectionName);
  records.unshift(payload);
  writeCollection(baseDir, collectionName, records);
  return payload;
}

function appendAudit(baseDir, event) {
  const record = normalizeRecord("audit_event", {
    title: event.title || "Agency audit event",
    actor: event.actor || "system",
    action: event.action || "agency.cycle",
    object: event.object || "agency",
    result: event.result || "ok",
    confidence: event.confidence ?? 0.8,
    timestamp: event.timestamp || iso(),
    details: event.details || {},
  });
  const records = listEnterpriseRecords(baseDir, "audit_events");
  records.unshift(record);
  writeCollection(baseDir, "audit_events", records);
  return record;
}

function detectBottlenecks(goal) {
  const text = String(goal || "").toLowerCase();
  const bottlenecks = [];
  if (/revenue|money|sales|customers/.test(text)) bottlenecks.push("Revenue conversion and pipeline visibility");
  if (/mission|execution|workflow/.test(text)) bottlenecks.push("Mission execution velocity");
  if (/asset|product|content|automation/.test(text)) bottlenecks.push("Asset readiness and deployment");
  if (/trust|evidence|proof/.test(text)) bottlenecks.push("Confidence and evidence quality");
  return bottlenecks.length ? bottlenecks : ["Observation quality and evidence capture"];
}

function rankOpportunities(goal, bottlenecks) {
  return bottlenecks.map((item, index) => ({
    title: `${item} opportunity`,
    value: 9000 + index * 1500,
    roi: 2.2 + index * 0.3,
    risk: 0.25 + index * 0.04,
    confidence: 0.78 + index * 0.04,
    nextAction: `Resolve ${item.toLowerCase()} with one verifiable mission`,
    goal,
  }));
}

function runAgencyCycle(input = {}) {
  const baseDir = input.baseDir || path.join(__dirname, "..", "..", "data", "agency-os");
  const state = loadState(baseDir);
  const goal = input.goal || "Launch one measurable autonomous enterprise mission";
  const bottlenecks = detectBottlenecks(goal);
  const opportunities = rankOpportunities(goal, bottlenecks);

  const mission = createEnterpriseRecord(baseDir, "missions", {
    title: "Enterprise mission loop",
    objective: goal,
    status: "queued",
    stage: "creation",
    confidence: 0.82,
    roi: opportunities[0]?.roi || 2.4,
    risk: opportunities[0]?.risk || 0.25,
    priority: 1,
  });

  const decision = createEnterpriseRecord(baseDir, "decisions", {
    title: "Next autonomous action",
    rationale: `Recommended priority: ${opportunities[0]?.nextAction || "Execute the next best mission"}`,
    evidence: bottlenecks,
    confidence: opportunities[0]?.confidence || 0.82,
    expectedImpact: { value: opportunities[0]?.value || 9500, risk: opportunities[0]?.risk || 0.25 },
  });

  const approval = createEnterpriseRecord(baseDir, "approvals", {
    title: "Approve autonomous mission",
    status: input.autoApprove ? "approved" : "pending",
    confidence: opportunities[0]?.confidence || 0.82,
    decisionId: decision.id,
    missionId: mission.id,
  });

  const auditEvent = appendAudit(baseDir, {
    actor: "Ω Executive",
    action: "agency.cycle",
    object: mission.id,
    result: approval.status,
    confidence: approval.confidence,
    details: { goal, bottlenecks, recommendation: opportunities[0]?.nextAction },
  });

  const learning = createEnterpriseRecord(baseDir, "learning", {
    title: "Agency cycle learning",
    lesson: `The highest-value path is ${opportunities[0]?.nextAction || "execute the next best action"}`,
    confidence: approval.confidence,
  });

  const recommendation = {
    title: "Autonomous next best action",
    bottlenecks,
    opportunities,
    mission,
    decision,
    approval,
    learning,
  };

  const metrics = {
    missions: (state.missions?.length || 0) + 1,
    opportunities: opportunities.length,
    revenue: opportunities[0]?.value || 9500,
    confidence: opportunities[0]?.confidence || 0.82,
  };

  saveState(baseDir, {
    ...state,
    goals: state.goals.concat({ id: `goal-${Date.now()}`, title: goal, confidence: metrics.confidence }),
    opportunities: state.opportunities.concat(opportunities),
    missions: state.missions.concat([mission]),
    decisions: state.decisions.concat([decision]),
    approvals: state.approvals.concat([approval]),
    learning: state.learning.concat([learning]),
    agencyMemory: state.agencyMemory.concat([{ id: `memory-${Date.now()}`, summary: recommendation.title, createdAt: iso() }]),
    auditEvents: state.auditEvents.concat([auditEvent]),
    metrics,
  });

  return {
    recommendation,
    decision,
    mission,
    approval,
    auditEvent,
    learning,
    metrics,
    bottlenecks,
  };
}

module.exports = {
  createEnterpriseRecord,
  listEnterpriseRecords,
  runAgencyCycle,
  loadState,
  saveState,
};
