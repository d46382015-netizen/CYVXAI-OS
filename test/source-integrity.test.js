"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");
const { audit, appearsToBeModule } = require("../scripts/audit-source-integrity");
const { inspect } = require("../scripts/check-provider-readiness");

test("repository JavaScript is syntactically valid and contains no patch markers", () => {
  const result = audit(path.resolve(__dirname, ".."));
  assert.equal(result.ok, true, JSON.stringify(result.failures, null, 2));
  assert.ok(result.checked_files > 500);
});

test("source auditor recognizes browser ES modules", () => {
  assert.equal(appearsToBeModule("export const ready = true;", ".js"), true);
  assert.equal(appearsToBeModule("module.exports = {};", ".js"), false);
});

test("provider readiness reports missing credentials without exposing values", () => {
  const result = inspect({}, ["backup", "uptime"]);
  assert.equal(result.ok, false);
  assert.deepEqual(result.providers[0].missing_required, [
    "CYVX_BACKUP_STORAGE_URL",
    "CYVX_BACKUP_STORAGE_TOKEN",
    "CYVX_BACKUP_BUCKET",
    "CYVX_BACKUP_ENCRYPTION_KEY",
  ]);
  assert.deepEqual(result.providers[1].missing_one_of, [
    "CYVX_PRODUCTION_URL",
    "CYVX_STAGING_URL",
    "CYVX_UPTIME_TARGETS",
  ]);
});
