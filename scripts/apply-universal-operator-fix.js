#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const file = path.resolve(__dirname, "../services/operator/universal.js");
let source = fs.readFileSync(file, "utf8");

function replaceOnce(search, replacement, label) {
  if (source.includes(replacement)) return;
  const count = source.split(search).length - 1;
  if (count !== 1) throw new Error(`${label}: expected one source match, found ${count}`);
  source = source.replace(search, replacement);
}

replaceOnce(
  `    if (compare(actual, contract.comparator, Number(contract.target_value))) return { terminal: true, outcome: "achieved", reason: \`Target achieved: \${contract.target_metric} \${actual} \${contract.comparator} \${contract.target_value}\`, actual };`,
  `    if (entity.activation_status === "learned" && compare(actual, contract.comparator, Number(contract.target_value))) return { terminal: true, outcome: "achieved", reason: \`Target achieved: \${contract.target_metric} \${actual} \${contract.comparator} \${contract.target_value}\`, actual };`,
  "activation-before-outcome rule",
);

fs.writeFileSync(file, source);
process.stdout.write(`${JSON.stringify({ ok: true, file, bytes: Buffer.byteLength(source) })}\n`);