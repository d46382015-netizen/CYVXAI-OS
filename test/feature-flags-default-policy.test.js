"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { DEFAULT_FLAGS, FeatureFlagService } = require("../core/integrations/feature_flags");

test("operating capabilities are approved by default", () => {
  for (const key of [
    "external_tools.enabled",
    "paid_operations.enabled",
    "signup.enabled",
    "billing.enabled",
    "email.enabled",
  ]) {
    assert.equal(DEFAULT_FLAGS[key].value, true, `${key} should default to approved`);
    assert.equal(DEFAULT_FLAGS[key].safety, "approve-by-default");
  }
});

test("unknown boolean flags approve by default", () => {
  const flags = new FeatureFlagService({ env: { NODE_ENV: "test" } });
  const decision = flags.getDetails("new_capability.enabled", false);
  assert.equal(decision.value, true);
  assert.equal(decision.reason, "APPROVE_BY_DEFAULT");
  assert.equal(flags.snapshot().approve_by_default, true);
});

test("approve-by-default policy can be disabled by environment", () => {
  const flags = new FeatureFlagService({
    env: { NODE_ENV: "test", CYVX_APPROVE_BY_DEFAULT: "false" },
  });
  const decision = flags.getDetails("new_capability.enabled", false);
  assert.equal(decision.value, false);
  assert.equal(decision.reason, "FLAG_NOT_FOUND");
});

test("environment overrides remain authoritative", () => {
  const flags = new FeatureFlagService({
    env: {
      NODE_ENV: "test",
      CYVX_FEATURE_FLAGS_JSON: JSON.stringify({ "paid_operations.enabled": false }),
    },
  });
  const decision = flags.getDetails("paid_operations.enabled", true);
  assert.equal(decision.value, false);
  assert.equal(decision.reason, "DEFAULT");
});

test("managed disabled rows explicitly deny a boolean capability", () => {
  const flags = new FeatureFlagService({ env: { CYVX_ENV: "production" } });
  flags.rows = [{
    flag_key: "external_tools.enabled",
    flag_type: "boolean",
    flag_value: true,
    enabled: false,
    tenant_id: null,
    environment: "production",
    updated_at: new Date().toISOString(),
  }];
  const decision = flags.getDetails("external_tools.enabled", true);
  assert.equal(decision.value, false);
  assert.equal(decision.reason, "EXPLICIT_DENY");
  assert.equal(decision.source, "database");
});
