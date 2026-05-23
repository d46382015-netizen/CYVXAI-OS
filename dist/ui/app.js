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
  view: "home",
  overlay: "world",
  connected: false,
  agents: [],
  leaderboard: [],
  roadmap: null,
  overview: null,
  history: [],
  insights: [],
  metrics: {
    confidence: 0.87,
    uncertainty: 0.13,
    contradiction: 0.04,
    volatility: 0.22,
  },
  feed: [
    "Controller booted",
    "Roadmap synchronized",
    "Planes online",
    "Ready for interventions",
  ],
  features: [
    "AI agents and automation",
    "Decentralized intelligence",
    "Real-world asset integration",
    "Cross-chain compatibility",
    "Quantum-safe security",
  ],
  economy: [
    "Compute exchange",
    "Futures market",
    "Carbon intelligence",
    "Insurance pool",
  ],
  governance: [
    "Constitutional invariants",
    "Human oversight",
    "Rollback enforcement",
    "Audit trails",
  ],
};

const coinCanvas = document.getElementById("coinCanvas");
const coinCtx = coinCanvas.getContext("2d");
const planetCanvas = document.getElementById("planetCanvas");
const planetCtx = planetCanvas.getContext("2d");

const els = {
  connectionState: document.getElementById("connectionState"),
  systemStatus: document.getElementById("systemStatus"),
  runtimeMode: document.getElementById("runtimeMode"),
  roadmapState: document.getElementById("roadmapState"),
  viewMode: document.getElementById("viewMode"),
  heroSubtitle: document.getElementById("heroSubtitle"),
  overlayTitle: document.getElementById("overlayTitle"),
  metricAgents: document.getElementById("metricAgents"),
  metricEvents: document.getElementById("metricEvents"),
  metricCycles: document.getElementById("metricCycles"),
  metricPlanes: document.getElementById("metricPlanes"),
  metricConfidence: document.getElementById("metricConfidence"),
  metricUncertainty: document.getElementById("metricUncertainty"),
  metricContradiction: document.getElementById("metricContradiction"),
  metricVolatility: document.getElementById("metricVolatility"),
  reasoningFeed: document.getElementById("reasoningFeed"),
  agentList: document.getElementById("agentList"),
  economyList: document.getElementById("economyList"),
  governanceList: document.getElementById("governanceList"),
  overviewList: document.getElementById("overviewList"),
  insightList: document.getElementById("insightList"),
  historyList: document.getElementById("historyList"),
  featureList: document.getElementById("featureList"),
  taskInput: document.getElementById("taskInput"),
  askOutput: document.getElementById("askOutput"),
};

let socket = null;
let lastFrame = 0;
let dimensions = { coin: 900, planet: 1400 };
let particles = makeParticles(200);

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString();
}

function makeParticles(count) {
  return Array.from({ length: count }, (_, index) => ({
    angle: (index / count) * Math.PI * 2,
    radius: 0.18 + (index % 17) * 0.028,
    speed: 0.18 + (index % 11) * 0.015,
    glow: index % 5 === 0 ? 1 : 0.6,
  }));
}

function setView(view) {
  state.view = view;
  document.querySelectorAll("[data-view]").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.view === view);
  });
  setText("viewMode", view.charAt(0).toUpperCase() + view.slice(1));

  const labels = {
    home: ["Finance", "AI", "Governance", "Security", "Ecosystem"],
    agents: ["Exploration", "Optimization", "Defense", "Planning"],
    economy: ["Price discovery", "Compute exchange", "Futures", "Carbon"],
    governance: ["Constitution", "Authority", "Escalation", "Audit"],
  };
  state.features = labels[view] || state.features;
  renderFeatureList();
  drawCoin(performance.now());
  drawPlanet(performance.now());
}

function setOverlay(overlay) {
  state.overlay = overlay;
  document.querySelectorAll("[data-overlay]").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.overlay === overlay);
  });
  const titles = {
    world: "World Overlay",
    causal: "Causal Overlay",
    future: "Future Overlay",
    economic: "Economic Overlay",
  };
  els.overlayTitle.textContent = titles[overlay] || "World Overlay";
}

function renderFeatureList() {
  els.featureList.innerHTML = state.features
    .map((item) => `<div class="feature-item">${item}</div>`)
    .join("");
}

function renderChips(target, items) {
  const el = document.getElementById(target);
  if (!el) return;
  el.innerHTML = items.map((item) => `<span class="chip">${item}</span>`).join("");
}

function renderAgents() {
  const agents = state.agents.length ? state.agents : [
    { id: "agent-1", specialization: "planner", credits: 100, wins: 12, losses: 1 },
    { id: "agent-2", specialization: "guardian", credits: 97, wins: 11, losses: 1 },
  ];

  els.agentList.innerHTML = agents
    .map((agent, index) => `
      <div class="agent-card">
        <div class="agent-head">
          <strong>${agent.id}</strong>
          <span>#${index + 1}</span>
        </div>
        <div class="agent-meta">${agent.specialization || agent.role || "agent"}</div>
        <div class="agent-stats">
          <span>Credits ${formatNumber(agent.credits || 0)}</span>
          <span>Wins ${formatNumber(agent.wins || 0)}</span>
          <span>Losses ${formatNumber(agent.losses || 0)}</span>
        </div>
      </div>
    `)
    .join("");
}

function renderOverview() {
  const overview = state.overview || {};
  const health = overview.health || {};
  const cluster = overview.cluster || {};
  const topAgent = (overview.agents && overview.agents.top) || state.leaderboard[0] || state.agents[0] || {};
  const workloads = cluster.workloads || [];
  const node = (cluster.nodes && cluster.nodes[0]) || {};
  const cards = [
    { label: 'Health', value: Number(health.score || 0).toFixed(2), sub: health.label || 'unknown' },
    { label: 'Top Agent', value: topAgent.id || 'n/a', sub: formatNumber(topAgent.credits || 0) + ' credits' },
    { label: 'Workloads', value: formatNumber(workloads.length), sub: formatNumber(node.cpu_used || 0) + '/' + formatNumber(node.cpu_capacity || 0) + ' CPU' },
    { label: 'Events', value: formatNumber((overview.activity && overview.activity.events) || 0), sub: formatNumber((overview.activity && overview.activity.evolutionCycles) || 0) + ' cycles' },
  ];

  els.overviewList.innerHTML = cards.map((card) => '<div class="summary-card"><span>' + card.label + '</span><strong>' + card.value + '</strong><small>' + card.sub + '</small></div>').join('');
}

function renderInsights() {
  const insights = state.insights.length ? state.insights : [{
    severity: 'info',
    title: 'Waiting for live data',
    summary: 'The controller will replace this placeholder once the overview endpoint responds.',
    recommendation: 'Refresh the dashboard or re-run the API.',
  }];

  els.insightList.innerHTML = insights.map((item) => '<div class="insight-card ' + (item.severity || 'info') + '"><div class="insight-head"><strong>' + item.title + '</strong><span>' + (item.severity || 'info') + '</span></div><p>' + item.summary + '</p><small>' + (item.recommendation || '') + '</small></div>').join('');
}

function renderHistory() {
  const history = state.history.length ? state.history : state.feed.map((item, index) => ({
    type: index === 0 ? 'latest' : 'event',
    created_at: new Date(Date.now() - index * 60_000).toISOString(),
    summary: { note: item },
  }));

  els.historyList.innerHTML = history.slice(0, 10).map((entry) => '<div class="history-item"><div class="history-meta"><strong>' + (entry.type || 'event') + '</strong><span>' + new Date(entry.created_at || Date.now()).toLocaleString() + '</span></div><pre>' + JSON.stringify(entry.summary || entry, null, 2) + '</pre></div>').join('');
}

function renderFeed() {
  els.reasoningFeed.innerHTML = state.feed
    .slice(0, 8)
    .map((item, index) => `
      <div class="feed-item">
        <strong>${index === 0 ? "Now" : `T-${index}`}</strong>
        <span>${item}</span>
      </div>
    `)
    .join("");
}

function updateMetrics(status = {}, roadmap = {}) {
  const agents = Number(status.agents || state.agents.length || 0);
  const events = Number(status.events || 0);
  const cycles = Number(status.evolutionCycles || 0);
  const planeGroups = Number(status.planeGroups || Object.keys(roadmap.planes || {}).length || 0);

  animateNumber(els.metricAgents, agents);
  animateNumber(els.metricEvents, events);
  animateNumber(els.metricCycles, cycles);
  animateNumber(els.metricPlanes, planeGroups);

  const confidence = clamp(0.76 + (agents % 10) * 0.015, 0.1, 0.99);
  state.metrics = {
    confidence,
    uncertainty: 1 - confidence,
    contradiction: clamp(0.04 + (events % 6) * 0.01, 0, 0.4),
    volatility: clamp(0.18 + (cycles % 7) * 0.015, 0, 0.6),
  };

  els.metricConfidence.textContent = state.metrics.confidence.toFixed(2);
  els.metricUncertainty.textContent = state.metrics.uncertainty.toFixed(2);
  els.metricContradiction.textContent = state.metrics.contradiction.toFixed(2);
  els.metricVolatility.textContent = state.metrics.volatility.toFixed(2);

  const statusText = status.startedAt ? "Online" : "Connecting";
  els.connectionState.textContent = state.connected ? "Live" : "Offline";
  els.systemStatus.textContent = `${statusText} | ${formatNumber(agents)} agents`;
  els.runtimeMode.textContent = state.connected ? "Live" : "Offline";
  els.roadmapState.textContent = roadmap.statusModel?.modules?.length ? "Synchronized" : "Loading";
  els.heroSubtitle.textContent = `Founder and creator: Dakota Lee Jonsgaard`;
}

function animateNumber(el, target) {
  const start = Number(el.textContent.replace(/,/g, "")) || 0;
  const end = Number(target || 0);
  const delta = end - start;
  const duration = 420;
  const started = performance.now();

  function tick(now) {
    const progress = clamp((now - started) / duration, 0, 1);
    const ease = 1 - Math.pow(1 - progress, 3);
    el.textContent = formatNumber(Math.round(start + delta * ease));
    if (progress < 1) requestAnimationFrame(tick);
  }

  requestAnimationFrame(tick);
}

function pushFeed(message) {
  if (!message) return;
  state.feed.unshift(message);
  state.feed = state.feed.slice(0, 10);
  renderFeed();
}

function connectSocket() {
  try {
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    socket = new WebSocket(`${proto}//${location.host}/ws`);
    socket.addEventListener("open", () => {
      state.connected = true;
      els.connectionState.textContent = "Live";
      pushFeed("WebSocket connected");
    });
    socket.addEventListener("message", (event) => {
      const payload = JSON.parse(event.data);
      if (payload.type === "hello") {
        updateMetrics(payload.payload || {}, state.roadmap || {});
      } else if (payload.type === "overview") {
        state.overview = payload.payload || null;
        renderOverview();
        renderInsights();
        renderHistory();
      } else if (payload.type === "event") {
        pushFeed(`Event: ${payload.payload?.intelligence?.winner?.detail?.algorithm || "update"}`);
      } else if (payload.type === "dream") {
        pushFeed("Dream cycle consolidated");
      } else if (payload.type === "ask") {
        pushFeed("Intervention processed");
      }
    });
    socket.addEventListener("close", () => {
      state.connected = false;
      els.connectionState.textContent = "Offline";
      setTimeout(connectSocket, 3000);
    });
    socket.addEventListener("error", () => {
      state.connected = false;
    });
  } catch {
    state.connected = false;
  }
}

async function loadLiveState() {
  try {
    const [statusRes, agentsRes, leaderboardRes, roadmapRes, stateRes, overviewRes, historyRes, insightsRes] = await Promise.all([
      fetch('/status'),
      fetch('/v1/agents'),
      fetch('/v1/leaderboard'),
      fetch('/v1/roadmap'),
      fetch('/api/v1/state'),
      fetch('/api/v1/overview'),
      fetch('/api/v1/metrics/history'),
      fetch('/api/v1/insights'),
    ]);

    const status = await statusRes.json();
    const agents = await agentsRes.json();
    const leaderboard = await leaderboardRes.json();
    const roadmap = await roadmapRes.json();
    const stateBody = await stateRes.json();
    const overview = await overviewRes.json();
    const history = await historyRes.json();
    const insights = await insightsRes.json();

    state.agents = agents.agents || [];
    state.leaderboard = leaderboard.leaderboard || [];
    state.roadmap = roadmap;
    state.overview = overview;
    state.history = history.history || [];
    state.insights = insights.insights || overview.insights || [];
    state.connected = true;

    updateMetrics(status, roadmap);
    renderAgents();
    renderFeed();
    renderOverview();
    renderInsights();
    renderHistory();

    renderChips('economyList', state.economy);
    renderChips('governanceList', state.governance);

    if (stateBody?.leaderboard?.length) {
      pushFeed('Top agent: ' + stateBody.leaderboard[0].id);
    }
  } catch (error) {
    state.connected = false;
    els.connectionState.textContent = 'Offline';
    pushFeed('Offline mode: ' + error.message);
    renderAgents();
    renderFeed();
    renderOverview();
    renderInsights();
    renderHistory();
  }
}

async function runIntervention() {
  const task = els.taskInput.value.trim() || "optimize:cluster";
  els.askOutput.textContent = "Running intervention...";
  try {
    const response = await fetch('/api/v1/command', {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ task }),
    });
    const json = await response.json();
    els.askOutput.textContent = JSON.stringify(json, null, 2);
    pushFeed(`Ask completed: ${task}`);
    loadLiveState();
    if (json?.data?.status === "ok") {
      const confidence = json.data?.confidence || state.metrics.confidence;
      els.metricConfidence.textContent = confidence.toFixed(2);
      els.metricUncertainty.textContent = (1 - confidence).toFixed(2);
    }
  } catch (error) {
    els.askOutput.textContent = JSON.stringify({ error: error.message, task }, null, 2);
    pushFeed(`Ask failed: ${error.message}`);
  }
}

function loadRoadmapView() {
  fetch("/v1/roadmap")
    .then((res) => res.json())
    .then((roadmap) => {
      state.roadmap = roadmap;
      updateMetrics({ agents: state.agents.length, events: Number(els.metricEvents.textContent.replace(/,/g, "")) || 0, evolutionCycles: Number(els.metricCycles.textContent.replace(/,/g, "")) || 0, planeGroups: Object.keys(roadmap.planes || {}).length }, roadmap);
      pushFeed("Roadmap refreshed");
      renderOverview();
      renderInsights();
    });
}

function drawCoin(now) {
  const w = coinCanvas.width;
  const h = coinCanvas.height;
  const cx = w / 2;
  const cy = h / 2;
  const radius = Math.min(w, h) * 0.34;
  const glowRadius = radius * 1.22;

  coinCtx.clearRect(0, 0, w, h);

  const sky = coinCtx.createRadialGradient(cx, cy - 120, 80, cx, cy, h * 0.6);
  sky.addColorStop(0, "rgba(255, 201, 102, 0.11)");
  sky.addColorStop(0.4, "rgba(25, 65, 136, 0.42)");
  sky.addColorStop(1, "rgba(3, 7, 16, 1)");
  coinCtx.fillStyle = sky;
  coinCtx.fillRect(0, 0, w, h);

  const halo = coinCtx.createRadialGradient(cx, cy + 180, 0, cx, cy + 180, glowRadius);
  halo.addColorStop(0, "rgba(55, 171, 255, 0.55)");
  halo.addColorStop(0.35, "rgba(25, 112, 255, 0.18)");
  halo.addColorStop(1, "rgba(25, 112, 255, 0)");
  coinCtx.fillStyle = halo;
  coinCtx.beginPath();
  coinCtx.ellipse(cx, cy + 190, glowRadius * 1.05, glowRadius * 0.28, 0, 0, Math.PI * 2);
  coinCtx.fill();

  const rotation = now * 0.00035;
  const ringGradient = coinCtx.createLinearGradient(cx - radius, cy - radius, cx + radius, cy + radius);
  ringGradient.addColorStop(0, "#ffd97a");
  ringGradient.addColorStop(0.4, "#b87a20");
  ringGradient.addColorStop(0.8, "#ffdb86");
  ringGradient.addColorStop(1, "#7a4b06");

  coinCtx.save();
  coinCtx.translate(cx, cy);
  coinCtx.rotate(rotation);

  coinCtx.shadowColor = "rgba(255, 204, 102, 0.65)";
  coinCtx.shadowBlur = 45;
  coinCtx.fillStyle = ringGradient;
  coinCtx.beginPath();
  coinCtx.arc(0, 0, radius * 1.1, 0, Math.PI * 2);
  coinCtx.fill();

  coinCtx.shadowBlur = 0;
  coinCtx.fillStyle = "rgba(8, 10, 16, 1)";
  coinCtx.beginPath();
  coinCtx.arc(0, 0, radius * 0.93, 0, Math.PI * 2);
  coinCtx.fill();

  for (let i = 0; i < 96; i++) {
    const angle = (i / 96) * Math.PI * 2;
    const inner = radius * 0.56;
    const outer = radius * (0.76 + (i % 7) * 0.01);
    coinCtx.strokeStyle = `rgba(100, 170, 255, ${0.12 + (i % 7) * 0.01})`;
    coinCtx.lineWidth = i % 11 === 0 ? 3 : 1.4;
    coinCtx.beginPath();
    coinCtx.moveTo(Math.cos(angle) * inner, Math.sin(angle) * inner);
    coinCtx.lineTo(Math.cos(angle) * outer, Math.sin(angle) * outer);
    coinCtx.stroke();
  }

  coinCtx.strokeStyle = "rgba(255, 215, 130, 0.8)";
  coinCtx.lineWidth = 16;
  coinCtx.beginPath();
  coinCtx.arc(0, 0, radius * 0.97, 0, Math.PI * 2);
  coinCtx.stroke();

  coinCtx.lineWidth = 2;
  coinCtx.strokeStyle = "rgba(255, 255, 255, 0.12)";
  coinCtx.beginPath();
  coinCtx.arc(0, 0, radius * 0.68, 0, Math.PI * 2);
  coinCtx.stroke();

  const xGradient = coinCtx.createLinearGradient(-radius, -radius, radius, radius);
  xGradient.addColorStop(0, "#ffcf60");
  xGradient.addColorStop(0.5, "#d49b2d");
  xGradient.addColorStop(1, "#fff0a2");

  coinCtx.shadowColor = "rgba(90, 165, 255, 0.95)";
  coinCtx.shadowBlur = 30;
  coinCtx.fillStyle = xGradient;
  coinCtx.beginPath();
  coinCtx.moveTo(-radius * 0.46, -radius * 0.46);
  coinCtx.lineTo(-radius * 0.16, -radius * 0.18);
  coinCtx.lineTo(radius * 0.46, -radius * 0.46);
  coinCtx.lineTo(radius * 0.18, -radius * 0.14);
  coinCtx.lineTo(radius * 0.46, radius * 0.46);
  coinCtx.lineTo(radius * 0.14, radius * 0.18);
  coinCtx.lineTo(-radius * 0.46, radius * 0.46);
  coinCtx.lineTo(-radius * 0.18, radius * 0.14);
  coinCtx.closePath();
  coinCtx.fill();

  coinCtx.shadowBlur = 0;
  coinCtx.fillStyle = "rgba(35, 160, 255, 0.85)";
  coinCtx.beginPath();
  coinCtx.arc(0, 0, radius * 0.09, 0, Math.PI * 2);
  coinCtx.fill();

  for (let i = 0; i < particles.length; i++) {
    const particle = particles[i];
    const a = particle.angle + now * 0.00015 * particle.speed;
    const r = radius * (0.3 + particle.radius);
    const x = Math.cos(a) * r;
    const y = Math.sin(a * 1.08) * r * 0.62;
    coinCtx.fillStyle = particle.glow > 0.9 ? "rgba(255, 220, 128, 0.9)" : "rgba(85, 184, 255, 0.8)";
    coinCtx.beginPath();
    coinCtx.arc(x, y, particle.glow > 0.9 ? 4.8 : 2.4, 0, Math.PI * 2);
    coinCtx.fill();
  }

  coinCtx.restore();

  coinCtx.fillStyle = "rgba(255,255,255,0.9)";
  coinCtx.font = "700 58px 'Space Grotesk', sans-serif";
  coinCtx.textAlign = "center";
  coinCtx.fillText("CYVXAI", cx, 110);
  coinCtx.font = "500 22px Inter, sans-serif";
  coinCtx.fillStyle = "rgba(235, 221, 190, 0.95)";
  coinCtx.fillText("Quantum-level intelligence for compute civilization", cx, 152);
}

function drawPlanet(now) {
  const w = planetCanvas.width;
  const h = planetCanvas.height;
  const cx = w / 2;
  const cy = h / 2 + 24;
  const radius = Math.min(w, h) * 0.25;

  planetCtx.clearRect(0, 0, w, h);

  const background = planetCtx.createLinearGradient(0, 0, 0, h);
  background.addColorStop(0, "rgba(6, 10, 18, 1)");
  background.addColorStop(1, "rgba(2, 5, 10, 1)");
  planetCtx.fillStyle = background;
  planetCtx.fillRect(0, 0, w, h);

  const orb = planetCtx.createRadialGradient(cx, cy - 50, 100, cx, cy, radius * 3);
  orb.addColorStop(0, "rgba(35, 149, 255, 0.12)");
  orb.addColorStop(0.5, "rgba(15, 45, 98, 0.2)");
  orb.addColorStop(1, "rgba(2, 5, 10, 1)");
  planetCtx.fillStyle = orb;
  planetCtx.fillRect(0, 0, w, h);

  planetCtx.save();
  planetCtx.translate(cx, cy);

  const overlayColors = {
    world: ["rgba(255, 211, 128, 0.45)", "rgba(60, 165, 255, 0.45)"],
    causal: ["rgba(255, 160, 96, 0.5)", "rgba(96, 165, 255, 0.4)"],
    future: ["rgba(255, 222, 155, 0.42)", "rgba(112, 199, 255, 0.42)"],
    economic: ["rgba(255, 190, 72, 0.55)", "rgba(92, 182, 255, 0.44)"],
  };
  const [a, b] = overlayColors[state.overlay] || overlayColors.world;

  for (let i = 0; i < 4; i++) {
    planetCtx.strokeStyle = `rgba(150, 190, 255, ${0.08 + i * 0.03})`;
    planetCtx.beginPath();
    planetCtx.ellipse(0, 0, radius * (1.5 + i * 0.2), radius * (0.78 + i * 0.1), -0.2, 0, Math.PI * 2);
    planetCtx.stroke();
  }

  planetCtx.strokeStyle = "rgba(255, 205, 107, 0.38)";
  planetCtx.lineWidth = 3;
  planetCtx.beginPath();
  planetCtx.ellipse(0, 0, radius * 1.42, radius * 0.76, -0.18, 0, Math.PI * 2);
  planetCtx.stroke();

  planetCtx.fillStyle = "rgba(7, 15, 30, 0.92)";
  planetCtx.beginPath();
  planetCtx.arc(0, 0, radius, 0, Math.PI * 2);
  planetCtx.fill();

  const gridLines = 28;
  for (let i = 0; i < gridLines; i++) {
    const angle = (i / gridLines) * Math.PI * 2;
    planetCtx.strokeStyle = i % 3 === 0 ? a : b;
    planetCtx.globalAlpha = 0.3;
    planetCtx.beginPath();
    planetCtx.moveTo(Math.cos(angle) * radius * 0.18, Math.sin(angle) * radius * 0.18);
    planetCtx.lineTo(Math.cos(angle) * radius * 0.98, Math.sin(angle) * radius * 0.98);
    planetCtx.stroke();
  }

  planetCtx.globalAlpha = 1;
  planetCtx.lineWidth = 1.3;
  for (let i = 0; i < 10; i++) {
    const y = -radius * 0.78 + (radius * 1.56 * i) / 9;
    planetCtx.strokeStyle = i % 2 === 0 ? "rgba(255,255,255,0.06)" : "rgba(255,210,125,0.07)";
    planetCtx.beginPath();
    planetCtx.ellipse(0, y, radius * 0.96, radius * (0.18 + i * 0.012), 0, 0, Math.PI * 2);
    planetCtx.stroke();
  }

  const nodes = 48;
  for (let i = 0; i < nodes; i++) {
    const angle = (i / nodes) * Math.PI * 2 + now * 0.00005;
    const r = radius * (0.48 + (i % 5) * 0.08);
    const x = Math.cos(angle) * r;
    const y = Math.sin(angle * 1.14) * r * 0.52;
    planetCtx.fillStyle = i % 7 === 0 ? "rgba(255, 220, 133, 0.95)" : "rgba(100, 186, 255, 0.82)";
    planetCtx.beginPath();
    planetCtx.arc(x, y, i % 7 === 0 ? 4.4 : 2.2, 0, Math.PI * 2);
    planetCtx.fill();
  }

  const ring = planetCtx.createLinearGradient(-radius, -radius, radius, radius);
  ring.addColorStop(0, "rgba(255, 208, 100, 0.88)");
  ring.addColorStop(0.5, "rgba(120, 190, 255, 0.92)");
  ring.addColorStop(1, "rgba(255, 229, 168, 0.88)");
  planetCtx.shadowColor = "rgba(255, 195, 83, 0.75)";
  planetCtx.shadowBlur = 22;
  planetCtx.strokeStyle = ring;
  planetCtx.lineWidth = 8;
  planetCtx.beginPath();
  planetCtx.arc(0, 0, radius * 0.88, 0, Math.PI * 2);
  planetCtx.stroke();

  planetCtx.restore();

  planetCtx.fillStyle = "rgba(255, 235, 196, 0.95)";
  planetCtx.font = "700 28px 'Space Grotesk', sans-serif";
  planetCtx.fillText("Planetary Infrastructure Map", 56, 72);
  planetCtx.font = "500 16px Inter, sans-serif";
  planetCtx.fillStyle = "rgba(222, 231, 245, 0.72)";
  planetCtx.fillText(`Overlay: ${state.overlay}`, 56, 98);
}

function resizeCanvas() {
  const coinRect = coinCanvas.getBoundingClientRect();
  const planetRect = planetCanvas.getBoundingClientRect();
  if (coinRect.width > 0) {
    dimensions.coin = Math.round(Math.min(coinRect.width, 900));
  }
  if (planetRect.width > 0) {
    dimensions.planet = Math.round(Math.min(planetRect.width, 1400));
  }
}

function bindEvents() {
  document.querySelectorAll("[data-view]").forEach((btn) => {
    btn.addEventListener("click", () => setView(btn.dataset.view));
  });
  document.querySelectorAll("[data-overlay]").forEach((btn) => {
    btn.addEventListener("click", () => setOverlay(btn.dataset.overlay));
  });
  document.getElementById("askBtn").addEventListener("click", runIntervention);
  document.getElementById("refreshBtn").addEventListener("click", loadLiveState);
  document.getElementById("loadRoadmapBtn").addEventListener("click", loadRoadmapView);
  document.querySelectorAll("[data-command]").forEach((btn) => {
    btn.addEventListener("click", () => {
      els.taskInput.value = btn.dataset.command;
      runIntervention();
    });
  });
  document.getElementById("launchBtn").addEventListener("click", () => {
    setView("home");
    pushFeed("App launch sequence acknowledged");
  });

  window.addEventListener("resize", () => {
    resizeCanvas();
    drawCoin(performance.now());
    drawPlanet(performance.now());
  });
}

function animate(now) {
  if (now - lastFrame > 32) {
    drawCoin(now);
    drawPlanet(now);
    lastFrame = now;
  }
  requestAnimationFrame(animate);
}

function init() {
  resizeCanvas();
  renderFeatureList();
  renderFeed();
  renderAgents();
  renderChips("economyList", state.economy);
  renderChips("governanceList", state.governance);
  renderOverview();
  renderInsights();
  renderHistory();
  bindEvents();
  connectSocket();
  loadLiveState();
  requestAnimationFrame(animate);
}

init();
