"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { spawnSync } = require("node:child_process");
const { hashTree } = require("../services/topology-consolidation");
const { restoreGovernedGitBaseline } = require("../services/topology-consolidation/governed-rollback");

function git(root, args) {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`);
  return String(result.stdout || "").trim();
}

test("governed rollback restores tracked, ignored, and untracked verification drift", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cyvx-governed-rollback-"));
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), "cyvx-governed-rollback-state-"));
  const previousActions = process.env.GITHUB_ACTIONS;
  try {
    git(root, ["init"]);
    git(root, ["config", "user.email", "cyvx-test@example.invalid"]);
    git(root, ["config", "user.name", "CYVX Test"]);
    git(root, ["checkout", "-b", "mission/research-leaves-consolidation-stage-1"]);
    fs.writeFileSync(path.join(root, ".gitignore"), "*.log\nnode_modules/\ndist/\n.env\n.env.*\n");
    fs.writeFileSync(path.join(root, "tracked.js"), "module.exports = 'baseline';\n");
    fs.mkdirSync(path.join(root, "node_modules"), { recursive: true });
    fs.writeFileSync(path.join(root, "node_modules", "retained.txt"), "dependency cache");
    fs.writeFileSync(path.join(root, ".env"), "SECRET=preserved\n");
    git(root, ["add", ".gitignore", "tracked.js"]);
    git(root, ["commit", "-m", "baseline"]);

    const sourceCommit = git(root, ["rev-parse", "HEAD"]);
    const config = { exclude: [".git", "node_modules", "dist"], text_extensions: [".js", ".json", ".md"] };
    const expectedDigest = hashTree(root, config);
    const statePath = path.join(stateRoot, "state.json");
    fs.writeFileSync(statePath, `${JSON.stringify({ run_id: "test-run", status: "rollback_mismatch" }, null, 2)}\n`);

    fs.writeFileSync(path.join(root, "tracked.js"), "module.exports = 'mutated';\n");
    fs.writeFileSync(path.join(root, "verification.log"), "generated ignored output\n");
    fs.mkdirSync(path.join(root, "generated"), { recursive: true });
    fs.writeFileSync(path.join(root, "generated", "proof.json"), "{}\n");
    fs.writeFileSync(path.join(root, ".env"), "SECRET=preserved\n");

    process.env.GITHUB_ACTIONS = "true";
    const result = restoreGovernedGitBaseline({
      root,
      sourceCommit,
      expectedDigest,
      statePath,
      config,
      requiredBranch: "mission/research-leaves-consolidation-stage-1",
    });

    assert.equal(result.ok, true);
    assert.equal(result.rollback.verified, true);
    assert.equal(fs.readFileSync(path.join(root, "tracked.js"), "utf8"), "module.exports = 'baseline';\n");
    assert.equal(fs.existsSync(path.join(root, "verification.log")), false);
    assert.equal(fs.existsSync(path.join(root, "generated")), false);
    assert.equal(fs.readFileSync(path.join(root, ".env"), "utf8"), "SECRET=preserved\n");
    assert.equal(fs.existsSync(path.join(root, "node_modules", "retained.txt")), true);
    assert.equal(hashTree(root, config), expectedDigest);
    const state = JSON.parse(fs.readFileSync(statePath, "utf8"));
    assert.equal(state.status, "rolled_back");
    assert.equal(state.rollback.recovery_method, "governed_git_reset_and_clean");
    assert.equal(state.rollback.verified, true);
    assert.match(state.proof.digest, /^[a-f0-9]{64}$/);
  } finally {
    if (previousActions === undefined) delete process.env.GITHUB_ACTIONS;
    else process.env.GITHUB_ACTIONS = previousActions;
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});
