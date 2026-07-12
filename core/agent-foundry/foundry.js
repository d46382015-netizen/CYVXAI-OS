"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { GovernanceError, canonical, sha256 } = require("../governance");

const SENSITIVE_ACTIONS = Object.freeze(["create_agent", "deploy_staging", "deploy_production", "spend_budget"]);
const SENSITIVE_ACTION_SET = new Set(SENSITIVE_ACTIONS);

function now() { return new Date().toISOString(); }
function newId(prefix) { return `${prefix}_${crypto.randomUUID().replace(/-/g, "")}`; }
function hmac(secret, value) { return crypto.createHmac("sha256", secret).update(String(value)).digest("hex"); }
function safeEqual(left, right) {
  const a = Buffer.from(String(left || ""));
  const b = Buffer.from(String(right || ""));
  return a.length === b.length && a.length > 0 && crypto.timingSafeEqual(a, b);
}
function bounded(value, name, max = 500, required = true) {
  const output = String(value ?? "").trim();
  if (required && !output) throw new GovernanceError("VALIDATION_ERROR", `${name} is required`, 422);
  if (output.length > max) throw new GovernanceError("VALIDATION_ERROR", `${name} exceeds ${max} characters`, 422);
  return output;
}
function finiteMoney(value, name = "amount_usd", allowZero = true) {
  const output = Number(value);
  if (!Number.isFinite(output) || output < 0 || (!allowZero && output === 0)) {
    throw new GovernanceError("VALIDATION_ERROR", `${name} must be ${allowZero ? "zero or greater" : "greater than zero"}`, 422);
  }
  return Math.round((output + Number.EPSILON) * 100) / 100;
}
function parseJson(value, fallback) {
  if (value === null || value === undefined || value === "") return fallback;
  if (typeof value !== "string") return value;
  try { return JSON.parse(value); } catch { return fallback; }
}
function slug(value, name = "identifier") {
  const output = bounded(value, name, 100).toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
  if (!output) throw new GovernanceError("VALIDATION_ERROR", `${name} must contain letters or numbers`, 422);
  return output;
}
function atomicWrite(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.${crypto.randomUUID()}.tmp`;
  fs.writeFileSync(temporary, content, { mode: 0o600 });
  fs.renameSync(temporary, file);
}
function isInside(root, candidate) {
  const base = path.resolve(root);
  const target = path.resolve(candidate);
  return target === base || target.startsWith(`${base}${path.sep}`);
}
function assertNoSymlinks(target, root = target) {
  const stat = fs.lstatSync(target);
  if (stat.isSymbolicLink()) throw new GovernanceError("SYMLINK_NOT_ALLOWED", `Deployment source contains a symbolic link: ${path.relative(root, target) || "."}`, 422);
  if (stat.isDirectory()) {
    for (const name of fs.readdirSync(target).sort()) assertNoSymlinks(path.join(target, name), root);
  }
}
function hashPath(target) {
  const absolute = path.resolve(target);
  if (!fs.existsSync(absolute)) throw new GovernanceError("ARTIFACT_NOT_FOUND", "Deployment source does not exist", 404);
  assertNoSymlinks(absolute);
  const stat = fs.statSync(absolute);
  if (stat.isFile()) return crypto.createHash("sha256").update(fs.readFileSync(absolute)).digest("hex");
  if (!stat.isDirectory()) throw new GovernanceError("ARTIFACT_TYPE_UNSUPPORTED", "Deployment source must be a file or directory", 422);
  const records = [];
  const walk = (directory, relative = "") => {
    for (const name of fs.readdirSync(directory).sort()) {
      const full = path.join(directory, name);
      const rel = path.posix.join(relative.split(path.sep).join(path.posix.sep), name);
      const item = fs.lstatSync(full);
      if (item.isSymbolicLink()) throw new GovernanceError("SYMLINK_NOT_ALLOWED", `Deployment source contains a symbolic link: ${rel}`, 422);
      if (item.isDirectory()) {
        records.push({ path: `${rel}/`, type: "directory" });
        walk(full, rel);
      } else if (item.isFile()) {
        records.push({ path: rel, type: "file", bytes: item.size, sha256: crypto.createHash("sha256").update(fs.readFileSync(full)).digest("hex") });
      } else {
        throw new GovernanceError("ARTIFACT_TYPE_UNSUPPORTED", `Unsupported artifact entry: ${rel}`, 422);
      }
    }
  };
  walk(absolute);
  return sha256(canonical(records));
}

class GrantCapabilityGateway {
  constructor(options = {}) {
    if (!options.kernel) throw new GovernanceError("CONFIG_INVALID", "governance kernel is required", 500);
    this.kernel = options.kernel;
    this.secret = String(options.secret || "");
    if (this.secret.length < 32) throw new GovernanceError("CONFIG_INVALID", "foundry governance secret must contain at least 32 characters", 500);
  }

  inspect(auth, grantId, capability, actualCostUsd = 0) {
    if (!auth || !auth.user_id || !auth.organization_id || !auth.role) throw new GovernanceError("AUTH_REQUIRED", "Authenticated principal is required", 401);
    const requestedCapability = bounded(capability, "capability", 120);
    if (!SENSITIVE_ACTION_SET.has(requestedCapability)) throw new GovernanceError("CAPABILITY_NOT_SUPPORTED", "Foundry action is not a governed sensitive capability", 422);
    const id = bounded(grantId, "grant_id", 200);
    const actualCost = finiteMoney(actualCostUsd, "actual_cost_usd");
    const grant = this.kernel.getGrant(auth, id);
    if (grant.status !== "active") throw new GovernanceError("GRANT_NOT_ACTIVE", `Capability grant is ${grant.status}`, 409);
    if (Date.parse(grant.expires_at) <= Date.now()) throw new GovernanceError("GRANT_EXPIRED", "Capability grant has expired", 409);
    if (grant.grantee_id !== auth.user_id) throw new GovernanceError("GRANTEE_MISMATCH", "Only the exact grant recipient can execute this Foundry action", 403);
    if (grant.capability !== requestedCapability) {
      throw new GovernanceError("CAPABILITY_MISMATCH", `Grant authorizes ${grant.capability}, not ${requestedCapability}`, 409);
    }
    if (actualCost > Number(grant.maximum_cost_usd)) {
      throw new GovernanceError("BUDGET_EXCEEDED", "Actual cost exceeds the capability grant", 409, {
        maximum_cost_usd: Number(grant.maximum_cost_usd), actual_cost_usd: actualCost
      });
    }
    const pkg = this.kernel.getPackage(auth, grant.package_id);
    if (pkg.status !== "authorized" || pkg.capability_grant_id !== grant.id) {
      throw new GovernanceError("PACKAGE_NOT_AUTHORIZED", "Grant is not attached to an authorized governance package", 409);
    }
    if (pkg.requested_action !== requestedCapability || pkg.mission_id !== grant.mission_id || pkg.worker_id !== grant.grantee_id) {
      throw new GovernanceError("GRANT_BINDING_INVALID", "Grant does not match its package, mission, worker, and capability binding", 409);
    }
    const constitutionHash = pkg.policy_decision && pkg.policy_decision.constitution_hash;
    if (!constitutionHash) throw new GovernanceError("GRANT_BINDING_INVALID", "Authorized package is missing its Constitution hash", 409);
    const unsigned = {
      id: grant.id,
      organization_id: grant.organization_id,
      package_id: grant.package_id,
      mission_id: grant.mission_id,
      grantee_id: grant.grantee_id,
      capability: grant.capability,
      maximum_cost_usd: Number(grant.maximum_cost_usd),
      issued_at: grant.issued_at,
      expires_at: grant.expires_at,
      constitution_hash: constitutionHash
    };
    const expectedSignature = hmac(this.secret, canonical(unsigned));
    if (!safeEqual(expectedSignature, grant.signature)) throw new GovernanceError("GRANT_SIGNATURE_INVALID", "Capability grant signature is invalid", 409);
    const controls = this.kernel.getControls(auth);
    if (controls.global_stop) throw new GovernanceError("GLOBAL_STOP", "Global emergency stop is active", 423);
    if (controls.external_actions_disabled) throw new GovernanceError("EXTERNAL_ACTIONS_DISABLED", "External actions are disabled", 423);
    if (controls.spending_frozen && actualCost > 0) throw new GovernanceError("SPENDING_FROZEN", "Spending is frozen", 423);
    if (requestedCapability === "create_agent" && controls.agent_creation_disabled) {
      throw new GovernanceError("AGENT_CREATION_DISABLED", "Agent creation is disabled", 423);
    }
    return { grant, package: pkg, actual_cost_usd: actualCost };
  }
}

class AgentFoundry {
  constructor(options = {}) {
    if (!options.db) throw new GovernanceError("CONFIG_INVALID", "db is required", 500);
    if (!options.kernel) throw new GovernanceError("CONFIG_INVALID", "governance kernel is required", 500);
    this.db = options.db;
    this.kernel = options.kernel;
    this.repoRoot = path.resolve(options.repoRoot || path.join(__dirname, "../.."));
    this.dataRoot = path.resolve(options.dataRoot || path.join(this.repoRoot, "data"));
    this.logger = options.logger || { write() {} };
    this.gateway = new GrantCapabilityGateway({ kernel: this.kernel, secret: options.secret });
    this.spendExecutor = options.spendExecutor || commandSpendExecutor(process.env.CYVX_SPEND_COMMAND_JSON);
    this.maxLineageDepth = Math.max(1, Number(options.maxLineageDepth || 6));
    this.maxChildrenPerAgent = Math.max(1, Number(options.maxChildrenPerAgent || 8));
    this.bootstrap();
  }

  bootstrap() {
    const migrationPath = path.join(this.repoRoot, "ops", "sqlite", "004_grant_gated_agent_foundry.sql");
    const sql = fs.readFileSync(migrationPath, "utf8");
    const checksum = sha256(sql);
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db.exec(sql);
      const existing = this.db.prepare("SELECT checksum FROM governance_schema_migrations WHERE version=4").get();
      if (existing && existing.checksum !== checksum) throw new GovernanceError("MIGRATION_CHECKSUM_MISMATCH", "Foundry migration changed after application", 500);
      if (!existing) this.db.prepare("INSERT INTO governance_schema_migrations(version,name,checksum,applied_at) VALUES(4,?,?,?)")
        .run("004_grant_gated_agent_foundry.sql", checksum, now());
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  executeAction(auth, action, input = {}) {
    const capability = bounded(action, "action", 120).toLowerCase();
    if (!SENSITIVE_ACTION_SET.has(capability)) throw new GovernanceError("ACTION_NOT_SUPPORTED", `Action must be one of ${SENSITIVE_ACTIONS.join(", ")}`, 422);
    const grantId = bounded(input.grant_id, "grant_id", 200);
    const actualCost = capability === "spend_budget"
      ? finiteMoney(input.amount_usd, "amount_usd", false)
      : finiteMoney(input.actual_cost_usd || 0, "actual_cost_usd");
    const authorization = this.gateway.inspect(auth, grantId, capability, actualCost);
    const run = this._claimRun(auth, authorization, capability, input, actualCost);
    let envelope = null;
    try {
      envelope = {
        create_agent: () => this._createAgent(auth, authorization, input),
        deploy_staging: () => this._deploy(auth, authorization, input, "staging"),
        deploy_production: () => this._deploy(auth, authorization, input, "production"),
        spend_budget: () => this._spend(auth, authorization, input)
      }[capability]();
      if (!envelope || typeof envelope !== "object" || !("value" in envelope)) {
        throw new GovernanceError("EXECUTOR_INVALID", "Foundry executor returned an invalid result envelope", 500);
      }
      if (envelope && typeof envelope.then === "function") throw new GovernanceError("ASYNC_EXECUTOR_FORBIDDEN", "Foundry executors must complete synchronously to preserve the grant boundary", 500);
      const resultHash = envelope.result_sha256 || sha256(canonical(envelope.value));
      const consumedGrant = this.kernel.consumeGrant(auth, grantId, {
        actual_cost_usd: actualCost,
        external_reference: envelope.external_reference || null,
        result_sha256: resultHash,
        outcome: envelope.outcome || `${capability} completed through the Agent Foundry grant gateway`,
        metadata: { action: capability, foundry_run_id: run.id, ...(envelope.metadata || {}) }
      });
      this.db.prepare(`UPDATE foundry_action_runs SET status='succeeded',result_hash=?,external_reference=?,updated_at=? WHERE id=?`)
        .run(resultHash, envelope.external_reference || null, now(), run.id);
      this._log("info", "foundry.action_succeeded", { action: capability, grant_id: grantId, run_id: run.id, mission_id: authorization.grant.mission_id });
      return { action: capability, run: this.getRun(auth, run.id), grant: consumedGrant, result: envelope.value };
    } catch (error) {
      let rolledBack = false;
      if (envelope && typeof envelope.rollback === "function") {
        try { envelope.rollback(); rolledBack = true; } catch (rollbackError) {
          this._log("error", "foundry.rollback_failed", { run_id: run.id, error: rollbackError.message });
        }
      }
      const status = envelope && !rolledBack ? "reconciliation_required" : "failed";
      this.db.prepare("UPDATE foundry_action_runs SET status=?,error_code=?,error_message=?,updated_at=? WHERE id=?")
        .run(status, String(error.code || "ACTION_FAILED").slice(0, 120), String(error.message || "Action failed").slice(0, 2000), now(), run.id);
      this._log(status === "reconciliation_required" ? "error" : "warn", "foundry.action_failed", {
        action: capability, grant_id: grantId, run_id: run.id, status, code: error.code, error: error.message
      });
      throw error;
    }
  }

  dashboard(auth, options = {}) {
    this._requireAuth(auth);
    const limit = Math.min(200, Math.max(1, Number(options.limit || 50)));
    const mapRows = (sql) => this.db.prepare(sql).all(auth.organization_id, limit).map(foundryRow);
    const counts = (table) => Number(this.db.prepare(`SELECT COUNT(*) AS count FROM ${table} WHERE organization_id=?`).get(auth.organization_id).count);
    return {
      boundary: this.verifyBoundary(auth),
      counts: {
        agents: counts("foundry_agents"), deployments: counts("foundry_deployments"),
        spend_receipts: counts("foundry_spend_receipts"), action_runs: counts("foundry_action_runs")
      },
      action_runs: mapRows("SELECT * FROM foundry_action_runs WHERE organization_id=? ORDER BY created_at DESC LIMIT ?"),
      agents: mapRows("SELECT * FROM foundry_agents WHERE organization_id=? ORDER BY created_at DESC LIMIT ?"),
      deployments: mapRows("SELECT * FROM foundry_deployments WHERE organization_id=? ORDER BY created_at DESC LIMIT ?"),
      spend_receipts: mapRows("SELECT * FROM foundry_spend_receipts WHERE organization_id=? ORDER BY created_at DESC LIMIT ?")
    };
  }

  getRun(auth, runId) {
    this._requireAuth(auth);
    const row = this.db.prepare("SELECT * FROM foundry_action_runs WHERE id=? AND organization_id=?").get(runId, auth.organization_id);
    if (!row) throw new GovernanceError("NOT_FOUND", "Foundry action run not found", 404);
    return foundryRow(row);
  }

  verifyBoundary(auth) {
    this._requireAuth(auth);
    const checks = [
      ["agents", "foundry_agents", "create_agent"],
      ["staging_deployments", "foundry_deployments", "deploy_staging", "environment='staging'"],
      ["production_deployments", "foundry_deployments", "deploy_production", "environment='production'"],
      ["spend_receipts", "foundry_spend_receipts", "spend_budget"]
    ].map(([name, table, capability, extra]) => {
      const row = this.db.prepare(`SELECT COUNT(*) AS count FROM ${table} resource
        LEFT JOIN governance_capability_grants grant_record ON grant_record.id=resource.grant_id AND grant_record.organization_id=resource.organization_id
        WHERE resource.organization_id=? ${extra ? `AND ${extra}` : ""}
          AND (grant_record.id IS NULL OR grant_record.capability<>? OR grant_record.status<>'consumed')`)
        .get(auth.organization_id, capability);
      return { name, orphaned_or_unconsumed: Number(row.count) };
    });
    return { ok: checks.every((check) => check.orphaned_or_unconsumed === 0), sensitive_actions: SENSITIVE_ACTIONS, checks };
  }

  _claimRun(auth, authorization, action, input, actualCost) {
    const existing = this.db.prepare("SELECT * FROM foundry_action_runs WHERE organization_id=? AND grant_id=?")
      .get(auth.organization_id, authorization.grant.id);
    const timestamp = now();
    const inputHash = sha256(canonical({ action, input: { ...input, grant_id: authorization.grant.id } }));
    if (existing) {
      if (existing.status === "succeeded") throw new GovernanceError("GRANT_ALREADY_EXECUTED", "This grant already completed a Foundry action", 409);
      if (existing.status === "reconciliation_required") throw new GovernanceError("RECONCILIATION_REQUIRED", "This grant has an unresolved external outcome", 409);
      if (existing.status === "running") throw new GovernanceError("ACTION_IN_PROGRESS", "This grant is already executing", 409);
      this.db.prepare(`UPDATE foundry_action_runs SET status='running',attempts=attempts+1,input_hash=?,actual_cost_usd=?,error_code=NULL,error_message=NULL,updated_at=? WHERE id=?`)
        .run(inputHash, actualCost, timestamp, existing.id);
      return foundryRow(this.db.prepare("SELECT * FROM foundry_action_runs WHERE id=?").get(existing.id));
    }
    const id = newId("foundryrun");
    this.db.prepare(`INSERT INTO foundry_action_runs(
      id,organization_id,grant_id,package_id,mission_id,worker_id,action,status,attempts,input_hash,actual_cost_usd,created_at,updated_at
    ) VALUES(?,?,?,?,?,?,?,?,1,?,?,?,?)`).run(
      id, auth.organization_id, authorization.grant.id, authorization.package.id, authorization.grant.mission_id,
      auth.user_id, action, "running", inputHash, actualCost, timestamp, timestamp
    );
    return foundryRow(this.db.prepare("SELECT * FROM foundry_action_runs WHERE id=?").get(id));
  }

  _createAgent(auth, authorization, input) {
    const parentAgentId = input.parent_agent_id ? bounded(input.parent_agent_id, "parent_agent_id", 200) : auth.user_id;
    if (parentAgentId !== auth.user_id) throw new GovernanceError("PARENT_MISMATCH", "A child agent can only descend from the executing grant recipient", 403);
    const parent = this.db.prepare("SELECT id,role,active FROM users WHERE organization_id=? AND id=?").get(auth.organization_id, parentAgentId);
    if (!parent || !parent.active || !["agent", "admin"].includes(parent.role)) throw new GovernanceError("PARENT_NOT_ACTIVE", "Parent agent identity is not active", 409);
    const lineage = this.db.prepare("SELECT lineage_depth FROM foundry_agents WHERE organization_id=? AND id=?").get(auth.organization_id, parentAgentId);
    const lineageDepth = lineage ? Number(lineage.lineage_depth) + 1 : 1;
    if (lineageDepth > this.maxLineageDepth) throw new GovernanceError("LINEAGE_LIMIT_EXCEEDED", "Agent lineage depth exceeds the Foundry safety limit", 409);
    const childCount = Number(this.db.prepare("SELECT COUNT(*) AS count FROM foundry_agents WHERE organization_id=? AND parent_agent_id=? AND status IN ('active','paused')")
      .get(auth.organization_id, parentAgentId).count);
    if (childCount >= this.maxChildrenPerAgent) throw new GovernanceError("CHILD_LIMIT_EXCEEDED", "Parent agent reached the active child limit", 409);
    const name = bounded(input.name, "name", 120);
    const mission = bounded(input.mission, "mission", 2000);
    const capabilities = Array.isArray(input.capabilities) ? input.capabilities.slice(0, 50).map((value) => bounded(value, "capability", 120)) : [];
    const permissions = input.permissions && typeof input.permissions === "object" ? input.permissions : {};
    const forbiddenPermissionKeys = ["bypass_governance", "raw_credentials", "unrestricted_spend", "unrestricted_deploy", "self_authorize"];
    const forbidden = forbiddenPermissionKeys.filter((key) => permissions[key]);
    if (forbidden.length) throw new GovernanceError("UNSAFE_AGENT_PERMISSION", "Child agent requests permissions that cannot be delegated", 409, { forbidden });
    const genome = input.genome && typeof input.genome === "object" ? input.genome : {};
    const budget = input.budget && typeof input.budget === "object" ? input.budget : {};
    const agentId = `agent_${slug(name)}_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
    const createdAt = now();
    const spec = { id: agentId, name, mission, parent_agent_id: parentAgentId, lineage_depth: lineageDepth, genome, capabilities, permissions, budget };
    const specHash = sha256(canonical(spec));
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db.prepare("INSERT INTO users(id,organization_id,role,active,created_at,updated_at) VALUES(?,?,?,?,?,?)")
        .run(agentId, auth.organization_id, "agent", 1, createdAt, createdAt);
      this.db.prepare(`INSERT INTO foundry_agents(
        id,organization_id,parent_agent_id,mission_id,grant_id,name,status,lineage_depth,genome_json,capabilities_json,
        permissions_json,budget_json,spec_hash,created_at,created_by
      ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
        agentId, auth.organization_id, parentAgentId, authorization.grant.mission_id, authorization.grant.id, name, "active",
        lineageDepth, JSON.stringify({ ...genome, mission }), JSON.stringify(capabilities), JSON.stringify(permissions), JSON.stringify(budget),
        specHash, createdAt, auth.user_id
      );
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    const value = foundryRow(this.db.prepare("SELECT * FROM foundry_agents WHERE id=?").get(agentId));
    return {
      value, external_reference: agentId, outcome: `Created governed child agent ${agentId}`,
      metadata: { agent_id: agentId, parent_agent_id: parentAgentId, lineage_depth: lineageDepth, spec_hash: specHash },
      rollback: () => {
        this.db.exec("BEGIN IMMEDIATE");
        try {
          this.db.prepare("DELETE FROM foundry_agents WHERE id=? AND organization_id=?").run(agentId, auth.organization_id);
          this.db.prepare("DELETE FROM users WHERE id=? AND organization_id=?").run(agentId, auth.organization_id);
          this.db.exec("COMMIT");
        } catch (error) { this.db.exec("ROLLBACK"); throw error; }
      }
    };
  }

  _deploy(auth, authorization, input, environment) {
    const source = this._resolveArtifactSource(input.source_path);
    const artifactHash = hashPath(source);
    if (artifactHash !== authorization.package.artifact_sha256) {
      throw new GovernanceError("ARTIFACT_HASH_MISMATCH", "Deployment source does not match the Supervisor- and Boss-approved artifact hash", 409, {
        approved_sha256: authorization.package.artifact_sha256, actual_sha256: artifactHash
      });
    }
    const appId = slug(input.app_id, "app_id");
    const releaseId = `release_${new Date().toISOString().replace(/[-:.TZ]/g, "")}_${crypto.randomUUID().replace(/-/g, "").slice(0, 8)}`;
    const appRoot = path.join(this.dataRoot, "foundry", "deployments", environment, appId);
    const releasesRoot = path.join(appRoot, "releases");
    const releasePath = path.join(releasesRoot, releaseId);
    const temporary = `${releasePath}.tmp-${process.pid}-${crypto.randomUUID()}`;
    const currentFile = path.join(appRoot, "current.json");
    fs.mkdirSync(releasesRoot, { recursive: true });
    const previousRaw = fs.existsSync(currentFile) ? fs.readFileSync(currentFile, "utf8") : null;
    const previous = previousRaw ? parseJson(previousRaw, null) : null;
    try {
      fs.cpSync(source, temporary, { recursive: true, errorOnExist: true, force: false });
      fs.renameSync(temporary, releasePath);
      const manifest = {
        app_id: appId, environment, release_id: releaseId, release_path: releasePath,
        artifact_sha256: artifactHash, mission_id: authorization.grant.mission_id,
        grant_id: authorization.grant.id, previous_release_id: previous && previous.release_id || null, deployed_at: now()
      };
      this.db.prepare(`INSERT INTO foundry_deployments(
        id,organization_id,mission_id,grant_id,worker_id,environment,app_id,release_id,source_path,release_path,
        artifact_sha256,previous_release_id,status,manifest_json,created_at,created_by
      ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
        newId("deployment"), auth.organization_id, authorization.grant.mission_id, authorization.grant.id, auth.user_id,
        environment, appId, releaseId, source, releasePath, artifactHash, manifest.previous_release_id, "active",
        JSON.stringify(manifest), manifest.deployed_at, auth.user_id
      );
      atomicWrite(currentFile, `${JSON.stringify(manifest, null, 2)}\n`);
      const value = foundryRow(this.db.prepare("SELECT * FROM foundry_deployments WHERE organization_id=? AND grant_id=?")
        .get(auth.organization_id, authorization.grant.id));
      return {
        value, external_reference: releasePath, outcome: `${environment} release ${releaseId} activated`,
        metadata: { environment, app_id: appId, release_id: releaseId, artifact_sha256: artifactHash },
        rollback: () => {
          this.db.prepare("DELETE FROM foundry_deployments WHERE organization_id=? AND grant_id=?").run(auth.organization_id, authorization.grant.id);
          fs.rmSync(releasePath, { recursive: true, force: true });
          if (previousRaw !== null) atomicWrite(currentFile, previousRaw); else fs.rmSync(currentFile, { force: true });
        }
      };
    } catch (error) {
      fs.rmSync(temporary, { recursive: true, force: true });
      if (fs.existsSync(releasePath) && !this.db.prepare("SELECT id FROM foundry_deployments WHERE organization_id=? AND grant_id=?").get(auth.organization_id, authorization.grant.id)) {
        fs.rmSync(releasePath, { recursive: true, force: true });
      }
      throw error;
    }
  }

  _spend(auth, authorization, input) {
    if (typeof this.spendExecutor !== "function") {
      throw new GovernanceError("SPEND_EXECUTOR_NOT_CONFIGURED", "No production spend executor is configured; no funds were moved", 503);
    }
    const amount = finiteMoney(input.amount_usd, "amount_usd", false);
    const vendor = bounded(input.vendor, "vendor", 200);
    const purpose = bounded(input.purpose, "purpose", 1000);
    const idempotencyKey = bounded(input.idempotency_key, "idempotency_key", 200);
    const currency = bounded(input.currency || "USD", "currency", 3).toUpperCase();
    if (currency !== "USD") throw new GovernanceError("CURRENCY_NOT_SUPPORTED", "The current Constitution budget ledger is denominated in USD", 422);
    const duplicate = this.db.prepare("SELECT * FROM foundry_spend_receipts WHERE organization_id=? AND idempotency_key=?")
      .get(auth.organization_id, idempotencyKey);
    if (duplicate) throw new GovernanceError("IDEMPOTENCY_CONFLICT", "A spend receipt already exists for this idempotency key", 409);
    const request = {
      amount_usd: amount, currency, vendor, purpose, idempotency_key: idempotencyKey,
      mission_id: authorization.grant.mission_id, grant_id: authorization.grant.id,
      worker_id: auth.user_id, metadata: input.metadata && typeof input.metadata === "object" ? input.metadata : {}
    };
    const provider = this.spendExecutor(request);
    if (provider && typeof provider.then === "function") throw new GovernanceError("ASYNC_EXECUTOR_FORBIDDEN", "Spend executor must complete synchronously", 500);
    if (!provider || !["succeeded", "authorized"].includes(provider.status) || !provider.external_reference) {
      throw new GovernanceError("SPEND_PROVIDER_FAILED", "Spend provider did not return a successful durable receipt", 502);
    }
    const receiptId = newId("spend");
    const createdAt = now();
    this.db.prepare(`INSERT INTO foundry_spend_receipts(
      id,organization_id,mission_id,grant_id,worker_id,idempotency_key,vendor,purpose,currency,amount_usd,
      external_reference,provider_status,provider_metadata_json,created_at,created_by
    ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      receiptId, auth.organization_id, authorization.grant.mission_id, authorization.grant.id, auth.user_id,
      idempotencyKey, vendor, purpose, currency, amount, String(provider.external_reference).slice(0, 500), provider.status,
      JSON.stringify(provider.metadata && typeof provider.metadata === "object" ? provider.metadata : {}), createdAt, auth.user_id
    );
    const value = foundryRow(this.db.prepare("SELECT * FROM foundry_spend_receipts WHERE id=?").get(receiptId));
    return {
      value, external_reference: value.external_reference, outcome: `Authorized spend completed for ${vendor}`,
      metadata: { spend_receipt_id: receiptId, provider_status: provider.status, idempotency_key: idempotencyKey },
      rollback: typeof provider.rollback === "function" ? () => {
        provider.rollback();
        this.db.prepare("DELETE FROM foundry_spend_receipts WHERE id=? AND organization_id=?").run(receiptId, auth.organization_id);
      } : null
    };
  }

  _resolveArtifactSource(value) {
    const raw = bounded(value, "source_path", 1000);
    const source = path.resolve(this.repoRoot, raw);
    const allowedRoots = [this.repoRoot, path.join(this.dataRoot, "evidence"), path.join(this.dataRoot, "artifacts")].map((root) => path.resolve(root));
    if (!allowedRoots.some((root) => isInside(root, source))) throw new GovernanceError("ARTIFACT_PATH_FORBIDDEN", "Deployment source is outside approved artifact roots", 403);
    if (!fs.existsSync(source)) throw new GovernanceError("ARTIFACT_NOT_FOUND", "Deployment source does not exist", 404);
    assertNoSymlinks(source);
    return source;
  }

  _requireAuth(auth) {
    if (!auth || !auth.user_id || !auth.organization_id || !auth.role) throw new GovernanceError("AUTH_REQUIRED", "Authenticated principal is required", 401);
  }

  _log(level, event, data) { try { this.logger.write(level, event, data); } catch { } }
}

function foundryRow(row) {
  if (!row) return null;
  const output = { ...row };
  for (const key of ["genome_json", "capabilities_json", "permissions_json", "budget_json", "manifest_json", "provider_metadata_json"]) {
    if (Object.prototype.hasOwnProperty.call(output, key)) {
      const clean = key.replace(/_json$/, "");
      output[clean] = parseJson(output[key], key.includes("capabilities") ? [] : {});
      delete output[key];
    }
  }
  return output;
}

function commandSpendExecutor(configuration) {
  if (!configuration) return null;
  let command;
  try { command = JSON.parse(configuration); } catch { throw new GovernanceError("CONFIG_INVALID", "CYVX_SPEND_COMMAND_JSON must be a JSON array", 500); }
  if (!Array.isArray(command) || !command.length || command.some((part) => typeof part !== "string" || !part)) {
    throw new GovernanceError("CONFIG_INVALID", "CYVX_SPEND_COMMAND_JSON must contain an executable and optional arguments", 500);
  }
  return (request) => {
    const result = spawnSync(command[0], command.slice(1), {
      input: `${JSON.stringify(request)}\n`, encoding: "utf8", shell: false,
      timeout: Number(process.env.CYVX_SPEND_TIMEOUT_MS || 30_000), maxBuffer: 1024 * 1024,
      env: { ...process.env, CYVX_FOUNDRY_ACTION: "spend_budget" }
    });
    if (result.error) throw new GovernanceError("SPEND_PROVIDER_FAILED", result.error.message, 502);
    if (result.status !== 0) throw new GovernanceError("SPEND_PROVIDER_FAILED", String(result.stderr || `Spend command exited ${result.status}`).slice(0, 2000), 502);
    let payload;
    try { payload = JSON.parse(String(result.stdout || "").trim()); }
    catch { throw new GovernanceError("SPEND_PROVIDER_FAILED", "Spend command did not return JSON", 502); }
    return payload;
  };
}

module.exports = {
  AgentFoundry,
  GrantCapabilityGateway,
  SENSITIVE_ACTIONS,
  commandSpendExecutor,
  hashPath
};
