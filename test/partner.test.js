"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createPartnerBrief } = require("../core/partner/partner");

test("CYVX Partner creates persistent agency brief", () => {
  const brief = createPartnerBrief({
    goal: "Build CYVX Partner Alpha into one measurable agency loop",
    resources: ["running API", "running UI"],
    constraints: ["must move fast"]
  });

  assert.equal(brief.primitive, "Agency");
  assert.ok(brief.agency_score >= 0);
  assert.ok(brief.mission);
  assert.ok(brief.mission.next_best_action);
  assert.ok(brief.top_constraint);
});
