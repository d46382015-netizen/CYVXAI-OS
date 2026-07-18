"use strict";

const fs = require("node:fs");
const path = require("node:path");
const {
  RuntimeError, now, id, sha256, canonical, atomicWrite,
} = require("../../runtime/missions/base");

const BID_SPRINT_VERTICALS = Object.freeze([
  "commercial_cleaning",
  "landscaping",
  "facilities",
  "security",
  "small_construction",
]);

const OFFER_LADDER = Object.freeze([
  Object.freeze({ code: "opportunity_audit", name: "Opportunity Audit", price_cents: 25_000, cadence: "one_time", outcome: "A scored go/no-go decision, eligibility map, risk register, and next-action brief." }),
  Object.freeze({ code: "bid_readiness_pack", name: "Bid Readiness Pack", price_cents: 50_000, cadence: "one_time", outcome: "A reusable compliance, capability, pricing, and submission-readiness system." }),
  Object.freeze({ code: "proposal_sprint", name: "Proposal Sprint", price_cents: 150_000, cadence: "one_time", outcome: "A 14-day solicitation-specific response system with compliance matrix, narrative framework, pricing worksheet, and final quality control." }),
  Object.freeze({ code: "deal_desk_monitoring", name: "Deal Desk Monitoring", price_cents: 50_000, cadence: "monthly", outcome: "Recurring opportunity monitoring, bid-fit scoring, deadline control, and monthly pipeline review." }),
]);

const TARGET_REVENUE_CENTS = 500_000;
const TARGET_RECURRING_MRR_CENTS = 50_000;
const BID_SPRINT_AGENT_PREFIX = "cyvx-bid-sprint-agent";
const SPRINT_STATUSES = new Set(["awaiting_approval", "active", "paused", "target_achieved", "stopped"]);
const OPPORTUNITY_STATUSES = new Set(["discovered", "qualified", "pursue", "passed", "submitted", "won", "lost"]);
const TASK_STATUSES = new Set(["pending", "awaiting_approval", "approved", "completed", "blocked", "cancelled"]);
const AGREEMENT_STATUSES = new Set(["proposed", "active", "paused", "cancelled"]);

function parseJson(value, fallback) {
  if (value === null || value === undefined || value === "") return fallback;
  if (typeof value !== "string") return value;
  try { return JSON.parse(value); } catch { return fallback; }
}

function text(value, name, maximum, required = false) {
  const output = String(value ?? "").trim();
  if (required && !output) throw new RuntimeError("VALIDATION_ERROR", `${name} is required`, 422);
  if (output.length > maximum) throw new RuntimeError("VALIDATION_ERROR", `${name} exceeds ${maximum} characters`, 422);
  return output;
}

function integer(value, name, minimum = 0, maximum = 1_000_000_000) {
  const output = Number(value);
  if (!Number.isInteger(output) || output < minimum || output > maximum) {
    throw new RuntimeError("VALIDATION_ERROR", `${name} must be an integer from ${minimum} to ${maximum}`, 422);
  }
  return output;
}

function array(value, name, maximum = 50) {
  if (!Array.isArray(value)) throw new RuntimeError("VALIDATION_ERROR", `${name} must be an array`, 422);
  if (!value.length) throw new RuntimeError("VALIDATION_ERROR", `${name} must contain at least one value`, 422);
  if (value.length > maximum) throw new RuntimeError("VALIDATION_ERROR", `${name} exceeds ${maximum} values`, 422);
  return [...new Set(value.map((entry) => text(entry, `${name} item`, 160, true)))];
}

function safePath(root, candidate) {
  const base = path.resolve(root);
  const resolved = path.resolve(candidate);
  if (resolved !== base && !resolved.startsWith(`${base}${path.sep}`)) {
    throw new RuntimeError("WORKSPACE_PATH_INVALID", "Bid sprint workspace escaped the configured root", 500);
  }
  return resolved;
}

function ensureSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS bid_sprints (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL,
      entity_id TEXT NOT NULL UNIQUE,
      venture_id TEXT NOT NULL UNIQUE,
      idempotency_key TEXT NOT NULL,
      name TEXT NOT NULL,
      region TEXT NOT NULL,
      verticals TEXT NOT NULL,
      offer_ladder TEXT NOT NULL,
      target_mix TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('awaiting_approval','active','paused','target_achieved','stopped')),
      target_revenue_cents INTEGER NOT NULL,
      target_recurring_mrr_cents INTEGER NOT NULL,
      verified_revenue_cents INTEGER NOT NULL DEFAULT 0,
      recurring_mrr_cents INTEGER NOT NULL DEFAULT 0,
      workspace_path TEXT NOT NULL,
      intelligence_state_path TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      last_tick_at TEXT,
      UNIQUE(organization_id,idempotency_key),
      FOREIGN KEY(entity_id) REFERENCES operator_entities(id),
      FOREIGN KEY(venture_id) REFERENCES revenue_ventures(id)
    );
    CREATE INDEX IF NOT EXISTS idx_bid_sprints_org_status ON bid_sprints(organization_id,status,updated_at DESC);

    CREATE TABLE IF NOT EXISTS bid_sprint_opportunities (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL,
      sprint_id TEXT NOT NULL,
      source_key TEXT NOT NULL,
      source_name TEXT NOT NULL,
      source_url TEXT,
      title TEXT NOT NULL,
      buyer TEXT,
      vertical TEXT NOT NULL,
      location TEXT,
      due_at TEXT,
      estimated_value_cents INTEGER,
      score INTEGER NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('discovered','qualified','pursue','passed','submitted','won','lost')),
      evidence_id TEXT,
      metadata TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(sprint_id,source_key),
      FOREIGN KEY(sprint_id) REFERENCES bid_sprints(id)
    );
    CREATE INDEX IF NOT EXISTS idx_bid_sprint_opportunities_rank ON bid_sprint_opportunities(sprint_id,status,score DESC,due_at);

    CREATE TABLE IF NOT EXISTS bid_sprint_tasks (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL,
      sprint_id TEXT NOT NULL,
      fingerprint TEXT NOT NULL,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('pending','awaiting_approval','approved','completed','blocked','cancelled')),
      priority INTEGER NOT NULL,
      requires_approval INTEGER NOT NULL DEFAULT 0,
      related_type TEXT,
      related_id TEXT,
      payload TEXT NOT NULL,
      evidence_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      completed_at TEXT,
      UNIQUE(sprint_id,fingerprint),
      FOREIGN KEY(sprint_id) REFERENCES bid_sprints(id)
    );
    CREATE INDEX IF NOT EXISTS idx_bid_sprint_tasks_queue ON bid_sprint_tasks(sprint_id,status,priority DESC,created_at);

    CREATE TABLE IF NOT EXISTS bid_sprint_cycles (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL,
      sprint_id TEXT NOT NULL,
      status TEXT NOT NULL,
      constraint_code TEXT NOT NULL,
      summary TEXT NOT NULL,
      metrics TEXT NOT NULL,
      next_action TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(sprint_id) REFERENCES bid_sprints(id)
    );
    CREATE INDEX IF NOT EXISTS idx_bid_sprint_cycles_time ON bid_sprint_cycles(sprint_id,created_at DESC);

    CREATE TABLE IF NOT EXISTS bid_sprint_recurring_agreements (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL,
      sprint_id TEXT NOT NULL,
      client_id TEXT NOT NULL,
      deal_id TEXT,
      offer_code TEXT NOT NULL,
      monthly_cents INTEGER NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('proposed','active','paused','cancelled')),
      agreement_reference TEXT,
      starts_at TEXT,
      evidence_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(sprint_id,client_id,offer_code),
      FOREIGN KEY(sprint_id) REFERENCES bid_sprints(id),
      FOREIGN KEY(client_id) REFERENCES revenue_clients(id)
    );
    CREATE INDEX IF NOT EXISTS idx_bid_sprint_recurring_status ON bid_sprint_recurring_agreements(sprint_id,status,updated_at DESC);
  `);
}

function normalizeVerticals(input) {
  const values = array(input || BID_SPRINT_VERTICALS, "verticals", BID_SPRINT_VERTICALS.length);
  const invalid = values.filter((value) => !BID_SPRINT_VERTICALS.includes(value));
  if (invalid.length) throw new RuntimeError("VALIDATION_ERROR", `Unsupported verticals: ${invalid.join(", ")}`, 422);
  return values;
}

function verticalLabel(value) {
  return String(value).replace(/_/g, " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function classifyVertical(record) {
  const source = [record.title, record.description, record.category, record.agency, record.buyer, record.department]
    .filter(Boolean).join(" ").toLowerCase();
  const rules = [
    ["commercial_cleaning", ["janitorial", "cleaning", "custodial", "sanitation"]],
    ["landscaping", ["landscape", "grounds", "lawn", "snow removal", "tree service"]],
    ["facilities", ["facility", "facilities", "maintenance", "building operations", "property management"]],
    ["security", ["security", "guard", "surveillance", "access control", "patrol"]],
    ["small_construction", ["construction", "renovation", "repair", "trade", "electrical", "plumbing", "roofing", "concrete"]],
  ];
  const matched = rules.find(([, keywords]) => keywords.some((keyword) => source.includes(keyword)));
  return matched ? matched[0] : null;
}

function opportunityScore(record, vertical, region) {
  const base = Number(record.operator_score ?? record.score ?? 0);
  const textValue = [record.title, record.description, record.location, record.agency].filter(Boolean).join(" ").toLowerCase();
  const regionTokens = String(region || "").toLowerCase().split(/[^a-z0-9]+/).filter((token) => token.length > 2);
  const regionBonus = regionTokens.some((token) => textValue.includes(token)) ? 12 : 0;
  const deadline = record.due_at || record.deadline || record.response_deadline;
  const deadlineMs = deadline ? new Date(deadline).getTime() - Date.now() : NaN;
  const deadlineBonus = Number.isFinite(deadlineMs) && deadlineMs > 7 * 86400000 && deadlineMs < 60 * 86400000 ? 8 : 0;
  const verticalBonus = vertical ? 20 : 0;
  return Math.max(0, Math.min(100, Math.round(base + regionBonus + deadlineBonus + verticalBonus)));
}

function normalizeTargetMix(value) {
  if (value === undefined || value === null) return defaultTargetMix();
  if (!Array.isArray(value) || !value.length || value.length > 20) throw new RuntimeError("VALIDATION_ERROR", "target_mix must be a non-empty array with at most 20 rows", 422);
  return value.map((row, index) => {
    if (!row || typeof row !== "object" || Array.isArray(row)) throw new RuntimeError("VALIDATION_ERROR", `target_mix[${index}] must be an object`, 422);
    const offerCode = text(row.offer_code, `target_mix[${index}].offer_code`, 120, true);
    if (!OFFER_LADDER.some((offer) => offer.code === offerCode && offer.cadence === "one_time")) throw new RuntimeError("VALIDATION_ERROR", `target_mix[${index}] uses an unsupported one-time offer`, 422);
    const quantity = integer(row.quantity, `target_mix[${index}].quantity`, 1, 1000);
    const unitPrice = integer(row.unit_price_cents, `target_mix[${index}].unit_price_cents`, 1, 100_000_000);
    return { offer_code: offerCode, quantity, unit_price_cents: unitPrice, subtotal_cents: quantity * unitPrice };
  });
}

function defaultTargetMix() {
  return [
    { offer_code: "proposal_sprint", quantity: 3, unit_price_cents: 150_000, subtotal_cents: 450_000 },
    { offer_code: "bid_readiness_pack", quantity: 1, unit_price_cents: 50_000, subtotal_cents: 50_000 },
  ];
}

function dashboardMetrics(graph, recurringMrr) {
  return {
    verified_revenue_cents: Number(graph.metrics.revenue_cents || 0),
    provider_verified_revenue_cents: Number(graph.metrics.provider_verified_revenue_cents || 0),
    owner_attested_revenue_cents: Number(graph.metrics.owner_attested_revenue_cents || 0),
    recurring_mrr_cents: Number(recurringMrr || 0),
    prospects: Number(graph.metrics.prospects || 0),
    leads: Number(graph.metrics.leads || 0),
    qualified: Number(graph.metrics.qualified_leads || 0),
    deals: Number(graph.metrics.deals || 0),
    won: Number(graph.metrics.won_deals || 0),
    clients: Number(graph.metrics.clients || 0),
    weighted_pipeline_cents: Number(graph.metrics.weighted_pipeline_cents || 0),
    gross_pipeline_cents: Number(graph.metrics.gross_pipeline_cents || 0),
    fulfillment_completed: Number(graph.metrics.fulfillment_completed || 0),
  };
}

class BidRevenueSprintOperator {
  constructor(runtime, options = {}) {
    if (!runtime || !runtime.db || !runtime.evidence) throw new Error("BidRevenueSprintOperator requires the CYVX mission runtime");
    if (!options.universal || !options.revenue) throw new Error("BidRevenueSprintOperator requires universal and revenue operators");
    this.runtime = runtime;
    this.db = runtime.db;
    this.universal = options.universal;
    this.revenue = options.revenue;
    this.logger = runtime.logger || runtime.store && runtime.store.logger || { write() {} };
    this.workspaceRoot = path.resolve(options.workspaceRoot || process.env.CYVX_BID_SPRINT_ROOT || path.join(runtime.dataRoot, "bid-revenue-sprint"));
    this.intelligenceStatePath = path.resolve(options.intelligenceStatePath || process.env.CYVX_MN_STATE_FILE || path.join(runtime.dataRoot, "intelligence", "minnesota", "state.json"));
    fs.mkdirSync(this.workspaceRoot, { recursive: true, mode: 0o700 });
    ensureSchema(this.db);
  }

  assertRole(auth, roles) {
    if (!auth || !roles.includes(auth.role)) throw new RuntimeError("PERMISSION_DENIED", "This bid sprint action is not permitted", 403);
  }

  ensureAgent(organizationId) {
    const agentId = `${BID_SPRINT_AGENT_PREFIX}-${sha256(organizationId).slice(0, 12)}`;
    const timestamp = now();
    this.db.prepare(`INSERT INTO users(id,organization_id,role,active,created_at,updated_at)
      VALUES(?,?,?,?,?,?) ON CONFLICT(organization_id,id) DO UPDATE SET role='agent',active=1,updated_at=excluded.updated_at`)
      .run(agentId, organizationId, "agent", 1, timestamp, timestamp);
    return agentId;
  }

  bootstrap(input = {}, auth) {
    this.assertRole(auth, ["admin"]);
    const idempotencyKey = text(input.idempotency_key || "cyvx-bid-revenue-sprint-v1", "idempotency_key", 160, true);
    const existing = this.db.prepare("SELECT id FROM bid_sprints WHERE organization_id=? AND idempotency_key=?").get(auth.organization_id, idempotencyKey);
    if (existing) return this.getSprint(existing.id, auth);

    const name = text(input.name || "CYVX Bid & Revenue Sprint", "name", 180, true);
    const region = text(input.region || "Minnesota and nearby Upper Midwest markets", "region", 300, true);
    const verticals = normalizeVerticals(input.verticals || BID_SPRINT_VERTICALS);
    const targetRevenue = integer(input.target_revenue_cents ?? TARGET_REVENUE_CENTS, "target_revenue_cents", 1, 100_000_000);
    const targetRecurring = integer(input.target_recurring_mrr_cents ?? TARGET_RECURRING_MRR_CENTS, "target_recurring_mrr_cents", 1, 100_000_000);
    const targetMix = normalizeTargetMix(input.target_mix);

    const created = this.revenue.createVenture({
      name,
      market: `${region}; ${verticals.map(verticalLabel).join(", ")}`,
      ideal_customer: "Owner-operated and growth-stage commercial cleaning, landscaping, facilities, security, and small construction companies pursuing institutional, commercial, and public-sector work.",
      problem: "Qualified opportunities, eligibility, compliance, pricing, proposal production, submission control, and post-award delivery are disconnected, causing missed deadlines and lost revenue.",
      offer_name: "CYVX Proposal Sprint",
      offer_summary: "A governed 14-day bid and revenue operating sprint that turns a real opportunity into a go/no-go decision, compliance matrix, response architecture, pricing worksheet, final quality control, and measurable deal pipeline.",
      deliverables: [
        "Opportunity and eligibility assessment",
        "Compliance and submission matrix",
        "Proposal narrative and staffing framework",
        "Pricing and margin worksheet",
        "Submission quality-control checklist",
        "Pipeline, payment, fulfillment, and evidence tracking",
        "Recurring Deal Desk Monitoring conversion plan",
      ],
      price_cents: 150_000,
      revenue_target_cents: targetRevenue,
      max_budget_cents: integer(input.max_budget_cents ?? 0, "max_budget_cents", 0, 100_000_000),
      approval_threshold_cents: integer(input.approval_threshold_cents ?? 0, "approval_threshold_cents", 0, 100_000_000),
      currency: "usd",
      location: region,
      keywords: [...verticals, "RFP", "RFQ", "IFB", "proposal", "procurement", "contract"],
      constraints: [
        "Never fabricate a prospect, customer, bid, credential, submission, payment, award, or outcome",
        "External messaging, proposal submission, contract acceptance, and money movement require explicit approval and provider readiness",
        "Revenue counts only after provider verification or documented owner payment evidence",
        "Recurring revenue counts only after a real client agreement is evidenced",
      ],
      channels: ["owned website", "referrals", "opt-in intake", "approved existing-relationship follow-up"],
    }, auth);

    const entityId = created.entity.entity.id;
    const ventureId = created.venture.venture.id;
    const sprintId = id("bid_sprint");
    const timestamp = now();
    const workspace = safePath(this.workspaceRoot, path.join(this.workspaceRoot, auth.organization_id, sprintId));
    fs.mkdirSync(workspace, { recursive: true, mode: 0o700 });

    this.db.prepare(`INSERT INTO bid_sprints(
      id,organization_id,entity_id,venture_id,idempotency_key,name,region,verticals,offer_ladder,target_mix,status,
      target_revenue_cents,target_recurring_mrr_cents,workspace_path,intelligence_state_path,created_at,updated_at
    ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      sprintId, auth.organization_id, entityId, ventureId, idempotencyKey, name, region, JSON.stringify(verticals),
      JSON.stringify(OFFER_LADDER), JSON.stringify(targetMix), "awaiting_approval", targetRevenue, targetRecurring,
      workspace, this.intelligenceStatePath, timestamp, timestamp,
    );

    const assets = this.buildAssets(this.requireSprint(sprintId, auth.organization_id), auth);
    this.ensureTask(sprintId, {
      fingerprint: "owner-activation-approval",
      type: "owner.approve_activation",
      title: "Approve the governed Bid & Revenue Sprint",
      description: "Approve the bounded internal activation. This does not authorize external outreach, bid submission, contracts, purchases, or money movement.",
      priority: 100,
      requires_approval: true,
      related_type: "entity",
      related_id: entityId,
      payload: { entity_id: entityId, venture_id: ventureId },
    });
    this.logger.write("info", "bid_sprint.bootstrapped", { sprint_id: sprintId, entity_id: entityId, venture_id: ventureId, asset_count: assets.length });
    return this.getSprint(sprintId, auth);
  }

  approveAndLaunch(sprintId, input = {}, auth) {
    this.assertRole(auth, ["admin"]);
    const sprint = this.requireSprint(sprintId, auth.organization_id);
    if (sprint.status !== "awaiting_approval") throw new RuntimeError("INVALID_STATE", `Sprint cannot be approved from ${sprint.status}`, 409);
    this.universal.approveEntity(sprint.entity_id, { decision_reason: text(input.decision_reason || "Owner approved the bounded CYVX Bid & Revenue Sprint activation", "decision_reason", 1000, true) }, auth);
    const activated = this.universal.runToIdle(sprint.entity_id, auth, 80);
    if (activated.entity.entity.activation_status !== "learned") throw new RuntimeError("ACTIVATION_INCOMPLETE", "Universal venture activation did not reach learned state", 409);
    this.revenue.activate(sprint.venture_id, {
      offer_name: "CYVX Proposal Sprint",
      offer_summary: "A governed 14-day opportunity-to-proposal system for service contractors, with verified pipeline, payment, fulfillment, and recurring-revenue conversion.",
      deliverables: [
        "Opportunity and eligibility assessment", "Compliance matrix", "Response architecture", "Pricing worksheet",
        "Submission checklist", "Final quality control", "Client acceptance evidence", "Deal Desk Monitoring conversion",
      ],
      price_cents: 150_000,
    }, auth);
    const timestamp = now();
    this.db.prepare("UPDATE bid_sprints SET status='active',updated_at=? WHERE id=?").run(timestamp, sprint.id);
    const task = this.db.prepare("SELECT id FROM bid_sprint_tasks WHERE sprint_id=? AND fingerprint='owner-activation-approval'").get(sprint.id);
    if (task) this.completeTask(task.id, { evidence_note: "Owner approved internal activation and the universal venture completed its governed activation lifecycle." }, auth);
    this.importIntelligence(sprint.id, {}, auth);
    this.tick(sprint.id, auth);
    return this.getSprint(sprint.id, auth);
  }

  buildAssets(sprint, auth) {
    const workspace = safePath(this.workspaceRoot, sprint.workspace_path);
    const files = [
      ["manifest.json", JSON.stringify({ schema_version: 1, sprint_id: sprint.id, entity_id: sprint.entity_id, venture_id: sprint.venture_id, mission: "Collect the first $5,000 in verified revenue and convert delivery into recurring service income.", region: sprint.region, verticals: parseJson(sprint.verticals, []), offer_ladder: OFFER_LADDER, target_mix: parseJson(sprint.target_mix, []), governance: { external_messaging: "approval_required", bid_submission: "approval_required", contracts: "approval_required", payments: "provider_verified_or_owner_attested" }, generated_at: now() }, null, 2) + "\n", "bid_sprint.manifest", "Bid sprint operating manifest"],
      ["offer-ladder.json", JSON.stringify({ offers: OFFER_LADDER, target_mix: parseJson(sprint.target_mix, []), target_revenue_cents: Number(sprint.target_revenue_cents), target_recurring_mrr_cents: Number(sprint.target_recurring_mrr_cents) }, null, 2) + "\n", "bid_sprint.offer_ladder", "Bid sprint offer ladder"],
      ["qualification-scorecard.md", qualificationScorecard(), "bid_sprint.qualification", "Opportunity qualification scorecard"],
      ["proposal-production-sop.md", proposalSop(), "bid_sprint.fulfillment", "Proposal production SOP"],
      ["recurring-conversion.md", recurringPlaybook(), "bid_sprint.retention", "Recurring revenue conversion playbook"],
      ["revenue-plan.md", revenuePlan(), "bid_sprint.revenue_plan", "First $5,000 revenue plan"],
    ];
    const output = [];
    for (const [relative, content, evidenceType, title] of files) {
      const target = safePath(workspace, path.join(workspace, relative));
      atomicWrite(target, content);
      const evidence = this.runtime.evidence.record({
        auth, missionId: this.db.prepare("SELECT mission_id FROM revenue_ventures WHERE id=?").get(sprint.venture_id).mission_id,
        content, type: evidenceType, title, source: "cyvx.bid-revenue-sprint.v1",
        correlationId: auth.correlation_id || id("correlation"), causationId: sprint.id,
      });
      output.push({ path: target, relative_path: relative, sha256: sha256(content), evidence_id: evidence.id });
    }
    return output;
  }

  importIntelligence(sprintId, input = {}, auth) {
    this.assertRole(auth, ["admin", "agent"]);
    const sprint = this.requireSprint(sprintId, auth.organization_id);
    const statePath = path.resolve(input.state_path || sprint.intelligence_state_path);
    if (!fs.existsSync(statePath)) {
      this.ensureTask(sprint.id, {
        fingerprint: "refresh-minnesota-intelligence",
        type: "intelligence.refresh",
        title: "Refresh Minnesota opportunity intelligence",
        description: "Run the official-source intelligence collector before scoring bid opportunities.",
        priority: 95,
        requires_approval: false,
        payload: { command: "npm run intel:mn:refresh", state_path: statePath },
      });
      return { imported: 0, updated: 0, rejected: 0, source_ready: false, state_path: statePath };
    }
    let state;
    try { state = JSON.parse(fs.readFileSync(statePath, "utf8")); }
    catch (error) { throw new RuntimeError("INTELLIGENCE_STATE_INVALID", `Unable to read intelligence state: ${error.message}`, 422); }
    const records = Array.isArray(state.opportunities) ? state.opportunities : [];
    const allowedVerticals = parseJson(sprint.verticals, BID_SPRINT_VERTICALS);
    const summary = { imported: 0, updated: 0, rejected: 0, source_ready: true, state_path: statePath, considered: records.length };
    for (const record of records) {
      const vertical = classifyVertical(record);
      if (!vertical || !allowedVerticals.includes(vertical)) { summary.rejected += 1; continue; }
      const title = text(record.title || record.name, "opportunity.title", 500, false);
      if (!title) { summary.rejected += 1; continue; }
      const sourceKey = String(record.id || record.external_id || record.source_id || sha256(canonical({ title, agency: record.agency, due_at: record.due_at || record.deadline, source_url: record.source_url || record.url })));
      const score = opportunityScore(record, vertical, sprint.region);
      if (score < 45) { summary.rejected += 1; continue; }
      const timestamp = now();
      const existing = this.db.prepare("SELECT id,status FROM bid_sprint_opportunities WHERE sprint_id=? AND source_key=?").get(sprint.id, sourceKey);
      const metadata = JSON.stringify(record);
      const sourceName = text(record.source || record.source_name || "minnesota_intelligence", "source_name", 200, true);
      const sourceUrl = text(record.source_url || record.url || "", "source_url", 2000, false) || null;
      const buyer = text(record.agency || record.buyer || record.department || "", "buyer", 300, false) || null;
      const location = text(record.location || "", "location", 300, false) || null;
      const dueAtValue = record.due_at || record.deadline || record.response_deadline;
      const dueAt = dueAtValue && Number.isFinite(new Date(dueAtValue).getTime()) ? new Date(dueAtValue).toISOString() : null;
      const estimatedValue = record.estimated_value_cents === undefined || record.estimated_value_cents === null ? null : integer(record.estimated_value_cents, "estimated_value_cents", 0, 10_000_000_000);
      if (existing) {
        this.db.prepare(`UPDATE bid_sprint_opportunities SET source_name=?,source_url=?,title=?,buyer=?,vertical=?,location=?,due_at=?,estimated_value_cents=?,score=?,metadata=?,updated_at=? WHERE id=?`)
          .run(sourceName, sourceUrl, title, buyer, vertical, location, dueAt, estimatedValue, score, metadata, timestamp, existing.id);
        summary.updated += 1;
      } else {
        const opportunityId = id("bid_opportunity");
        const evidence = this.runtime.evidence.record({
          auth, missionId: this.db.prepare("SELECT mission_id FROM revenue_ventures WHERE id=?").get(sprint.venture_id).mission_id,
          content: { source_key: sourceKey, source_name: sourceName, source_url: sourceUrl, title, buyer, vertical, location, due_at: dueAt, score, imported_at: timestamp },
          type: "bid_sprint.opportunity", title: `Imported opportunity: ${title}`, source: sourceName,
          correlationId: auth.correlation_id || id("correlation"), causationId: sprint.id,
        });
        this.db.prepare(`INSERT INTO bid_sprint_opportunities(id,organization_id,sprint_id,source_key,source_name,source_url,title,buyer,vertical,location,due_at,estimated_value_cents,score,status,evidence_id,metadata,created_at,updated_at)
          VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(opportunityId, sprint.organization_id, sprint.id, sourceKey, sourceName, sourceUrl, title, buyer, vertical, location, dueAt, estimatedValue, score, "discovered", evidence.id, metadata, timestamp, timestamp);
        summary.imported += 1;
        this.ensureTask(sprint.id, {
          fingerprint: `qualify-opportunity:${sourceKey}`,
          type: "opportunity.qualify",
          title: `Qualify: ${title}`,
          description: "Apply eligibility, deadline, fit, capacity, margin, evidence, and competitive-position checks before any pursuit decision.",
          priority: score,
          requires_approval: false,
          related_type: "opportunity",
          related_id: opportunityId,
          payload: { opportunity_id: opportunityId, source_url: sourceUrl, score },
        });
      }
    }
    this.logger.write("info", "bid_sprint.intelligence_imported", { sprint_id: sprint.id, ...summary });
    return summary;
  }

  decideOpportunity(sprintId, opportunityId, input = {}, auth) {
    this.assertRole(auth, ["admin", "agent"]);
    const sprint = this.requireSprint(sprintId, auth.organization_id);
    const opportunity = this.db.prepare("SELECT * FROM bid_sprint_opportunities WHERE id=? AND sprint_id=? AND organization_id=?").get(opportunityId, sprint.id, auth.organization_id);
    if (!opportunity) throw new RuntimeError("NOT_FOUND", "Bid opportunity not found", 404);
    const status = text(input.status, "status", 40, true);
    if (!OPPORTUNITY_STATUSES.has(status)) throw new RuntimeError("VALIDATION_ERROR", "Invalid opportunity status", 422);
    if (["submitted", "won"].includes(status)) {
      this.assertRole(auth, ["admin"]);
      const evidenceNote = text(input.evidence_note, "evidence_note", 10_000, true);
      if (evidenceNote.length < 20) throw new RuntimeError("VALIDATION_ERROR", "evidence_note must document the real external event", 422);
      const evidence = this.runtime.evidence.record({
        auth, missionId: this.db.prepare("SELECT mission_id FROM revenue_ventures WHERE id=?").get(sprint.venture_id).mission_id,
        content: { opportunity_id: opportunity.id, from: opportunity.status, to: status, reference: text(input.reference || "", "reference", 1000, false), evidence_note: evidenceNote, recorded_at: now() },
        type: `bid_sprint.opportunity_${status}`, title: `${status}: ${opportunity.title}`, source: "owner_attestation",
        correlationId: auth.correlation_id || id("correlation"), causationId: opportunity.id,
      });
      this.db.prepare("UPDATE bid_sprint_opportunities SET status=?,evidence_id=?,updated_at=? WHERE id=?").run(status, evidence.id, now(), opportunity.id);
    } else {
      this.db.prepare("UPDATE bid_sprint_opportunities SET status=?,updated_at=? WHERE id=?").run(status, now(), opportunity.id);
    }
    if (["qualified", "pursue"].includes(status)) {
      this.ensureTask(sprint.id, {
        fingerprint: `prepare-proposal:${opportunity.source_key}`,
        type: "proposal.prepare",
        title: `Prepare response system: ${opportunity.title}`,
        description: "Build the compliance matrix, response outline, pricing model, evidence checklist, and owner review package. Preparation is internal; submission remains approval-gated.",
        priority: Math.max(80, Number(opportunity.score)),
        requires_approval: false,
        related_type: "opportunity",
        related_id: opportunity.id,
        payload: { opportunity_id: opportunity.id },
      });
      this.ensureTask(sprint.id, {
        fingerprint: `submit-bid:${opportunity.source_key}`,
        type: "bid.submit",
        title: `Owner approval required before submission: ${opportunity.title}`,
        description: "No bid or proposal may be submitted until the owner verifies scope, pricing, representations, attachments, deadline, and submission channel.",
        priority: Math.max(75, Number(opportunity.score) - 5),
        requires_approval: true,
        related_type: "opportunity",
        related_id: opportunity.id,
        payload: { opportunity_id: opportunity.id, prohibited_until_approved: true },
      });
    }
    return this.getSprint(sprint.id, auth);
  }

  tick(sprintId, auth) {
    this.assertRole(auth, ["admin", "agent"]);
    const sprint = this.requireSprint(sprintId, auth.organization_id);
    const graph = this.revenue.getVenture(sprint.venture_id, auth);
    const recurringMrr = Number(this.db.prepare("SELECT COALESCE(sum(monthly_cents),0) AS amount FROM bid_sprint_recurring_agreements WHERE sprint_id=? AND status='active'").get(sprint.id).amount);
    const metrics = dashboardMetrics(graph, recurringMrr);
    const opportunityCounts = this.db.prepare(`SELECT count(*) AS total,
      sum(CASE WHEN status IN ('qualified','pursue','submitted','won') THEN 1 ELSE 0 END) AS qualified,
      sum(CASE WHEN status='submitted' THEN 1 ELSE 0 END) AS submitted,
      sum(CASE WHEN status='won' THEN 1 ELSE 0 END) AS won
      FROM bid_sprint_opportunities WHERE sprint_id=?`).get(sprint.id);
    metrics.opportunities = Number(opportunityCounts.total || 0);
    metrics.qualified_opportunities = Number(opportunityCounts.qualified || 0);
    metrics.submitted_opportunities = Number(opportunityCounts.submitted || 0);
    metrics.won_opportunities = Number(opportunityCounts.won || 0);
    metrics.target_revenue_cents = Number(sprint.target_revenue_cents);
    metrics.target_recurring_mrr_cents = Number(sprint.target_recurring_mrr_cents);
    metrics.revenue_progress = Math.min(1, metrics.verified_revenue_cents / metrics.target_revenue_cents);
    metrics.recurring_progress = Math.min(1, metrics.recurring_mrr_cents / metrics.target_recurring_mrr_cents);

    let constraintCode;
    let summary;
    let nextAction;
    if (sprint.status === "awaiting_approval") {
      constraintCode = "activation_approval";
      summary = "The operator is built but not activated.";
      nextAction = { type: "owner.approve_activation", title: "Approve bounded internal activation", requires_approval: true };
    } else if (!metrics.opportunities) {
      constraintCode = "opportunity_supply";
      summary = "No relevant official-source opportunities are loaded.";
      nextAction = { type: "intelligence.refresh", title: "Refresh and import Minnesota opportunity intelligence", requires_approval: false };
      this.ensureTask(sprint.id, { fingerprint: "refresh-minnesota-intelligence", type: nextAction.type, title: nextAction.title, description: "Collect and normalize current official-source opportunities, then rerun the import.", priority: 95, requires_approval: false, payload: { command: "npm run intel:mn:refresh" } });
    } else if (!metrics.leads) {
      constraintCode = "permissioned_demand";
      summary = "Relevant opportunities exist, but no real contractor has entered the pipeline.";
      nextAction = { type: "demand.acquire", title: "Acquire permissioned contractor demand", requires_approval: true };
      this.ensureTask(sprint.id, { fingerprint: "acquire-permissioned-demand", type: nextAction.type, title: nextAction.title, description: "Use owned pages, referrals, opt-in intake, and approved existing relationships. No unsolicited campaign is authorized by this task.", priority: 92, requires_approval: true, payload: { allowed_channels: ["owned_page", "referral", "opt_in", "existing_relationship"] } });
    } else if (!metrics.qualified) {
      constraintCode = "lead_qualification";
      summary = "Real leads exist, but none are qualified for a paid sprint.";
      nextAction = { type: "lead.qualify", title: "Qualify need, authority, deadline, budget, and fit", requires_approval: false };
      this.ensureTask(sprint.id, { fingerprint: "qualify-real-leads", type: nextAction.type, title: nextAction.title, description: "Advance only real prospects that satisfy the qualification scorecard.", priority: 90, requires_approval: false, payload: {} });
    } else if (metrics.verified_revenue_cents < metrics.target_revenue_cents && !graph.deals.some((deal) => ["proposal", "negotiation"].includes(deal.stage))) {
      constraintCode = "proposal_pipeline";
      summary = "Qualified demand exists without an active proposal or negotiation.";
      nextAction = { type: "proposal.prepare", title: "Create a scoped paid Proposal Sprint package", requires_approval: false };
      this.ensureTask(sprint.id, { fingerprint: "prepare-paid-proposal", type: nextAction.type, title: nextAction.title, description: "Produce the scope, price, acceptance criteria, schedule, and checkout-ready deal record.", priority: 88, requires_approval: false, payload: { default_price_cents: 150_000 } });
    } else if (metrics.verified_revenue_cents < metrics.target_revenue_cents) {
      constraintCode = "verified_collection";
      summary = "Pipeline exists, but verified collected revenue remains below $5,000.";
      nextAction = { type: "payment.collect", title: "Convert approved proposals into verified payment", requires_approval: true };
      this.ensureTask(sprint.id, { fingerprint: "collect-verified-payment", type: nextAction.type, title: nextAction.title, description: "Create or send checkout only after owner approval. Count revenue only after a verified provider webhook or documented business receipt.", priority: 96, requires_approval: true, payload: { target_revenue_cents: metrics.target_revenue_cents } });
    } else if (metrics.fulfillment_completed < metrics.clients) {
      constraintCode = "fulfillment_acceptance";
      summary = "The revenue target is met, but one or more client deliveries lack completion and acceptance evidence.";
      nextAction = { type: "fulfillment.complete", title: "Complete delivery and capture acceptance evidence", requires_approval: false };
      this.ensureTask(sprint.id, { fingerprint: "complete-fulfillment", type: nextAction.type, title: nextAction.title, description: "Finish deliverables, validate acceptance criteria, and record evidence before seeking recurring work.", priority: 94, requires_approval: false, payload: {} });
    } else if (metrics.recurring_mrr_cents < metrics.target_recurring_mrr_cents) {
      constraintCode = "recurring_conversion";
      summary = "The first $5,000 is verified, but recurring service income is not yet evidenced.";
      nextAction = { type: "recurring.convert", title: "Convert an accepted client to Deal Desk Monitoring", requires_approval: true };
      this.ensureTask(sprint.id, { fingerprint: "convert-recurring-service", type: nextAction.type, title: nextAction.title, description: "Offer $500/month Deal Desk Monitoring only after successful delivery and owner approval; activate MRR only with real agreement evidence.", priority: 100, requires_approval: true, payload: { offer_code: "deal_desk_monitoring", monthly_cents: 50_000 } });
    } else {
      constraintCode = "scale_and_retain";
      summary = "The $5,000 verified-revenue target and first recurring-service target are both achieved.";
      nextAction = { type: "growth.compound", title: "Retain the client, collect proof, and repeat the winning acquisition path", requires_approval: false };
      this.ensureTask(sprint.id, { fingerprint: "compound-winning-loop", type: nextAction.type, title: nextAction.title, description: "Capture case evidence, referral permission, renewal health, and the next repeatable sprint cohort.", priority: 90, requires_approval: false, payload: {} });
    }

    const status = metrics.verified_revenue_cents >= metrics.target_revenue_cents && metrics.recurring_mrr_cents >= metrics.target_recurring_mrr_cents ? "target_achieved" : sprint.status;
    const timestamp = now();
    this.db.prepare("UPDATE bid_sprints SET status=?,verified_revenue_cents=?,recurring_mrr_cents=?,last_tick_at=?,updated_at=? WHERE id=?")
      .run(status, metrics.verified_revenue_cents, metrics.recurring_mrr_cents, timestamp, timestamp, sprint.id);
    const cycle = { id: id("bid_cycle"), organization_id: sprint.organization_id, sprint_id: sprint.id, status: status === "target_achieved" ? "achieved" : "active", constraint_code: constraintCode, summary, metrics, next_action: nextAction, created_at: timestamp };
    this.db.prepare("INSERT INTO bid_sprint_cycles(id,organization_id,sprint_id,status,constraint_code,summary,metrics,next_action,created_at) VALUES(?,?,?,?,?,?,?,?,?)")
      .run(cycle.id, cycle.organization_id, cycle.sprint_id, cycle.status, cycle.constraint_code, cycle.summary, JSON.stringify(cycle.metrics), JSON.stringify(cycle.next_action), cycle.created_at);
    this.logger.write("info", "bid_sprint.tick", { sprint_id: sprint.id, constraint_code: constraintCode, status, verified_revenue_cents: metrics.verified_revenue_cents, recurring_mrr_cents: metrics.recurring_mrr_cents });
    return { ...cycle, sprint_status: status };
  }

  runAllOnce() {
    const rows = this.db.prepare("SELECT id,organization_id FROM bid_sprints WHERE status IN ('active','target_achieved') ORDER BY COALESCE(last_tick_at,created_at) ASC LIMIT 100").all();
    const results = [];
    for (const row of rows) {
      const agentId = this.ensureAgent(row.organization_id);
      try {
        results.push(this.tick(row.id, { user_id: agentId, organization_id: row.organization_id, role: "agent", correlation_id: id("bid_sprint_cycle") }));
      } catch (error) {
        this.logger.write("error", "bid_sprint.tick_failed", { sprint_id: row.id, organization_id: row.organization_id, code: error.code || null, error: error.message });
        results.push({ sprint_id: row.id, status: "failed", error: error.message });
      }
    }
    return results;
  }

  decideTask(taskId, input = {}, auth) {
    this.assertRole(auth, ["admin", "approver", "agent"]);
    const task = this.db.prepare("SELECT * FROM bid_sprint_tasks WHERE id=? AND organization_id=?").get(taskId, auth.organization_id);
    if (!task) throw new RuntimeError("NOT_FOUND", "Bid sprint task not found", 404);
    const decision = text(input.decision, "decision", 40, true);
    if (!["approved", "rejected", "completed", "blocked"].includes(decision)) throw new RuntimeError("VALIDATION_ERROR", "decision must be approved, rejected, completed, or blocked", 422);
    if (task.requires_approval && decision === "approved") this.assertRole(auth, ["admin", "approver"]);
    if (decision === "completed") return this.completeTask(task.id, input, auth);
    const status = decision === "rejected" ? "cancelled" : decision;
    if (!TASK_STATUSES.has(status)) throw new RuntimeError("VALIDATION_ERROR", "Invalid task status", 422);
    this.db.prepare("UPDATE bid_sprint_tasks SET status=?,updated_at=? WHERE id=?").run(status, now(), task.id);
    return this.getSprint(task.sprint_id, auth);
  }

  completeTask(taskId, input = {}, auth) {
    this.assertRole(auth, ["admin", "approver", "agent"]);
    const task = this.db.prepare("SELECT * FROM bid_sprint_tasks WHERE id=? AND organization_id=?").get(taskId, auth.organization_id);
    if (!task) throw new RuntimeError("NOT_FOUND", "Bid sprint task not found", 404);
    const sprint = this.requireSprint(task.sprint_id, auth.organization_id);
    const evidenceNote = text(input.evidence_note || `Completed internal task: ${task.title}`, "evidence_note", 20_000, true);
    if (task.requires_approval && evidenceNote.length < 20) throw new RuntimeError("VALIDATION_ERROR", "Approval-gated task completion requires meaningful evidence", 422);
    const evidence = this.runtime.evidence.record({
      auth, missionId: this.db.prepare("SELECT mission_id FROM revenue_ventures WHERE id=?").get(sprint.venture_id).mission_id,
      content: { task_id: task.id, type: task.type, title: task.title, evidence_note: evidenceNote, reference: text(input.reference || "", "reference", 1000, false), completed_at: now(), completed_by: auth.user_id },
      type: "bid_sprint.task_completed", title: task.title, source: "cyvx.bid-revenue-sprint.v1",
      correlationId: auth.correlation_id || id("correlation"), causationId: task.id,
    });
    const timestamp = now();
    this.db.prepare("UPDATE bid_sprint_tasks SET status='completed',evidence_id=?,completed_at=?,updated_at=? WHERE id=?")
      .run(evidence.id, timestamp, timestamp, task.id);
    return { task_id: task.id, status: "completed", evidence_id: evidence.id };
  }

  recordRecurringAgreement(sprintId, input = {}, auth) {
    this.assertRole(auth, ["admin"]);
    const sprint = this.requireSprint(sprintId, auth.organization_id);
    const clientId = text(input.client_id, "client_id", 200, true);
    const client = this.db.prepare("SELECT * FROM revenue_clients WHERE id=? AND venture_id=? AND organization_id=?").get(clientId, sprint.venture_id, auth.organization_id);
    if (!client) throw new RuntimeError("NOT_FOUND", "A real sprint client is required", 404);
    const fulfillment = this.db.prepare("SELECT * FROM revenue_fulfillments WHERE client_id=? AND venture_id=? AND status='completed'").get(client.id, sprint.venture_id);
    if (!fulfillment) throw new RuntimeError("FULFILLMENT_NOT_ACCEPTED", "Complete and evidence the initial client fulfillment before activating recurring service", 409);
    const status = text(input.status || "active", "status", 40, true);
    if (!AGREEMENT_STATUSES.has(status)) throw new RuntimeError("VALIDATION_ERROR", "Invalid recurring agreement status", 422);
    const monthlyCents = integer(input.monthly_cents ?? TARGET_RECURRING_MRR_CENTS, "monthly_cents", 1, 100_000_000);
    const reference = text(input.agreement_reference, "agreement_reference", 1000, true);
    const evidenceNote = text(input.evidence_note, "evidence_note", 20_000, true);
    if (evidenceNote.length < 20) throw new RuntimeError("VALIDATION_ERROR", "evidence_note must document the real recurring agreement", 422);
    const startsAt = input.starts_at ? new Date(input.starts_at).toISOString() : now();
    const evidence = this.runtime.evidence.record({
      auth, missionId: this.db.prepare("SELECT mission_id FROM revenue_ventures WHERE id=?").get(sprint.venture_id).mission_id,
      content: { sprint_id: sprint.id, client_id: client.id, deal_id: input.deal_id || client.deal_id, offer_code: "deal_desk_monitoring", monthly_cents: monthlyCents, status, agreement_reference: reference, evidence_note: evidenceNote, starts_at: startsAt, recorded_at: now() },
      type: "bid_sprint.recurring_agreement", title: `Recurring agreement for ${client.name}`, source: "owner_attestation",
      correlationId: auth.correlation_id || id("correlation"), causationId: client.id,
    });
    const timestamp = now();
    const agreementId = id("recurring_agreement");
    this.db.prepare(`INSERT INTO bid_sprint_recurring_agreements(id,organization_id,sprint_id,client_id,deal_id,offer_code,monthly_cents,status,agreement_reference,starts_at,evidence_id,created_at,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(sprint_id,client_id,offer_code) DO UPDATE SET deal_id=excluded.deal_id,monthly_cents=excluded.monthly_cents,status=excluded.status,agreement_reference=excluded.agreement_reference,starts_at=excluded.starts_at,evidence_id=excluded.evidence_id,updated_at=excluded.updated_at`)
      .run(agreementId, sprint.organization_id, sprint.id, client.id, input.deal_id || client.deal_id || null, "deal_desk_monitoring", monthlyCents, status, reference, startsAt, evidence.id, timestamp, timestamp);
    this.tick(sprint.id, auth);
    const stored = this.db.prepare("SELECT * FROM bid_sprint_recurring_agreements WHERE sprint_id=? AND client_id=? AND offer_code='deal_desk_monitoring'").get(sprint.id, client.id);
    return { agreement_id: stored.id, evidence_id: evidence.id, recurring_mrr_cents: monthlyCents, status };
  }

  ensureTask(sprintId, input) {
    const sprint = this.db.prepare("SELECT * FROM bid_sprints WHERE id=?").get(sprintId);
    if (!sprint) throw new RuntimeError("NOT_FOUND", "Bid sprint not found", 404);
    const timestamp = now();
    const initialStatus = input.requires_approval ? "awaiting_approval" : "pending";
    this.db.prepare(`INSERT INTO bid_sprint_tasks(id,organization_id,sprint_id,fingerprint,type,title,description,status,priority,requires_approval,related_type,related_id,payload,created_at,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(sprint_id,fingerprint) DO NOTHING`).run(
      id("bid_task"), sprint.organization_id, sprint.id, text(input.fingerprint, "fingerprint", 500, true),
      text(input.type, "type", 120, true), text(input.title, "title", 500, true), text(input.description, "description", 2000, true),
      initialStatus, integer(input.priority ?? 50, "priority", 0, 100), input.requires_approval ? 1 : 0,
      input.related_type || null, input.related_id || null, JSON.stringify(input.payload || {}), timestamp, timestamp,
    );
    return this.db.prepare("SELECT * FROM bid_sprint_tasks WHERE sprint_id=? AND fingerprint=?").get(sprint.id, input.fingerprint);
  }

  listSprints(auth) {
    this.assertRole(auth, ["admin", "approver", "agent", "viewer"]);
    return this.db.prepare("SELECT * FROM bid_sprints WHERE organization_id=? ORDER BY created_at DESC").all(auth.organization_id).map((row) => this.decorateSprint(row));
  }

  getSprint(sprintId, auth) {
    this.assertRole(auth, ["admin", "approver", "agent", "viewer"]);
    const sprint = this.requireSprint(sprintId, auth.organization_id);
    const venture = this.revenue.getVenture(sprint.venture_id, auth);
    const currentCycle = this.db.prepare("SELECT * FROM bid_sprint_cycles WHERE sprint_id=? ORDER BY created_at DESC LIMIT 1").get(sprint.id);
    return {
      sprint: this.decorateSprint(sprint),
      metrics: dashboardMetrics(venture, Number(sprint.recurring_mrr_cents)),
      next_best_action: currentCycle ? parseJson(currentCycle.next_action, null) : { type: "owner.approve_activation", title: "Approve bounded internal activation", requires_approval: true },
      current_constraint: currentCycle ? { code: currentCycle.constraint_code, summary: currentCycle.summary } : null,
      opportunities: this.db.prepare("SELECT * FROM bid_sprint_opportunities WHERE sprint_id=? ORDER BY score DESC,due_at,created_at DESC LIMIT 500").all(sprint.id).map((row) => ({ ...row, metadata: parseJson(row.metadata, {}) })),
      tasks: this.db.prepare("SELECT * FROM bid_sprint_tasks WHERE sprint_id=? ORDER BY CASE status WHEN 'awaiting_approval' THEN 0 WHEN 'pending' THEN 1 WHEN 'approved' THEN 2 ELSE 3 END,priority DESC,created_at").all(sprint.id).map((row) => ({ ...row, requires_approval: Boolean(row.requires_approval), payload: parseJson(row.payload, {}) })),
      recurring_agreements: this.db.prepare("SELECT * FROM bid_sprint_recurring_agreements WHERE sprint_id=? ORDER BY updated_at DESC").all(sprint.id),
      cycles: this.db.prepare("SELECT * FROM bid_sprint_cycles WHERE sprint_id=? ORDER BY created_at DESC LIMIT 50").all(sprint.id).map((row) => ({ ...row, metrics: parseJson(row.metrics, {}), next_action: parseJson(row.next_action, {}) })),
      revenue: venture,
    };
  }

  decorateSprint(row) {
    return {
      ...row,
      verticals: parseJson(row.verticals, []),
      offer_ladder: parseJson(row.offer_ladder, []),
      target_mix: parseJson(row.target_mix, []),
      progress: {
        revenue: Number(row.target_revenue_cents) ? Math.min(1, Number(row.verified_revenue_cents) / Number(row.target_revenue_cents)) : 0,
        recurring: Number(row.target_recurring_mrr_cents) ? Math.min(1, Number(row.recurring_mrr_cents) / Number(row.target_recurring_mrr_cents)) : 0,
      },
    };
  }

  requireSprint(sprintId, organizationId) {
    const sprint = this.db.prepare("SELECT * FROM bid_sprints WHERE id=? AND organization_id=?").get(sprintId, organizationId);
    if (!sprint) throw new RuntimeError("NOT_FOUND", "Bid sprint not found", 404);
    if (!SPRINT_STATUSES.has(sprint.status)) throw new RuntimeError("STATE_CORRUPT", "Bid sprint status is invalid", 500);
    return sprint;
  }

  health() {
    return {
      ok: true,
      database: true,
      workspace: this.workspaceRoot,
      intelligence_state_path: this.intelligenceStatePath,
      intelligence_ready: fs.existsSync(this.intelligenceStatePath),
      sprints: Number(this.db.prepare("SELECT count(*) AS count FROM bid_sprints").get().count),
      active: Number(this.db.prepare("SELECT count(*) AS count FROM bid_sprints WHERE status IN ('active','target_achieved')").get().count),
      target_revenue_cents: TARGET_REVENUE_CENTS,
      target_recurring_mrr_cents: TARGET_RECURRING_MRR_CENTS,
    };
  }
}

function createBidRevenueSprintHttpRuntime(options = {}) {
  const { runtime, operator, authenticate, sendJson, readBody, match } = options;
  if (!runtime || !operator || !authenticate || !sendJson || !readBody || !match) throw new Error("Bid sprint HTTP runtime requires shared operator HTTP primitives");
  const uiFile = path.resolve(options.uiFile || path.join(runtime.repoRoot, "ui", "bid-revenue-sprint.html"));
  const bodyLimit = Number(options.bodyLimit || process.env.CYVX_OPERATOR_BODY_LIMIT || 256 * 1024);

  function route(pathname) {
    return pathname === "/bid-revenue-sprint" || pathname === "/api/v4/bid-sprints" || pathname.startsWith("/api/v4/bid-sprints/");
  }

  async function handle(req, res, url, context = {}) {
    if (!route(url.pathname)) return false;
    if (req.method === "GET" && url.pathname === "/bid-revenue-sprint") {
      if (!fs.existsSync(uiFile)) throw new RuntimeError("UI_NOT_FOUND", "Bid & Revenue Sprint UI is unavailable", 404);
      const body = fs.readFileSync(uiFile);
      res.statusCode = 200;
      res.setHeader("content-type", "text/html; charset=utf-8");
      res.setHeader("content-length", body.length);
      res.end(body);
      return true;
    }
    const auth = authenticate(req);
    auth.correlation_id = context.correlationId || id("correlation");
    const input = ["GET", "HEAD"].includes(req.method) ? {} : await readBody(req, bodyLimit);
    let params;
    if (req.method === "GET" && url.pathname === "/api/v4/bid-sprints") {
      sendJson(res, 200, { ok: true, sprints: operator.listSprints(auth), health: operator.health() }, auth.correlation_id); return true;
    }
    if (req.method === "POST" && url.pathname === "/api/v4/bid-sprints") {
      sendJson(res, 201, { ok: true, operator: operator.bootstrap(input, auth) }, auth.correlation_id); return true;
    }
    if ((params = match(url.pathname, "/api/v4/bid-sprints/:id")) && req.method === "GET") {
      sendJson(res, 200, { ok: true, operator: operator.getSprint(params.id, auth) }, auth.correlation_id); return true;
    }
    if ((params = match(url.pathname, "/api/v4/bid-sprints/:id/approve")) && req.method === "POST") {
      sendJson(res, 200, { ok: true, operator: operator.approveAndLaunch(params.id, input, auth) }, auth.correlation_id); return true;
    }
    if ((params = match(url.pathname, "/api/v4/bid-sprints/:id/tick")) && req.method === "POST") {
      sendJson(res, 200, { ok: true, cycle: operator.tick(params.id, auth), operator: operator.getSprint(params.id, auth) }, auth.correlation_id); return true;
    }
    if ((params = match(url.pathname, "/api/v4/bid-sprints/:id/intelligence/import")) && req.method === "POST") {
      sendJson(res, 200, { ok: true, result: operator.importIntelligence(params.id, input, auth), operator: operator.getSprint(params.id, auth) }, auth.correlation_id); return true;
    }
    if ((params = match(url.pathname, "/api/v4/bid-sprints/:id/opportunities/:opportunityId/decision")) && req.method === "POST") {
      sendJson(res, 200, { ok: true, operator: operator.decideOpportunity(params.id, params.opportunityId, input, auth) }, auth.correlation_id); return true;
    }
    if ((params = match(url.pathname, "/api/v4/bid-sprints/:id/tasks/:taskId/decision")) && req.method === "POST") {
      const task = operator.db.prepare("SELECT sprint_id FROM bid_sprint_tasks WHERE id=?").get(params.taskId);
      if (!task || task.sprint_id !== params.id) throw new RuntimeError("NOT_FOUND", "Bid sprint task not found", 404);
      sendJson(res, 200, { ok: true, result: operator.decideTask(params.taskId, input, auth), operator: operator.getSprint(params.id, auth) }, auth.correlation_id); return true;
    }
    if ((params = match(url.pathname, "/api/v4/bid-sprints/:id/recurring-agreements")) && req.method === "POST") {
      sendJson(res, 201, { ok: true, result: operator.recordRecurringAgreement(params.id, input, auth), operator: operator.getSprint(params.id, auth) }, auth.correlation_id); return true;
    }
    throw new RuntimeError("NOT_FOUND", "Bid sprint route not found", 404);
  }

  return { operator, route, handle, health: () => operator.health() };
}

function qualificationScorecard() {
  return `# CYVX Bid Opportunity Qualification Scorecard\n\nScore every real opportunity from 0–100 before committing proposal labor.\n\n## Gates\n\n1. **Eligibility (20):** registrations, licenses, insurance, certifications, geography, and mandatory experience are satisfied.\n2. **Deadline feasibility (15):** enough time remains for questions, pricing, documents, review, and submission.\n3. **Service fit (15):** scope matches commercial cleaning, landscaping, facilities, security, or small construction capability.\n4. **Capacity (10):** staffing, equipment, supervision, and mobilization can be evidenced.\n5. **Economics (15):** price supports labor, materials, overhead, risk, and target margin.\n6. **Evidence strength (10):** references, past performance, safety, quality, and operating procedures are available.\n7. **Buyer and competition (10):** buyer requirements and competitive position are understood.\n8. **Strategic value (5):** award creates proof, recurring work, or a reusable market position.\n\n## Decision\n\n- 75–100: pursue after owner review.\n- 60–74: pursue only after closing named gaps.\n- Below 60: pass and record the reason.\n\nNo score authorizes external communication, submission, pricing representation, or contract acceptance.\n`;
}

function proposalSop() {
  return `# CYVX Proposal Sprint — Production SOP\n\n## Input\nA real solicitation or commercial opportunity, owner-approved scope, company evidence, capacity, pricing assumptions, and deadline.\n\n## Execute\n1. Preserve the source document and provenance.\n2. Build a requirement-by-requirement compliance matrix.\n3. Resolve eligibility, insurance, licensing, registration, and attachment gaps.\n4. Map evaluation criteria to response sections and proof.\n5. Build staffing, implementation, quality, safety, and escalation frameworks.\n6. Produce a pricing worksheet with explicit assumptions and margin checks.\n7. Run completeness, consistency, representation, attachment, and deadline quality control.\n8. Create an owner approval package.\n9. Submit only through an approved capability and retain the receipt.\n\n## Output\nVersioned response assets, approval evidence, submission receipt when applicable, deal value, next action, and learning record.\n`;
}

function recurringPlaybook() {
  return `# Deal Desk Monitoring — Recurring Conversion\n\nConvert only after the client receives and accepts the initial paid outcome.\n\n## Monthly service\n- official-source opportunity monitoring\n- bid-fit scoring and go/no-go briefs\n- deadline and requirement tracking\n- monthly pipeline review\n- readiness-gap backlog\n- one reusable proposal-system improvement per month\n\n## Proof required\nA real client, completed initial fulfillment, written recurring scope, monthly price, start date, agreement reference, and evidence note. Proposed recurring revenue is not MRR. Only active evidenced agreements count toward recurring MRR.\n`;
}

function revenuePlan() {
  return `# First $5,000 Verified Revenue Plan\n\n## Target mix\n- 3 Proposal Sprints × $1,500 = $4,500\n- 1 Bid Readiness Pack × $500 = $500\n- Total verified collected revenue target = $5,000\n\n## Recurring conversion\nConvert at least one accepted client to Deal Desk Monitoring at $500 per month.\n\n## Truth rules\n- A prospect is not a lead until real demand or qualification exists.\n- A proposal is not revenue.\n- A checkout is not revenue.\n- Revenue requires a verified provider event or documented owner receipt evidence.\n- Recurring MRR requires a real active agreement with evidence.\n- Every external message, submission, contract, and payment action remains approval-gated.\n`;
}

module.exports = {
  BidRevenueSprintOperator,
  createBidRevenueSprintHttpRuntime,
  BID_SPRINT_VERTICALS,
  OFFER_LADDER,
  TARGET_REVENUE_CENTS,
  TARGET_RECURRING_MRR_CENTS,
};
