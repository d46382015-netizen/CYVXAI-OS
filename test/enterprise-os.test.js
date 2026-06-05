const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { runAgencyCycle, createEnterpriseRecord, listEnterpriseRecords } = require('../core/agency-os/enterprise_os');

test('enterprise agency cycle records a recommendation, approval, and audit trail', async () => {
  const tempDir = path.join(__dirname, '..', 'data', 'test-enterprise-os');
  fs.rmSync(tempDir, { recursive: true, force: true });
  fs.mkdirSync(tempDir, { recursive: true });

  const state = await runAgencyCycle({
    baseDir: tempDir,
    goal: 'Launch one measurable enterprise mission',
    autoApprove: true,
  });

  assert.ok(state.recommendation);
  assert.ok(state.decision);
  assert.ok(state.approval);
  assert.ok(state.auditEvent);
  assert.equal(state.auditEvent.action, 'agency.cycle');
  assert.ok(listEnterpriseRecords(tempDir, 'missions').length >= 1);
  assert.ok(listEnterpriseRecords(tempDir, 'audit_events').length >= 1);
});

test('enterprise records persist and can be retrieved by type', () => {
  const tempDir = path.join(__dirname, '..', 'data', 'test-enterprise-os-crud');
  fs.rmSync(tempDir, { recursive: true, force: true });
  fs.mkdirSync(tempDir, { recursive: true });

  const record = createEnterpriseRecord(tempDir, 'opportunities', {
    title: 'Revenue pilot',
    value: 12000,
    roi: 3.5,
    confidence: 0.84,
  });

  assert.equal(record.type, 'opportunity');
  assert.equal(listEnterpriseRecords(tempDir, 'opportunities')[0].title, 'Revenue pilot');
});
