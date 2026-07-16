"use strict";

const assert = require("node:assert/strict");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { BackupScheduler } = require("../core/production/backup_scheduler");
const { PostHogClient } = require("../core/integrations/posthog_client");
const { QueueWorker } = require("../core/integrations/supabase_queue");
const { StripeBilling } = require("../core/integrations/stripe_billing");
const { TransactionalEmail } = require("../core/integrations/transactional_email");
const { StripeRevenueProvider } = require("../services/revenue/providers");

const queue = { configured: () => false };

test("operational providers approve execution by default", () => {
  assert.equal(new PostHogClient({ env: {} }).enabled, true);
  assert.equal(new StripeBilling({ env: {} }).enabled, true);
  assert.equal(new TransactionalEmail({ env: {} }).enabled, true);
  assert.equal(new QueueWorker({ queue }).enabled, true);
  assert.equal(new StripeRevenueProvider({ env: {} }).enabled, true);
  const dataRoot = path.join(os.tmpdir(), `cyvx-policy-backup-${process.pid}-${Date.now()}`);
  const backup = new BackupScheduler({ env: {}, dataRoot });
  assert.equal(backup.enabled, true);
  assert.equal(backup.upload, true);
});

test("explicit false remains an authoritative kill switch", () => {
  assert.equal(new PostHogClient({ env: { CYVX_PRODUCT_ANALYTICS_ENABLED: "false" } }).enabled, false);
  assert.equal(new StripeBilling({ env: { CYVX_BILLING_ENABLED: "false" } }).enabled, false);
  assert.equal(new TransactionalEmail({ env: { CYVX_EMAIL_ENABLED: "false" } }).enabled, false);
  const prior = process.env.CYVX_QUEUE_WORKER;
  process.env.CYVX_QUEUE_WORKER = "false";
  try { assert.equal(new QueueWorker({ queue }).enabled, false); } finally {
    if (prior === undefined) delete process.env.CYVX_QUEUE_WORKER; else process.env.CYVX_QUEUE_WORKER = prior;
  }
  assert.equal(new StripeRevenueProvider({ env: { CYVX_BILLING_ENABLED: "false" } }).enabled, false);
  const dataRoot = path.join(os.tmpdir(), `cyvx-policy-backup-off-${process.pid}-${Date.now()}`);
  const backup = new BackupScheduler({ env: { CYVX_BACKUP_ENABLED: "false", CYVX_BACKUP_UPLOAD: "false" }, dataRoot });
  assert.equal(backup.enabled, false);
  assert.equal(backup.upload, false);
});

test("approval does not pretend missing provider credentials are configured", () => {
  assert.equal(new PostHogClient({ env: {} }).configured(), false);
  assert.equal(new StripeBilling({ env: {} }).configured(), false);
  assert.equal(new TransactionalEmail({ env: {} }).configured(), false);
  assert.equal(new StripeRevenueProvider({ env: {} }).configured(), false);
});
