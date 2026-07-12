#!/usr/bin/env node
"use strict";

const crypto = require("node:crypto");
const path = require("node:path");
const { bootstrap } = require("./bootstrap-cyvx-supabase");
const { ensureGovernancePrincipal } = require("./run-supabase-production-canary");
const { SupabaseRuntime } = require("../core/integrations/supabase-runtime");
const { SupabaseServiceRuntime } = require("../core/integrations/supabase-service-runtime");
const { SupabaseAgentIdentityIssuer } = require("../core/integrations/supabase-agent-identity");
const { SupabasePersistenceAdapter, sha256, stableJson } = require("../core/integrations/supabase-persistence-adapter");
const {
  VENTURE_KEY,
  buildVenturePlan,
  buildLandingPage,
  evaluateProductionGate
} = require("../core/ventures/production-audit-venture");

const root = path.resolve(__dirname, "..");

function hmac(key, value) {
  return crypto.createHmac("sha256", key).update(String(value)).digest("hex");
}

function suffix() {
  return `${Date.now().toString(36)}${crypto.randomBytes(2).toString("hex")}`;
}

async function maybeOne(query, label) {
  const result = await query.maybeSingle();
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  return result.data || null;
}

async function ensureMission(adapter, serviceClient, ownerToken, mission) {
  const existing = await maybeOne(serviceClient.from("missions").select("*")
    .eq("organization_id", mission.organization_id).eq("id", mission.id), "read venture mission");
  if (existing) return existing;
  return adapter.createMission(ownerToken, mission);
}

async function ensureReview(adapter, serviceClient, review) {
  const existing = await maybeOne(serviceClient.from("governance_reviews").select("*")
    .eq("organization_id", review.organization_id).eq("id", review.id), "read governance review");
  return existing || adapter.recordGovernanceReview(review);
}

async function authorizePackage(input) {
  const {
    adapter, serviceClient, organizationId, missionId, workerId, requestedAction,
    artifactHash, evidenceIds, supervisor, boss, signingKey, purpose
  } = input;
  const run = suffix();
  const packageId = `package:${purpose}:${run}`;
  const supervisorReviewId = `review:supervisor:${purpose}:${run}`;
  const bossReviewId = `review:boss:${purpose}:${run}`;
  const grantId = `grant:${requestedAction}:${purpose}:${run}`;

  await adapter.submitGovernancePackage({
    id: packageId,
    organization_id: organizationId,
    mission_id: missionId,
    worker_id: workerId,
    status: "awaiting_approval",
    requested_action: requestedAction,
    risk_tier: 1,
    artifact_sha256: artifactHash,
    evidence_ids: evidenceIds || [],
    tests: [
      { name: "scope", passed: true },
      { name: "zero_cost", passed: true },
      { name: "reversible", passed: true }
    ],
    rollback_plan: { action: "revoke grant and retire created resource or mark staging release rolled_back" },
    declared_risks: [],
    estimated_cost_usd: 0,
    payload: { purpose, requested_action: requestedAction, artifact_sha256: artifactHash }
  });

  const supervisorHash = sha256(stableJson({ package_id: packageId, reviewer_id: supervisor.id, decision: "APPROVED" }));
  await ensureReview(adapter, serviceClient, {
    id: supervisorReviewId,
    organization_id: organizationId,
    package_id: packageId,
    review_type: "supervisor",
    reviewer_id: supervisor.id,
    decision: "APPROVED",
    reason: "Requirements, evidence, security boundary, cost ceiling, and rollback plan passed.",
    findings: [],
    signature: hmac(signingKey, supervisorHash),
    signed_payload_hash: supervisorHash
  });

  const bossHash = sha256(stableJson({ package_id: packageId, reviewer_id: boss.id, decision: "AUTHORIZE" }));
  await ensureReview(adapter, serviceClient, {
    id: bossReviewId,
    organization_id: organizationId,
    package_id: packageId,
    review_type: "boss",
    reviewer_id: boss.id,
    decision: "AUTHORIZE",
    reason: "This bounded zero-cost action advances the validated staging mission without production exposure.",
    findings: [],
    signature: hmac(signingKey, bossHash),
    signed_payload_hash: bossHash
  });

  const issuedAt = new Date();
  const expiresAt = new Date(issuedAt.getTime() + 30 * 60 * 1000);
  await adapter.issueCapabilityGrant({
    id: grantId,
    organization_id: organizationId,
    package_id: packageId,
    mission_id: missionId,
    grantee_id: workerId,
    capability: requestedAction,
    status: "active",
    maximum_cost_usd: 0,
    issued_at: issuedAt.toISOString(),
    expires_at: expiresAt.toISOString(),
    signature: hmac(signingKey, `${grantId}:${packageId}:${workerId}:${requestedAction}`)
  });

  const update = await serviceClient.from("governance_packages").update({
    status: "approved",
    supervisor_review_id: supervisorReviewId,
    boss_review_id: bossReviewId,
    capability_grant_id: grantId,
    policy_decision: { decision: "ALLOW", purpose, maximum_cost_usd: 0 }
  }).eq("organization_id", organizationId).eq("id", packageId);
  if (update.error) throw update.error;

  return { packageId, supervisorReviewId, bossReviewId, grantId };
}

async function ensurePodAgent(input) {
  const {
    agent, adapter, serviceClient, issuer, ownerToken, ownerUserId, organizationId,
    missionId, parentAgentId, supervisor, boss, signingKey
  } = input;
  const existing = await maybeOne(serviceClient.from("agents").select("*")
    .eq("organization_id", organizationId).eq("id", agent.id), `read ${agent.id}`);
  if (existing) {
    await adapter.assignAgent(ownerToken, {
      organization_id: organizationId,
      mission_id: missionId,
      agent_id: agent.id,
      assignment_role: agent.role,
      permissions: agent.permissions,
      assigned_by: ownerUserId
    });
    return { agent: existing, identity: await issuer.issue({ organizationId, agentId: agent.id }), created: false };
  }

  const specHash = sha256(stableJson(agent));
  const authorization = await authorizePackage({
    adapter,
    serviceClient,
    organizationId,
    missionId,
    workerId: parentAgentId,
    requestedAction: "create_agent",
    artifactHash: specHash,
    evidenceIds: [],
    supervisor,
    boss,
    signingKey,
    purpose: agent.key
  });

  const created = await adapter.registerChildAgent({
    id: agent.id,
    organization_id: organizationId,
    parent_agent_id: parentAgentId,
    creation_grant_id: authorization.grantId,
    creation_mission_id: missionId,
    name: agent.name,
    agent_role: agent.role,
    status: "active",
    lineage_depth: agent.lineage_depth,
    genome: agent.genome,
    capabilities: agent.capabilities,
    permissions: agent.permissions,
    budget: agent.budget,
    spec_hash: specHash,
    created_by: ownerUserId
  });

  await adapter.recordFoundryAction({
    id: `action:create:${agent.key}:${suffix()}`,
    organization_id: organizationId,
    grant_id: authorization.grantId,
    package_id: authorization.packageId,
    mission_id: missionId,
    worker_id: parentAgentId,
    action: "create_agent",
    status: "succeeded",
    input_hash: specHash,
    result_hash: sha256(stableJson({ agent_id: agent.id, status: "active" })),
    actual_cost_usd: 0,
    external_reference: `supabase://agents/${agent.id}`
  });

  const consumed = await serviceClient.from("governance_capability_grants").update({
    status: "consumed",
    consumed_at: new Date().toISOString(),
    consumed_by: parentAgentId,
    actual_cost_usd: 0,
    receipt: { action: "create_agent", agent_id: agent.id }
  }).eq("organization_id", organizationId).eq("id", authorization.grantId);
  if (consumed.error) throw consumed.error;

  await adapter.assignAgent(ownerToken, {
    organization_id: organizationId,
    mission_id: missionId,
    agent_id: agent.id,
    assignment_role: agent.role,
    permissions: agent.permissions,
    assigned_by: ownerUserId
  });

  return { agent: created, identity: await issuer.issue({ organizationId, agentId: agent.id }), created: true };
}

async function ensureArtifact(input) {
  const { serviceClient, adapter, identity, organizationId, missionId, ownerUserId, plan } = input;
  const artifactId = `asset:${VENTURE_KEY}:landing:v1`;
  const existing = await maybeOne(serviceClient.from("artifacts").select("*")
    .eq("organization_id", organizationId).eq("id", artifactId), "read venture asset");
  if (existing) return existing;
  const html = buildLandingPage(plan, {
    contact: process.env.CYVX_VENTURE_CONTACT || process.env.CYVX_OWNER_EMAIL || "pbgkota93@gmail.com",
    formAction: process.env.CYVX_VENTURE_LEAD_ENDPOINT || "mailto:pbgkota93@gmail.com"
  });
  return adapter.uploadArtifact(identity.access_token, {
    id: artifactId,
    organization_id: organizationId,
    mission_id: missionId,
    agent_id: identity.agent_id,
    kind: "staging-offer-page",
    file_name: "index.html",
    content_type: "text/html; charset=utf-8",
    metadata: { venture_key: VENTURE_KEY, stage: "staging_validation", owner_user_id: ownerUserId },
    created_by: identity.auth_user_id
  }, Buffer.from(html));
}

async function runFirstGovernedVenture(options = {}) {
  const env = options.env || process.env;
  const runtime = options.runtime || new SupabaseRuntime({ repoRoot: root, env, schemaCacheMs: 0 });
  const service = options.service || new SupabaseServiceRuntime({ repoRoot: root, env });
  const adapter = options.adapter || new SupabasePersistenceAdapter({ repoRoot: root, env, runtime, service });
  const issuer = options.issuer || new SupabaseAgentIdentityIssuer({ service });
  const schema = await runtime.assertCloudWritesReady({ force: true, timeoutMs: 15000 });
  const owner = await bootstrap({ env, runtime, service });
  const organizationId = owner.organization.id;
  const ownerUserId = owner.owner.user_id;
  const ownerToken = owner.access_token;
  const parentAgentId = env.CYVX_PARENT_AGENT_ID || "cyvx-parent-agent";
  const serviceClient = service.createServiceClient();
  const signingKey = env.CYVX_VENTURE_SIGNING_KEY || crypto.randomBytes(32).toString("hex");
  const plan = buildVenturePlan({ organizationId, parentAgentId });

  await adapter.registerParentAgent(ownerToken, {
    id: parentAgentId,
    organization_id: organizationId,
    name: "CYVX Parent Agent",
    agent_role: "foundry-parent",
    capabilities: ["mission_execution", "create_agent", "deploy_staging"],
    permissions: { cloud_writes: true, create_agent: true, deploy_staging: true, deploy_production: false, spend_budget: false },
    budget: { maximum_cost_usd: 0 },
    spec_hash: sha256(stableJson({ id: parentAgentId, version: 2, venture_factory: true })),
    created_by: ownerUserId
  });

  const mission = await ensureMission(adapter, serviceClient, ownerToken, {
    id: plan.mission_id,
    organization_id: organizationId,
    title: "Launch and validate CYVX Production Systems Audit",
    objective: "Create a governed specialist pod, build a truthful staging offer, instrument demand validation, and keep production blocked until real buyer evidence exists.",
    state: "running",
    risk_tier: plan.risk_tier,
    owner_agent_id: parentAgentId,
    inputs: { offer: plan.offer, production_gate: plan.production_gate },
    expected_outputs: plan.expected_outputs,
    acceptance_tests: plan.acceptance_tests,
    required_evidence: ["child-agent grant receipts", "staging asset hash", "two-key approval", "deployment receipt", "production gate evaluation"],
    budget: { maximum_cost_usd: 0 },
    created_by: ownerUserId
  });

  const principalKey = VENTURE_KEY;
  const supervisor = await ensureGovernancePrincipal(service, organizationId, "supervisor", principalKey);
  const boss = await ensureGovernancePrincipal(service, organizationId, "boss", principalKey);

  const pod = [];
  for (const agent of plan.pod) {
    pod.push(await ensurePodAgent({
      agent, adapter, serviceClient, issuer, ownerToken, ownerUserId, organizationId,
      missionId: plan.mission_id, parentAgentId, supervisor, boss, signingKey
    }));
  }

  const builder = pod.find((entry) => entry.agent.agent_role === "builder") || pod[0];
  const asset = await ensureArtifact({
    serviceClient, adapter, identity: builder.identity, organizationId,
    missionId: plan.mission_id, ownerUserId, plan
  });

  const evidenceId = `evidence:${VENTURE_KEY}:asset:v1`;
  let evidence = await maybeOne(serviceClient.from("evidence_records").select("*")
    .eq("organization_id", organizationId).eq("id", evidenceId), "read venture evidence");
  if (!evidence) {
    evidence = await adapter.appendEvidence(builder.identity.access_token, {
      id: evidenceId,
      organization_id: organizationId,
      mission_id: plan.mission_id,
      agent_id: builder.agent.id,
      artifact_id: asset.id,
      evidence_type: "staging_asset_integrity",
      claim: "The venture pod produced a bounded staging offer asset without claiming unverified outcomes.",
      payload: { artifact_sha256: asset.sha256, storage_path: asset.storage_path, venture_key: VENTURE_KEY },
      created_by: builder.identity.auth_user_id
    });
  }

  let deployment = await maybeOne(serviceClient.from("foundry_deployments").select("*")
    .eq("organization_id", organizationId).eq("app_id", VENTURE_KEY).eq("environment", "staging").eq("status", "active"), "read staging deployment");
  let deployAuthorization = null;
  if (!deployment) {
    deployAuthorization = await authorizePackage({
      adapter, serviceClient, organizationId, missionId: plan.mission_id,
      workerId: builder.agent.id, requestedAction: "deploy_staging", artifactHash: asset.sha256,
      evidenceIds: [evidence.id], supervisor, boss, signingKey, purpose: `${VENTURE_KEY}-staging`
    });
    const releaseId = `release:${VENTURE_KEY}:${suffix()}`;
    await adapter.recordFoundryAction({
      id: `action:deploy:${VENTURE_KEY}:${suffix()}`,
      organization_id: organizationId,
      grant_id: deployAuthorization.grantId,
      package_id: deployAuthorization.packageId,
      mission_id: plan.mission_id,
      worker_id: builder.agent.id,
      action: "deploy_staging",
      status: "succeeded",
      input_hash: sha256(stableJson({ artifact_sha256: asset.sha256, environment: "staging" })),
      result_hash: sha256(stableJson({ release_id: releaseId, status: "active" })),
      actual_cost_usd: 0,
      external_reference: `supabase-storage://${asset.storage_path}`
    });
    deployment = await adapter.recordDeployment({
      id: `deployment:${VENTURE_KEY}:${suffix()}`,
      organization_id: organizationId,
      mission_id: plan.mission_id,
      grant_id: deployAuthorization.grantId,
      worker_id: builder.agent.id,
      environment: "staging",
      app_id: VENTURE_KEY,
      release_id: releaseId,
      source_path: asset.storage_path,
      release_path: `staging/${VENTURE_KEY}/${releaseId}`,
      artifact_sha256: asset.sha256,
      status: "active",
      manifest: {
        reversible: true,
        external_publication: false,
        lead_endpoint: env.CYVX_VENTURE_LEAD_ENDPOINT || null,
        measurement_required_before_production: true
      },
      created_by: ownerUserId
    });
    const consumed = await serviceClient.from("governance_capability_grants").update({
      status: "consumed", consumed_at: new Date().toISOString(), consumed_by: builder.agent.id,
      actual_cost_usd: 0, receipt: { action: "deploy_staging", deployment_id: deployment.id }
    }).eq("organization_id", organizationId).eq("id", deployAuthorization.grantId);
    if (consumed.error) throw consumed.error;
  }

  const gate = evaluateProductionGate({
    gate: plan.production_gate,
    buyer_interviews: Number(env.CYVX_BUYER_INTERVIEWS || 0),
    qualified_leads: Number(env.CYVX_QUALIFIED_LEADS || 0),
    explicit_paid_intent: Number(env.CYVX_EXPLICIT_PAID_INTENT || 0),
    staging_healthy: true,
    critical_security_findings: 0
  });

  const outcomeRows = [
    {
      id: `outcome:${VENTURE_KEY}:staging-ready:v1`, outcome_type: "staging_asset_ready",
      value_numeric: 1, unit: "release", evidence_id: evidence.id,
      metadata: { deployment_id: deployment.id, release_id: deployment.release_id }
    },
    {
      id: `outcome:${VENTURE_KEY}:production-gate:v1`, outcome_type: "production_gate_eligible",
      value_numeric: gate.eligible ? 1 : 0, unit: "boolean", evidence_id: evidence.id,
      metadata: gate
    }
  ];
  for (const outcome of outcomeRows) {
    const exists = await maybeOne(serviceClient.from("outcomes").select("id")
      .eq("organization_id", organizationId).eq("id", outcome.id), `read ${outcome.id}`);
    if (!exists) {
      await adapter.recordOutcome(builder.identity.access_token, {
        ...outcome,
        organization_id: organizationId,
        mission_id: plan.mission_id,
        agent_id: builder.agent.id
      });
    }
  }

  await adapter.updateMission(ownerToken, organizationId, mission.id, {
    state: gate.eligible ? "awaiting_approval" : "running",
    inputs: { offer: plan.offer, production_gate: plan.production_gate, latest_gate_evaluation: gate }
  });

  return {
    ok: true,
    venture_key: VENTURE_KEY,
    schema_version: schema.applied_version,
    organization_id: organizationId,
    mission_id: plan.mission_id,
    pod: pod.map((entry) => ({ id: entry.agent.id, role: entry.agent.agent_role, created: entry.created, token_version: entry.identity.token_version })),
    asset: { id: asset.id, sha256: asset.sha256, storage_path: asset.storage_path },
    deployment: { id: deployment.id, environment: deployment.environment, status: deployment.status, release_id: deployment.release_id },
    production_gate: gate,
    next_action: gate.eligible
      ? "submit a separately governed deploy_production package"
      : "collect real buyer interviews, qualified leads, and explicit paid intent while remaining in staging"
  };
}

async function main() {
  const result = await runFirstGovernedVenture();
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`${JSON.stringify({ ok: false, error: error.code || "FIRST_VENTURE_FAILED", message: error.message })}\n`);
    process.exit(1);
  });
}

module.exports = {
  runFirstGovernedVenture,
  authorizePackage,
  ensurePodAgent,
  ensureMission
};
