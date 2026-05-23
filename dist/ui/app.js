/**
 * CYVX — Autonomous Infrastructure Intelligence
 * © 2026 Dakota Lee Jonsgaard. All rights reserved.
 * Creator & Architect: Dakota Lee Jonsgaard
 * https://cyvx.ai | dakota@cyvx.ai
 *
 * This software is the exclusive intellectual property
 * of Dakota Lee Jonsgaard. Unauthorized use prohibited.
 */

const state = {
  view: 'overview',
  connected: false,
  overview: null,
  status: null,
  snapshot: null,
  cluster: null,
  insights: [],
  history: [],
  actions: [],
  workloads: [],
  agents: [],
  leaderboard: [],
  audit: [],
  snapshots: [],
  roadmap: null,
  feed: [
    'Controller booted',
    'Awaiting first synchronization',
    'Operations console is live',
  ],
  metrics: {
    confidence: 0,
    uncertainty: 0,
    contradiction: 0,
    volatility: 0,
  },
};

const els = {
  connectionState: document.getElementById('connectionState'),
  runtimeMode: document.getElementById('runtimeMode'),
  roadmapState: document.getElementById('roadmapState'),
  viewMode: document.getElementById('viewMode'),
  leaderBadge: document.getElementById('leaderBadge'),
  systemStatus: document.getElementById('systemStatus'),
  controllerSummary: document.getElementById('controllerSummary'),
  bandRuntime: document.getElementById('bandRuntime'),
  bandHealth: document.getElementById('bandHealth'),
  bandCluster: document.getElementById('bandCluster'),
  bandRoadmap: document.getElementById('bandRoadmap'),
  heroSubtitle: document.getElementById('heroSubtitle'),
  overlayTitle: document.getElementById('overlayTitle'),
  metricAgents: document.getElementById('metricAgents'),
  metricEvents: document.getElementById('metricEvents'),
  metricCycles: document.getElementById('metricCycles'),
  metricPlanes: document.getElementById('metricPlanes'),
  metricConfidence: document.getElementById('metricConfidence'),
  metricUncertainty: document.getElementById('metricUncertainty'),
  metricContradiction: document.getElementById('metricContradiction'),
  metricVolatility: document.getElementById('metricVolatility'),
  overviewList: document.getElementById('overviewList'),
  insightList: document.getElementById('insightList'),
  historyList: document.getElementById('historyList'),
  agentList: document.getElementById('agentList'),
  economyList: document.getElementById('economyList'),
  governanceList: document.getElementById('governanceList'),
  featureList: document.getElementById('featureList'),
  reasoningFeed: document.getElementById('reasoningFeed'),
  roadmapList: document.getElementById('roadmapList'),
  nodeList: document.getElementById('nodeList'),
  workloadList: document.getElementById('workloadList'),
  auditList: document.getElementById('auditList'),
  snapshotList: document.getElementById('snapshotList'),
  verificationOutput: document.getElementById('verificationOutput'),
  askOutput: document.getElementById('askOutput'),
  taskInput: document.getElementById('taskInput'),
  askInput: document.getElementById('askInput'),
  scaleWorkload: document.getElementById('scaleWorkload'),
  scaleReplicas: document.getElementById('scaleReplicas'),
  migrateWorkload: document.getElementById('migrateWorkload'),
  migrateNode: document.getElementById('migrateNode'),
  rebalanceScope: document.getElementById('rebalanceScope'),
  clusterCanvas: document.getElementById('clusterCanvas'),
};

const clusterCtx = els.clusterCanvas.getContext('2d');
let socket = null;
let reconnectTimer = null;
let renderRequested = false;

const NUMBER_FORMAT = new Intl.NumberFormat('en-US');
const PERCENT_FORMAT = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

const staticFeatures = [
  'Consensus-backed command execution',
  'Live overview, insights, and event ledger',
  'Typed scale, migrate, and rebalance forms',
  'Prometheus metrics and readiness endpoints',
  'Kubernetes deployment assets included',
];

const staticEconomy = [
  'Compute exchange and workload metering',
  'Futures market for planned capacity',
  'Carbon and cost intelligence loops',
  'Insurance-aware risk scoring',
];

const staticGovernance = [
  'Human oversight and audit trails',
  'Action envelopes with replayability',
  'Recovery-safe startup defaults',
  'Safety-first API and rate controls',
];

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatNumber(value) {
  return NUMBER_FORMAT.format(Number(value || 0));
}

function formatPercent(value, digits = 0) {
  const formatter = new Intl.NumberFormat('en-US', {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  });
  return `${formatter.format((Number(value || 0)) * 100)}%`;
}

function formatDate(value) {
  try {
    return new Date(value).toLocaleString();
  } catch {
    return String(value || '');
  }
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function setText(el, value) {
  if (el) el.textContent = value;
}

function setHtml(el, value) {
  if (el) el.innerHTML = value;
}

function normalizeEnvelope(payload) {
  if (!payload) return null;
  if (Object.prototype.hasOwnProperty.call(payload, 'data') && Object.prototype.hasOwnProperty.call(payload, 'type')) {
    return payload.data;
  }
  return payload;
}

async function fetchEnvelope(path, options = {}) {
  const response = await fetch(path, {
    headers: {
      'content-type': 'application/json',
      ...(options.headers || {}),
    },
    ...options,
  });

  const json = await response.json().catch(() => null);
  if (!response.ok) {
    const message = json?.data?.error || json?.error || response.statusText || 'Request failed';
    throw new Error(message);
  }
  return normalizeEnvelope(json);
}

function pushFeed(message) {
  state.feed.unshift(`${new Date().toLocaleTimeString()} · ${message}`);
  state.feed = state.feed.slice(0, 8);
}

function updateStatusPills() {
  const overview = state.overview || {};
  const health = overview.health || {};
  const cluster = overview.cluster || state.cluster || {};
  const road = state.roadmap || overview.roadmap || {};
  const status = state.status || overview.status || {};
  const leader = cluster.nodes?.[0]?.id || status.leader?.id || 'node-1';
  const nodes = cluster.nodes?.length || 0;
  const workloads = cluster.workloads?.length || 0;
  const score = Number(health.score || 0);

  setText(els.connectionState, state.connected ? 'Connected' : 'Reconnecting');
  setText(els.runtimeMode, status.version ? `v${status.version}` : 'Live runtime');
  setText(els.roadmapState, health.label ? health.label.toUpperCase() : 'Loading');
  setText(els.viewMode, state.view.charAt(0).toUpperCase() + state.view.slice(1));
  setText(els.leaderBadge, leader);
  setText(els.systemStatus, health.label ? health.label : 'Loading');
  setText(els.controllerSummary, status.timestamp
    ? `${status.powered_by || 'CYVX'} · ${status.modules || 0} modules · ${status.events || 0} events`
    : 'Waiting for the first sync.');
  setText(els.bandRuntime, status.version ? `v${status.version}` : 'Live');
  setText(els.bandHealth, health.label ? `${health.label} · ${PERCENT_FORMAT.format(score * 100)}%` : 'Loading');
  setText(els.bandCluster, `${nodes} node${nodes === 1 ? '' : 's'} · ${workloads} workload${workloads === 1 ? '' : 's'}`);
  setText(els.bandRoadmap, road.statusModel?.modules?.length ? `${road.statusModel.modules.length} modules` : 'Pending');
  setText(els.heroSubtitle, health.label === 'healthy'
    ? 'Consensus, recovery, and visibility are aligned.'
    : 'The console is live. Use the operational forms to stabilize the cluster.');
  setText(els.overlayTitle, status.powered_by ? `${status.powered_by} operations` : 'Live control plane');

  const confidence = clamp(score, 0, 1);
  const warningCount = (state.insights || []).filter((item) => item.severity === 'warning').length;
  state.metrics = {
    confidence,
    uncertainty: 1 - confidence,
    contradiction: clamp(warningCount / 6, 0, 1),
    volatility: clamp((health.workloadDemand || 0) * 0.5 + (health.utilization || 0) * 0.5, 0, 1),
  };

  setText(els.metricConfidence, formatPercent(state.metrics.confidence));
  setText(els.metricUncertainty, formatPercent(state.metrics.uncertainty));
  setText(els.metricContradiction, formatPercent(state.metrics.contradiction));
  setText(els.metricVolatility, formatPercent(state.metrics.volatility));
  setText(els.metricAgents, formatNumber((state.snapshot?.agents || []).length || state.agents.length));
  setText(els.metricEvents, formatNumber(status.events || overview.activity?.events || state.history.length || 0));
  setText(els.metricCycles, formatNumber(status.evolutionCycles || overview.activity?.evolutionCycles || 0));
  setText(els.metricPlanes, formatNumber(status.planeGroups || Object.keys(road.planes || {}).length || 0));
}

function renderFeatureList() {
  setHtml(els.featureList, staticFeatures.map((item) => `<div class="feature-item">${escapeHtml(item)}</div>`).join(''));
}

function renderOverview() {
  const overview = state.overview || {};
  const health = overview.health || {};
  const cluster = overview.cluster || state.cluster || {};
  const status = state.status || overview.status || {};
  const roadmap = state.roadmap || overview.roadmap || {};
  const nodes = cluster.nodes || [];
  const workloads = cluster.workloads || [];
  const topAgent = overview.agents?.top || state.leaderboard?.[0] || state.agents?.[0] || null;

  const cards = [
    { label: 'Health', value: health.label ? health.label.toUpperCase() : 'UNKNOWN', sub: `${PERCENT_FORMAT.format((health.score || 0) * 100)}% score` },
    { label: 'Nodes', value: formatNumber(nodes.length), sub: `${nodes.filter((node) => node.healthy !== false).length} healthy` },
    { label: 'Workloads', value: formatNumber(workloads.length), sub: `${formatPercent(health.workloadDemand || 0)} demand` },
    { label: 'Agents', value: formatNumber((overview.agents?.count || state.agents.length || 0)), sub: topAgent ? `Leader ${escapeHtml(topAgent.id)}` : 'No leader data yet' },
    { label: 'Events', value: formatNumber(status.events || 0), sub: `${formatNumber(status.evolutionCycles || 0)} cycles` },
    { label: 'Modules', value: formatNumber(status.modules || 0), sub: `${formatNumber(status.planeGroups || 0)} plane groups` },
  ];

  setHtml(els.overviewList, cards.map((card) => `
    <div class="summary-card">
      <span>${escapeHtml(card.label)}</span>
      <strong>${escapeHtml(card.value)}</strong>
      <small>${escapeHtml(card.sub)}</small>
    </div>
  `).join(''));

  const insights = state.insights && state.insights.length ? state.insights : [
    {
      severity: 'info',
      title: 'Waiting for telemetry',
      summary: 'The controller has not produced insight data yet.',
      recommendation: 'Refresh state after the first API sync.',
    },
  ];

  setHtml(els.insightList, insights.map((item) => `
    <article class="insight-card ${escapeHtml(item.severity || 'info')}">
      <div class="insight-head">
        <strong>${escapeHtml(item.title || 'Insight')}</strong>
        <span>${escapeHtml((item.severity || 'info').toUpperCase())}</span>
      </div>
      <p>${escapeHtml(item.summary || '')}</p>
      <small>${escapeHtml(item.recommendation || '')}</small>
    </article>
  `).join(''));

  const roadmapModules = roadmap.statusModel?.modules || [];
  const roadmapCards = [
    { key: 'Constitution', value: (roadmap.constitution || []).length, detail: 'Invariant rules' },
    { key: 'Tier 0', value: Object.values(roadmap.tier0 || {}).filter((value) => value === 'online').length, detail: 'Networking, hardware, internet' },
    { key: 'Tier 1', value: Object.values(roadmap.tier1 || {}).filter((value) => value === 'online').length, detail: 'Raft and storage' },
    { key: 'Modules', value: roadmapModules.length, detail: 'Governed roadmap modules' },
  ];

  setHtml(els.roadmapList, roadmapCards.map((card) => `
    <div class="roadmap-card">
      <span>${escapeHtml(card.key)}</span>
      <strong>${escapeHtml(String(card.value))}</strong>
      <small>${escapeHtml(card.detail)}</small>
    </div>
  `).join(''));
}

function renderAgents() {
  const agents = state.leaderboard.length ? state.leaderboard : state.agents;
  setHtml(els.agentList, agents.slice(0, 8).map((agent, index) => `
    <div class="stack-item">
      <div>
        <strong>${escapeHtml(agent.id || `agent-${index + 1}`)}</strong>
        <span>${escapeHtml(agent.specialization || 'Operator')}</span>
      </div>
      <div class="stack-meta">
        <b>${escapeHtml(String(agent.credits ?? agent.score ?? 0))}</b>
        <small>credits</small>
      </div>
    </div>
  `).join(''));

  setHtml(els.economyList, staticEconomy.map((item) => `<div class="stack-item muted-item"><strong>${escapeHtml(item)}</strong></div>`).join(''));
  setHtml(els.governanceList, staticGovernance.map((item) => `<div class="stack-item muted-item"><strong>${escapeHtml(item)}</strong></div>`).join(''));
}

function renderCluster() {
  const cluster = state.cluster || state.overview?.cluster || state.snapshot?.cluster || {};
  const nodes = cluster.nodes || [];
  const workloads = cluster.workloads || [];

  setHtml(els.nodeList, (nodes.length ? nodes : [{ id: 'node-1', healthy: true, cpu_capacity: 32, cpu_used: 18, cost_per_hour: 2.75 }]).map((node) => {
    const usage = clamp(Number(node.cpu_used || 0) / Math.max(1, Number(node.cpu_capacity || 1)), 0, 1);
    return `
      <article class="node-card ${node.healthy === false ? 'down' : 'up'}">
        <div class="node-head">
          <strong>${escapeHtml(node.id || 'node')}</strong>
          <span>${node.healthy === false ? 'offline' : 'online'}</span>
        </div>
        <div class="meter"><i style="width:${(usage * 100).toFixed(0)}%"></i></div>
        <div class="node-meta">
          <span>CPU ${escapeHtml(String(node.cpu_used ?? 0))}/${escapeHtml(String(node.cpu_capacity ?? 0))}</span>
          <span>$${escapeHtml(String(node.cost_per_hour ?? '0.00'))}/hr</span>
        </div>
      </article>
    `;
  }).join(''));

  setHtml(els.workloadList, (workloads.length ? workloads : [{ id: 'workload-1', cpu_request: 2, replicas: 3, target_latency_ms: 120 }]).map((workload) => `
    <article class="workload-card">
      <div class="node-head">
        <strong>${escapeHtml(workload.id || 'workload')}</strong>
        <span>${escapeHtml(String(workload.replicas ?? 1))} replicas</span>
      </div>
      <div class="workload-meta">
        <span>CPU request ${escapeHtml(String(workload.cpu_request ?? 0))}</span>
        <span>Latency target ${escapeHtml(String(workload.target_latency_ms ?? 0))} ms</span>
        <span>Assigned ${escapeHtml(workload.assigned_node_id || 'pending')}</span>
      </div>
    </article>
  `).join(''));
}

function renderVerification() {
  const audit = state.audit.length ? state.audit : [];
  const snapshots = state.snapshots.length ? state.snapshots : [];
  setHtml(els.auditList, audit.slice(0, 10).map((entry) => `
    <div class="stack-item">
      <div>
        <strong>${escapeHtml(entry.type || 'audit')}</strong>
        <span>${escapeHtml(formatDate(entry.created_at || Date.now()))}</span>
      </div>
      <div class="stack-meta">
        <b>${escapeHtml(String(entry.meta?.stateAfterHash || entry.meta?.stateHash || 'n/a').slice(0, 8))}</b>
        <small>hash</small>
      </div>
    </div>
  `).join('') || '<div class="feed-item">No audit entries yet.</div>');

  setHtml(els.snapshotList, snapshots.slice(0, 10).map((entry) => `
    <div class="stack-item">
      <div>
        <strong>${escapeHtml(entry.name || 'snapshot')}</strong>
        <span>${escapeHtml(formatDate(entry.created_at || entry.at || Date.now()))}</span>
      </div>
      <div class="stack-meta">
        <b>${escapeHtml(String(entry.hash || 'n/a').slice(0, 8))}</b>
        <small>state</small>
      </div>
    </div>
  `).join('') || '<div class="feed-item">No snapshots recorded yet.</div>');
}

function renderHistory() {
  const history = state.history.length ? state.history : state.snapshot?.cluster?.history || [];
  setHtml(els.historyList, history.slice(0, 12).map((entry) => `
    <article class="history-item">
      <div class="history-head">
        <strong>${escapeHtml(entry.type || 'event')}</strong>
        <span>${escapeHtml(formatDate(entry.created_at || Date.now()))}</span>
      </div>
      <pre>${escapeHtml(JSON.stringify(entry.summary || entry, null, 2))}</pre>
    </article>
  `).join(''));
}

function renderFeed() {
  setHtml(els.reasoningFeed, state.feed.map((item) => `<div class="feed-item">${escapeHtml(item)}</div>`).join(''));
}

function describeResultEnvelope(envelope) {
  const data = envelope?.data || envelope;
  if (!data || typeof data !== 'object') return String(data || '');
  if (data.explanation) return data.explanation;
  if (data.summary) return data.summary;
  if (data.message) return data.message;
  if (data.type) return data.type;
  return JSON.stringify(data, null, 2);
}

function renderCommandEcho(result) {
  if (!result) return;
  const response = result.response || result.result || result.data || result;
  const summary = response?.explanation || response?.summary || response?.type || JSON.stringify(response, null, 2);
  setText(els.askOutput, typeof summary === 'string' ? summary : JSON.stringify(summary, null, 2));
  pushFeed(`Command executed: ${result.mode || 'command'}`);
}

function renderStatusText() {
  if (!els.askOutput) return;
  if (els.askOutput.textContent && els.askOutput.textContent !== 'No planner response yet.') {
    els.askOutput.classList.remove('muted');
  }
}

function drawTopology() {
  const canvas = els.clusterCanvas;
  if (!canvas) return;

  const rect = canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return;

  const dpr = window.devicePixelRatio || 1;
  const targetWidth = Math.floor(rect.width * dpr);
  const targetHeight = Math.floor(rect.height * dpr);
  if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
    canvas.width = targetWidth;
    canvas.height = targetHeight;
  }

  const ctx = clusterCtx;
  const width = canvas.width;
  const height = canvas.height;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, width, height);

  const overview = state.overview || {};
  const cluster = state.cluster || overview.cluster || {};
  const nodes = cluster.nodes || [];
  const workloads = cluster.workloads || [];
  const centerX = width / 2;
  const centerY = height / 2.1;
  const minDim = Math.min(width, height);
  const outerRadius = minDim * 0.28;
  const innerRadius = minDim * 0.16;

  const background = ctx.createLinearGradient(0, 0, 0, height);
  background.addColorStop(0, '#08111f');
  background.addColorStop(1, '#0b1627');
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, width, height);

  ctx.save();
  ctx.globalAlpha = 0.35;
  ctx.strokeStyle = 'rgba(120, 176, 255, 0.18)';
  ctx.lineWidth = 1.5 * dpr;
  for (let ring = 1; ring <= 4; ring += 1) {
    ctx.beginPath();
    ctx.arc(centerX, centerY, outerRadius * (ring / 4), 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();

  const leaderPulse = (Date.now() % 2400) / 2400;
  const pulseRadius = innerRadius * (0.85 + leaderPulse * 0.08);
  const leaderGradient = ctx.createRadialGradient(centerX, centerY, innerRadius * 0.1, centerX, centerY, pulseRadius);
  leaderGradient.addColorStop(0, 'rgba(255, 219, 132, 0.95)');
  leaderGradient.addColorStop(0.45, 'rgba(92, 173, 255, 0.92)');
  leaderGradient.addColorStop(1, 'rgba(92, 173, 255, 0.05)');
  ctx.beginPath();
  ctx.fillStyle = leaderGradient;
  ctx.arc(centerX, centerY, pulseRadius, 0, Math.PI * 2);
  ctx.fill();

  ctx.beginPath();
  ctx.fillStyle = 'rgba(10, 18, 32, 0.95)';
  ctx.arc(centerX, centerY, innerRadius * 0.6, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#f7e8b0';
  ctx.font = `${Math.max(18, minDim * 0.027)}px Space Grotesk, sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText('PRIMARY', centerX, centerY - 6 * dpr);
  ctx.font = `${Math.max(12, minDim * 0.016)}px IBM Plex Mono, monospace`;
  ctx.fillText(state.status?.powered_by || 'CYVX', centerX, centerY + 20 * dpr);

  const count = Math.max(1, nodes.length || 1);
  nodes.forEach((node, index) => {
    const angle = (index / count) * Math.PI * 2 - Math.PI / 2;
    const orbit = outerRadius * 0.72;
    const x = centerX + Math.cos(angle) * orbit;
    const y = centerY + Math.sin(angle) * orbit;
    const usage = clamp(Number(node.cpu_used || 0) / Math.max(1, Number(node.cpu_capacity || 1)), 0, 1);
    const radius = innerRadius * (0.26 + usage * 0.12);

    ctx.beginPath();
    ctx.fillStyle = node.healthy === false ? 'rgba(255, 111, 111, 0.95)' : 'rgba(92, 173, 255, 0.95)';
    ctx.shadowBlur = 24 * dpr;
    ctx.shadowColor = node.healthy === false ? 'rgba(255, 111, 111, 0.6)' : 'rgba(92, 173, 255, 0.55)';
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
    ctx.lineWidth = 1.2 * dpr;
    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.lineTo(x, y);
    ctx.stroke();

    ctx.fillStyle = '#f2f5fb';
    ctx.font = `${Math.max(10, minDim * 0.014)}px IBM Plex Mono, monospace`;
    ctx.textAlign = 'center';
    ctx.fillText(node.id || `node-${index + 1}`, x, y + radius + 16 * dpr);
  });

  const workloadCount = Math.max(1, workloads.length || 1);
  workloads.slice(0, 8).forEach((workload, index) => {
    const angle = (index / workloadCount) * Math.PI * 2 + leaderPulse * Math.PI * 2;
    const orbit = outerRadius * 1.08;
    const x = centerX + Math.cos(angle) * orbit;
    const y = centerY + Math.sin(angle) * orbit * 0.84;
    const widthBox = 110 * dpr;
    const heightBox = 34 * dpr;

    ctx.fillStyle = 'rgba(7, 12, 22, 0.92)';
    ctx.strokeStyle = 'rgba(255, 207, 107, 0.35)';
    ctx.lineWidth = 1 * dpr;
    roundedRect(ctx, x - widthBox / 2, y - heightBox / 2, widthBox, heightBox, 12 * dpr);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#ffd979';
    ctx.font = `${Math.max(9, minDim * 0.012)}px IBM Plex Mono, monospace`;
    ctx.fillText(workload.id || 'workload', x, y + 4 * dpr);
  });
}

function roundedRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function scheduleRender() {
  if (renderRequested) return;
  renderRequested = true;
  window.requestAnimationFrame(() => {
    renderRequested = false;
    updateStatusPills();
    renderFeatureList();
    renderOverview();
    renderAgents();
    renderCluster();
    renderHistory();
    renderVerification();
    renderFeed();
    drawTopology();
    renderStatusText();
  });
}

async function loadState() {
  const [overview, insights, snapshot, status, actions, workloads, history, audit, snapshots, leaderboard, roadmap, agents] = await Promise.all([
    fetchEnvelope('/api/v1/overview'),
    fetchEnvelope('/api/v1/insights'),
    fetchEnvelope('/api/v1/state'),
    fetchEnvelope('/status'),
    fetchEnvelope('/api/v1/actions'),
    fetchEnvelope('/api/v1/workloads'),
    fetchEnvelope('/api/v1/metrics/history'),
    fetchEnvelope('/api/v1/audit'),
    fetchEnvelope('/api/v1/snapshots'),
    fetchEnvelope('/v1/leaderboard'),
    fetchEnvelope('/v1/roadmap'),
    fetchEnvelope('/v1/agents'),
  ]);

  state.overview = overview;
  state.insights = insights?.insights || overview?.insights || [];
  state.snapshot = snapshot;
  state.status = status;
  state.actions = actions?.actions || [];
  state.workloads = workloads?.workloads || snapshot?.cluster?.workloads || [];
  state.history = history?.history || snapshot?.cluster?.history || [];
  state.audit = audit?.audit || [];
  state.snapshots = snapshots?.snapshots || [];
  state.leaderboard = leaderboard?.leaderboard || snapshot?.leaderboard || [];
  state.roadmap = roadmap || overview?.roadmap || snapshot?.roadmap || null;
  state.agents = agents?.agents || snapshot?.agents || [];
  state.cluster = snapshot?.cluster || overview?.cluster || null;
  state.connected = true;
  pushFeed(`Synced ${state.status?.modules || 0} modules and ${state.history.length} events`);
  scheduleRender();
}

async function sendCommand(payload) {
  const response = await fetchEnvelope('/api/v1/command', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  const summary = describeResultEnvelope(response?.response);
  setText(els.askOutput, summary);
  els.askOutput.classList.remove('muted');
  pushFeed(`Command: ${payload.command || payload.task || payload.prompt || 'action'}`);
  return response;
}

function buildActionCommand(action, text) {
  return {
    mode: 'action',
    command: text,
    action,
  };
}

function selectedViewFromTarget(target) {
  const panel = target.closest('[data-panel]');
  if (panel?.dataset.panel) return panel.dataset.panel;
  return 'overview';
}

function setView(view) {
  state.view = view;
  document.querySelectorAll('[data-view]').forEach((button) => {
    button.classList.toggle('active', button.dataset.view === view);
  });
  document.body.dataset.view = view;
  setText(els.viewMode, view.charAt(0).toUpperCase() + view.slice(1));
  scheduleRender();
}

function connectSocket() {
  if (socket) {
    try {
      socket.close();
    } catch {
      // ignore
    }
  }

  const scheme = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  socket = new WebSocket(`${scheme}//${window.location.host}/ws`);
  socket.addEventListener('open', () => {
    state.connected = true;
    setText(els.connectionState, 'Connected');
    pushFeed('Realtime stream connected');
    scheduleRender();
  });
  socket.addEventListener('message', (event) => {
    try {
      const message = JSON.parse(event.data);
      const label = message.type || message.event || 'event';
      pushFeed(`Stream · ${label}`);
      scheduleRender();
    } catch {
      pushFeed('Stream message received');
    }
  });
  socket.addEventListener('close', () => {
    state.connected = false;
    setText(els.connectionState, 'Reconnecting');
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(connectSocket, 3000);
    scheduleRender();
  });
  socket.addEventListener('error', () => {
    state.connected = false;
    setText(els.connectionState, 'Degraded');
    scheduleRender();
  });
}

function downloadSnapshot() {
  const payload = {
    generatedAt: new Date().toISOString(),
    status: state.status,
    overview: state.overview,
    snapshot: state.snapshot,
    history: state.history,
    insights: state.insights,
    actions: state.actions,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `cyvx-snapshot-${Date.now()}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
  pushFeed('Snapshot exported');
}

function wireEvents() {
  document.querySelectorAll('[data-view]').forEach((button) => {
    button.addEventListener('click', () => setView(button.dataset.view || 'overview'));
  });

  document.getElementById('refreshBtn')?.addEventListener('click', () => loadState().catch(reportError));
  document.getElementById('syncBtn')?.addEventListener('click', () => connectSocket());
  document.getElementById('syncStateBtn')?.addEventListener('click', () => loadState().catch(reportError));
  document.getElementById('exportBtn')?.addEventListener('click', downloadSnapshot);
  document.getElementById('askBtn')?.addEventListener('click', async () => {
    if (!els.askInput?.value.trim()) return;
    await sendCommand({ mode: 'ask', prompt: els.askInput.value.trim(), context: { source: 'ui' } }).catch(reportError);
  });

  document.getElementById('commandForm')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const command = els.taskInput?.value.trim();
    if (!command) return;
    await sendCommand({ command, task: command }).catch(reportError);
  });

  document.getElementById('scaleForm')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const workloadId = els.scaleWorkload?.value.trim() || 'workload-1';
    const replicas = Number(els.scaleReplicas?.value || 1);
    await sendCommand(buildActionCommand({ type: 'scale_up', workload_id: workloadId, replicas }, `scale ${workloadId} to ${replicas} replicas`)).catch(reportError);
  });

  document.getElementById('migrateForm')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const workloadId = els.migrateWorkload?.value.trim() || 'workload-1';
    const targetNodeId = els.migrateNode?.value.trim() || 'node-1';
    await sendCommand(buildActionCommand({ type: 'migrate', workload_id: workloadId, target_node_id: targetNodeId }, `migrate ${workloadId} to ${targetNodeId}`)).catch(reportError);
  });

  document.getElementById('rebalanceForm')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const scope = els.rebalanceScope?.value || 'cluster';
    await sendCommand(buildActionCommand({ type: 'rebalance', scope }, `rebalance ${scope}`)).catch(reportError);
  });

  document.getElementById('askForm')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const prompt = els.askInput?.value.trim();
    if (!prompt) return;
    await sendCommand({ mode: 'ask', prompt, context: { source: 'planner' } }).catch(reportError);
  });

  document.getElementById('replayForm')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const limit = Number(document.getElementById('replayLimit')?.value || 50);
    const replay = await fetchEnvelope(`/api/v1/replay?limit=${encodeURIComponent(limit)}`);
    setText(els.verificationOutput, `Replay processed ${replay.replayed || 0} events. State hash: ${replay.stateHash || 'n/a'}.`);
    els.verificationOutput.classList.remove('muted');
    pushFeed(`Replay run over ${replay.replayed || 0} events`);
    scheduleRender();
  });

  document.getElementById('failureForm')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const kind = document.getElementById('failureKind')?.value || 'leader';
    const result = await sendCommand({ mode: 'action', command: `simulate failure ${kind}`, action: { type: 'simulate_failure', kind } }).catch(reportError);
    const drill = result?.response?.data?.simulation || result?.response?.data;
    if (drill) {
      setText(els.verificationOutput, `Failure drill: ${kind}. Recovery steps: ${(drill.recovery || []).join(' | ')}`);
      els.verificationOutput.classList.remove('muted');
    }
  });

  els.clusterCanvas.addEventListener('click', () => scheduleRender());
  window.addEventListener('resize', scheduleRender);
}

function reportError(error) {
  state.connected = false;
  setText(els.connectionState, 'Error');
  setText(els.systemStatus, 'Error');
  setText(els.askOutput, error.message || String(error));
  els.askOutput.classList.remove('muted');
  pushFeed(`Error · ${error.message || error}`);
  scheduleRender();
}

async function bootstrap() {
  renderFeatureList();
  wireEvents();
  connectSocket();
  try {
    await loadState();
  } catch (error) {
    reportError(error);
  }
  setInterval(() => loadState().catch(reportError), 15000);
  setView('overview');
}

bootstrap();
