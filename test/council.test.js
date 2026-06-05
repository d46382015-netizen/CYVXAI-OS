"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { cognitiveCouncilSnapshot } = require("../core/council/cognitive_council");

test("cognitive council exposes AEON and five perspectives", () => {
  const s = cognitiveCouncilSnapshot({ reality: "Build CYVX" });
  assert.equal(s.kernel.name, "AEON Ω");
  assert.equal(s.council.length, 5);
  assert.ok(s.council.find(x => x.name === "ARGUS"));
  assert.ok(s.council.find(x => x.name === "AURORA"));
  assert.ok(s.synthesis.recommended_action);
});
