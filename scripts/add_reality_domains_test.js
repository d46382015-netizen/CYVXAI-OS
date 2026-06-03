"use strict";

const fs = require("node:fs");
const path = require("node:path");

const FILE = path.join(process.cwd(), "test/platform.test.js");
let s = fs.readFileSync(FILE, "utf8");

if (!s.includes("reality engine exposes reality domains and ingestion priority")) {
  s += `

test('reality engine exposes reality domains and ingestion priority', () => {
  const kernel = createTempKernel();
  const report = kernel.realityEngine();

  assert.ok(report.reality_domains);
  assert.ok(report.reality_domains.geography);
  assert.ok(Array.isArray(report.reality_domains.geography.sources));
  assert.equal(report.reality_domains.geography.sources[0], 'U.S. Census');
  assert.ok(Array.isArray(report.ingestion_priority));
  assert.equal(report.ingestion_priority[0], 'State GIS');
  assert.ok(report.knowledge_gap_layer);
  assert.ok(report.knowledge_gap_layer.unknown_unknown);
});
`;
}

fs.writeFileSync(FILE, s);
console.log("Reality domain test added.");
