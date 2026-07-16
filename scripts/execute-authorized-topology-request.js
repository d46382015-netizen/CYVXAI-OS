"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const ROOT = process.cwd();
const REQUEST_PATH = path.join(ROOT, ".cyvx", "topology-execution.json");
const PROOF_DIR = path.resolve(process.env.CYVX_TOPOLOGY_PROOF_DIR || path.join(process.env.RUNNER_TEMP || os.tmpdir(), "topology-execution-proof"));
const STATE_ROOT = path.resolve(process.env.CYVX_TOPOLOGY_ROOT || path.join(os.homedir(), ".cyvx", "topology-consolidation"));
const ALLOWED_STAGE = "research-leaves";
const ALLOWED_REQUEST = "research-leaves-stage-1";
const EXPECTED_MOVES = 6;
const EXPECTED_BRANCH = "mission/research-leaves-consolidation-stage-1";

function main() {
  const branch = runText("git", ["branch", "--show-current"]).trim();
  if (branch !== EXPECTED_BRANCH) fail(`Unauthorized mission branch: ${branch || "detached"}`);
  if (!fs.existsSync(REQUEST_PATH)) {
    writeOutput("executed", "false");
    console.log("No active topology execution request.");
    return;
  }

  run("git", ["fetch", "--no-tags", "origin", "main"]);
  const mergeBase = runText("git", ["merge-base", "origin/main", "HEAD"]).trim();
  const changed = runText("git", ["diff", "--name-only", mergeBase, "HEAD"]).split(/\r?\n/).filter(Boolean);
  if (changed.length !== 1 || changed[0] !== ".cyvx/topology-execution.json") {
    fail(`Mission branch must differ from main only by .cyvx/topology-execution.json; detected: ${changed.join(", ") || "none"}`);
  }

  const request = readJson(REQUEST_PATH);
  validateRequest(request);
  fs.mkdirSync(PROOF_DIR, { recursive: true, mode: 0o700 });
  writeJson(path.join(PROOF_DIR, "request.json"), request);

  const sourceCommit = runText("git", ["rev-parse", "HEAD"]).trim();
  const scan = topologyJson(["scan", "--json"]);
  writeJson(path.join(PROOF_DIR, "scan.json"), scan);

  const plan = topologyJson(["plan", ALLOWED_STAGE, "--json"]);
  if (!plan.ok || Number(plan.summary && plan.summary.blocked_moves) !== 0 || Number(plan.summary && plan.summary.active_moves) !== EXPECTED_MOVES) {
    fail("Topology plan does not match the authorized six-move, unblocked stage", { summary: plan.summary || null });
  }
  const approvalDigest = String(plan.approval && plan.approval.digest || "");
  if (!/^[a-f0-9]{64}$/.test(approvalDigest)) fail("Topology plan did not produce a valid SHA-256 approval digest");
  writeJson(path.join(PROOF_DIR, "plan.json"), plan);
  fs.writeFileSync(path.join(PROOF_DIR, "approved-digest.txt"), `${approvalDigest}\n`, { mode: 0o600 });

  const applyResult = spawnSync(process.execPath, [
    path.join(ROOT, "scripts", "topology-consolidation.js"),
    "apply",
    ALLOWED_STAGE,
    "--approve",
    approvalDigest,
    "--verify",
    "full",
    "--json",
  ], { cwd: ROOT, encoding: "utf8", env: process.env, maxBuffer: 64 * 1024 * 1024 });

  fs.writeFileSync(path.join(PROOF_DIR, "apply.stdout.json"), applyResult.stdout || "", { mode: 0o600 });
  fs.writeFileSync(path.join(PROOF_DIR, "apply.stderr.log"), applyResult.stderr || "", { mode: 0o600 });
  copyStateStore();
  if (applyResult.status !== 0) {
    fail("Topology apply failed; the engine rollback path was invoked", {
      exit_code: applyResult.status,
      stderr: truncate(applyResult.stderr),
    });
  }

  const apply = parseJsonOutput(applyResult.stdout, "topology apply");
  if (apply.status !== "applied" || !apply.run_id) fail("Topology apply did not return an applied run", { apply });
  writeJson(path.join(PROOF_DIR, "apply.json"), apply);
  fs.writeFileSync(path.join(PROOF_DIR, "run-id.txt"), `${apply.run_id}\n`, { mode: 0o600 });

  const verification = topologyJson(["verify-run", apply.run_id, "--json"]);
  if (!verification.ok) fail("Applied topology run failed proof verification", { verification });
  writeJson(path.join(PROOF_DIR, "verification.json"), verification);

  for (const name of ["physics", "science", "thermodynamics", "formal", "futures", "civilization"]) {
    const legacy = path.join(ROOT, name);
    const target = path.join(ROOT, "research", name);
    if (!fs.lstatSync(legacy).isSymbolicLink()) fail(`${name} compatibility alias is not a symbolic link`);
    if (!fs.statSync(target).isDirectory()) fail(`${target} is not a directory`);
  }

  run("npm", ["run", "topology:verify"]);
  run("npm", ["run", "repo:intelligence:verify"]);
  run("git", ["diff", "--check"]);

  const proof = {
    schema_version: 1,
    mission: "CYVX governed topology consolidation",
    request_id: ALLOWED_REQUEST,
    stage_id: ALLOWED_STAGE,
    source_commit: sourceCommit,
    generated_at: new Date().toISOString(),
    request,
    plan,
    apply,
    verification,
  };
  proof.proof = { algorithm: "sha256", digest: sha256(stableStringify(proof)) };
  const committedProof = path.join(ROOT, "artifacts", "topology", ALLOWED_REQUEST, "proof.json");
  writeJson(committedProof, proof);

  fs.unlinkSync(REQUEST_PATH);
  removeEmptyDirectory(path.dirname(REQUEST_PATH));
  const status = runText("git", ["status", "--short"]);
  fs.writeFileSync(path.join(PROOF_DIR, "git-status.txt"), status, { mode: 0o600 });
  if (!status.trim()) fail("Migration produced no repository changes");

  writeOutput("executed", "true");
  writeOutput("run_id", apply.run_id);
  writeOutput("request_id", ALLOWED_REQUEST);
  writeOutput("proof_digest", proof.proof.digest);
  console.log(JSON.stringify({ ok: true, status: "applied", run_id: apply.run_id, proof_digest: proof.proof.digest }, null, 2));
}

function validateRequest(request) {
  if (!request || request.schema_version !== 1) fail("Request schema_version must equal 1");
  if (request.request_id !== ALLOWED_REQUEST) fail(`Request id must equal ${ALLOWED_REQUEST}`);
  if (request.stage_id !== ALLOWED_STAGE) fail(`Stage id must equal ${ALLOWED_STAGE}`);
  if (request.expected_active_moves !== EXPECTED_MOVES) fail(`Expected move count must equal ${EXPECTED_MOVES}`);
  if (request.verify_mode !== "full") fail("Physical topology execution requires full verification");
}

function topologyJson(args) {
  return parseJsonOutput(runText(process.execPath, [path.join(ROOT, "scripts", "topology-consolidation.js"), ...args], { maxBuffer: 64 * 1024 * 1024 }), `topology ${args[0]}`);
}

function parseJsonOutput(text, label) {
  try { return JSON.parse(String(text || "").trim()); }
  catch (error) { fail(`${label} returned invalid JSON: ${error.message}`, { output: truncate(text) }); }
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: ROOT, encoding: "utf8", env: process.env, maxBuffer: options.maxBuffer || 32 * 1024 * 1024, stdio: options.stdio || "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) fail(`${command} ${args.join(" ")} failed`, { exit_code: result.status, stderr: truncate(result.stderr) });
  return result;
}

function runText(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: ROOT, encoding: "utf8", env: process.env, maxBuffer: options.maxBuffer || 32 * 1024 * 1024 });
  if (result.error) throw result.error;
  if (result.status !== 0) fail(`${command} ${args.join(" ")} failed`, { exit_code: result.status, stderr: truncate(result.stderr) });
  return result.stdout || "";
}

function copyStateStore() {
  if (!fs.existsSync(STATE_ROOT)) return;
  fs.cpSync(STATE_ROOT, path.join(PROOF_DIR, "state-store"), { recursive: true, dereference: false });
}

function readJson(filePath) { return JSON.parse(fs.readFileSync(filePath, "utf8")); }
function writeJson(filePath, value) { fs.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 }); fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 }); }
function removeEmptyDirectory(directory) { try { if (fs.readdirSync(directory).length === 0) fs.rmdirSync(directory); } catch {} }
function writeOutput(key, value) { if (!process.env.GITHUB_OUTPUT) return; fs.appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${value}\n`); }
function truncate(value, maximum = 12000) { const text = String(value || ""); return text.length <= maximum ? text : `${text.slice(0, maximum)}\n...[truncated]`; }
function sha256(value) { return crypto.createHash("sha256").update(value).digest("hex"); }
function stableStringify(value) { if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`; if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`; return JSON.stringify(value); }
function fail(message, fields = {}) { const error = new Error(message); Object.assign(error, fields); throw error; }

try { main(); }
catch (error) {
  fs.mkdirSync(PROOF_DIR, { recursive: true, mode: 0o700 });
  writeJson(path.join(PROOF_DIR, "operator-error.json"), { ok: false, error: error.message, code: error.code || "TOPOLOGY_EXECUTION_FAILED", fields: Object.fromEntries(Object.entries(error).filter(([key]) => !["stack", "message"].includes(key))) });
  console.error(JSON.stringify({ ok: false, error: error.message, code: error.code || "TOPOLOGY_EXECUTION_FAILED" }, null, 2));
  process.exitCode = 1;
}
