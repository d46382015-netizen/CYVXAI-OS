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

  if (event === "push") {
    const observation = invoke(platform, "createObservation", {
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
    });
    created.push(record("observation", observation));
  } else if (event === "issues") {
    const issue = payload.issue || {};
    const constraint = invoke(platform, "createConstraint", {
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
    });
    created.push(record("constraint", constraint));
  } else if (event === "pull_request" && action === "closed" && payload.pull_request && payload.pull_request.merged) {
    const pullRequest = payload.pull_request;
    const outcome = invoke(platform, "recordOutcome", {
      id: `github-outcome-${deliveryId}`,
      title: `Merged PR #${pullRequest.number || "?"}: ${pullRequest.title || "pull request"}`,
      status: "verified",
      source: "github.webhook",
      confidence: 0.99,
      evidence: compact([pullRequest.html_url, pullRequest.merge_commit_sha && `${repository.html_url}/commit/${pullRequest.merge_commit_sha}`]),
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
    });
    created.push(record("outcome", outcome));
  } else if (event === "workflow_run") {
    const workflow = payload.workflow_run || {};
    if (isFailure(workflow.conclusion)) {
      const constraint = invoke(platform, "createConstraint", {
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
      });
      created.push(record("constraint", constraint));
    } else if (workflow.conclusion === "success") {
      const observation = invoke(platform, "createObservation", {
        id: `github-workflow-observation-${deliveryId}`,
        title: `GitHub workflow succeeded: ${workflow.name || workflow.id || "workflow"}`,
        source: "github.webhook",
        confidence: 0.99,
        evidence: compact([workflow.html_url]),
        subject_id: repository.full_name || repository.id,
        observed_state: { repository, workflow_id: workflow.id || null, conclusion: workflow.conclusion },
        observed_change: { status: "verified_success" },
        metadata: provenance,
      });
      created.push(record("observation", observation));
    }
  } else if (event === "check_run") {
    const check = payload.check_run || {};
    if (isFailure(check.conclusion)) {
      const constraint = invoke(platform, "createConstraint", {
        id: `github-check-constraint-${deliveryId}`,
        title: `GitHub check failed: ${check.name || check.id || "check"}`,
        description: check.html_url || "GitHub check failed.",
        status: "open",
        state: "open",
        confidence: 0.99,
        severity: "high",
        entity_ids: compact([repository.full_name || repository.id]),
        evidence: compact([check.html_url]),
        source: "github.webhook",
        metadata: provenance,
      });
      created.push(record("constraint", constraint));
    }
  }

  return {
    delivery_id: deliveryId,
    event,
    action,
    repository,
    created,
    ignored: created.length === 0,
    ignored_reason: created.length === 0 ? "event has no first-slice mapping" : null,
  };
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
    payload.issue && payload.issue.html_url ||
    payload.workflow_run && payload.workflow_run.html_url ||
    payload.check_run && payload.check_run.html_url ||
    payload.compare ||
    payload.repository && payload.repository.html_url ||
    null;
}

function sourceObjectId(event, payload) {
  if (event === "pull_request") return payload.pull_request && (payload.pull_request.node_id || payload.pull_request.id) || null;
  if (event === "issues") return payload.issue && (payload.issue.node_id || payload.issue.id) || null;
  if (event === "workflow_run") return payload.workflow_run && payload.workflow_run.id || null;
  if (event === "check_run") return payload.check_run && payload.check_run.id || null;
  if (event === "push") return payload.after || null;
  return null;
}

function sourceCommitSha(event, payload) {
  if (event === "push") return payload.after || null;
  if (event === "pull_request") return payload.pull_request && (payload.pull_request.merge_commit_sha || payload.pull_request.head && payload.pull_request.head.sha) || null;
  if (event === "workflow_run") return payload.workflow_run && payload.workflow_run.head_sha || null;
  if (event === "check_run") return payload.check_run && payload.check_run.head_sha || null;
  return null;
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
