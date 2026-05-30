"use strict";

const { GitHubIntegration } = require('./github');

async function buildGithubProofCase(platform, input = {}) {
  const github = input.github instanceof GitHubIntegration ? input.github : new GitHubIntegration(input.githubOptions || input);
  const snapshot = await github.repositorySnapshot(input);
  const health = github.repositoryHealthFromSnapshot(snapshot);
  const repository = snapshot.repository;
  const repoKey = repository.full_name;
  const repoTitle = repository.full_name + ' repository';
  const observation = platform.createObservation({
    title: 'GitHub repository observation: ' + repoKey,
    source: 'github',
    subject_id: repoKey,
    confidence: health.confidence,
    observed_state: buildObservedState(repository, snapshot, health),
    observed_change: buildObservedChange(health),
    evidence: buildEvidence(snapshot),
    related_entity_ids: [repoKey],
    metadata: { source: 'github', repository: repoKey },
  });

  const criterion = ensureCriterion(platform, repository, health, observation);
  const realityObject = ensureRealityObject(platform, repository, snapshot, health, observation);
  const significanceRecord = platform.generateSignificance({
    criterion_id: criterion.id,
    reality_object_id: realityObject.id,
    evidence: [observation],
    rationale: health.recommendation,
    confidence: health.confidence,
    metadata: { source: 'github', repository: repoKey },
  });

  const recommendation = platform.createRecommendation({
    title: 'Repository health recommendation: ' + repoKey,
    recommendation_type: 'repository_health',
    target_id: repoKey,
    source_ids: [observation.id, significanceRecord.id],
    summary: health.recommendation,
    rationale: health.summary,
    expected_impact: { capability: 0.2, trust: 0.15, roi: 0.12 },
    confidence: health.confidence,
    metadata: { source: 'github', repository: repoKey, health_score: health.score },
  });

  const intervention = platform.createIntervention({
    title: 'Triage repository health: ' + repoKey,
    summary: health.recommendation,
    significance_record_ids: [significanceRecord.id],
    target_reality_object_id: realityObject.id,
    related_entity_ids: [repoKey],
    expected_delta_reduction: round3(Math.max(0.05, (100 - health.score) / 100)),
    cost: round3(Math.max(1, health.workflow_runs + health.issue_backlog)),
    risk: round3(health.signal === 'at-risk' ? 0.8 : health.signal === 'watch' ? 0.5 : 0.25),
    reversible: true,
    requires_approval: true,
    autonomy_level: 2,
    policy_status: 'review',
    governance_status: 'review',
    expected_impact: { cost: round3(Math.max(1, health.issue_backlog)), value: round3(health.score), risk: round3(1 - health.confidence), capability: 0.2 },
    resource_requirements: { attention: 1, triage: 1 },
    expected_outcome: health.predicted_outcome,
    confidence_source: 'github',
    confidence: health.confidence,
    confidence_contributors: health.top_contributors,
    metadata: { source: 'github', repository: repoKey, health_score: health.score },
  });

  const mission = platform.createMission({
    title: 'Repository health mission: ' + repoKey,
    objective: 'Convert live GitHub state into an actionable proof loop for ' + repoKey,
    objective_id: null,
    target_entity_ids: [realityObject.id],
    confidence: health.confidence,
    trust_score: health.confidence,
    risk: round3(1 - health.confidence),
    autonomy_level: 2,
    governance: { approval_required: true, operator_override: true, policy_status: 'review', reversible: true },
    stage: 'discovered',
    status: 'draft',
    significance_record_id: significanceRecord.id,
    intervention_id: intervention.id,
    decision_id: null,
    evidence: [observation.id],
    metadata: { source: 'github', repository: repoKey, health_score: health.score },
    expected_outcome: health.predicted_outcome,
  });

  const agent = platform.agents().find((item) => String(item.metadata && item.metadata.source || '').toLowerCase() === 'github') || platform.createAgent({
    name: 'GitHub repository analyst',
    role: 'repository analyst',
    status: 'idle',
    trust_score: health.confidence,
    metadata: { source: 'github', repository: repoKey },
  });

  const assignment = platform.assignMission({
    mission_id: mission.id,
    actor_type: 'agent',
    actor_id: agent.id,
    resource_ids: [],
    trust_score: health.confidence,
    capability_fit: health.score / 100,
    reason: health.recommendation,
  });

  const queueItem = platform.enqueueMission({
    mission_id: mission.id,
    actor_id: agent.id,
    resource_ids: [],
    priority: 0.9,
    reason: health.recommendation,
    state: 'queued',
  });

  platform.updateMission(mission.id, { stage: 'running', status: 'running', assigned_actor_id: agent.id, assigned_actor_type: 'agent' }, 'mission.running');

  const completion = platform.runQueuedMission({
    queue_item_id: queueItem.id,
    actual_result: health.summary,
    predicted_outcome: health.predicted_outcome,
    actual_outcome: health.actual_outcome,
    prediction_error: round3(1 - health.confidence),
    prediction_variance: round3(Math.abs((health.predicted_outcome.repository_health_score || 0) - (health.actual_outcome.repository_health_score || 0))),
    lesson: 'Repository telemetry is live and measurable against GitHub state.',
    future_recommendation: health.recommendation,
    capability_impact: round3(health.score / 100),
    trust_impact: round3(health.confidence - 0.5),
    risk_delta: round3((health.score - 50) / 100),
    cir_impact: round3(health.score / 100),
    economic_impact: { cost: round3(Math.max(1, health.issue_backlog + health.workflow_runs)), savings: round3(Math.max(0, 100 - health.score)), value: round3(health.score), roi: round3(Math.max(0.1, health.score / 25)) },
    evidence: [observation, significanceRecord],
  });

  const trust = platform.createTrust({
    subject_type: 'repository',
    subject_id: repoKey,
    trust_score: round3(Math.max(0, 1 - (completion.outcome.prediction_error != null ? completion.outcome.prediction_error : 0))),
    trust_trend: round3((health.score - 50) / 100),
    trust_confidence: health.confidence,
    trust_source: 'github',
    trust_reasons: [health.signal, health.recommendation],
    confidence_error: completion.outcome.prediction_error,
    prediction_error: completion.outcome.prediction_error,
    trust_history: [{
      at: new Date().toISOString(),
      predicted: completion.outcome.predicted_outcome,
      actual: completion.outcome.actual_outcome,
      prediction_error: completion.outcome.prediction_error,
      prediction_variance: completion.outcome.prediction_variance,
      calibration: round3(Math.max(0, 1 - completion.outcome.prediction_error)),
    }],
  });

  const latestRecommendation = platform.recommendations()[0] || recommendation;
  const latestPattern = platform.patterns()[0] || null;
  const report = platform.createReport({
    title: 'GitHub proof report: ' + repoKey,
    scope: 'repository-proof',
    summary: health.summary,
    findings: [
      'Repository health score: ' + String(health.score),
      'Build status: ' + String(health.build_status),
      'Open issues: ' + String(health.issue_backlog),
      'Open PRs: ' + String(health.open_pr_count),
      'Workflow failures: ' + String(health.workflow_failures),
      'Commit velocity (30d): ' + String(health.commits_30d),
    ],
    recommendations: [health.recommendation],
    metrics: {
      repository_health_score: health.score,
      build_status: health.build_status,
      issue_backlog: health.issue_backlog,
      open_pr_count: health.open_pr_count,
      workflow_failures: health.workflow_failures,
      commit_velocity_30d: health.commits_30d,
      prediction_error: completion.outcome.prediction_error,
      prediction_variance: completion.outcome.prediction_variance,
    },
    related_mission_id: mission.id,
    source_ids: [observation.id, significanceRecord.id, intervention.id, completion.outcome.id],
  });

  const proof = platform.proof();
  const cir = platform.cir();

  return {
    repository: repository,
    repositories_observed: [repository.full_name],
    repository_health: health,
    observation,
    significanceRecord,
    recommendation: latestRecommendation,
    intervention,
    mission,
    assignment,
    queueItem,
    outcome: completion.outcome,
    learningRecord: completion.knowledgeRecord,
    trust,
    pattern: latestPattern,
    report,
    proof,
    cir,
    prediction_accuracy_baseline: round3(Math.max(0, 1 - (completion.outcome.prediction_error != null ? completion.outcome.prediction_error : 0))),
    observations_generated: 1,
    significance_records_generated: 1,
    interventions_generated: 1,
    learning_records_generated: 1,
    cir_impact: round3(cir.summary && cir.summary.score != null ? cir.summary.score : 0),
    remaining_proof_gaps: summarizeProofGaps(health),
    external_reality_signal: true,
  };
}

function ensureCriterion(platform, repository, health, observation) {
  const existing = (platform.criteria() || []).find((item) => item.metadata && item.metadata.repository === repository.full_name);
  if (existing) return existing;
  return platform.createCriterion({
    title: 'GitHub repository health criterion: ' + repository.full_name,
    description: 'Maintain healthy GitHub repository operations for ' + repository.full_name,
    priority: 5,
    protected: true,
    preferred_state: {
      build_status: 'passing',
      issue_backlog: 0,
      open_pr_age_days: 0,
      workflow_failures: 0,
      commit_velocity_30d: Math.max(health.commits_30d, 4),
    },
    impermissible_state: {
      build_status: 'failing',
      issue_backlog: 20,
      workflow_failures: 5,
    },
    scoring_policy: { method: 'weighted', weight: 1 },
    confidence: health.confidence,
    metadata: { source: 'github', repository: repository.full_name, observation_id: observation.id },
    related_entity_ids: [repository.full_name],
  });
}

function ensureRealityObject(platform, repository, snapshot, health, observation) {
  const existing = (platform.realityObjects() || []).find((item) => item.metadata && item.metadata.repository === repository.full_name);
  if (existing) return existing;
  return platform.createRealityObject({
    title: 'GitHub repository: ' + repository.full_name,
    reality_type: 'repository',
    state: buildObservedState(repository, snapshot, health),
    resources: {
      contributors: snapshot.contributors.length,
      commits_30d: health.commits_30d,
      issues: health.issue_backlog,
      pull_requests: health.open_pr_count,
    },
    constraints: [health.recommendation],
    observations: [observation],
    confidence: health.confidence,
    metadata: { source: 'github', repository: repository.full_name },
    related_entity_ids: [repository.full_name],
  });
}

function buildObservedState(repository, snapshot, health) {
  return {
    repository: {
      full_name: repository.full_name,
      default_branch: repository.default_branch,
      description: repository.description,
      html_url: repository.html_url,
      language: repository.language,
      topics: repository.topics,
      archived: repository.archived,
      fork: repository.fork,
    },
    health: {
      score: health.score,
      rating: health.rating,
      signal: health.signal,
      build_status: health.build_status,
      issue_backlog: health.issue_backlog,
      open_pr_age_days: health.open_pr_age_days,
      workflow_failures: health.workflow_failures,
      commits_30d: health.commits_30d,
      contributors: health.contributors,
    },
    commits: snapshot.commits.slice(0, 5),
    issues: snapshot.issues.slice(0, 5),
    pull_requests: snapshot.pullRequests.slice(0, 5),
    workflow_runs: snapshot.workflowRuns.slice(0, 5),
    contributors: snapshot.contributors.slice(0, 5),
  };
}

function buildObservedChange(health) {
  return {
    build_status: health.build_status,
    repository_health_score: health.score,
    issue_backlog: health.issue_backlog,
    open_pr_age_days: health.open_pr_age_days,
    workflow_failures: health.workflow_failures,
    commit_velocity_30d: health.commits_30d,
  };
}

function buildEvidence(snapshot) {
  const commits = snapshot.commits.slice(0, 3).map((item) => ({ id: item.sha, type: 'commit', title: item.message, html_url: item.html_url, committed_at: item.committed_at }));
  const issues = snapshot.issues.slice(0, 3).map((item) => ({ id: 'issue-' + item.number, type: 'issue', title: item.title, html_url: item.html_url, created_at: item.created_at }));
  const prs = snapshot.pullRequests.slice(0, 3).map((item) => ({ id: 'pr-' + item.number, type: 'pull_request', title: item.title, html_url: item.html_url, created_at: item.created_at }));
  const runs = snapshot.workflowRuns.slice(0, 3).map((item) => ({ id: 'run-' + item.id, type: 'workflow_run', title: item.name || item.event, html_url: item.html_url, created_at: item.created_at, conclusion: item.conclusion }));
  return commits.concat(issues, prs, runs);
}

function summarizeProofGaps(health) {
  const gaps = [];
  if (health.build_status !== 'passing') gaps.push('workflow-build');
  if (health.issue_backlog > 0) gaps.push('issue-backlog');
  if (health.open_pr_count > 0) gaps.push('stale-prs');
  if (health.workflow_failures > 0) gaps.push('workflow-failures');
  if (health.commits_30d < 4) gaps.push('commit-velocity');
  return gaps;
}

function round3(value) {
  return Number(Number(value || 0).toFixed(3));
}

module.exports = { buildGithubProofCase };
