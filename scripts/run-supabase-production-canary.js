#!/usr/bin/env node
"use strict";

const crypto = require("node:crypto");
const path = require("node:path");
const { bootstrap } = require("./bootstrap-cyvx-supabase");
const { SupabaseRuntime } = require("../core/integrations/supabase-runtime");
const { SupabaseServiceRuntime, randomPassword } = require("../core/integrations/supabase-service-runtime");
const { SupabaseAgentIdentityIssuer } = require("../core/integrations/supabase-agent-identity");
const { SupabasePersistenceAdapter, sha256, stableJson } = require("../core/integrations/supabase-persistence-adapter");

const root = path.resolve(__dirname, "..");

function id(prefix, runId) {
  return `${prefix}:${runId}`;
}

function hmac(key, value) {
  return crypto.createHmac("sha256", key).update(String(value)).digest("hex");
}

async function ensureGovernancePrincipal(service, organizationId, role, runId) {
  const email = `${role}-${sha256(`${organizationId}:${runId}`).slice(0, 20)}@governance.cyvx.invalid`;
  const password = randomPassword();
  const ensured = await service.ensureUser({
    email,
    password,
    appMetadata: { cyvx_identity_type: "governance", organization_id: organizationId, governance_role: role },
    userMetadata: { display_name: `CYVX ${role}` }
  });
  const client = service.createServiceClient();
  const member = await client.from("organization_members").upsert({
    organization_id: organizationId,
    user_id: ensured.user.id,
    role,
    active: true
  }, { onConflict: "organization_id,user_id" });
  if (member.error) throw member.error;
  const principal = await client.from("governance_principals").upsert({
    organization_id: organizationId,
    user_id: ensured.user.id,
    governance_role: role,
    active: true
  }, { onConflict: "organization_id,user_id,governance_role" });
  if (principal.error) throw principal.error;
  return ensured.user;
}

async function createIsolationOrganization(service, runId) {
  const email = `isolation-${runId}@canary.cyvx.invalid`;
  const password = randomPassword();
  const ensured = await service.ensureUser({
    email,
    password,
    appMetadata: { cyvx_identity_type: "canary-isolation" },
    userMetadata: { display_name: "CYVX Isolation Canary" }
  });
  const signedIn = await service.signInWithPassword(email, password);
  const client = service.createAccessTokenClient(signedIn.session.access_token);
  const slug = `cyvx-isolation-${runId.toLowerCase()}`.slice(0, 63);
  const created = await client.rpc("cyvx_create_organization", {
    org_name: `CYVX Isolation ${runId}`,
    org_slug: slug
  });
  if (created.error) throw created.error;
  return { organization: created.data, accessToken: signedIn.session.access_token, user: ensured.user };
}

async function runCanary(options = {}) {
  const env = options.env || process.env;
  const runtime = options.runtime || new SupabaseRuntime({ repoRoot: root, env, schemaCacheMs: 0 });
  const service = options.service || new SupabaseServiceRuntime({ repoRoot: root, env });
  const adapter = options.adapter || new SupabasePersistenceAdapter({ repoRoot: root, env, runtime, service });
  const issuer = options.issuer || new SupabaseAgentIdentityIssuer({ service });
  const schema = await runtime.assertCloudWritesReady({ force: true, timeoutMs: 15000 });

  const owner = await bootstrap({
    env,
    runtime,
    service,
    ownerEmail: options.ownerEmail || env.CYVX_OWNER_EMAIL,
    ownerPassword: options.ownerPassword || env.CYVX_OWNER_PASSWORD,
    organizationName: options.organizationName || env.CYVX_ORG_NAME || "CYVX",
    organizationSlug: options.organizationSlug || env.CYVX_ORG_SLUG || "cyvx"
  });
  const organizationId = owner.organization.id;
  const ownerUserId = owner.owner.user_id;
  const ownerToken = owner.access_token;
  const runId = `${Date.now().toString(36)}${crypto.randomBytes(3).toString("hex")}`;
  const signingKey = env.CYVX_CANARY_SIGNING_KEY || crypto.randomBytes(32).toString("hex");

  const supervisor = await ensureGovernancePrincipal(service, organizationId, "supervisor", runId);
  const boss = await ensureGovernancePrincipal(service, organizationId, "boss", runId);

  const parentAgentId = env.CYVX_PARENT_AGENT_ID || "cyvx-parent-agent";
  await adapter.registerParentAgent(ownerToken, {
    id: parentAgentId,
    organization_id: organizationId,
    name: "CYVX Parent Agent",
    agent_role: "foundry-parent",
    capabilities: ["mission_execution", "deploy_staging"],
    permissions: { cloud_writes: true, production_deploy: false },
    budget: { maximum_cost_usd: 0 },
    spec_hash: sha256(stableJson({ id: parentAgentId, role: "foundry-parent", version: 1 })),
    created_by: ownerUserId
  });
  const agentIdentity = await issuer.issue({ organizationId, agentId: parentAgentId });

  const missionId = id("canary-mission", runId);
  const artifactId = id("canary-artifact", runId);
  const evidenceId = id("canary-evidence", runId);
  const packageId = id("canary-package", runId);
  const supervisorReviewId = id("canary-supervisor-review", runId);
  const bossReviewId = id("canary-boss-review", runId);
  const grantId = id("canary-grant", runId);
  const actionId = id("canary-action", runId);
  const deploymentId = id("canary-deployment", runId);

  await adapter.createMission(ownerToken, {
    id: missionId,
    organization_id: organizationId,
    title: "Supabase governed production canary",
    objective: "Prove organization isolation, agent identity, evidence persistence, two-key approval, capability grant binding, and staging deployment records.",
    state: "running",
    risk_tier: 1,
    owner_agent_id: parentAgentId,
    expected_outputs: ["artifact", "evidence", "approved staging deployment"],
    acceptance_tests: ["tenant isolation", "grant binding", "audit persistence"],
    required_evidence: ["artifact hash", "deployment receipt"],
    created_by: ownerUserId
  });
  await adapter.assignAgent(ownerToken, {
    organization_id: organizationId,
    mission_id: missionId,
    agent_id: parentAgentId,
    assignment_role: "worker",
    permissions: { write_events: true, write_artifacts: true, write_evidence: true },
    assigned_by: ownerUserId
  });

  await adapter.appendMissionEvent(agentIdentity.access_token, {
    id: id("canary-event", runId),
    organization_id: organizationId,
    mission_id: missionId,
    agent_id: parentAgentId,
    event_type: "canary.started",
    correlation_id: runId,
    payload: { run_id: runId, schema_version: schema.applied_version },
    created_by: agentIdentity.auth_user_id
  });

  const artifactBody = Buffer.from(JSON.stringify({ run_id: runId, mission_id: missionId, proof: "CYVX Supabase canary" }));
  const artifact = await adapter.uploadArtifact(agentIdentity.access_token, {
    id: artifactId,
    organization_id: organizationId,
    mission_id: missionId,
    agent_id: parentAgentId,
    kind: "canary-proof",
    file_name: "proof.json",
    content_type: "application/json",
    metadata: { run_id: runId },
    created_by: agentIdentity.auth_user_id
  }, artifactBody);
  const evidence = await adapter.appendEvidence(agentIdentity.access_token, {
    id: evidenceId,
    organization_id: organizationId,
    mission_id: missionId,
    agent_id: parentAgentId,
    artifact_id: artifactId,
    evidence_type: "artifact_integrity",
    claim: "The governed agent persisted an immutable artifact under organization-scoped RLS.",
    payload: { artifact_sha256: artifact.sha256, storage_path: artifact.storage_path },
    created_by: agentIdentity.auth_user_id
  });
  await adapter.recordOutcome(agentIdentity.access_token, {
    id: id("canary-outcome", runId),
    organization_id: organizationId,
    mission_id: missionId,
    agent_id: parentAgentId,
    outcome_type: "canary_artifact_persisted",
    value_numeric: 1,
    unit: "proof",
    evidence_id: evidenceId,
    metadata: { run_id: runId }
  });

  const packagePayload = {
    mission_id: missionId,
    worker_id: parentAgentId,
    requested_action: "deploy_staging",
    artifact_sha256: artifact.sha256
  };
  await adapter.submitGovernancePackage({
    id: packageId,
    organization_id: organizationId,
    mission_id: missionId,
    worker_id: parentAgentId,
    status: "awaiting_approval",
    requested_action: "deploy_staging",
    risk_tier: 1,
    artifact_sha256: artifact.sha256,
    evidence_ids: [evidenceId],
    tests: [{ name: "artifact_integrity", passed: true }],
    rollback_plan: { action: "mark release rolled_back" },
    declared_risks: [],
    estimated_cost_usd: 0,
    payload: packagePayload
  });

  const supervisorPayloadHash = sha256(stableJson({ package_id: packageId, reviewer_id: supervisor.id, decision: "APPROVED" }));
  await adapter.recordGovernanceReview({
    id: supervisorReviewId,
    organization_id: organizationId,
    package_id: packageId,
    review_type: "supervisor",
    reviewer_id: supervisor.id,
    decision: "APPROVED",
    reason: "Artifact, RLS, evidence, and rollback checks passed.",
    findings: [],
    signature: hmac(signingKey, supervisorPayloadHash),
    signed_payload_hash: supervisorPayloadHash
  });
  const bossPayloadHash = sha256(stableJson({ package_id: packageId, reviewer_id: boss.id, decision: "AUTHORIZE" }));
  await adapter.recordGovernanceReview({
    id: bossReviewId,
    organization_id: organizationId,
    package_id: packageId,
    review_type: "boss",
    reviewer_id: boss.id,
    decision: "AUTHORIZE",
    reason: "The zero-cost reversible staging action advances the canary mission.",
    findings: [],
    signature: hmac(signingKey, bossPayloadHash),
    signed_payload_hash: bossPayloadHash
  });

  const issuedAt = new Date();
  const expiresAt = new Date(issuedAt.getTime() + 15 * 60 * 1000);
  await adapter.issueCapabilityGrant({
    id: grantId,
    organization_id: organizationId,
    package_id: packageId,
    mission_id: missionId,
    grantee_id: parentAgentId,
    capability: "deploy_staging",
    status: "active",
    maximum_cost_usd: 0,
    issued_at: issuedAt.toISOString(),
    expires_at: expiresAt.toISOString(),
    signature: hmac(signingKey, `${grantId}:${packageId}:${parentAgentId}:deploy_staging`)
  });
  const serviceClient = service.createServiceClient();
  const packageUpdate = await serviceClient.from("governance_packages").update({
    status: "approved",
    supervisor_review_id: supervisorReviewId,
    boss_review_id: bossReviewId,
    capability_grant_id: grantId,
    policy_decision: { decision: "ALLOW", schema_version: schema.applied_version }
  }).eq("organization_id", organizationId).eq("id", packageId);
  if (packageUpdate.error) throw packageUpdate.error;

  await adapter.recordFoundryAction({
    id: actionId,
    organization_id: organizationId,
    grant_id: grantId,
    package_id: packageId,
    mission_id: missionId,
    worker_id: parentAgentId,
    action: "deploy_staging",
    status: "succeeded",
    input_hash: sha256(stableJson({ artifact_sha256: artifact.sha256, environment: "staging" })),
    result_hash: sha256(stableJson({ release_id: id("canary-release", runId), status: "active" })),
    actual_cost_usd: 0,
    external_reference: `canary://${runId}`
  });
  const releaseId = id("canary-release", runId);
  const deployment = await adapter.recordDeployment({
    id: deploymentId,
    organization_id: organizationId,
    mission_id: missionId,
    grant_id: grantId,
    worker_id: parentAgentId,
    environment: "staging",
    app_id: "cyvx-governance-canary",
    release_id: releaseId,
    source_path: artifact.storage_path,
    release_path: `staging/cyvx-governance-canary/${releaseId}`,
    artifact_sha256: artifact.sha256,
    status: "active",
    manifest: { run_id: runId, reversible: true, network_exposure: false },
    created_by: ownerUserId
  });

  const isolation = await createIsolationOrganization(service, runId);
  const isolationClient = service.createAccessTokenClient(isolation.accessToken);
  const hiddenRead = await isolationClient.from("missions").select("id").eq("organization_id", organizationId).eq("id", missionId);
  if (hiddenRead.error) throw hiddenRead.error;
  if (hiddenRead.data.length !== 0) throw new Error("RLS tenant isolation failed: foreign mission was visible");
  const blockedWrite = await isolationClient.from("mission_events").insert({
    id: id("foreign-write", runId),
    organization_id: organizationId,
    mission_id: missionId,
    event_type: "isolation.violation",
    payload: {},
    payload_hash: sha256("{}"),
    created_by: isolation.user.id
  });
  if (!blockedWrite.error) throw new Error("RLS tenant isolation failed: foreign write was accepted");

  const proofQueries = await Promise.all([
    serviceClient.from("mission_events").select("id").eq("organization_id", organizationId).eq("mission_id", missionId),
    serviceClient.from("evidence_records").select("id").eq("organization_id", organizationId).eq("mission_id", missionId),
    serviceClient.from("governance_reviews").select("id,review_type").eq("organization_id", organizationId).eq("package_id", packageId),
    serviceClient.from("governance_capability_grants").select("id,capability,status").eq("organization_id", organizationId).eq("id", grantId),
    serviceClient.from("foundry_deployments").select("id,environment,status").eq("organization_id", organizationId).eq("id", deploymentId)
  ]);
  for (const query of proofQueries) if (query.error) throw query.error;
  if (proofQueries[2].data.length !== 2) throw new Error("Canary did not persist two independent governance reviews");
  if (proofQueries[4].data.length !== 1 || proofQueries[4].data[0].environment !== "staging") {
    throw new Error("Canary staging deployment proof is missing");
  }

  return {
    ok: true,
    run_id: runId,
    schema: { applied_version: schema.applied_version, ready: schema.ready },
    organization_id: organizationId,
    mission_id: missionId,
    parent_agent_id: parentAgentId,
    agent_token_version: agentIdentity.token_version,
    artifact: { id: artifact.id, sha256: artifact.sha256, storage_path: artifact.storage_path },
    evidence_id: evidence.id,
    package_id: packageId,
    reviews: [supervisorReviewId, bossReviewId],
    grant_id: grantId,
    deployment: { id: deployment.id, environment: deployment.environment, status: deployment.status },
    isolation: { foreign_read_rows: 0, foreign_write_blocked: true, second_organization_id: isolation.organization.id }
  };
}

async function main() {
  const result = await runCanary();
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`${JSON.stringify({ ok: false, error: error.code || "CANARY_FAILED", message: error.message })}\n`);
    process.exit(1);
  });
}

module.exports = { runCanary, ensureGovernancePrincipal, createIsolationOrganization };
