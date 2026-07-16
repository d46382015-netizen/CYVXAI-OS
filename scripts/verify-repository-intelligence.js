#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createRepositoryIntelligence } = require("../services/repository-intelligence");

const dataRoot = process.env.CYVX_REPOSITORY_INTELLIGENCE_ROOT || fs.mkdtempSync(path.join(os.tmpdir(), "cyvx-repository-intelligence-"));
const intelligence = createRepositoryIntelligence({ dataRoot });
const first = intelligence.scan();
const second = intelligence.scan();
const persisted = intelligence.latest();
const history = intelligence.history(10);

const failures = [];
if (first.summary.critical !== 0) failures.push(`critical findings: ${first.summary.critical}`);
if (first.readiness_score < 70) failures.push(`readiness below 70: ${first.readiness_score}`);
if (!first.proof || !/^[a-f0-9]{64}$/.test(first.proof.digest)) failures.push("missing valid proof digest");
if (!persisted.proof || persisted.proof.digest !== second.proof.digest) failures.push("latest snapshot does not match persisted scan");
if (history.length < 2) failures.push("history did not retain repeated scans");
if (!fs.existsSync(path.join(dataRoot, "latest.md"))) failures.push("Markdown evidence was not written");

const result = {
  ok: failures.length === 0,
  service: "cyvx-repository-intelligence",
  readiness_score: first.readiness_score,
  status: first.status,
  summary: first.summary,
  next_best_action: first.next_best_action,
  proof: first.proof,
  data_root: dataRoot,
  failures,
};
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
if (failures.length) process.exit(1);
