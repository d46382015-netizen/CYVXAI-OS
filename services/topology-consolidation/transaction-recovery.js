"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { hashTree, stableStringify } = require("./index");

function restoreCommittedTree(options) {
  const root = path.resolve(options.root);
  const statePath = path.resolve(options.statePath);
  const config = options.config;
  const state = readJson(statePath);
  const expected = state.before_tree_digest;
  if (!expected) throw new Error("Topology run state has no pre-migration tree digest");

  runGit(root, ["reset", "--hard", "HEAD"]);
  runGit(root, ["clean", "-ffdx", "-e", "node_modules/"]);

  const actual = hashTree(root, config);
  const verified = actual === expected;
  state.status = verified ? "rolled_back" : "rollback_mismatch";
  state.rollback = {
    automatic: true,
    recovery: "committed-head-reset",
    completed_at: new Date().toISOString(),
    expected_tree_digest: expected,
    actual_tree_digest: actual,
    verified,
  };
  state.proof = {
    algorithm: "sha256",
    digest: crypto.createHash("sha256").update(stableStringify({ ...state, proof: undefined })).digest("hex"),
  };
  writeJson(statePath, state);
  if (!verified) throw Object.assign(new Error("Committed-tree recovery did not match the pre-migration digest"), { state });
  return state;
}

function runGit(root, args) {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw Object.assign(new Error(`git ${args.join(" ")} failed`), {
      exit_code: result.status,
      stderr: String(result.stderr || "").slice(0, 12000),
    });
  }
}

function readJson(filePath) { return JSON.parse(fs.readFileSync(filePath, "utf8")); }
function writeJson(filePath, value) { fs.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 }); fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 }); }

module.exports = { restoreCommittedTree };
