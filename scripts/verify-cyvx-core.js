#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createMissionRuntime } = require("../runtime/missions");
const { LIFECYCLE, createCyvxCore, sha256 } = require("../runtime/core");

async function main() {
  const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), "cyvx-core-verify-"));
  const workspaceRoot = path.join(dataRoot, "workspace");
  fs.mkdirSync(workspaceRoot, { recursive: true });
  const missionRuntime = createMissionRuntime({ dataRoot, allowLocalAuth: true });
  missionRuntime.logger = missionRuntime.logger || missionRuntime.store?.logger;
  const core = createCyvxCore(missionRuntime, { workspaceRoot });
  const content = `${JSON.stringify({ service: "cyvx-core", verified_at: new Date().toISOString() })}\n`;
  try {
    const result = await core.run({
      objective: "Verify the production CYVX Core lifecycle and capability evidence path",
      memory_subject: "cyvx-core-verification",
      operations: [
        {
          id: "write-proof",
          capability: "filesystem.write",
          input: { path: "proof/core-verification.jsonl", content },
        },
        {
          id: "read-proof",
          capability: "filesystem.read",
          depends_on: ["write-proof"],
          input: { path: "proof/core-verification.jsonl" },
        },
      ],
      success_criteria: [
        { path: "execute.results.1.output.sha256", operator: "eq", value: sha256(content) },
      ],
    }, {
      user_id: "cyvx-core-verifier",
      organization_id: "verification",
      role: "admin",
      permissions: ["runtime.read", "filesystem.read", "filesystem.write", "learning.write"],
    }, {
      idempotency_key: "cyvx-core-v1-verification",
      budget: { max_capability_invocations: 10, max_duration_ms: 60000 },
    });

    const run = result.run;
    const proof = {
      schema_version: 1,
      ok: run.status === "completed",
      generated_at: new Date().toISOString(),
      runtime: "CYVX Core v1",
      run_id: run.id,
      lifecycle: LIFECYCLE,
      completed_stages: run.stages.filter((stage) => stage.status === "completed").length,
      capability_invocations: run.invocations.map((invocation) => ({
        capability: invocation.capability,
        status: invocation.status,
        attempts: invocation.attempts,
        input_sha256: invocation.input_sha256,
        output_sha256: invocation.output_sha256,
        duration_ms: invocation.duration_ms,
      })),
      learning_records: run.learning.map((record) => ({
        id: record.id,
        subject: record.subject,
        outcome: record.outcome,
        created_at: record.created_at,
      })),
      event_count: run.events.length,
      proof_file_sha256: sha256(content),
      truth_boundary: "This verification proves the local CYVX Core lifecycle, governed capability execution, durable tracing, evidence hashing, and learning persistence. It does not claim external provider execution or business outcomes.",
    };
    if (!proof.ok || proof.completed_stages !== LIFECYCLE.length || proof.capability_invocations.length !== 2 || proof.learning_records.length !== 1) {
      throw new Error(`CYVX Core verification invariants failed: ${JSON.stringify(proof)}`);
    }
    const artifact = path.resolve("artifacts/cyvx-core/verification.json");
    fs.mkdirSync(path.dirname(artifact), { recursive: true });
    fs.writeFileSync(artifact, `${JSON.stringify(proof, null, 2)}\n`, "utf8");
    process.stdout.write(`${JSON.stringify({ ...proof, artifact }, null, 2)}\n`);
  } finally {
    missionRuntime.close();
    fs.rmSync(dataRoot, { recursive: true, force: true });
  }
}

main().catch((error) => {
  process.stderr.write(`${JSON.stringify({ ok: false, event: "cyvx_core_verification_failed", error: error.stack || error.message }, null, 2)}\n`);
  process.exit(1);
});
