"use strict";

const crypto = require("node:crypto");
const { SupabaseRuntime } = require("./supabase-runtime");
const { SupabaseServiceRuntime } = require("./supabase-service-runtime");

function stableJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
}

function sha256(value) {
  return crypto.createHash("sha256").update(Buffer.isBuffer(value) ? value : String(value)).digest("hex");
}

function requireFields(value, fields, label) {
  for (const field of fields) {
    if (value[field] === undefined || value[field] === null || value[field] === "") {
      throw new TypeError(`${label}.${field} is required`);
    }
  }
}

function cleanFileName(value) {
  const name = String(value || "artifact.bin").replace(/[^A-Za-z0-9._-]/g, "-").slice(0, 180);
  return name || "artifact.bin";
}

function unwrap(result, operation) {
  if (result && result.error) {
    const error = new Error(`${operation} failed: ${result.error.message}`);
    error.code = result.error.code || "SUPABASE_WRITE_FAILED";
    error.status = Number(result.error.status || 500);
    error.cause = result.error;
    throw error;
  }
  return result ? result.data : null;
}

class SupabasePersistenceAdapter {
  constructor(options = {}) {
    this.runtime = options.runtime || new SupabaseRuntime(options);
    this.service = options.service || new SupabaseServiceRuntime(options);
    this.logger = options.logger || { write() {} };
  }

  async assertReady() {
    return this.runtime.assertCloudWritesReady({ force: true });
  }

  scoped(accessToken) {
    return this.service.createAccessTokenClient(accessToken);
  }

  privileged() {
    return this.service.createServiceClient();
  }

  async registerParentAgent(accessToken, agent) {
    await this.assertReady();
    requireFields(agent, ["id", "organization_id", "name", "spec_hash"], "agent");
    if (agent.parent_agent_id) throw new TypeError("registerParentAgent only accepts a root agent");
    const row = {
      status: "active",
      lineage_depth: 0,
      agent_role: "worker",
      genome: {},
      capabilities: [],
      permissions: {},
      budget: {},
      ...agent,
      parent_agent_id: null
    };
    const data = unwrap(await this.scoped(accessToken).from("agents").upsert(row, { onConflict: "id" }).select().single(), "register parent agent");
    this.logger.write("info", "supabase.agent_registered", { organization_id: row.organization_id, agent_id: row.id });
    return data;
  }

  async createMission(accessToken, mission) {
    await this.assertReady();
    requireFields(mission, ["id", "organization_id", "title", "objective"], "mission");
    const row = {
      state: "draft",
      risk_tier: 1,
      inputs: {},
      expected_outputs: [],
      acceptance_tests: [],
      required_evidence: [],
      budget: {},
      ...mission
    };
    return unwrap(await this.scoped(accessToken).from("missions").insert(row).select().single(), "create mission");
  }

  async assignAgent(accessToken, assignment) {
    await this.assertReady();
    requireFields(assignment, ["organization_id", "mission_id", "agent_id"], "assignment");
    const row = { assignment_role: "worker", status: "active", permissions: {}, ...assignment };
    return unwrap(await this.scoped(accessToken).from("mission_assignments").upsert(row, {
      onConflict: "organization_id,mission_id,agent_id"
    }).select().single(), "assign agent");
  }

  async appendMissionEvent(accessToken, event) {
    await this.assertReady();
    requireFields(event, ["id", "organization_id", "mission_id", "event_type"], "event");
    const payload = event.payload || {};
    const row = { ...event, payload, payload_hash: event.payload_hash || sha256(stableJson(payload)) };
    return unwrap(await this.scoped(accessToken).from("mission_events").insert(row).select().single(), "append mission event");
  }

  async uploadArtifact(accessToken, artifact, content) {
    await this.assertReady();
    requireFields(artifact, ["id", "organization_id", "mission_id", "kind"], "artifact");
    const bytes = Buffer.isBuffer(content) ? content : Buffer.from(String(content ?? ""));
    const fileName = cleanFileName(artifact.file_name || `${artifact.id}.bin`);
    const bucket = artifact.storage_bucket || "cyvx-artifacts";
    const path = artifact.storage_path || `${artifact.organization_id}/${artifact.mission_id}/${artifact.id}/${fileName}`;
    if (!path.startsWith(`${artifact.organization_id}/${artifact.mission_id}/`)) {
      throw new TypeError("Artifact storage_path must be scoped to organization_id/mission_id");
    }
    const client = this.scoped(accessToken);
    const upload = await client.storage.from(bucket).upload(path, bytes, {
      contentType: artifact.content_type || "application/octet-stream",
      upsert: false
    });
    unwrap(upload, "upload artifact content");
    const row = {
      id: artifact.id,
      organization_id: artifact.organization_id,
      mission_id: artifact.mission_id,
      agent_id: artifact.agent_id || null,
      kind: artifact.kind,
      storage_bucket: bucket,
      storage_path: path,
      content_type: artifact.content_type || "application/octet-stream",
      size_bytes: bytes.length,
      sha256: artifact.sha256 || sha256(bytes),
      metadata: artifact.metadata || {},
      created_by: artifact.created_by || null
    };
    try {
      return unwrap(await client.from("artifacts").insert(row).select().single(), "register artifact");
    } catch (error) {
      await client.storage.from(bucket).remove([path]).catch(() => undefined);
      throw error;
    }
  }

  async appendEvidence(accessToken, evidence) {
    await this.assertReady();
    requireFields(evidence, ["id", "organization_id", "mission_id", "evidence_type"], "evidence");
    const payload = evidence.payload || {};
    const payloadHash = evidence.payload_hash || sha256(stableJson(payload));
    const previousHash = evidence.previous_hash || null;
    const recordHash = evidence.record_hash || sha256(`${previousHash || "GENESIS"}:${payloadHash}:${evidence.id}`);
    const row = { ...evidence, payload, payload_hash: payloadHash, previous_hash: previousHash, record_hash: recordHash };
    return unwrap(await this.scoped(accessToken).from("evidence_records").insert(row).select().single(), "append evidence");
  }

  async recordOutcome(accessToken, outcome) {
    await this.assertReady();
    requireFields(outcome, ["id", "organization_id", "mission_id", "outcome_type"], "outcome");
    const row = { metadata: {}, ...outcome };
    return unwrap(await this.scoped(accessToken).from("outcomes").insert(row).select().single(), "record outcome");
  }

  async submitGovernancePackage(pkg) {
    await this.assertReady();
    requireFields(pkg, ["id", "organization_id", "mission_id", "worker_id", "status", "requested_action", "risk_tier", "artifact_sha256"], "package");
    const row = {
      evidence_ids: [], tests: [], rollback_plan: null, declared_risks: [], estimated_cost_usd: 0, payload: {}, ...pkg
    };
    return unwrap(await this.privileged().from("governance_packages").insert(row).select().single(), "submit governance package");
  }

  async recordGovernanceReview(review) {
    await this.assertReady();
    requireFields(review, ["id", "organization_id", "package_id", "review_type", "reviewer_id", "decision", "reason", "signature", "signed_payload_hash"], "review");
    return unwrap(await this.privileged().from("governance_reviews").insert({ findings: [], ...review }).select().single(), "record governance review");
  }

  async issueCapabilityGrant(grant) {
    await this.assertReady();
    requireFields(grant, ["id", "organization_id", "package_id", "mission_id", "grantee_id", "capability", "status", "expires_at", "signature"], "grant");
    return unwrap(await this.privileged().from("governance_capability_grants").insert({ maximum_cost_usd: 0, ...grant }).select().single(), "issue capability grant");
  }

  async recordFoundryAction(action) {
    await this.assertReady();
    requireFields(action, ["id", "organization_id", "grant_id", "package_id", "mission_id", "worker_id", "action", "status", "input_hash"], "foundryAction");
    return unwrap(await this.privileged().from("foundry_action_runs").insert({ attempts: 1, actual_cost_usd: 0, ...action }).select().single(), "record foundry action");
  }

  async recordDeployment(deployment) {
    await this.assertReady();
    requireFields(deployment, ["id", "organization_id", "mission_id", "grant_id", "worker_id", "environment", "app_id", "release_id", "source_path", "release_path", "artifact_sha256", "status"], "deployment");
    return unwrap(await this.privileged().from("foundry_deployments").insert({ manifest: {}, ...deployment }).select().single(), "record deployment");
  }

  async recordSpendReceipt(receipt) {
    await this.assertReady();
    requireFields(receipt, ["id", "organization_id", "mission_id", "grant_id", "worker_id", "idempotency_key", "vendor", "purpose", "amount_usd", "external_reference", "provider_status"], "receipt");
    return unwrap(await this.privileged().from("foundry_spend_receipts").insert({ currency: "USD", provider_metadata: {}, ...receipt }).select().single(), "record spend receipt");
  }
}

module.exports = {
  SupabasePersistenceAdapter,
  stableJson,
  sha256,
  requireFields,
  cleanFileName,
  unwrap
};
