"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { rewriteContent, mapRepositoryPath, reverseMapRepositoryPath } = require("../services/topology-consolidation/path-aware-rewrite");
const executionOperator = require("../scripts/execute-authorized-topology-request");

const moves = [{ source: "futures", target: "research/futures" }];

test("path-aware rewriting changes imports and explicit paths but preserves semantic labels", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cyvx-path-rewrite-"));
  try {
    fs.mkdirSync(path.join(root, "core"), { recursive: true });
    fs.mkdirSync(path.join(root, "research", "futures"), { recursive: true });
    fs.writeFileSync(path.join(root, "research", "futures", "trajectory_engine.js"), "module.exports = {};\n");
    fs.symlinkSync(path.join("research", "futures"), path.join(root, "futures"), "dir");

    const source = [
      'const trajectory = require("../futures/trajectory_engine");',
      'const council = { watches: ["futures", "alternatives"] };',
      'const manifest = "futures/trajectory_engine.js";',
      'const relative = "./futures/trajectory_engine.js";',
      "module.exports = { trajectory, council, manifest, relative };",
      "",
    ].join("\n");

    const rewritten = rewriteContent(root, "core/example.js", "core/example.js", source, moves);
    assert.match(rewritten, /require\("\.\.\/research\/futures\/trajectory_engine"\)/);
    assert.match(rewritten, /watches: \["futures", "alternatives"\]/);
    assert.match(rewritten, /"research\/futures\/trajectory_engine\.js"/);
    assert.match(rewritten, /"\.\/research\/futures\/trajectory_engine\.js"/);
    assert.doesNotMatch(rewritten, /watches: \["research\/futures"/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("a moved importer rebases relative imports to unmoved repository roots", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cyvx-import-rebase-"));
  try {
    fs.mkdirSync(path.join(root, "core", "lib"), { recursive: true });
    fs.mkdirSync(path.join(root, "research", "futures"), { recursive: true });
    fs.writeFileSync(path.join(root, "core", "lib", "cyxv.js"), "module.exports = {};\n");
    fs.symlinkSync(path.join("research", "futures"), path.join(root, "futures"), "dir");

    const source = 'const { validate } = require("../core/lib/cyxv");\n';
    const rewritten = rewriteContent(root, "futures/validator.js", "research/futures/validator.js", source, moves);
    assert.equal(rewritten, 'const { validate } = require("../../core/lib/cyxv");\n');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("forward and reverse path mapping are exact", () => {
  assert.equal(mapRepositoryPath("futures/trajectory_engine.js", moves), "research/futures/trajectory_engine.js");
  assert.equal(reverseMapRepositoryPath("research/futures/trajectory_engine.js", moves), "futures/trajectory_engine.js");
  assert.equal(mapRepositoryPath("core/futures-analysis.js", moves), "core/futures-analysis.js");
});

test("the governed execution operator is loadable without executing", () => {
  assert.equal(typeof executionOperator.main, "function");
});
