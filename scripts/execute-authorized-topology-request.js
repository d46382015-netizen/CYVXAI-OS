"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { hashTree, stableStringify: topologyStableStringify } = require("../services/topology-consolidation");
const { restoreAndRewrite } = require("../services/topology-consolidation/path-aware-rewrite");

const ROOT = process.cwd();
const REQUEST_PATH = path.join(ROOT, ".cyvx", "topology-execution.json");
const PROOF_DIR = path.resolve(process.env.CYVX_TOPOLOGY_PROOF_DIR || path.join(process.env.RUNNER_TEMP || os.tmpdir(), "topology-execution-proof"));
const STATE_ROOT = path.resolve(process.env.CYVX_TOPOLOGY_ROOT || path.join(os.homedir(), ".cyvx", "topology-consolidation"));
const CONFIG = readJson(path.join(ROOT, "config", "topology-consolidation.json"));
const STAGE = "research-leaves";
const REQUEST = "research-leaves-stage-1";
const BRANCH = "mission/research-leaves-consolidation-stage-1";
const MOVES = ["physics", "science", "thermodynamics", "formal", "futures", "civilization"].map((source) => ({ source, target: `research/${source}` }));
let activeRunId = null;

function main() {
  authorize();
  const request = readJson(REQUEST_PATH);
  validateRequest(request);
  fs.mkdirSync(PROOF_DIR, { recursive: true, mode: 0o700 });
  writeJson(path.join(PROOF_DIR, "request.json"), request);

  const sourceCommit = runText("git", ["rev-parse", "HEAD"]).trim();
  const scan = topologyJson(["scan", "--json"]);
  const plan = topologyJson(["plan", STAGE, "--json"]);
  writeJson(path.join(PROOF_DIR, "scan.json"), scan);
  writeJson(path.join(PROOF_DIR, "plan.json"), plan);
  if (!plan.ok || plan.summary.blocked_moves !== 0 || plan.summary.active_moves !== MOVES.length) fail("The current plan is not the authorized six-move stage", { summary: plan.summary });
  const approval = String(plan.approval && plan.approval.digest || "");
  if (!/^[a-f0-9]{64}$/.test(approval)) fail("The plan did not produce a valid SHA-256 approval digest");
  fs.writeFileSync(path.join(PROOF_DIR, "approved-digest.txt"), `${approval}\n`, { mode: 0o600 });

  const applied = runCaptured(process.execPath, [path.join(ROOT, "scripts", "topology-consolidation.js"), "apply", STAGE, "--approve", approval, "--verify", "none", "--json"]);
  fs.writeFileSync(path.join(PROOF_DIR, "apply.stdout.json"), applied.stdout, { mode: 0o600 });
  fs.writeFileSync(path.join(PROOF_DIR, "apply.stderr.log"), applied.stderr, { mode: 0o600 });
  if (applied.status !== 0) fail("The governed move transaction failed", { verification: applied });
  const initialState = parseJson(applied.stdout, "topology apply");
  activeRunId = initialState.run_id;
  if (initialState.status !== "applied" || !activeRunId) fail("The move transaction did not return an applied run", { initialState });
  writeJson(path.join(PROOF_DIR, "apply-initial.json"), initialState);
  fs.writeFileSync(path.join(PROOF_DIR, "run-id.txt"), `${activeRunId}\n`, { mode: 0o600 });

  const statePath = runStatePath(activeRunId);
  const state = restoreAndRewrite({ root: ROOT, statePath, proofDir: PROOF_DIR, config: CONFIG, moves: MOVES });
  const fullVerification = runCaptured("npm", ["run", "verify:production-baseline"], { timeout: 1200000 });
  state.verification = [fullVerification];
  writeJson(statePath, state);
  writeJson(path.join(PROOF_DIR, "full-verification.json"), fullVerification);
  fs.writeFileSync(path.join(PROOF_DIR, "full-verification.stdout.log"), fullVerification.stdout, { mode: 0o600 });
  fs.writeFileSync(path.join(PROOF_DIR, "full-verification.stderr.log"), fullVerification.stderr, { mode: 0o600 });
  if (fullVerification.status !== 0) fail("Full production verification failed after path-aware rewriting", { verification: fullVerification });

  state.status = "applied";
  state.completed_at = new Date().toISOString();
  state.after_tree_digest = hashTree(ROOT, CONFIG);
  state.proof = { algorithm: "sha256", digest: sha256(topologyStableStringify({ ...state, proof: undefined })) };
  writeJson(statePath, state);
  appendHistory(state);

  const verification = topologyJson(["verify-run", activeRunId, "--json"]);
  if (!verification.ok) fail("The applied topology run did not verify", { verification });
  writeJson(path.join(PROOF_DIR, "verification.json"), verification);
  verifyAliases();
  run("npm", ["run", "topology:verify"]);
  run("npm", ["run", "repo:intelligence:verify"]);
  run("git", ["diff", "--check"]);

  const proof = { schema_version: 1, mission: "CYVX governed topology consolidation", request_id: REQUEST, stage_id: STAGE, source_commit: sourceCommit, generated_at: new Date().toISOString(), request, plan, apply: state, verification };
  proof.proof = { algorithm: "sha256", digest: sha256(stableStringify(proof)) };
  writeJson(path.join(ROOT, "artifacts", "topology", REQUEST, "proof.json"), proof);

  fs.unlinkSync(REQUEST_PATH);
  removeEmptyDirectory(path.dirname(REQUEST_PATH));
  const status = runText("git", ["status", "--short"]);
  fs.writeFileSync(path.join(PROOF_DIR, "git-status.txt"), status, { mode: 0o600 });
  if (!status.trim()) fail("The verified migration produced no repository changes");
  copyStateStore();
  activeRunId = null;
  writeOutput("executed", "true");
  writeOutput("run_id", state.run_id);
  writeOutput("proof_digest", proof.proof.digest);
  console.log(JSON.stringify({ ok: true, status: "applied", run_id: state.run_id, proof_digest: proof.proof.digest }, null, 2));
}

function authorize() {
  const branch = runText("git", ["branch", "--show-current"]).trim();
  if (branch !== BRANCH) fail(`Unauthorized mission branch: ${branch || "detached"}`);
  if (!fs.existsSync(REQUEST_PATH)) { writeOutput("executed", "false"); console.log("No active topology execution request."); process.exit(0); }
  run("git", ["fetch", "--no-tags", "origin", "main"]);
  const base = runText("git", ["merge-base", "origin/main", "HEAD"]).trim();
  const changed = runText("git", ["diff", "--name-only", base, "HEAD"]).split(/\r?\n/).filter(Boolean);
  if (changed.length !== 1 || changed[0] !== ".cyvx/topology-execution.json") fail(`Mission branch must differ from main only by the authorization request; detected: ${changed.join(", ") || "none"}`);
}

function validateRequest(value) {
  if (!value || value.schema_version !== 1 || value.request_id !== REQUEST || value.stage_id !== STAGE || value.expected_active_moves !== MOVES.length || value.verify_mode !== "full") fail("Topology authorization request is invalid");
}

function verifyAliases() {
  for (const move of MOVES) {
    const legacy = path.join(ROOT, move.source);
    const target = path.join(ROOT, move.target);
    if (!fs.lstatSync(legacy).isSymbolicLink()) fail(`${move.source} is not a compatibility symlink`);
    if (!fs.statSync(target).isDirectory()) fail(`${move.target} is not a directory`);
  }
}

function runCaptured(command, args, options = {}) {
  const started = Date.now();
  const result = spawnSync(command, args, { cwd: ROOT, encoding: "utf8", env: { ...process.env, CYVX_TOPOLOGY_VERIFICATION: "1" }, maxBuffer: 64 * 1024 * 1024, timeout: options.timeout || 1200000 });
  return { command: `${command} ${args.join(" ")}`, status: result.status, signal: result.signal || null, elapsed_ms: Date.now() - started, stdout: truncate(result.stdout, 100000), stderr: truncate(`${result.stderr || ""}${result.error ? `\n${result.error.message}` : ""}`, 100000) };
}

function topologyJson(args) { return parseJson(runText(process.execPath, [path.join(ROOT, "scripts", "topology-consolidation.js"), ...args], { maxBuffer: 64 * 1024 * 1024 }), `topology ${args[0]}`); }
function parseJson(text, label) { try { return JSON.parse(String(text || "").trim()); } catch (error) { fail(`${label} returned invalid JSON: ${error.message}`, { output: truncate(text) }); } }
function run(command, args) { const result = spawnSync(command, args, { cwd: ROOT, encoding: "utf8", env: process.env, maxBuffer: 32 * 1024 * 1024, stdio: "inherit" }); if (result.error) throw result.error; if (result.status !== 0) fail(`${command} ${args.join(" ")} failed`); }
function runText(command, args, options = {}) { const result = spawnSync(command, args, { cwd: ROOT, encoding: "utf8", env: process.env, maxBuffer: options.maxBuffer || 32 * 1024 * 1024 }); if (result.error) throw result.error; if (result.status !== 0) fail(`${command} ${args.join(" ")} failed`, { stderr: truncate(result.stderr) }); return result.stdout || ""; }
function runStatePath(runId) { return path.join(STATE_ROOT, "runs", runId, "state.json"); }
function appendHistory(state) { fs.mkdirSync(STATE_ROOT, { recursive: true, mode: 0o700 }); fs.appendFileSync(path.join(STATE_ROOT, "history.jsonl"), `${JSON.stringify({ run_id: state.run_id, stage_id: state.stage_id, status: state.status, started_at: state.started_at, completed_at: state.completed_at, proof: state.proof })}\n`, { mode: 0o600 }); }
function copyStateStore() { if (!fs.existsSync(STATE_ROOT)) return; fs.rmSync(path.join(PROOF_DIR, "state-store"), { recursive: true, force: true }); fs.cpSync(STATE_ROOT, path.join(PROOF_DIR, "state-store"), { recursive: true, dereference: false }); }
function readJson(filePath) { return JSON.parse(fs.readFileSync(filePath, "utf8")); }
function writeJson(filePath, value) { fs.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 }); fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 }); }
function removeEmptyDirectory(directory) { try { if (fs.readdirSync(directory).length === 0) fs.rmdirSync(directory); } catch {} }
function writeOutput(key, value) { if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${value}\n`); }
function truncate(value, maximum = 12000) { const text = String(value || ""); return text.length <= maximum ? text : `${text.slice(0, maximum)}\n...[truncated]`; }
function sha256(value) { return crypto.createHash("sha256").update(value).digest("hex"); }
function stableStringify(value) { if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`; if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`; return JSON.stringify(value); }
function fail(message, fields = {}) { const error = new Error(message); Object.assign(error, fields); throw error; }

if (require.main === module) {
  try { main(); }
  catch (error) {
    let rollback = null;
    if (activeRunId) {
      try { rollback = topologyJson(["rollback", activeRunId, "--json"]); }
      catch (rollbackError) { rollback = { ok: false, error: rollbackError.message }; }
    }
    fs.mkdirSync(PROOF_DIR, { recursive: true, mode: 0o700 });
    copyStateStore();
    writeJson(path.join(PROOF_DIR, "operator-error.json"), { ok: false, error: error.message, fields: Object.fromEntries(Object.entries(error).filter(([key]) => !["stack", "message"].includes(key))), rollback });
    console.error(JSON.stringify({ ok: false, error: error.message, rollback_verified: Boolean(rollback && rollback.rollback && rollback.rollback.verified) }, null, 2));
    process.exitCode = 1;
  }
}

module.exports = { main };
