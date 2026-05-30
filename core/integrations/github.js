/**
 * CYVX -- Autonomous Infrastructure Intelligence
 * Copyright 2026 Dakota Lee Jonsgaard.
 * Unauthorized use prohibited.
 */
"use strict";

const { execFileSync } = require('node:child_process');
const { response } = require('../shared/attribution');

class GitHubIntegration {
  constructor(options = {}) {
    this.options = options;
    this.fetchImpl = options.fetch || global.fetch;
    this.baseUrl = String(options.baseUrl || process.env.CYVX_GITHUB_API_BASE || 'https://api.github.com').replace(/\/$/, '');
    this.userAgent = options.userAgent || 'CYVX';
    this.token = options.token || process.env.CYVX_GITHUB_TOKEN || process.env.GH_TOKEN || process.env.GITHUB_TOKEN || '';
    this.repoRoot = options.repoRoot || process.env.CYVX_REPO_ROOT || process.cwd();
  }

  publish(repo) {
    return response('github', { repo, released: true });
  }

  resolveRepository(input = {}) {
    if (input && input.owner && input.repo) {
      return normalizeRepository(input.owner, input.repo, input.branch || input.default_branch || input.defaultBranch || null);
    }
    const candidate = input.repository || input.full_name || input.fullName || input.repository_full_name || input.repositoryFullName || input;
    if (candidate && typeof candidate === 'object' && candidate.owner && candidate.repo) {
      return normalizeRepository(candidate.owner, candidate.repo, candidate.branch || candidate.default_branch || candidate.defaultBranch || null);
    }
    if (candidate && typeof candidate === 'object' && candidate.full_name) {
      return normalizeRepositoryFromFullName(candidate.full_name, candidate.branch || candidate.default_branch || candidate.defaultBranch || null);
    }
    if (typeof candidate === 'string' && candidate.includes('/')) {
      return normalizeRepositoryFromFullName(candidate, input.branch || input.default_branch || input.defaultBranch || null);
    }
    const envRepo = String(input.owner || input.repo || input.repository || process.env.CYVX_GITHUB_REPOSITORY || process.env.CYVX_REPO || '').trim();
    if (envRepo.includes('/')) {
      return normalizeRepositoryFromFullName(envRepo, input.branch || input.default_branch || input.defaultBranch || null);
    }
    const remoteUrl = safeExecFileSync('git', ['-C', this.repoRoot, 'remote', 'get-url', 'origin']);
    const remoteRepo = parseRepositoryFromRemote(remoteUrl);
    if (remoteRepo) {
      return normalizeRepository(remoteRepo.owner, remoteRepo.repo, input.branch || remoteRepo.branch || null);
    }
    const owner = String(input.owner || process.env.CYVX_GITHUB_OWNER || 'd46382015-netizen').trim();
    const repo = String(input.repo || input.repository_name || process.env.CYVX_GITHUB_REPO || 'CYVXAI-OS').trim();
    return normalizeRepository(owner, repo, input.branch || null);
  }

  async repository(input = {}) {
    const repo = this.resolveRepository(input);
    const data = await this.requestJson('/repos/' + repo.full_name);
    return Object.assign({}, normalizeRepository(data.owner && data.owner.login ? data.owner.login : repo.owner, data.name || repo.repo, data.default_branch || repo.branch || null), {
      id: data.id || null,
      node_id: data.node_id || null,
      full_name: data.full_name || repo.full_name,
      private: Boolean(data.private),
      html_url: data.html_url || 'https://github.com/' + repo.full_name,
      description: data.description || '',
      default_branch: data.default_branch || repo.branch || 'main',
      archived: Boolean(data.archived),
      fork: Boolean(data.fork),
      created_at: data.created_at || null,
      updated_at: data.updated_at || null,
      pushed_at: data.pushed_at || null,
      stargazers_count: Number(data.stargazers_count || 0),
      watchers_count: Number(data.watchers_count || 0),
      forks_count: Number(data.forks_count || 0),
      open_issues_count: Number(data.open_issues_count || 0),
      size: Number(data.size || 0),
      language: data.language || null,
      topics: Array.isArray(data.topics) ? data.topics : [],
      owner: data.owner || { login: repo.owner },
    });
  }

  async commits(input = {}) {
    const repo = this.resolveRepository(input);
    const limit = clampLimit(input.per_page || input.limit || 30);
    const data = await this.requestJson('/repos/' + repo.full_name + '/commits?per_page=' + limit);
    return Array.isArray(data) ? data.map((item) => ({
      sha: item.sha,
      html_url: item.html_url,
      message: item.commit && item.commit.message ? item.commit.message.split('\n')[0] : '',
      author: item.commit && item.commit.author ? item.commit.author.name : null,
      author_login: item.author && item.author.login ? item.author.login : null,
      committed_at: item.commit && item.commit.author ? item.commit.author.date : null,
      parents: Array.isArray(item.parents) ? item.parents.map((parent) => parent.sha) : [],
    })) : [];
  }

  async issues(input = {}) {
    const repo = this.resolveRepository(input);
    const state = input.state || 'open';
    const limit = clampLimit(input.per_page || input.limit || 30);
    const data = await this.requestJson('/repos/' + repo.full_name + '/issues?state=' + encodeURIComponent(state) + '&per_page=' + limit);
    return Array.isArray(data) ? data.filter((issue) => !issue.pull_request).map((issue) => ({
      id: issue.id,
      number: issue.number,
      title: issue.title,
      state: issue.state,
      created_at: issue.created_at,
      updated_at: issue.updated_at,
      closed_at: issue.closed_at,
      comments: Number(issue.comments || 0),
      labels: Array.isArray(issue.labels) ? issue.labels.map((label) => label.name) : [],
      author: issue.user && issue.user.login ? issue.user.login : null,
      html_url: issue.html_url,
    })) : [];
  }

  async pullRequests(input = {}) {
    const repo = this.resolveRepository(input);
    const state = input.state || 'open';
    const limit = clampLimit(input.per_page || input.limit || 30);
    const data = await this.requestJson('/repos/' + repo.full_name + '/pulls?state=' + encodeURIComponent(state) + '&per_page=' + limit);
    return Array.isArray(data) ? data.map((pr) => ({
      id: pr.id,
      number: pr.number,
      title: pr.title,
      state: pr.state,
      created_at: pr.created_at,
      updated_at: pr.updated_at,
      merged_at: pr.merged_at,
      draft: Boolean(pr.draft),
      html_url: pr.html_url,
      author: pr.user && pr.user.login ? pr.user.login : null,
      additions: Number(pr.additions || 0),
      deletions: Number(pr.deletions || 0),
      changed_files: Number(pr.changed_files || 0),
    })) : [];
  }

  async workflowRuns(input = {}) {
    const repo = this.resolveRepository(input);
    const limit = clampLimit(input.per_page || input.limit || 30);
    const data = await this.requestJson('/repos/' + repo.full_name + '/actions/runs?per_page=' + limit);
    return data && Array.isArray(data.workflow_runs) ? data.workflow_runs.map((run) => ({
      id: run.id,
      name: run.name,
      head_branch: run.head_branch,
      head_sha: run.head_sha,
      status: run.status,
      conclusion: run.conclusion,
      event: run.event,
      created_at: run.created_at,
      updated_at: run.updated_at,
      run_started_at: run.run_started_at,
      html_url: run.html_url,
      actor: run.actor && run.actor.login ? run.actor.login : null,
    })) : [];
  }

  async contributors(input = {}) {
    const repo = this.resolveRepository(input);
    const limit = clampLimit(input.per_page || input.limit || 30);
    const data = await this.requestJson('/repos/' + repo.full_name + '/contributors?per_page=' + limit);
    return Array.isArray(data) ? data.map((item) => ({
      login: item.login,
      id: item.id,
      html_url: item.html_url,
      contributions: Number(item.contributions || 0),
    })) : [];
  }

  async repositorySnapshot(input = {}) {
    const repository = await this.repository(input);
    const [commits, issues, pullRequests, workflowRuns, contributors] = await Promise.all([
      this.commits(input),
      this.issues(input),
      this.pullRequests(input),
      this.workflowRuns(input),
      this.contributors(input),
    ]);
    return { repository, commits, issues, pullRequests, workflowRuns, contributors };
  }

  repositoryHealthFromSnapshot(snapshot = {}) {
    const repository = snapshot.repository || {};
    const commits = Array.isArray(snapshot.commits) ? snapshot.commits : [];
    const issues = Array.isArray(snapshot.issues) ? snapshot.issues : [];
    const pullRequests = Array.isArray(snapshot.pullRequests) ? snapshot.pullRequests : [];
    const workflowRuns = Array.isArray(snapshot.workflowRuns) ? snapshot.workflowRuns : [];
    const contributors = Array.isArray(snapshot.contributors) ? snapshot.contributors : [];
    const now = Date.now();
    const thirtyDays = 1000 * 60 * 60 * 24 * 30;
    const buildStatus = deriveBuildStatus(workflowRuns);
    const workflowFailures = workflowRuns.filter((run) => isWorkflowFailure(run.conclusion || run.status)).length;
    const workflowFailureRate = workflowRuns.length ? workflowFailures / workflowRuns.length : 0;
    const issueBacklog = issues.length;
    const openPrAgeDays = pullRequests.length ? average(pullRequests.map((pr) => daysBetween(now, pr.created_at || pr.updated_at || now))) : 0;
    const commitVelocity = commits.filter((commit) => commit.committed_at && (now - Date.parse(commit.committed_at)) <= thirtyDays).length;
    const commitRecencyDays = commits.length ? daysBetween(now, commits[0].committed_at || commits[0].updated_at || now) : 0;
    const buildScore = buildStatus === 'passing' ? 1 : buildStatus === 'failing' ? 0 : 0.5;
    const backlogScore = clamp01(1 - Math.min(1, issueBacklog / 20));
    const prAgeScore = clamp01(1 - Math.min(1, openPrAgeDays / 30));
    const failureScore = clamp01(1 - Math.min(1, workflowFailureRate));
    const velocityScore = clamp01(Math.min(1, commitVelocity / 12));
    const healthScore = clamp01((buildScore * 0.3) + (backlogScore * 0.2) + (prAgeScore * 0.15) + (failureScore * 0.2) + (velocityScore * 0.15));
    const score = round3(healthScore * 100);
    const confidence = round3(clamp01((contributors.length ? 0.45 : 0.3) + Math.min(0.4, commits.length / 20) + Math.min(0.2, workflowRuns.length / 20)));
    const signal = score >= 80 ? 'healthy' : score >= 60 ? 'watch' : 'at-risk';
    return {
      repository,
      score,
      rating: signal,
      signal,
      confidence,
      build_status: buildStatus,
      build_score: round3(buildScore),
      issue_backlog: issueBacklog,
      issue_backlog_score: round3(backlogScore),
      open_pr_count: pullRequests.length,
      open_pr_age_days: round3(openPrAgeDays),
      open_pr_age_score: round3(prAgeScore),
      workflow_runs: workflowRuns.length,
      workflow_failures: workflowFailures,
      workflow_failure_rate: round3(workflowFailureRate),
      workflow_failure_score: round3(failureScore),
      commits_30d: commitVelocity,
      commit_velocity_score: round3(velocityScore),
      commit_recency_days: round3(commitRecencyDays),
      contributors: contributors.length,
      top_contributors: contributors.slice(0, 5),
      components: {
        build: round3(buildScore),
        issue_backlog: round3(backlogScore),
        pull_request_age: round3(prAgeScore),
        workflow_failures: round3(failureScore),
        commit_velocity: round3(velocityScore),
      },
      recommendation: buildRecommendation(signal, {
        issue_backlog: issueBacklog,
        open_pr_age_days: openPrAgeDays,
        workflow_failures: workflowFailures,
        commit_velocity: commitVelocity,
      }),
      predicted_outcome: {
        repository_health_score: score + (signal === 'at-risk' ? 8 : signal === 'watch' ? 4 : 0),
        build_status: buildStatus === 'passing' ? 'passing' : 'improve build reliability',
        issue_backlog: Math.max(0, issueBacklog - 2),
        open_pr_age_days: Math.max(0, round3(openPrAgeDays - 3)),
        workflow_failures: Math.max(0, workflowFailures - 1),
        commit_velocity_30d: commitVelocity + 1,
      },
      actual_outcome: {
        repository_health_score: score,
        build_status: buildStatus,
        issue_backlog: issueBacklog,
        open_pr_age_days: round3(openPrAgeDays),
        workflow_failures: workflowFailures,
        commit_velocity_30d: commitVelocity,
      },
      variance: {
        repository_health_score: 8,
        build_status: buildStatus === 'passing' ? 0 : 1,
        issue_backlog: 2,
        open_pr_age_days: 3,
        workflow_failures: workflowFailures ? 1 : 0,
        commit_velocity_30d: 1,
      },
      summary: summarizeRepositoryHealth(repository, score, signal, issueBacklog, pullRequests.length, workflowRuns.length, commitVelocity),
    };
  }

  async repositoryHealth(input = {}) {
    const snapshot = await this.repositorySnapshot(input);
    return this.repositoryHealthFromSnapshot(snapshot);
  }

  async proofCase(input = {}) {
    const snapshot = await this.repositorySnapshot(input);
    const health = this.repositoryHealthFromSnapshot(snapshot);
    return Object.assign({}, snapshot, { health });
  }

  async requestJson(pathname, options = {}) {
    if (typeof this.fetchImpl !== 'function') {
      throw new Error('Fetch is not available in this environment');
    }
    const response = await this.fetchImpl(this.baseUrl + pathname, {
      method: options.method || 'GET',
      headers: Object.assign({
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': this.userAgent,
      }, this.token ? { Authorization: 'Bearer ' + this.token } : {}, options.headers || {}),
      body: options.body,
    });
    const text = await response.text();
    let data = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch (error) {
        data = { raw: text };
      }
    }
    if (!response.ok) {
      const message = data && (data.message || data.error) ? data.message || data.error : response.statusText || 'GitHub request failed';
      throw new Error(message);
    }
    return data;
  }
}

function normalizeRepository(owner, repo, branch) {
  return { owner: String(owner || '').trim(), repo: String(repo || '').trim(), branch: branch ? String(branch) : 'main', full_name: String(owner || '').trim() + '/' + String(repo || '').trim() };
}

function normalizeRepositoryFromFullName(fullName, branch) {
  const [owner, repo] = String(fullName || '').split('/');
  return normalizeRepository(owner, repo, branch);
}

function parseRepositoryFromRemote(remoteUrl) {
  const text = String(remoteUrl || '').trim();
  const match = text.match(/github\.com[:/](.+?)(?:\.git)?$/i);
  if (!match) return null;
  const [owner, repo] = match[1].split('/');
  if (!owner || !repo) return null;
  return { owner, repo, branch: null };
}

function safeExecFileSync(command, args) {
  try {
    return execFileSync(command, args, { encoding: 'utf8' }).trim();
  } catch (error) {
    return '';
  }
}

function clampLimit(value) {
  const n = Number(value || 30);
  return Math.max(1, Math.min(100, Number.isFinite(n) ? n : 30));
}

function deriveBuildStatus(workflowRuns) {
  if (!Array.isArray(workflowRuns) || !workflowRuns.length) return 'unknown';
  const latest = workflowRuns[0];
  const conclusion = String(latest.conclusion || latest.status || '').toLowerCase();
  if (['success', 'passing', 'completed'].includes(conclusion)) return 'passing';
  if (['failure', 'cancelled', 'timed_out', 'action_required', 'startup_failure'].includes(conclusion)) return 'failing';
  return 'unknown';
}

function isWorkflowFailure(value) {
  const status = String(value || '').toLowerCase();
  return ['failure', 'cancelled', 'timed_out', 'startup_failure', 'error'].includes(status);
}

function daysBetween(now, value) {
  const date = Date.parse(value);
  if (Number.isNaN(date)) return 0;
  return round3(Math.max(0, (Number(now) - date) / (1000 * 60 * 60 * 24)));
}

function average(values) {
  const list = Array.isArray(values) ? values.map((value) => Number(value)).filter((value) => Number.isFinite(value)) : [];
  if (!list.length) return 0;
  return list.reduce((sum, value) => sum + value, 0) / list.length;
}

function round3(value) {
  return Number(Number(value || 0).toFixed(3));
}

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value || 0)));
}

function buildRecommendation(signal, counts) {
  if (signal === 'healthy') return 'Preserve the current operating pattern and monitor for drift.';
  if (counts.workflow_failures > 0) return 'Reduce workflow failures first; failed automation is the clearest external reliability signal.';
  if (counts.issue_backlog > 10) return 'Triage the issue backlog and close or label stale items to reduce operational drag.';
  if (counts.open_pr_age_days > 7) return 'Review and merge or close stale pull requests to shorten decision latency.';
  if (counts.commit_velocity < 4) return 'Increase repository execution cadence and verify the team can sustain delivery.';
  return 'Keep the repository moving and verify the next change with live telemetry.';
}

function summarizeRepositoryHealth(repository, score, signal, issues, pullRequests, workflowRuns, commitVelocity) {
  return [
    repository.full_name + ' is ' + signal + ' at ' + score + '/100.',
    issues + ' open issue' + (issues === 1 ? '' : 's'),
    pullRequests + ' open pull request' + (pullRequests === 1 ? '' : 's'),
    workflowRuns + ' recent workflow run' + (workflowRuns === 1 ? '' : 's'),
    commitVelocity + ' commit' + (commitVelocity === 1 ? '' : 's') + ' in 30 days',
  ].join(' | ');
}

module.exports = { GitHubIntegration };
