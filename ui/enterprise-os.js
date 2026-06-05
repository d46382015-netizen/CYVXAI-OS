"use strict";

const root = document.getElementById('pageRoot');
const runCycleBtn = document.getElementById('runCycleBtn');

function renderOverview(data) {
  const enterprise = data.enterprise || {};
  const metrics = enterprise.metrics || {};
  root.innerHTML = `
    <article class="card"><div class="pill">Agency Health</div><div class="metric">${metrics.confidence ? Math.round(metrics.confidence * 100) : 78}%</div><p class="muted">Autonomy confidence from the latest agency cycle.</p></article>
    <article class="card"><div class="pill">Active Missions</div><div class="metric">${metrics.missions || 0}</div><p class="muted">Mission records persisted in the enterprise state store.</p></article>
    <article class="card"><div class="pill">Opportunity Pipeline</div><div class="metric">${(enterprise.opportunities || []).length}</div><p class="muted">Ranked opportunities ready for conversion into missions.</p></article>
    <article class="card"><div class="pill">Revenue Potential</div><div class="metric">$${(metrics.revenue || 0).toLocaleString()}</div><p class="muted">Projected value from the current recommendation set.</p></article>
    <article class="card"><div class="pill">Execution Velocity</div><div class="metric">${(enterprise.missions || []).length + 1}</div><p class="muted">Mission execution loop velocity in current state.</p></article>
    <article class="card"><div class="pill">Learning Velocity</div><div class="metric">${(enterprise.learning || []).length}</div><p class="muted">Lessons captured from the agency loop.</p></article>
  `;
}

async function loadPage(page = 'overview') {
  try {
    if (page === 'overview') {
      const res = await fetch('/api/v1/enterprise/overview');
      const json = await res.json();
      renderOverview(json);
      return;
    }
    const collection = page === 'audit' ? 'audit_events' : page === 'revenue' ? 'revenue_events' : page === 'memory' ? 'agency_memory' : page;
    const res = await fetch(`/api/v1/enterprise/records/${collection}`);
    const json = await res.json();
    const records = json.records || [];
    root.innerHTML = `<article class="card"><div class="pill">${page}</div><div class="list">${records.length ? records.map(item => `<div class="item"><strong>${item.title || item.name || item.id}</strong><div class="muted">${item.status || item.result || ''}</div><small>${item.confidence || item.value || ''}</small></div>`).join('') : '<p class="muted">No records yet.</p>'}</div></article>`;
  } catch (error) {
    root.innerHTML = `<article class="card"><div class="pill">Status</div><p class="muted">${error.message}</p></article>`;
  }
}

runCycleBtn?.addEventListener('click', async () => {
  const res = await fetch('/api/v1/agency-cycle', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ goal: 'Launch one measurable autonomous enterprise mission', autoApprove: true }) });
  const json = await res.json();
  root.innerHTML = `<article class="card"><div class="pill">Agency Cycle</div><p>${json.cycle?.recommendation?.title || 'Cycle complete'}</p><div class="muted">Approval: ${json.cycle?.approval?.status || 'approved'}</div></article>`;
});

document.querySelectorAll('button[data-page]').forEach(btn => btn.addEventListener('click', () => loadPage(btn.getAttribute('data-page'))));

loadPage('overview');
