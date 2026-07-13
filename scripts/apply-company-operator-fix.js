#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const file = path.resolve(__dirname, "../services/operator/index.js");
let source = fs.readFileSync(file, "utf8");

function replaceOnce(search, replacement, label) {
  if (source.includes(replacement)) return;
  const count = source.split(search).length - 1;
  if (count !== 1) throw new Error(`${label}: expected one source match, found ${count}`);
  source = source.replace(search, replacement);
}

replaceOnce(
  `    this.runtime = runtime;\n    this.db = runtime.db;`,
  `    this.runtime = runtime;\n    this.logger = runtime.logger || (runtime.store && runtime.store.logger) || { write() {} };\n    runtime.logger = this.logger;\n    this.db = runtime.db;`,
  "runtime logger adapter",
);

replaceOnce(
  `        this.db.prepare(\`UPDATE operator_companies SET spent_cents=spent_cents+?,last_tick_at=?,updated_at=?,\n          qualified_opportunities=CASE WHEN ? IS NULL THEN qualified_opportunities ELSE ? END WHERE id=?\`).run(\n          Number(result.actual_cost_cents || 0), completedAt, completedAt,\n          result.metrics && result.metrics.qualified_opportunities === undefined ? null : Number(result.metrics.qualified_opportunities),\n          result.metrics && result.metrics.qualified_opportunities === undefined ? 0 : Number(result.metrics.qualified_opportunities),\n          company.id,\n        );`,
  `        const qualifiedOpportunities = result.metrics && result.metrics.qualified_opportunities;\n        this.db.prepare(\`UPDATE operator_companies SET spent_cents=spent_cents+?,last_tick_at=?,updated_at=?,\n          qualified_opportunities=CASE WHEN ? IS NULL THEN qualified_opportunities ELSE ? END WHERE id=?\`).run(\n          Number(result.actual_cost_cents || 0), completedAt, completedAt,\n          qualifiedOpportunities === undefined ? null : Number(qualifiedOpportunities),\n          qualifiedOpportunities === undefined ? 0 : Number(qualifiedOpportunities),\n          company.id,\n        );`,
  "optional action metrics",
);

fs.writeFileSync(file, source);
process.stdout.write(`${JSON.stringify({ ok: true, file, bytes: Buffer.byteLength(source) })}\n`);