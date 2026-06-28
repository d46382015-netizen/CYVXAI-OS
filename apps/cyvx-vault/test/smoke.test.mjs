import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createApp } from '../src/app.mjs';

async function request(base, path, options = {}, token = '') {
  const headers = { 'content-type': 'application/json', ...(options.headers || {}) };
  if (token) headers.authorization = `Bearer ${token}`;
  const response = await fetch(base + path, { ...options, headers });
  const data = await response.json();
  return { response, data };
}

test('production vertical slice: intake → publish → allocate → vault → buyback → audit', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'cyvx-vault-'));
  const app = createApp({
    dataDir,
    publicDir: resolve('public'),
    env: {
      ADMIN_EMAIL: 'admin@example.com',
      ADMIN_PASSWORD: 'StrongAdminPassword1!',
      PAID_PACKS_ENABLED: 'false',
      BUYBACK_BPS: '8500',
    },
  });
  await new Promise(resolveListen => app.server.listen(0, '127.0.0.1', resolveListen));
  const address = app.server.address();
  const base = `http://127.0.0.1:${address.port}`;
  try {
    let r = await request(base, '/api/auth/login', { method: 'POST', body: JSON.stringify({ email: 'admin@example.com', password: 'StrongAdminPassword1!' }) });
    assert.equal(r.response.status, 200);
    const admin = r.data.token;

    for (const [sku, title, value] of [['PKM-001','Charizard Holo',40000],['PKM-002','Blastoise Holo',15000],['PKM-003','Venusaur Holo',12000]]) {
      r = await request(base, '/api/admin/items', { method: 'POST', body: JSON.stringify({ sku, title, category: 'POKEMON', grade: 'PSA 8', acquisition_cost_cents: 7000, market_value_cents: value }) }, admin);
      assert.equal(r.response.status, 201);
    }

    r = await request(base, '/api/admin/packs', { method: 'POST', body: JSON.stringify({ name: 'Genesis', slug: 'genesis', category: 'POKEMON', description: 'Verified slabs', price_cents: 0 }) }, admin);
    assert.equal(r.response.status, 201);
    const packId = r.data.pack.id;

    r = await request(base, `/api/admin/packs/${packId}/publish`, { method: 'POST', body: '{}' }, admin);
    assert.equal(r.response.status, 200);
    assert.equal(r.data.pack.total_slots, 3);
    assert.match(r.data.pack.commitment_hash, /^[a-f0-9]{64}$/);

    r = await request(base, '/api/auth/register', { method: 'POST', body: JSON.stringify({ email: 'collector@example.com', password: 'CollectorPassword1!' }) });
    assert.equal(r.response.status, 201);
    const collector = r.data.token;

    const key = 'test-idempotency-0001';
    r = await request(base, '/api/checkout', { method: 'POST', headers: { 'Idempotency-Key': key }, body: JSON.stringify({ pack_id: packId, client_seed: 'collector-controlled-seed' }) }, collector);
    assert.equal(r.response.status, 201);
    assert.equal(r.data.order.status, 'FULFILLED');
    assert.match(r.data.receipt.draw_digest, /^[a-f0-9]{64}$/);
    const ownershipId = r.data.ownership.id;

    r = await request(base, '/api/checkout', { method: 'POST', headers: { 'Idempotency-Key': key }, body: JSON.stringify({ pack_id: packId, client_seed: 'collector-controlled-seed' }) }, collector);
    assert.equal(r.response.status, 200);
    assert.equal(r.data.idempotent_replay, true);

    r = await request(base, '/api/checkout', { method: 'POST', headers: { 'Idempotency-Key': 'test-idempotency-0002' }, body: JSON.stringify({ pack_id: packId, client_seed: 'second-seed' }) }, collector);
    assert.equal(r.response.status, 409);
    assert.equal(r.data.error.code, 'FREE_CLAIM_USED');

    r = await request(base, '/api/vault', {}, collector);
    assert.equal(r.data.ownerships.length, 1);
    assert.equal(r.data.ownerships[0].id, ownershipId);

    r = await request(base, `/api/ownerships/${ownershipId}/buyback`, { method: 'POST', body: '{}' }, collector);
    assert.equal(r.response.status, 201);
    const offerId = r.data.offer.id;
    assert.ok(r.data.offer.offer_cents > 0);

    r = await request(base, `/api/buybacks/${offerId}/accept`, { method: 'POST', body: '{}' }, collector);
    assert.equal(r.response.status, 200);
    assert.ok(r.data.wallet_cents > 0);

    r = await request(base, '/api/admin/audit/verify', {}, admin);
    assert.equal(r.response.status, 200);
    assert.equal(r.data.valid, true);
    assert.ok(r.data.events >= 10);

    r = await request(base, '/api/health');
    assert.equal(r.response.status, 200);
    assert.equal(r.data.ok, true);
  } finally {
    await app.close();
    rmSync(dataDir, { recursive: true, force: true });
  }
});
