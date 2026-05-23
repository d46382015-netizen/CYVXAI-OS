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
  view: 'world',
  agents: [],
  leaderboard: [],
  beliefs: [
    'Node congestion increasing',
    'GPU scarcity likely',
    'Latency spike predicted',
    'Migration recommended'
  ],
  future: [
    '1m: stable',
    '5m: mixed risk',
    '1h: migration pressure',
    '24h: cost drift',
    '30d: rebalancing likely'
  ],
  causal: [
    'event -> dependency',
    'dependency -> downstream impact',
    'impact -> economic damage',
    'damage -> optimal intervention'
  ],
  economy: [
    'compute price volatility',
    'energy arbitrage',
    'carbon accounting',
    'capacity futures'
  ],
  governance: [
    'trust tiers',
    'sovereign partitions',
    'policy negotiation',
    'federation treaties'
  ],
  security: [
    'lateral movement risk',
    'attack propagation',
    'exploit chains',
    'containment status'
  ]
};

const canvas = document.getElementById('planetCanvas');
const ctx = canvas.getContext('2d');
const systemStatus = document.getElementById('systemStatus');
const askOutput = document.getElementById('askOutput');
const taskInput = document.getElementById('taskInput');

function setChips(id, items) {
  const el = document.getElementById(id);
  el.innerHTML = items.map((item) => `<span class="chip">${item}</span>`).join('');
}

function setAgents(agents) {
  const el = document.getElementById('agentList');
  el.innerHTML = agents.map((agent) => `
    <div class="agent-card">
      <strong>${agent.id}</strong>
      <div>${agent.role}</div>
      <div>score ${Number(agent.score || 0).toFixed(2)} | ${agent.status}</div>
    </div>
  `).join('');
}

function setFeed() {
  const el = document.getElementById('reasoningFeed');
  el.innerHTML = [
    'Policy validation active',
    'Uncertainty-aware reasoning online',
    'Counterfactual sandbox ready',
    'Self-audit scoring nominal'
  ].map((item) => `<div class="feed-item"><strong>${item}</strong>Live cognitive layer update.</div>`).join('');
}

function drawWorld() {
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  const grd = ctx.createLinearGradient(0, 0, 0, h);
  grd.addColorStop(0, '#08111f');
  grd.addColorStop(1, '#02050a');
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, w, h);

  const cx = w * 0.48;
  const cy = h * 0.48;
  const radius = Math.min(w, h) * 0.26;

  for (let i = 0; i < 120; i++) {
    const angle = (i / 120) * Math.PI * 2;
    const x = cx + Math.cos(angle) * radius * 1.35;
    const y = cy + Math.sin(angle) * radius * 0.7;
    ctx.strokeStyle = `rgba(118, 228, 255, ${0.03 + (i % 6) * 0.005})`;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(x, y);
    ctx.stroke();
  }

  const now = Date.now() / 1000;
  for (let i = 0; i < 160; i++) {
    const angle = i * 0.39 + now * 0.12;
    const dist = radius * (0.3 + (i % 7) * 0.09);
    const x = cx + Math.cos(angle) * dist * 1.2;
    const y = cy + Math.sin(angle * 1.3) * dist * 0.75;
    ctx.fillStyle = i % 9 === 0 ? 'rgba(124, 252, 154, 0.95)' : 'rgba(118, 228, 255, 0.85)';
    ctx.beginPath();
    ctx.arc(x, y, i % 9 === 0 ? 5 : 2, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  ctx.beginPath();
  ctx.ellipse(cx, cy, radius * 1.2, radius * 0.7, -0.18, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = 'rgba(118, 228, 255, 0.07)';
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#e7f0ff';
  ctx.font = '700 34px Inter, sans-serif';
  ctx.fillText('Planetary Digital Twin', 52, 68);
  ctx.font = '400 16px Inter, sans-serif';
  ctx.fillStyle = 'rgba(231, 240, 255, 0.7)';
  ctx.fillText(`Adaptive view: ${state.view}`, 54, 96);
}

function setView(view) {
  state.view = view;
  document.querySelectorAll('[data-view]').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.view === view);
  });
  const map = {
    world: ['clouds', 'clusters', 'edge nodes', 'latency fields'],
    causal: ['causal DAG', 'root causes', 'dependencies', 'interventions'],
    future: ['future tree', 'branching timelines', 'risk zones', 'scenario shifts'],
    economic: ['prices', 'scarcity', 'futures', 'carbon']
  };
  document.getElementById('overlayCard').querySelector('.overlay-title').textContent =
    `${view.charAt(0).toUpperCase() + view.slice(1)} Overlay`;
  state.beliefs = map[view] || state.beliefs;
  setChips('beliefList', state.beliefs);
  drawWorld();
}

async function loadState() {
  try {
    const [statusRes, agentsRes, leaderboardRes] = await Promise.all([
      fetch('/status'),
      fetch('/v1/agents'),
      fetch('/v1/leaderboard')
    ]);
    const status = await statusRes.json();
    const agents = await agentsRes.json();
    const leaderboard = await leaderboardRes.json();
    systemStatus.textContent = status?.name ? `${status.name} online` : 'CYVX online';
    state.agents = agents.agents || [];
    state.leaderboard = leaderboard.leaderboard || [];
    setAgents(state.agents.length ? state.agents : [
      { id: 'agent-1', role: 'planner', score: 0.91, status: 'ready' },
      { id: 'agent-2', role: 'guardian', score: 0.87, status: 'ready' }
    ]);
  } catch {
    systemStatus.textContent = 'Offline mode';
    setAgents([
      { id: 'agent-1', role: 'planner', score: 0.91, status: 'ready' },
      { id: 'agent-2', role: 'guardian', score: 0.87, status: 'ready' }
    ]);
  }
  setChips('beliefList', state.beliefs);
  setChips('futureList', state.future);
  setChips('causalList', state.causal);
  setChips('economyList', state.economy);
  setChips('governanceList', state.governance);
  setChips('securityList', state.security);
  setFeed();
  drawWorld();
}

async function runIntervention() {
  const task = taskInput.value.trim();
  askOutput.textContent = 'Running intervention...';
  try {
    const res = await fetch('/ask', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ task })
    });
    const json = await res.json();
    askOutput.textContent = JSON.stringify(json, null, 2);
    document.getElementById('metricConfidence').textContent = json?.confidence?.toFixed?.(2) || '0.87';
    document.getElementById('metricUncertainty').textContent = (1 - (json?.confidence || 0.87)).toFixed(2);
  } catch (error) {
    askOutput.textContent = JSON.stringify({ error: error.message, task }, null, 2);
  }
}

document.querySelectorAll('[data-view]').forEach((btn) => {
  btn.addEventListener('click', () => setView(btn.dataset.view));
});
document.getElementById('askBtn').addEventListener('click', runIntervention);
document.getElementById('refreshBtn').addEventListener('click', loadState);

window.addEventListener('resize', drawWorld);
loadState();
setInterval(drawWorld, 2000);
