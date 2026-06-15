"use strict";

function mapGitHubEvent(input = {}) {
  const event = String(input.event || "unknown");
  const deliveryId = requireValue(input.delivery_id, "delivery_id");
  const payload = input.payload && typeof input.payload === "object" ? input.payload : {};
  const platform = input.platform;
  const action = payload.action || null;
  const repository = repositorySnapshot(payload.repository);
  const provenance = buildProvenance({ event, action, deliveryId, payload, repository });
  const created = [];

  if (event === "ping") {
    created.push(record("observation", invoke(platform, "createObservation", {
      id: `github-ping-${deliveryId}`,
      title: `GitHub App ping received${payload.hook && payload.hook.name ? `: ${payload.hook.name}` : ""}`,
      source: "github.webhook",
      timestamp: new Date().toISOString(),
      confidence: 1,
      evidence: compact([payload.hook && payload.hook.url]),
      subject_id: payload.hook && payload.hook.app_id || "github-app",
      observed_state: { zen: payload.zen || null, hook_id: payload.hook_id || null },
      observed_change: { status: "reachable" },
      metadata: provenance,
    })));
  } else if (event === "installation") {
    const installation = payload.installation || {};
    created.push(record("capability", invoke(platform, "createCapability", {
      id: `github-installation-${installation.id || deliveryId}`,
      title: `GitHub installation ${action || "changed"}: ${installation.account && installation.account.login || installation.id || "unknown"}`,
      description: "GitHub App installation grants CYVX repository observation and controlled execution capability.",
      status: action === "deleted" || action === "suspend" ? "inactive" : "active",
      type: "github_app_installation",
      confidence: 0.99,
      evidence: compact([installation.html_url]),
      linked_entity_ids: compact([installation.account && installation.account.login]),
      value_generated: 1,
      cost_to_create: 0,
      source: "github.webhook",
      metadata: Object.assign({}, provenance, {
        installation_id: installation.id || provenance.installation_id,
        repository_selection: installation.repository_selection || null,
        permissions: installation.permissions || {},
        events: installation.events || [],
      }),
    })));
  } else if (event === "installation_repositories") {
    const installation = payload.installation || {};
    created.push(record("capability", invoke(platform, "createCapability", {
      id: `github-repository-capability-${deliveryId}`,
      title: `GitHub repository access ${action || "changed"}`,
      description: "CYVX GitHub repository access selection changed.",
      status: "active",
      type: "github_repository_access",
      confidence: 0.99,
      evidence: [],
      linked_entity_ids: compact([
        ...repositoryNames(payload.repositories_added),
        ...repositoryNames(payload.repositories_removed),
      ]),
      value_generated: Array.isArray(payload.repositories_added) ? payload.repositories_added.length : 0,
      cost_to_create: 0,
      source: "github.webhook",
      metadata: Object.assign({}, provenance, {
        installation_id: installation.id || provenance.installation_id,
        repositories_added: repositoryNames(payload.repositories_added),
        repositories_removed: repositoryNames(payload.repositories_removed),
      }),
    })));
  } else if (event === "push") {
    created.push(record("observation", invoke(platform, "createObservation", {
      id: `github-observation-${deliveryId}`,
      title: `GitHub push: ${repository.full_name || "unknown repository"}`,
      source: "github.webhook",
      timestamp: payload.head_commit && payload.head_commit.timestamp || new Date().toISOString(),
      confidence: 0.99,
      evidence: compact([payload.compare, payload.head_commit && payload.head_commit.url]),
      subject_id: repository.full_name || repository.id,
      observed_state: {
        repository,
        ref: payload.ref || null,
        before: payload.before || null,
        after: payload.after || null,
      },
      observed_change: {
        commit_count: Array.isArray(payload.commits) ? payload.commits.length : 0,
        created: Boolean(payload.created),
        deleted: Boolean(payload.deleted),
        forced: Boolean(payload.forced),
      },
      metadata: provenance,
    })));
  } else if (event === "issues") {
    mapIssueEvent({ action, created, deliveryId, payload, platform, provenance, repository });
  } else if (event === "pull_request") {
    mapPullRequestEvent({ action, created, deliveryId, payload, platform, provenance, repository });
  } else if (event === "pull_request_review") {
    const review = payload.review || {};
    created.push(record("decision", invoke(platform, "createDecision", {
      id: `github-review-decision-${deliveryId}`,
      title: `PR review ${review.state || action || "submitted"}: ${payload.pull_request && payload.pull_request.title || "pull request"}`,
      status: review.state || action || "submitted",
      confidence: 0.98,
      evidence: compact([review.html_url, payload.pull_request && payload.pull_request.html_url]),
      related_entity_ids: compact([repository.full_name || repository.id]),
      rationale: review.body || `GitHub pull request review state: ${review.state || action || "submitted"}`,
      recommendation: review.state === "approved" ? "Proceed when required checks and policy gates pass." : "Resolve review feedback before merge.",
      source: "github.webhook",
      metadata: provenance,
    })));
  } else if (event === "issue_comment") {
    const comment = payload.comment || {};
    created.push(record("decision", invoke(platform, "createDecision", {
      id: `github-comment-decision-${deliveryId}`,
      title: `GitHub comment on ${payload.issue && payload.issue.pull_request ? "pull request" : "issue"} #${payload.issue && payload.issue.number || "?"}`,
      status: action || "created",
      confidence: 0.85,
      evidence: compact([comment.html_url]),
      related_entity_ids: compact([repository.full_name || repository.id]),
      rationale: comment.body || "GitHub human feedback received.",
      recommendation: "Classify the feedback and update the related mission or constraint.",
      source: "github.webhook",
      metadata: provenance,
    })));
  } else if (event === "workflow_run") {
    mapWorkflowRun({ created, deliveryId, payload, platform, provenance, repository });
  } else if (event === "check_run") {
    mapCheck({ created, deliveryId, payload, platform, provenance, repository, type: "check_run" });
  } else if (event === "check_suite") {
    mapCheck({ created, deliveryId, payload, platform, provenance, repository, type: "check_suite" });
  }

  return {
    delivery_id: deliveryId,
    event,
    action,
    repository,
    created,
    ignored: created.length === 0,
    ignored_reason: created.length === 0 ? "event has no mapped CYVX primitive" : null,
  };
}

function mapIssueEvent({ action, created, deliveryId, payload, platform, provenance, repository }) {
  const issue = payload.issue || {};
  if (action === "closed") {
    created.push(record("outcome", invoke(platform, "recordOutcome", {
      id: `github-issue-outcome-${deliveryId}`,
      title: `Closed issue #${issue.number || "?"}: ${issue.title || "issue"}`,
      status: "verified",
      source: "github.webhook",
      confidence: 0.97,
      evidence: compact([issue.html_url]),
      entity_ids: compact([repository.full_name || repository.id]),
      predicted_outcome: { state: "closed" },
      actual_outcome: {
        state: issue.state || "closed",
        state_reason: issue.state_reason || null,
        closed_at: issue.closed_at || null,
      },
      metadata: provenance,
    })));
    return;
  }

  created.push(record("constraint", invoke(platform, "createConstraint", {
    id: `github-constraint-${deliveryId}`,
    title: `GitHub issue #${issue.number || "?"}: ${issue.title || action || "issue event"}`,
    description: issue.body || issue.html_url || "GitHub issue requires attention.",
    status: issue.state || "open",
    state: issue.state || "open",
    confidence: 0.98,
    severity: inferIssueSeverity(issue),
    entity_ids: compact([repository.full_name || repository.id]),
    evidence: compact([issue.html_url]),
    source: "github.webhook",
    metadata: provenance,
  })));
}

function mapPullRequestEvent({ action, created, deliveryId, payload, platform, provenance, repository }) {
  const pullRequest = payload.pull_request || {};
  if (action === "closed" && pullRequest.merged) {
    created.push(record("outcome", invoke(platform, "recordOutcome", {
      id: `github-outcome-${deliveryId}`,
      title: `Merged PR #${pullRequest.number || "?"}: ${pullRequest.title || "pull request"}`,
      status: "verified",
      source: "github.webhook",
      confidence: 0.99,
      evidence: compact([pullRequest.html_url, pullRequest.merge_commit_sha && repository.html_url && `${repository.html_url}/commit/${pullRequest.merge_commit_sha}`]),
      entity_ids: compact([repository.full_name || repository.id]),
      predicted_outcome: { state: "merged" },
      actual_outcome: {
        state: "merged",
        merge_commit_sha: pullRequest.merge_commit_sha || null,
        additions: numberOrNull(pullRequest.additions),
        deletions: numberOrNull(pullRequest.deletions),
        changed_files: numberOrNull(pullRequest.changed_files),
      },
      metadata: provenance,
    })));
    return;
  }

  if (["opened", "reopened", "synchronize", "ready_for_review"].includes(action)) {
    created.push(record("mission", invoke(platform, "createMission", {
      id: `github-pr-mission-${pullRequest.id || deliveryId}`,
      title: `PR #${pullRequest.number || "?"}: ${pullRequest.title || "pull request"}`,
      description: pullRequest.body || "Review, validate, and safely land the proposed repository intervention.",
      status: pullRequest.draft ? "draft" : "active",
      stage: action === "ready_for_review" ? "review" : "implementation",
      confidence: 0.95,
      risk: pullRequest.draft ? 0.35 : 0.25,
      evidence: compact([pullRequest.html_url]),
      target_entity_ids: compact([repository.full_name || repository.id]),
      success_metric: "Required reviews and checks pass; merged change produces a measured outcome.",
      source: "github.webhook",
      metadata: provenance,
    })));
  } else if (action === "closed" && !pullRequest.merged) {
    created.push(record("observation", invoke(platform, "createObservation", {
      id: `github-pr-closed-${deliveryId}`,
      title: `Closed unmerged PR #${pullRequest.number || "?"}: ${pullRequest.title || "pull request"}`,
      source: "github.webhook",
      timestamp: pullRequest.closed_at || new Date().toISOString(),
      confidence: 0.99,
      evidence: compact([pullRequest.html_url]),
      subject_id: repository.full_name || repository.id,
      observed_state: { state: "closed", merged: false },
      observed_change: { intervention_abandoned: true },
      metadata: provenance,
    })));
  }
}

function mapWorkflowRun({ created, deliveryId, payload, platform, provenance, repository }) {
  const workflow = payload.workflow_run || {};
  if (isFailure(workflow.conclusion)) {
    created.push(record("constraint", invoke(platform, "createConstraint", {
      id: `github-workflow-constraint-${deliveryId}`,
      title: `GitHub workflow failed: ${workflow.name || workflow.id || "workflow"}`,
      description: workflow.html_url || "GitHub Actions workflow failed.",
      status: "open",
      state: "open",
      confidence: 0.99,
      severity: workflow.conclusion === "failure" ? "high" : "medium",
      entity_ids: compact([repository.full_name || repository.id]),
      evidence: compact([workflow.html_url]),
      source: "github.webhook",
      metadata: provenance,
    })));
  } else if (workflow.conclusion === "success") {
    created.push(record("observation", invoke(platform, "createObservation", {
      id: `github-workflow-observation-${deliveryId}`,
      title: `GitHub workflow succeeded: ${workflow.name || workflow.id || "workflow"}`,
      source: "github.webhook",
      confidence: 0.99,
      evidence: compact([workflow.html_url]),
      subject_id: repository.full_name || repository.id,
      observed_state: { repository, workflow_id: workflow.id || null, conclusion: workflow.conclusion },
      observed_change: { status: "verified_success" },
      metadata: provenance,
    })));
  }
}

function mapCheck({ created, deliveryId, payload, platform, provenance, repository, type }) {
  const check = type === "check_suite" ? payload.check_suite || {} : payload.check_run || {};
  if (isFailure(check.conclusion)) {
    created.push(record("constraint", invoke(platform, "createConstraint", {
      id: `github-${type}-constraint-${deliveryId}`,
      title: `GitHub ${type.replace("_", " ")} failed: ${check.name || check.id || "check"}`,
      description: check.html_url || `GitHub ${type.replace("_", " ")} failed.`,
      status: "open",
      state: "open",
      confidence: 0.99,
      severity: "high",
      entity_ids: compact([repository.full_name || repository.id]),
      evidence: compact([check.html_url]),
      source: "github.webhook",
      metadata: provenance,
    })));
  } else if (check.conclusion === "success") {
    created.push(record("observation", invoke(platform, "createObservation", {
      id: `github-${type}-proof-${deliveryId}`,
      title: `GitHub ${type.replace("_", " ")} passed: ${check.name || check.id || "check"}`,
      source: "github.webhook",
      timestamp: check.completed_at || new Date().toISOString(),
      confidence: 0.99,
      evidence: compact([check.html_url]),
      subject_id: repository.full_name || repository.id,
      observed_state: { conclusion: "success", head_sha: check.head_sha || null },
      observed_change: { proof_verified: true },
      metadata: provenance,
    })));
  }
}

function buildProvenance({ event, action, deliveryId, payload, repository }) {
  return {
    provider: "github",
    delivery_id: deliveryId,
    event,
    action,
    installation_id: payload.installation && payload.installation.id || null,
    repository_id: repository.id,
    repository: repository.full_name,
    actor: payload.sender && payload.sender.login || null,
    source_url: sourceUrl(payload),
    source_object_id: sourceObjectId(event, payload),
    commit_sha: sourceCommitSha(event, payload),
    received_at: new Date().toISOString(),
    confidence: 0.99,
  };
}

function repositorySnapshot(repository = {}) {
  return {
    id: repository.id || null,
    full_name: repository.full_name || repository.name || null,
    html_url: repository.html_url || null,
    default_branch: repository.default_branch || null,
    private: repository.private == null ? null : Boolean(repository.private),
  };
}

function sourceUrl(payload) {
  return payload.pull_request && payload.pull_request.html_url ||
    payload.review && payload.review.html_url ||
    payload.comment && payload.comment.html_url ||
    payload.issue && payload.issue.html_url ||
    payload.workflow_run && payload.workflow_run.html_url ||
    payload.check_run && payload.check_run.html_url ||
    payload.check_suite && payload.check_suite.html_url ||
    payload.compare ||
    payload.repository && payload.repository.html_url ||
    null;
}

function sourceObjectId(event, payload) {
  if (event === "pull_request") return payload.pull_request && (payload.pull_request.node_id || payload.pull_request.id) || null;
  if (event === "pull_request_review") return payload.review && (payload.review.node_id || payload.review.id) || null;
  if (event === "issue_comment") return payload.comment && (payload.comment.node_id || payload.comment.id) || null;
  if (event === "issues") return payload.issue && (payload.issue.node_id || payload.issue.id) || null;
  if (event === "workflow_run") return payload.workflow_run && payload.workflow_run.id || null;
  if (event === "check_run") return payload.check_run && payload.check_run.id || null;
  if (event === "check_suite") return payload.check_suite && payload.check_suite.id || null;
  if (event === "installation") return payload.installation && payload.installation.id || null;
  if (event === "push") return payload.after || null;
  return null;
}

function sourceCommitSha(event, payload) {
  if (event === "push") return payload.after || null;
  if (event === "pull_request") return payload.pull_request && (payload.pull_request.merge_commit_sha || payload.pull_request.head && payload.pull_request.head.sha) || null;
  if (event === "pull_request_review") return payload.pull_request && payload.pull_request.head && payload.pull_request.head.sha || null;
  if (event === "workflow_run") return payload.workflow_run && payload.workflow_run.head_sha || null;
  if (event === "check_run") return payload.check_run && payload.check_run.head_sha || null;
  if (event === "check_suite") return payload.check_suite && payload.check_suite.head_sha || null;
  return null;
}

function repositoryNames(items) {
  return Array.isArray(items) ? items.map((item) => item && (item.full_name || item.name || item.id)).filter(Boolean) : [];
}

function inferIssueSeverity(issue = {}) {
  const labels = Array.isArray(issue.labels) ? issue.labels.map((label) => String(label.name || label).toLowerCase()) : [];
  if (labels.some((label) => /critical|sev[- ]?1|security/.test(label))) return "critical";
  if (labels.some((label) => /high|sev[- ]?2|bug/.test(label))) return "high";
  return "medium";
}

function isFailure(conclusion) {
  return ["failure", "timed_out", "cancelled", "action_required", "startup_failure", "stale"].includes(String(conclusion || ""));
}

function invoke(platform, method, payload) {
  if (!platform || typeof platform[method] !== "function") {
    throw new Error(`platform method unavailable: ${method}`);
  }
  return platform[method](payload);
}

function record(kind, value) {
  return { kind, id: value && value.id || null, value };
}

function compact(values) {
  return values.filter((value) => value != null && value !== "");
}

function numberOrNull(value) {
  return Number.isFinite(Number(value)) ? Number(value) : null;
}

function requireValue(value, name) {
  const text = String(value || "").trim();
  if (!text) throw new Error(`${name} is required`);
  return text;
}

module.exports = {
  buildProvenance,
  mapGitHubEvent,
  repositorySnapshot,
};
