"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { hashTree, stableStringify } = require("./index");

function restoreGovernedGitBaseline(options = {}) {
  const root = path.resolve(options.root || process.cwd());
  const sourceCommit = String(options.sourceCommit || "").trim();
  const expectedDigest = String(options.expectedDigest || "").trim();
  const statePath = options.statePath ? path.resolve(options.statePath) : null;
  const config = options.config;
  const requiredBranch = String(options.requiredBranch || "mission/research-leaves-consolidation-stage-1");

  if (process.env.GITHUB_ACTIONS !== "true") throw new Error("Governed Git rollback repair is restricted to GitHub Actions");
  if (!/^[a-f0-9]{40}$/.test(sourceCommit)) throw new Error("A full source commit SHA is required for governed rollback repair");
  if (!/^[a-f0-9]{64}$/.test(expectedDigest)) throw new Error("A baseline tree digest is required for governed rollback repair");
  if (!config) throw new Error("Topology configuration is required for governed rollback repair");

  const branch = git(root, ["branch", "--show-current"]).trim();
  if (branch !== requiredBranch) throw new Error(`Governed rollback repair rejected branch ${branch || "detached"}`);
  const currentHead = git(root, ["rev-parse", "HEAD"]).trim();
  if (currentHead !== sourceCommit) throw new Error(`Governed rollback repair expected HEAD ${sourceCommit}, received ${currentHead}`);

  git(root, ["reset", "--hard", sourceCommit]);
  git(root, ["clean", "-fdx", "-e", "node_modules", "-e", "dist", "-e", ".env", "-e", ".env.*"]);

  const actualDigest = hashTree(root, config);
  const verified = actualDigest === expectedDigest;
  const rollback = {
    automatic: false,
    completed_at: new Date().toISOString(),
    expected_tree_digest: expectedDigest,
    actual_tree_digest: actualDigest,
    verified,
    recovery_method: "governed_git_reset_and_clean",
    source_commit: sourceCommit,
  };

  if (statePath && fs.existsSync(statePath)) {
    const state = JSON.parse(fs.readFileSync(statePath, "utf8"));
    state.status = verified ? "rolled_back" : "rollback_mismatch";
    state.rollback = rollback;
    state.proof = {
      algorithm: "sha256",
      digest: crypto.createHash("sha256").update(stableStringify({ ...state, proof: undefined })).digest("hex"),
    };
    fs.writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
  }

  if (!verified) throw new Error(`Governed rollback repair digest mismatch: expected ${expectedDigest}, received ${actualDigest}`);
  return { ok: true, status: "rolled_back", rollback };
}

function git(root, args) {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${String(result.stderr || "").trim()}`);
  return result.stdout || "";
}

module.exports = { restoreGovernedGitBaseline };
