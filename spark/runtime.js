"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const VERSION = 1;
const MAX_EVENTS = 5000;
const AUTHORITY_TIERS = [
  "observe",
  "recommend",
  "simulate",
  "sandbox",
  "approved_execution",
  "bounded_autonomy",
  "proven_autonomy",
];

class SparkError extends Error {
  constructor(code, message, status = 400, details = undefined) {
    super(message);
    this.name = "SparkError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

class SparkStore {
  constructor(options = {}) {
    this.filePath = path.resolve(options.filePath || path.join(process.cwd(), ".cyvx", "spark-state.json"));
    this.artifactRoot = path.resolve(options.artifactRoot || path.join(process.cwd(), ".cyvx", "worlds"));
    this.now = options.now || (() => new Date());
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    fs.mkdirSync(this.artifactRoot, { recursive: true });
    if (!fs.existsSync(this.filePath)) this.save(defaultState(this.now));
  }

  load() {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.filePath, "utf8"));
      return normalizeState(parsed, this.now);
    } catch (error) {
      if (error.code === "ENOENT") {
        const state = defaultState(this.now);
        this.save(state);
        return state;
      }
      throw new SparkError("STATE_READ_FAILED", "Spark state could not be read", 500, { cause: error.message });
    }
  }

  save(state) {
    const normalized = normalizeState(state, this.now);
    normalized.metrics = calculateMetrics(normalized);
    normalized.updated_at = iso(this.now);
    const tempPath = `${this.filePath}.${process.pid}.${Date.now()}.tmp`;
    try {
      fs.writeFileSync(tempPath, `${JSON.stringify(normalized, null, 2)}\n`, { mode: 0o600 });
      fs.renameSync(tempPath, this.filePath);
      return normalized;
    } catch (error) {
      try { fs.rmSync(tempPath, { force: true }); } catch (_) {}
      throw new SparkError("STATE_WRITE_FAILED", "Spark state could not be persisted", 500, { cause: error.message });
    }
  }

  transaction(mutator) {
    const state = this.load();
    const result = mutator(state);
    this.save(state);
    return result;
  }

  worldDir(worldId) {
    const safe = safeId(worldId);
    const directory = path.join(this.artifactRoot, safe);
    fs.mkdirSync(directory, { recursive: true });
    return directory;
  }

  writeArtifact(worldId, relativePath, content) {
    const root = this.worldDir(worldId);
    const target = path.resolve(root, relativePath);
    if (target !== root && !target.startsWith(`${root}${path.sep}`)) {
      throw new SparkError("INVALID_ARTIFACT_PATH", "Artifact path escaped its World", 400);
    }
    fs.mkdirSync(path.dirname(target), { recursive: true });
    const body = typeof content === "string" ? content : `${JSON.stringify(content, null, 2)}\n`;
    const temp = `${target}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(temp, body, { mode: 0o600 });
    fs.renameSync(temp, target);
    return {
      path: path.relative(root, target),
      sha256: sha256(body),
      bytes: Buffer.byteLength(body),
    };
  }

  readArtifact(worldId, relativePath) {
    const root = this.worldDir(worldId);
    const target = path.resolve(root, relativePath);
    if (target !== root && !target.startsWith(`${root}${path.sep}`)) return null;
    if (!fs.existsSync(target) || !fs.statSync(target).isFile()) return null;
    return fs.readFileSync(target);
  }
}

class SparkRuntime {
  constructor(options = {}) {
    this.now = options.now || (() => new Date());
    this.store = options.store || new SparkStore({
      filePath: options.filePath,
      artifactRoot: options.artifactRoot,
      now: this.now,
    });
  }

  health() {
    const state = this.store.load();
    return {
      status: "ok",
      version: VERSION,
      state_file: this.store.filePath,
      artifact_root: this.store.artifactRoot,
      metrics: state.metrics,
    };
  }

  snapshot() {
    const state = this.store.load();
    return {
      version: state.version,
      metrics: state.metrics,
      sparks: state.sparks.slice().sort(byNewest),
      worlds: state.worlds.slice().sort(byNewest),
      capabilities: state.capabilities,
      recent_events: state.events.slice(-50).reverse(),
      updated_at: state.updated_at,
    };
  }

  listSparks() {
    return this.store.load().sparks.slice().sort(byNewest);
  }

  events(limit = 100) {
    const amount = clampInteger(limit, 1, 500, 100);
    return this.store.load().events.slice(-amount).reverse();
  }

  ignite(input = {}, context = {}) {
    const ownerId = requiredText(input.owner_id, "owner_id", 1, 200);
    const intention = requiredText(input.intention, "intention", 8, 2000);
    const idempotencyKey = optionalText(context.idempotencyKey || input.idempotency_key, 200);

    return this.store.transaction((state) => {
      if (idempotencyKey) {
        const existing = state.idempotency[idempotencyKey];
        if (existing?.kind === "ignite") return this._graphFromState(state, existing.spark_id);
      }

      const now = iso(this.now);
      const sparkId = id("spark");
      const worldId = id("world");
      const missionId = id("mission");
      const approvalId = id("approval");
      const title = optionalText(input.title, 120) || titleFromIntention(intention);
      const config = normalizeWorldConfig(input.world || input.config || {}, title);
      const budget = normalizeBudget(input.budget);
      const successMetrics = normalizeSuccessMetrics(input.success_metrics);
      const constraints = normalizeStringArray(input.constraints, 20, 300);

      const spark = {
        id: sparkId,
        owner_id: ownerId,
        title,
        intention,
        status: "awaiting_approval",
        authority_tier: "simulate",
        world_id: worldId,
        active_mission_id: missionId,
        budget,
        constraints,
        success_metrics: successMetrics,
        reliability_score: 0.5,
        next_action: "Approve the first bounded execution mission",
        created_at: now,
        updated_at: now,
      };

      const world = {
        id: worldId,
        spark_id: sparkId,
        owner_id: ownerId,
        name: config.name,
        slug: uniqueSlug(state, config.name),
        status: "provisioning",
        public_path: null,
        config,
        created_at: now,
        updated_at: now,
      };

      const mission = {
        id: missionId,
        spark_id: sparkId,
        world_id: worldId,
        owner_id: ownerId,
        type: "world_bootstrap",
        title: `Launch ${world.name}`,
        status: "planned",
        approval_id: approvalId,
        steps: bootstrapSteps(now),
        created_at: now,
        updated_at: now,
      };

      const approval = {
        id: approvalId,
        spark_id: sparkId,
        mission_id: missionId,
        owner_id: ownerId,
        action: "activate_spark",
        status: "pending",
        risk: "bounded",
        scope: {
          authority_tier: "approved_execution",
          allowed_capabilities: ["world.asset.write", "lead.capture", "followup.queue", "payment.link.attach"],
          budget_limit_cents: budget.limit_cents,
        },
        requested_at: now,
        decided_at: null,
        reason: null,
      };

      state.sparks.push(spark);
      state.worlds.push(world);
      state.missions.push(mission);
      state.approvals.push(approval);
      audit(state, this.now, "spark.ignited", ownerId, { spark_id: sparkId, world_id: worldId, mission_id: missionId });
      if (idempotencyKey) state.idempotency[idempotencyKey] = { kind: "ignite", spark_id: sparkId, created_at: now };
      return this._graphFromState(state, sparkId);
    });
  }

  graph(sparkId) {
    const state = this.store.load();
    return this._graphFromState(state, sparkId);
  }

  approve(sparkId, input = {}) {
    const ownerId = requiredText(input.owner_id, "owner_id", 1, 200);
    const decision = String(input.decision || "approved").toLowerCase();
    if (!new Set(["approved", "rejected"]).has(decision)) {
      throw new SparkError("INVALID_DECISION", "decision must be approved or rejected", 422);
    }

    return this.store.transaction((state) => {
      const spark = ownedSpark(state, sparkId, ownerId);
      const approval = state.approvals.find((item) => item.spark_id === spark.id && item.status === "pending");
      if (!approval) throw new SparkError("APPROVAL_NOT_FOUND", "No pending approval exists for this Spark", 409);
      const mission = requireById(state.missions, approval.mission_id, "mission");
      const now = iso(this.now);

      approval.status = decision;
      approval.decided_at = now;
      approval.reason = optionalText(input.reason, 500) || null;
      if (decision === "approved") {
        spark.status = "active";
        spark.authority_tier = "approved_execution";
        spark.next_action = "Execute the approved World bootstrap mission";
        mission.status = "active";
        audit(state, this.now, "approval.approved", ownerId, { spark_id: spark.id, approval_id: approval.id });
      } else {
        spark.status = "paused";
        spark.next_action = "Revise the mission or approve a new bounded scope";
        mission.status = "rejected";
        audit(state, this.now, "approval.rejected", ownerId, { spark_id: spark.id, approval_id: approval.id, reason: approval.reason });
      }
      spark.updated_at = now;
      mission.updated_at = now;
      return this._graphFromState(state, spark.id);
    });
  }

  execute(sparkId, input = {}) {
    const ownerId = requiredText(input.owner_id, "owner_id", 1, 200);
    const maxSteps = clampInteger(input.max_steps, 1, 20, 20);

    return this.store.transaction((state) => {
      const spark = ownedSpark(state, sparkId, ownerId);
      if (spark.status !== "active") {
        throw new SparkError("SPARK_NOT_ACTIVE", `Spark must be active before execution; current status is ${spark.status}`, 409);
      }
      const mission = requireById(state.missions, spark.active_mission_id, "mission");
      if (mission.status !== "active") {
        throw new SparkError("MISSION_NOT_ACTIVE", `Mission must be active before execution; current status is ${mission.status}`, 409);
      }

      let completed = 0;
      for (const step of mission.steps) {
        if (completed >= maxSteps) break;
        if (!new Set(["pending", "waiting_input"]).has(step.status)) continue;
        const result = this._executeStep(state, spark, mission, step);
        if (result.status === "waiting_input") continue;
        completed += 1;
      }

      const mandatoryComplete = mission.steps.filter((step) => !step.optional).every((step) => step.status === "completed");
      const now = iso(this.now);
      if (mandatoryComplete) {
        mission.status = "completed";
        mission.completed_at = now;
        spark.next_action = "Collect the first verified lead and record the resulting outcome";
        const world = requireById(state.worlds, spark.world_id, "world");
        world.status = "operational";
        world.public_path = `/w/${world.slug}`;
        world.updated_at = now;
        audit(state, this.now, "world.operational", ownerId, { spark_id: spark.id, world_id: world.id, public_path: world.public_path });
      } else {
        spark.next_action = "Continue the approved mission or provide required configuration";
      }
      spark.updated_at = now;
      mission.updated_at = now;
      return this._graphFromState(state, spark.id);
    });
  }

  configureWorld(worldId, input = {}) {
    const ownerId = requiredText(input.owner_id, "owner_id", 1, 200);
    return this.store.transaction((state) => {
      const world = requireById(state.worlds, worldId, "world");
      if (world.owner_id !== ownerId) throw new SparkError("FORBIDDEN", "Only the World owner may change its configuration", 403);
      const patch = normalizeWorldConfig({ ...world.config, ...input }, world.name);
      world.name = patch.name;
      world.config = patch;
      world.updated_at = iso(this.now);
      const mission = state.missions.find((item) => item.world_id === world.id);
      const paymentStep = mission?.steps.find((step) => step.key === "attach_payment");
      if (patch.payment_url && paymentStep?.status === "waiting_input") paymentStep.status = "pending";
      if (mission?.steps.find((step) => step.key === "launch_website")?.status === "completed") {
        const artifact = this.store.writeArtifact(world.id, "site/index.html", renderWorldSite(world));
        recordEvidence(state, this.now, world.spark_id, world.id, mission.id, "world.website.updated", artifact);
      }
      audit(state, this.now, "world.configured", ownerId, { world_id: world.id, spark_id: world.spark_id });
      return this._graphFromState(state, world.spark_id);
    });
  }

  captureLead(worldId, input = {}, context = {}) {
    const name = requiredText(input.name, "name", 1, 120);
    const contact = optionalText(input.email || input.phone || input.contact, 200);
    if (!contact) throw new SparkError("CONTACT_REQUIRED", "email, phone, or contact is required", 422);
    const idempotencyKey = optionalText(context.idempotencyKey || input.idempotency_key, 200);

    return this.store.transaction((state) => {
      if (idempotencyKey) {
        const existing = state.idempotency[idempotencyKey];
        if (existing?.kind === "lead") {
          return { lead: requireById(state.leads, existing.lead_id, "lead"), duplicate: true };
        }
      }
      const world = requireById(state.worlds, worldId, "world");
      if (world.status !== "operational") throw new SparkError("WORLD_NOT_OPERATIONAL", "World is not accepting leads yet", 409);
      const now = iso(this.now);
      const lead = {
        id: id("lead"),
        world_id: world.id,
        spark_id: world.spark_id,
        name,
        email: optionalText(input.email, 200) || null,
        phone: optionalText(input.phone, 80) || null,
        contact,
        message: optionalText(input.message, 2000) || null,
        source: optionalText(input.source, 120) || "world_site",
        status: "new",
        created_at: now,
      };
      const followup = {
        id: id("followup"),
        lead_id: lead.id,
        world_id: world.id,
        spark_id: world.spark_id,
        type: "owner_notification",
        status: "queued",
        due_at: now,
        created_at: now,
      };
      state.leads.push(lead);
      state.followups.push(followup);
      const artifact = this.store.writeArtifact(world.id, "data/leads.json", state.leads.filter((item) => item.world_id === world.id));
      recordEvidence(state, this.now, world.spark_id, world.id, null, "lead.captured", {
        ...artifact,
        lead_id: lead.id,
        source: lead.source,
      });
      audit(state, this.now, "lead.captured", "public", { world_id: world.id, spark_id: world.spark_id, lead_id: lead.id });
      if (idempotencyKey) state.idempotency[idempotencyKey] = { kind: "lead", lead_id: lead.id, created_at: now };
      return { lead, followup, duplicate: false };
    });
  }

  recordOutcome(sparkId, input = {}) {
    const ownerId = requiredText(input.owner_id, "owner_id", 1, 200);
    const metric = requiredText(input.metric, "metric", 1, 120);
    return this.store.transaction((state) => {
      const spark = ownedSpark(state, sparkId, ownerId);
      const target = spark.success_metrics.find((item) => item.key === metric) || null;
      const evidence = normalizeEvidenceInput(input.evidence);
      const actual = normalizeScalar(input.actual);
      const expected = input.expected === undefined ? target?.target ?? null : normalizeScalar(input.expected);
      const verified = evidence.length > 0;
      const outcome = {
        id: id("outcome"),
        spark_id: spark.id,
        world_id: spark.world_id,
        metric,
        expected,
        actual,
        unit: optionalText(input.unit, 40) || target?.unit || "count",
        verified,
        evidence,
        value_cents: clampInteger(input.value_cents, 0, Number.MAX_SAFE_INTEGER, 0),
        coordination_cost_cents: clampInteger(input.coordination_cost_cents, 0, Number.MAX_SAFE_INTEGER, 0),
        created_at: iso(this.now),
      };
      state.outcomes.push(outcome);
      const verifiedOutcomes = state.outcomes.filter((item) => item.spark_id === spark.id && item.verified);
      spark.reliability_score = Math.min(0.99, round(0.5 + verifiedOutcomes.length * 0.05, 2));
      spark.updated_at = iso(this.now);
      audit(state, this.now, "outcome.recorded", ownerId, { spark_id: spark.id, outcome_id: outcome.id, verified });
      return { outcome, spark, metrics: calculateMetrics(state) };
    });
  }

  control(sparkId, input = {}) {
    const ownerId = requiredText(input.owner_id, "owner_id", 1, 200);
    const action = requiredText(input.action, "action", 1, 40).toLowerCase();
    if (!new Set(["pause", "resume", "end"]).has(action)) {
      throw new SparkError("INVALID_CONTROL_ACTION", "action must be pause, resume, or end", 422);
    }
    return this.store.transaction((state) => {
      const spark = ownedSpark(state, sparkId, ownerId);
      if (action === "pause") {
        spark.status = "paused";
        spark.next_action = "Resume when the owner is ready";
      } else if (action === "resume") {
        const approved = state.approvals.some((item) => item.spark_id === spark.id && item.status === "approved");
        if (!approved) throw new SparkError("APPROVAL_REQUIRED", "Spark cannot resume without an approved scope", 409);
        spark.status = "active";
        spark.next_action = "Continue the approved mission";
      } else {
        spark.status = "ended";
        spark.next_action = null;
        const mission = state.missions.find((item) => item.id === spark.active_mission_id);
        if (mission && mission.status === "active") mission.status = "cancelled";
      }
      spark.updated_at = iso(this.now);
      audit(state, this.now, action === "end" ? "spark.ended" : `spark.${action}d`, ownerId, { spark_id: spark.id });
      return this._graphFromState(state, spark.id);
    });
  }

  worldBySlug(slug) {
    const state = this.store.load();
    const world = state.worlds.find((item) => item.slug === slug);
    if (!world) throw new SparkError("WORLD_NOT_FOUND", "World was not found", 404);
    return world;
  }

  worldSite(worldId) {
    const world = requireById(this.store.load().worlds, worldId, "world");
    const file = this.store.readArtifact(world.id, "site/index.html");
    if (!file) throw new SparkError("WORLD_SITE_NOT_READY", "World website has not been generated", 404);
    return file;
  }

  exportWorld(worldId, ownerId) {
    const state = this.store.load();
    const world = requireById(state.worlds, worldId, "world");
    if (world.owner_id !== ownerId) throw new SparkError("FORBIDDEN", "Only the owner may export this World", 403);
    return {
      format: "cyvx.world.v1",
      exported_at: iso(this.now),
      world,
      spark: state.sparks.find((item) => item.id === world.spark_id),
      missions: state.missions.filter((item) => item.world_id === world.id),
      approvals: state.approvals.filter((item) => item.spark_id === world.spark_id),
      evidence: state.evidence.filter((item) => item.world_id === world.id),
      outcomes: state.outcomes.filter((item) => item.world_id === world.id),
      leads: state.leads.filter((item) => item.world_id === world.id),
      followups: state.followups.filter((item) => item.world_id === world.id),
    };
  }

  prometheus() {
    const metrics = this.store.load().metrics;
    return [
      "# HELP spark_sparks_total Total durable Sparks",
      "# TYPE spark_sparks_total gauge",
      `spark_sparks_total ${metrics.sparks_total}`,
      "# HELP spark_worlds_operational Operational Worlds",
      "# TYPE spark_worlds_operational gauge",
      `spark_worlds_operational ${metrics.operational_worlds}`,
      "# HELP spark_leads_total Captured leads",
      "# TYPE spark_leads_total counter",
      `spark_leads_total ${metrics.leads_total}`,
      "# HELP spark_verified_outcomes_total Verified outcomes",
      "# TYPE spark_verified_outcomes_total counter",
      `spark_verified_outcomes_total ${metrics.verified_outcomes}`,
      "# HELP spark_verified_value_cents Verified value created in cents",
      "# TYPE spark_verified_value_cents counter",
      `spark_verified_value_cents ${metrics.verified_value_cents}`,
      "# HELP spark_coordination_cost_cents Coordination cost in cents",
      "# TYPE spark_coordination_cost_cents counter",
      `spark_coordination_cost_cents ${metrics.coordination_cost_cents}`,
      "# HELP spark_value_efficiency Verified value divided by coordination cost",
      "# TYPE spark_value_efficiency gauge",
      `spark_value_efficiency ${metrics.value_efficiency}`,
      "",
    ].join("\n");
  }

  _graphFromState(state, sparkId) {
    const spark = requireById(state.sparks, sparkId, "spark");
    const world = state.worlds.find((item) => item.id === spark.world_id) || null;
    return {
      spark,
      world,
      mission: state.missions.find((item) => item.id === spark.active_mission_id) || null,
      approvals: state.approvals.filter((item) => item.spark_id === spark.id),
      evidence: state.evidence.filter((item) => item.spark_id === spark.id),
      outcomes: state.outcomes.filter((item) => item.spark_id === spark.id),
      leads: state.leads.filter((item) => item.spark_id === spark.id),
      followups: state.followups.filter((item) => item.spark_id === spark.id),
      metrics: calculateMetrics(state),
    };
  }

  _executeStep(state, spark, mission, step) {
    const world = requireById(state.worlds, mission.world_id, "world");
    const now = iso(this.now);
    step.started_at ||= now;
    let artifact;

    if (step.key === "establish_ownership") {
      artifact = this.store.writeArtifact(world.id, "ownership.json", {
        format: "cyvx.ownership.v1",
        world_id: world.id,
        spark_id: spark.id,
        owner_id: spark.owner_id,
        portable: true,
        created_at: now,
      });
    } else if (step.key === "model_reality") {
      artifact = this.store.writeArtifact(world.id, "reality.json", {
        format: "cyvx.reality.v1",
        intention: spark.intention,
        constraints: spark.constraints,
        budget: spark.budget,
        current_state: "new_world",
        desired_state: "operational_owned_asset",
        created_at: now,
      });
    } else if (step.key === "define_offer") {
      artifact = this.store.writeArtifact(world.id, "offer.json", {
        format: "cyvx.offer.v1",
        world_id: world.id,
        name: world.config.offer_name,
        description: world.config.offer_description,
        price_cents: world.config.price_cents,
        currency: world.config.currency,
        call_to_action: world.config.call_to_action,
        created_at: now,
      });
    } else if (step.key === "launch_website") {
      artifact = this.store.writeArtifact(world.id, "site/index.html", renderWorldSite(world));
      world.public_path = `/w/${world.slug}`;
    } else if (step.key === "wire_lead_intake") {
      artifact = this.store.writeArtifact(world.id, "intake.json", {
        format: "cyvx.intake.v1",
        endpoint: `/api/v1/worlds/${world.id}/leads`,
        fields: ["name", "email", "phone", "message"],
        persistence: "spark-state",
        created_at: now,
      });
    } else if (step.key === "enable_follow_up") {
      artifact = this.store.writeArtifact(world.id, "automation.json", {
        format: "cyvx.automation.v1",
        trigger: "lead.captured",
        action: "queue.owner_notification",
        status: "enabled",
        created_at: now,
      });
    } else if (step.key === "attach_payment") {
      if (!world.config.payment_url) {
        step.status = "waiting_input";
        step.message = "Add a valid HTTPS payment_url to attach checkout.";
        return { status: step.status };
      }
      artifact = this.store.writeArtifact(world.id, "payment.json", {
        format: "cyvx.payment-link.v1",
        payment_url: world.config.payment_url,
        status: "attached",
        created_at: now,
      });
      this.store.writeArtifact(world.id, "site/index.html", renderWorldSite(world));
    } else if (step.key === "establish_proof") {
      artifact = this.store.writeArtifact(world.id, "proof-plan.json", {
        format: "cyvx.proof-plan.v1",
        claims: [
          { claim: "World is operational", evidence: "site/index.html and intake.json" },
          { claim: "Lead capture works", evidence: "data/leads.json plus lead.captured event" },
          { claim: "Value was created", evidence: "verified outcome with provenance" },
        ],
        created_at: now,
      });
    } else {
      throw new SparkError("UNKNOWN_MISSION_STEP", `Unknown mission step: ${step.key}`, 500);
    }

    step.status = "completed";
    step.completed_at = now;
    step.message = null;
    step.artifact = artifact;
    recordEvidence(state, this.now, spark.id, world.id, mission.id, `mission.${step.key}.completed`, artifact);
    audit(state, this.now, "mission.step.completed", spark.owner_id, {
      spark_id: spark.id,
      world_id: world.id,
      mission_id: mission.id,
      step: step.key,
      artifact,
    });
    return { status: step.status, artifact };
  }
}

function defaultState(now) {
  const created = iso(now);
  return {
    version: VERSION,
    created_at: created,
    updated_at: created,
    sparks: [],
    worlds: [],
    missions: [],
    approvals: [],
    capabilities: [
      capability("world.asset.write", "Generate and update portable World assets", "low"),
      capability("lead.capture", "Persist public customer intent with provenance", "low"),
      capability("followup.queue", "Queue owner follow-up work from captured intent", "low"),
      capability("payment.link.attach", "Attach an owner-provided payment link", "medium"),
      capability("external.execute", "Perform an external side effect", "high"),
    ],
    evidence: [],
    outcomes: [],
    leads: [],
    followups: [],
    events: [],
    idempotency: {},
    metrics: {},
  };
}

function normalizeState(input, now) {
  const base = defaultState(now);
  const state = input && typeof input === "object" ? input : {};
  for (const key of ["sparks", "worlds", "missions", "approvals", "capabilities", "evidence", "outcomes", "leads", "followups", "events"]) {
    if (!Array.isArray(state[key])) state[key] = base[key];
  }
  if (!state.idempotency || typeof state.idempotency !== "object" || Array.isArray(state.idempotency)) state.idempotency = {};
  state.version = VERSION;
  state.created_at ||= base.created_at;
  state.updated_at ||= base.updated_at;
  if (!state.capabilities.length) state.capabilities = base.capabilities;
  if (state.events.length > MAX_EVENTS) state.events = state.events.slice(-MAX_EVENTS);
  state.metrics = calculateMetrics(state);
  return state;
}

function calculateMetrics(state) {
  const verified = state.outcomes.filter((item) => item.verified);
  const value = verified.reduce((sum, item) => sum + Number(item.value_cents || 0), 0);
  const cost = state.outcomes.reduce((sum, item) => sum + Number(item.coordination_cost_cents || 0), 0);
  return {
    sparks_total: state.sparks.length,
    active_sparks: state.sparks.filter((item) => item.status === "active").length,
    operational_worlds: state.worlds.filter((item) => item.status === "operational").length,
    leads_total: state.leads.length,
    queued_followups: state.followups.filter((item) => item.status === "queued").length,
    verified_outcomes: verified.length,
    verified_value_cents: value,
    coordination_cost_cents: cost,
    value_efficiency: cost > 0 ? round(value / cost, 4) : value > 0 ? value : 0,
  };
}

function bootstrapSteps(now) {
  const created = iso(now);
  return [
    step("establish_ownership", "Establish ownership and portability", false, created),
    step("model_reality", "Model current and desired reality", false, created),
    step("define_offer", "Create a monetizable offer", false, created),
    step("launch_website", "Generate the operational World website", false, created),
    step("wire_lead_intake", "Persist real customer intent", false, created),
    step("enable_follow_up", "Queue follow-up work automatically", false, created),
    step("attach_payment", "Attach owner-controlled checkout", true, created),
    step("establish_proof", "Define inspectable proof requirements", false, created),
  ];
}

function step(key, title, optional, createdAt) {
  return { key, title, optional, risk: key === "attach_payment" ? "medium" : "low", status: "pending", created_at: createdAt, started_at: null, completed_at: null, message: null, artifact: null };
}

function capability(key, description, risk) {
  return { key, description, risk, interruptible: true, portable: true, requires_approval: risk !== "low" };
}

function normalizeWorldConfig(input = {}, fallbackName = "New World") {
  const name = optionalText(input.name || input.business_name, 120) || fallbackName;
  const paymentUrl = input.payment_url ? normalizeUrl(input.payment_url, "payment_url") : null;
  return {
    name,
    offer_name: optionalText(input.offer_name, 120) || "Starter Service",
    offer_description: optionalText(input.offer_description, 500) || "A clear, owner-operated service designed to solve one customer problem.",
    price_cents: clampInteger(input.price_cents, 0, 100_000_000, 0),
    currency: (optionalText(input.currency, 3) || "USD").toUpperCase(),
    call_to_action: optionalText(input.call_to_action, 120) || "Request service",
    location: optionalText(input.location, 160) || null,
    email: optionalText(input.email, 200) || null,
    phone: optionalText(input.phone, 80) || null,
    payment_url: paymentUrl,
  };
}

function normalizeBudget(input = {}) {
  const source = input && typeof input === "object" ? input : {};
  return {
    currency: (optionalText(source.currency, 3) || "USD").toUpperCase(),
    limit_cents: clampInteger(source.limit_cents, 0, 100_000_000_000, 0),
    spent_cents: 0,
  };
}

function normalizeSuccessMetrics(input) {
  if (!Array.isArray(input) || !input.length) {
    return [
      { key: "world_operational", target: 1, unit: "boolean" },
      { key: "qualified_leads", target: 1, unit: "count" },
    ];
  }
  return input.slice(0, 20).map((item, index) => {
    if (!item || typeof item !== "object") throw new SparkError("INVALID_SUCCESS_METRIC", `success_metrics[${index}] must be an object`, 422);
    return {
      key: requiredText(item.key, `success_metrics[${index}].key`, 1, 120),
      target: normalizeScalar(item.target),
      unit: optionalText(item.unit, 40) || "count",
    };
  });
}

function normalizeEvidenceInput(input) {
  if (!Array.isArray(input)) return [];
  return input.slice(0, 20).map((item, index) => {
    if (!item || typeof item !== "object") throw new SparkError("INVALID_EVIDENCE", `evidence[${index}] must be an object`, 422);
    return {
      source: requiredText(item.source, `evidence[${index}].source`, 1, 500),
      claim: requiredText(item.claim, `evidence[${index}].claim`, 1, 500),
      sha256: optionalText(item.sha256, 128) || sha256(JSON.stringify(item)),
    };
  });
}

function normalizeScalar(value) {
  if (["string", "number", "boolean"].includes(typeof value)) return value;
  if (value === null) return null;
  throw new SparkError("INVALID_SCALAR", "Outcome values must be string, number, boolean, or null", 422);
}

function renderWorldSite(world) {
  const config = world.config;
  const price = config.price_cents > 0
    ? new Intl.NumberFormat("en-US", { style: "currency", currency: config.currency }).format(config.price_cents / 100)
    : "Custom quote";
  const payment = config.payment_url
    ? `<a class="button secondary" href="${escapeAttribute(config.payment_url)}" rel="noopener noreferrer">Pay securely</a>`
    : "";
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="description" content="${escapeAttribute(config.offer_description)}">
  <title>${escapeHtml(world.name)}</title>
  <style>
    :root{color-scheme:dark;--bg:#07090f;--panel:#111624;--text:#f7f8fb;--muted:#9ca7ba;--line:#263047;--accent:#8cf5c5}*{box-sizing:border-box}body{margin:0;font-family:Inter,system-ui,sans-serif;background:radial-gradient(circle at top,#18233b 0,#07090f 45%);color:var(--text)}main{max-width:980px;margin:auto;padding:32px 18px 80px}.eyebrow{color:var(--accent);font-weight:800;letter-spacing:.12em;text-transform:uppercase}.hero{padding:72px 0 40px}h1{font-size:clamp(2.4rem,8vw,5.8rem);line-height:.95;margin:.2em 0}.lede{font-size:1.15rem;color:var(--muted);max-width:680px}.grid{display:grid;grid-template-columns:1.2fr .8fr;gap:18px}.card{background:rgba(17,22,36,.9);border:1px solid var(--line);border-radius:22px;padding:24px}.price{font-size:2rem;font-weight:900}.button,button{display:inline-flex;justify-content:center;align-items:center;border:0;border-radius:14px;padding:14px 18px;font-weight:800;text-decoration:none;background:var(--accent);color:#07110c;cursor:pointer}.secondary{background:transparent;color:var(--text);border:1px solid var(--line);margin-left:8px}form{display:grid;gap:12px}input,textarea{width:100%;border:1px solid var(--line);border-radius:12px;padding:13px;background:#0a0e18;color:var(--text)}textarea{min-height:120px;resize:vertical}.status{min-height:24px;color:var(--accent)}footer{margin-top:40px;color:var(--muted);font-size:.9rem}@media(max-width:760px){.grid{grid-template-columns:1fr}.hero{padding-top:44px}.secondary{margin:8px 0 0;width:100%}.button,button{width:100%}}
  </style>
</head>
<body>
<main>
  <section class="hero">
    <div class="eyebrow">Owned operational World</div>
    <h1>${escapeHtml(world.name)}</h1>
    <p class="lede">${escapeHtml(config.offer_description)}</p>
    ${config.location ? `<p>${escapeHtml(config.location)}</p>` : ""}
  </section>
  <section class="grid">
    <article class="card">
      <div class="eyebrow">Offer</div>
      <h2>${escapeHtml(config.offer_name)}</h2>
      <p class="price">${escapeHtml(price)}</p>
      <p>${escapeHtml(config.offer_description)}</p>
      ${payment}
    </article>
    <article class="card">
      <div class="eyebrow">Start here</div>
      <h2>${escapeHtml(config.call_to_action)}</h2>
      <form id="lead-form">
        <input name="name" autocomplete="name" placeholder="Your name" required>
        <input name="email" type="email" autocomplete="email" placeholder="Email">
        <input name="phone" autocomplete="tel" placeholder="Phone">
        <textarea name="message" placeholder="What do you need?"></textarea>
        <button type="submit">${escapeHtml(config.call_to_action)}</button>
        <div class="status" id="status" role="status"></div>
      </form>
    </article>
  </section>
  <footer>Powered by Spark + CYVX · Owner-controlled and portable</footer>
</main>
<script>
const form=document.getElementById('lead-form');const status=document.getElementById('status');
form.addEventListener('submit',async(event)=>{event.preventDefault();status.textContent='Sending…';const data=Object.fromEntries(new FormData(form).entries());try{const response=await fetch('/api/v1/worlds/${world.id}/leads',{method:'POST',headers:{'content-type':'application/json','idempotency-key':crypto.randomUUID()},body:JSON.stringify(data)});const body=await response.json();if(!response.ok)throw new Error(body.error?.message||'Request failed');form.reset();status.textContent='Received. The owner can follow up now.';}catch(error){status.textContent=error.message;}});
</script>
</body>
</html>\n`;
}

function recordEvidence(state, now, sparkId, worldId, missionId, type, artifact = {}) {
  const evidence = {
    id: id("evidence"),
    spark_id: sparkId,
    world_id: worldId,
    mission_id: missionId,
    type,
    source: artifact.path || type,
    sha256: artifact.sha256 || sha256(JSON.stringify(artifact)),
    bytes: Number(artifact.bytes || 0),
    metadata: { ...artifact },
    created_at: iso(now),
  };
  state.evidence.push(evidence);
  return evidence;
}

function audit(state, now, type, actor, data = {}) {
  state.events.push({ id: id("event"), type, actor, data, created_at: iso(now) });
  if (state.events.length > MAX_EVENTS) state.events.splice(0, state.events.length - MAX_EVENTS);
}

function ownedSpark(state, sparkId, ownerId) {
  const spark = requireById(state.sparks, sparkId, "spark");
  if (spark.owner_id !== ownerId) throw new SparkError("FORBIDDEN", "Only the Spark owner may perform this action", 403);
  return spark;
}

function requireById(collection, itemId, label) {
  const item = collection.find((entry) => entry.id === itemId);
  if (!item) throw new SparkError(`${label.toUpperCase()}_NOT_FOUND`, `${capitalize(label)} was not found`, 404);
  return item;
}

function uniqueSlug(state, name) {
  const base = slugify(name) || "world";
  let candidate = base;
  let index = 2;
  while (state.worlds.some((world) => world.slug === candidate)) candidate = `${base}-${index++}`;
  return candidate;
}

function titleFromIntention(value) {
  const cleaned = value.replace(/\s+/g, " ").trim();
  const words = cleaned.split(" ").slice(0, 8).join(" ");
  return words.length < cleaned.length ? `${words}…` : words;
}

function normalizeUrl(value, field) {
  try {
    const url = new URL(String(value));
    if (!new Set(["https:", "http:"]).has(url.protocol)) throw new Error("unsupported protocol");
    return url.toString();
  } catch (_) {
    throw new SparkError("INVALID_URL", `${field} must be a valid HTTP or HTTPS URL`, 422);
  }
}

function normalizeStringArray(value, maxItems, maxLength) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, maxItems).map((item, index) => requiredText(item, `item[${index}]`, 1, maxLength));
}

function requiredText(value, field, min, max) {
  const text = typeof value === "string" ? value.trim() : "";
  if (text.length < min || text.length > max) {
    throw new SparkError("VALIDATION_ERROR", `${field} must be between ${min} and ${max} characters`, 422, { field });
  }
  return text;
}

function optionalText(value, max) {
  if (value === undefined || value === null || value === "") return null;
  const text = String(value).trim();
  if (text.length > max) throw new SparkError("VALIDATION_ERROR", `Value may not exceed ${max} characters`, 422);
  return text || null;
}

function clampInteger(value, min, max, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < min || number > max) {
    throw new SparkError("VALIDATION_ERROR", `Expected an integer between ${min} and ${max}`, 422);
  }
  return number;
}

function id(prefix) {
  return `${prefix}_${crypto.randomUUID().replaceAll("-", "")}`;
}

function safeId(value) {
  const text = String(value || "");
  if (!/^[a-z0-9_\-]+$/i.test(text)) throw new SparkError("INVALID_ID", "Identifier contains unsupported characters", 400);
  return text;
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function iso(now) {
  const value = typeof now === "function" ? now() : now;
  return new Date(value).toISOString();
}

function byNewest(a, b) {
  return String(b.created_at || "").localeCompare(String(a.created_at || ""));
}

function round(value, digits) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
}

function escapeAttribute(value) {
  return escapeHtml(value).replace(/`/g, "&#96;");
}

module.exports = {
  AUTHORITY_TIERS,
  SparkError,
  SparkRuntime,
  SparkStore,
  calculateMetrics,
  renderWorldSite,
};
