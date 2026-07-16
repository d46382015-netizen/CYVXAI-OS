"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");
const { hashTree } = require("../services/topology-consolidation");
const { restoreCommittedTree } = require("../services/topology-consolidation/transaction-recovery");

function git(root, args) {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr || `git ${args.join(" ")} failed`);
  return result.stdout.trim();
}

test("committed-tree recovery removes generated verification noise and proves the original digest", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cyvx-transaction-recovery-"));
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), "cyvx-transaction-state-"));
  const config = { exclude: [".git", "node_modules", "dist", "coverage", ".next", ".cache", "vendor"] };
  try {
    git(root, ["init"]);
    git(root, ["config", "user.name", "CYVX Test"]);
    git(root, ["config", "user.email", "cyvx-test@example.invalid"]);
    fs.writeFileSync(path.join(root, ".gitignore"), "generated/\n");
    fs.mkdirSync(path.join(root, "physics"), { recursive: true });
    fs.writeFileSync(path.join(root, "physics", "model.js"), "module.exports = 1;\n");
    git(root, ["add", "-A"]);
    git(root, ["commit", "-m", "baseline"]);

    const before = hashTree(root, config);
    const statePath = path.join(stateRoot, "state.json");
    fs.writeFileSync(statePath, `${JSON.stringify({ run_id: "test-run", stage_id: "research-leaves", status: "rollback_mismatch", before_tree_digest: before }, null, 2)}\n`);

    fs.writeFileSync(path.join(root, "physics", "model.js"), "module.exports = 2;\n");
    fs.mkdirSync(path.join(root, "generated"), { recursive: true });
    fs.writeFileSync(path.join(root, "generated", "verification.json"), "{}\n");
    fs.writeFileSync(path.join(root, "untracked.txt"), "temporary\n");

    const recovered = restoreCommittedTree({ root, statePath, config });
    assert.equal(recovered.status, "rolled_back");
    assert.equal(recovered.rollback.verified, true);
    assert.equal(recovered.rollback.recovery, "committed-head-reset");
    assert.equal(hashTree(root, config), before);
    assert.equal(fs.readFileSync(path.join(root, "physics", "model.js"), "utf8"), "module.exports = 1;\n");
    assert.equal(fs.existsSync(path.join(root, "generated")), false);
    assert.equal(fs.existsSync(path.join(root, "untracked.txt")), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});
