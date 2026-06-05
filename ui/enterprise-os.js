"use strict";

const root = document.getElementById('pageRoot');
const runCycleBtn = document.getElementById('runCycleBtn');
const pageButtons = Array.from(document.querySelectorAll('button[data-page]'));

function labelForPage(page) {
  return page === 'audit' ? 'Audit Log' : page.charAt(0).toUpperCase() + page.slice(1);
}

function renderOverview(data) {
  const enterprise = data.enterprise || {};
  const metrics = enterprise.metrics || {};
  root.innerHTML = `
    <article class="card"><div class="pill">Agency Health</div><div class="metric">${Math.round((metrics.confidence || 0.82) * 100)}%</div><p class="muted">Autonomy confidence from the latest agency cycle.</p></article>
    <article class="card"><div class="pill">Active Missions</div><div class="metric">${metrics.missions || (enterprise.missions || []).length}</div><p class="muted">Mission records persisted in the enterprise state store.</p></article>
    <article class="card"><div class="pill">Opportunity Pipeline</div><div class="metric">${(enterprise.opportunities || []).length}</div><p class="muted">Ranked opportunities ready for missions.</p></article>
    <article class="card"><div class="pill">Revenue Potential</div><div class="metric">$${(metrics.revenue || 0).toLocaleString()}</div><p class="muted">Projected revenue from the current recommendation set.</p></article>
    <article class="card"><div class="pill">Execution Velocity</div><div class="metric">${(enterprise.missions || []).length + 1}</div><p class="muted">Mission execution loop velocity in current state.</p></article>
    <article class="card"><div class="pill">Learning Velocity</div><div class="metric">${(enterprise.learning || []).length}</div><p class="muted">Lessons captured from the agency loop.</p></article>
  `;
}

function renderRecords(page, records) {
  const collection = page === 'audit' ? 'audit_events' : page === 'knowledge' ? 'agency_memory' : page === 'revenue' ? 'revenue_events' : page;
  root.innerHTML = `
    <article class="card">
      <div class="pill">${labelForPage(page)}</div>
      <p class="muted">Persisted records are stored in the local enterprise state and can be created from the form below.</p>
      <form id="createRecordForm" class="list">
        <input id="recordTitle" placeholder="Title" style="width:100%;padding:8px;border-radius:10px;border:1px solid rgba(115,160,255,.25);background:rgba(7,12,21,.7);color:#fff;" />
        <textarea id="recordSummary" placeholder="Details" style="width:100%;min-height:72px;padding:8px;border-radius:10px;border:1px solid rgba(115,160,255,.25);background:rgba(7,12,21,.7);color:#fff;"></textarea>
        <button class="primary" type="submit">Create ${labelForPage(page)} record</button>
      </form>
      <div class="list" style="margin-top:12px;">${records.length ? records.map(item => `<div class="item"><strong>${item.title || item.name || item.id}</strong><div class="muted">${item.status || item.result || item.summary || item.lesson || ''}</div><small>${item.confidence ? 'Confidence ' + Math.round(item.confidence * 100) + '%' : ''}${item.value ? ' • Value $' + Number(item.value).toLocaleString() : ''}</small></div>`).join('') : '<p class="muted">No persisted records yet.</p>'}</div>
    </article>
  `;
  const form = document.getElementById('createRecordForm');
  if (form) {
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const title = document.getElementById('recordTitle').value.trim();
      const summary = document.getElementById('recordSummary').value.trim();
      if (!title) return;
      await fetch(`/api/v1/enterprise/records/${collection}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title, summary, status: 'active', confidence: 0.82 }) });
      await loadPage(page);
    });
  }
}

async function loadPage(page = 'overview') {
  try {
    if (page === 'overview') {
      const res = await fetch('/api/v1/enterprise/overview');
      const json = await res.json();
      renderOverview(json);
      return;
    }
    const collection = page === 'audit' ? 'audit_events' : page === 'knowledge' ? 'agency_memory' : page === 'revenue' ? 'revenue_events' : page;
    const res = await fetch(`/api/v1/enterprise/records/${collection}`);
    const json = await res.json();
    renderRecords(page, json.records || []);
  } catch (error) {
    root.innerHTML = `<article class="card"><div class="pill">Status</div><p class="muted">${error.message}</p></article>`;
  }
}

runCycleBtn?.addEventListener('click', async () => {
  const res = await fetch('/api/v1/agency-cycle', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ goal: 'Launch one measurable autonomous enterprise mission', autoApprove: true }) });
  const json = await res.json();
  root.innerHTML = `<article class="card"><div class="pill">Agency Cycle</div><p>${json.cycle?.recommendation?.title || 'Cycle complete'}</p><div class="muted">Approval: ${json.cycle?.approval?.status || 'approved'} • Confidence: ${Math.round((json.cycle?.approval?.confidence || 0.82) * 100)}%</div></article>`;
});

pageButtons.forEach(btn => btn.addEventListener('click', () => loadPage(btn.getAttribute('data-page'))));

loadPage('overview');
