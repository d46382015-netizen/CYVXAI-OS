"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { createMissionRuntime } = require("../runtime/missions");
const {
  LIFECYCLE,
  CapabilityRegistry,
  createCyvxCore,
  sha256,
} = require("../runtime/core");

function fixture(options = {}) {
  const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), "cyvx-core-v1-"));
  const repoRoot = path.join(dataRoot, "workspace");
  fs.mkdirSync(repoRoot, { recursive: true });
  const missionRuntime = createMissionRuntime({ dataRoot, allowLocalAuth: true });
  missionRuntime.logger = missionRuntime.logger || missionRuntime.store?.logger;
  const core = createCyvxCore(missionRuntime, { workspaceRoot: repoRoot, ...options });
  const principal = {
    user_id: "core-test-admin",
    organization_id: "default",
    role: "admin",
    permissions: ["runtime.read", "filesystem.read", "filesystem.write", "learning.write"],
  };
  return { dataRoot, repoRoot, missionRuntime, core, principal };
}

test("CYVX Core owns the complete observe-to-learn lifecycle with durable evidence", async () => {
  const { repoRoot, missionRuntime, core, principal } = fixture();
  const content = "CYVX Core production evidence\n";
  try {
    const result = await core.run({
      objective: "Write and verify the first CYVX Core owned artifact",
      memory_subject: "cyvx-core-artifact",
      operations: [
        {
          id: "write-artifact",
          capability: "filesystem.write",
          input: { path: "artifacts/core-v1/first-proof.txt", content },
        },
        {
          id: "read-artifact",
          capability: "filesystem.read",
          depends_on: ["write-artifact"],
          input: { path: "artifacts/core-v1/first-proof.txt" },
        },
      ],
      success_criteria: [
        { path: "execute.results.1.output.sha256", operator: "eq", value: sha256(content) },
        { path: "execute.results.1.output.content", operator: "eq", value: content },
      ],
    }, principal, { idempotency_key: "core-v1-first-proof" });

    assert.equal(result.reused, false);
    assert.equal(result.run.status, "completed");
    assert.equal(result.run.context.status, "completed");
    assert.equal(result.run.stages.length, LIFECYCLE.length);
    assert.deepEqual(result.run.stages.map((stage) => stage.stage), LIFECYCLE);
    assert.ok(result.run.stages.every((stage) => stage.status === "completed"));
    assert.equal(result.run.invocations.length, 2);
    assert.ok(result.run.invocations.every((invocation) => invocation.status === "completed"));
    assert.equal(result.run.learning.length, 1);
    assert.equal(result.run.learning[0].outcome, "completed");
    const proofPath = path.join(repoRoot, "artifacts/core-v1/first-proof.txt");
    assert.equal(fs.readFileSync(proofPath, "utf8"), content);
    assert.match(result.run.invocations[0].result.output_sha256, /^[a-f0-9]{64}$/);
    assert.ok(result.run.events.some((event) => event.type === "core.run.completed"));
  } finally {
    missionRuntime.close();
  }
});

test("CYVX Core denies ungranted capabilities and learns from the failed execution", async () => {
  const { repoRoot, missionRuntime, core } = fixture();
  let runId;
  try {
    await assert.rejects(
      () => core.run({
        objective: "Attempt an unapproved filesystem mutation",
        capability: "filesystem.write",
        input: { path: "denied.txt", content: "must not exist" },
      }, {
        user_id: "viewer",
        organization_id: "default",
        role: "viewer",
        permissions: ["runtime.read"],
      }),
      (error) => {
        assert.equal(error.code, "CORE_PERMISSION_DENIED");
        assert.equal(error.status, 403);
        runId = error.details.run_id;
        return true;
      },
    );
    assert.ok(runId);
    const failed = core.getRun(runId, { organization_id: "default" });
    assert.equal(failed.status, "failed");
    assert.equal(failed.stages.find((stage) => stage.stage === "execute").status, "failed");
    assert.ok(failed.learning.some((record) => record.outcome === "failed"));
    assert.equal(fs.existsSync(path.join(repoRoot, "denied.txt")), false);
  } finally {
    missionRuntime.close();
  }
});

test("CYVX Core reuses idempotent requests instead of executing twice", async () => {
  const { missionRuntime, core, principal } = fixture();
  try {
    const request = {
      objective: "Inspect the CYVX capability bus exactly once",
      capability: "runtime.inspect",
      input: {},
      idempotency_key: "inspect-capability-bus-001",
    };
    const first = await core.run(request, principal);
    const second = await core.run(request, principal);
    assert.equal(first.reused, false);
    assert.equal(second.reused, true);
    assert.equal(second.run.id, first.run.id);
    assert.equal(core.listRuns(principal).length, 1);
    assert.equal(second.run.invocations.length, 1);
  } finally {
    missionRuntime.close();
  }
});

test("CYVX capability execution retries transient failures and records final reliability evidence", async () => {
  const registry = new CapabilityRegistry({ logger: { info() {}, error() {} } });
  let attempts = 0;
  registry.register({
    name: "system.transient-operation",
    description: "Exercise governed retry behavior",
    permission: "system.execute",
    risk_level: "medium",
    retries: 2,
    timeout_ms: 5000,
    handler() {
      attempts += 1;
      if (attempts === 1) {
        const error = new Error("temporary provider outage");
        error.code = "PROVIDER_TEMPORARY";
        throw error;
      }
      return { output: { recovered: true, attempts }, evidence: [{ type: "provider_receipt", receipt: "retry-001" }] };
    },
  });
  const { missionRuntime, core } = fixture({ registry, registerBuiltins: false });
  try {
    const result = await core.run({
      objective: "Recover a transient provider operation",
      capability: "system.transient-operation",
      input: {},
    }, {
      user_id: "operator",
      organization_id: "default",
      role: "admin",
      permissions: ["system.execute"],
    });
    assert.equal(result.run.status, "completed");
    assert.equal(attempts, 2);
    assert.equal(result.run.invocations[0].attempts, 2);
    assert.equal(result.run.invocations[0].result.output.recovered, true);
  } finally {
    missionRuntime.close();
  }
});

test("CYVX Core rejects cyclic capability plans before any action executes", async () => {
  const { missionRuntime, core, principal } = fixture();
  let runId;
  try {
    await assert.rejects(() => core.run({
      objective: "Reject an invalid dependency cycle",
      operations: [
        { id: "a", capability: "runtime.inspect", depends_on: ["b"], input: {} },
        { id: "b", capability: "runtime.inspect", depends_on: ["a"], input: {} },
      ],
    }, principal), (error) => {
      assert.equal(error.code, "CORE_PLAN_CYCLE");
      runId = error.details.run_id;
      return true;
    });
    const failed = core.getRun(runId, principal);
    assert.equal(failed.invocations.length, 0);
    assert.ok(failed.learning.some((record) => record.outcome === "failed"));
  } finally {
    missionRuntime.close();
  }
});
