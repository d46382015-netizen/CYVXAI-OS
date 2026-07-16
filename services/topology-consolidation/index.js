"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const DEFAULT_EXCLUDES = new Set([".git", "node_modules", "dist", "coverage", ".next", ".cache", "vendor"]);
const DEFAULT_TEXT_EXTENSIONS = new Set([".cjs", ".css", ".html", ".js", ".json", ".md", ".mjs", ".sh", ".sql", ".ts", ".tsx", ".yaml", ".yml"]);
const MODULE_EXTENSIONS = ["", ".js", ".cjs", ".mjs", ".json", ".ts", ".tsx"];
const SPECIFIER_PATTERNS = [
  /\brequire\s*\(\s*(["'`])([^"'`]+)\1\s*\)/g,
  /\bimport\s*\(\s*(["'`])([^"'`]+)\1\s*\)/g,
  /\b(?:import|export)\s+(?:[^"'`]*?\s+from\s+)?(["'`])([^"'`]+)\1/g,
];

function createTopologyConsolidation(options = {}) {
  const root = path.resolve(options.root || process.cwd());
  const configPath = path.resolve(options.configPath || path.join(root, "config", "topology-consolidation.json"));
  const config = options.config || readJson(configPath, "topology consolidation config");
  validateConfig(config);
  const dataRoot = path.resolve(options.dataRoot || process.env.CYVX_TOPOLOGY_ROOT || path.join(os.homedir(), ".cyvx", "topology-consolidation"));
  const logger = options.logger || createLogger(path.join(dataRoot, "topology-consolidation.jsonl"));
  const requireClean = options.requireClean !== false;

  function scan() {
    const files = walkFiles(root, config);
    const graph = buildDependencyGraph(root, files);
    const stages = config.stages.map((stage) => summarizeStage(root, files, graph, stage, config));
    const snapshot = {
      ok: true,
      service: "cyvx-topology-consolidation",
      schema_version: 1,
      config_version: config.version,
      generated_at: new Date().toISOString(),
      root,
      files: { text: files.length, modules: graph.nodes.length },
      graph,
      stages,
    };
    snapshot.proof = { algorithm: "sha256", digest: digest(stableStringify(snapshot)) };
    persistLatest(dataRoot, "scan", snapshot);
    logger.write("info", "topology.scan.completed", { files: files.length, edges: graph.edges.length, digest: snapshot.proof.digest });
    return snapshot;
  }

  function plan(stageId, planOptions = {}) {
    const stage = getStage(config, stageId);
    const files = walkFiles(root, config);
    const graph = buildDependencyGraph(root, files);
    const moves = stage.moves.map((move) => buildMovePlan(root, files, graph, stage, move, config));
    const activeMoves = moves.filter((move) => move.source_exists);
    const blocked = moves.filter((move) => move.blocked_reasons.length > 0);
    const planDocument = {
      ok: blocked.length === 0 && activeMoves.length > 0,
      service: "cyvx-topology-consolidation",
      schema_version: 1,
      config_version: config.version,
      generated_at: new Date().toISOString(),
      root,
      stage: {
        id: stage.id,
        title: stage.title,
        description: stage.description,
        risk: stage.risk,
        approval_required: true,
      },
      summary: {
        configured_moves: moves.length,
        active_moves: activeMoves.length,
        skipped_missing_sources: moves.length - activeMoves.length,
        blocked_moves: blocked.length,
        files_to_move: activeMoves.reduce((sum, move) => sum + move.file_count, 0),
        module_edges_affected: activeMoves.reduce((sum, move) => sum + move.module_edges_affected, 0),
        text_references_affected: activeMoves.reduce((sum, move) => sum + move.text_references_affected, 0),
      },
      moves,
      verification: config.verification,
      stop_conditions: config.stop_conditions || [],
      baseline: { tree_digest: hashTree(root, config), git_head: gitHead(root) },
    };
    const digestInput = { ...planDocument, generated_at: undefined };
    planDocument.approval = {
      algorithm: "sha256",
      digest: digest(stableStringify(digestInput)),
      instruction: "Apply only with the exact digest from this plan and an unchanged repository tree.",
    };
    if (planOptions.persist !== false) persistPlan(dataRoot, stage.id, planDocument);
    logger.write("info", "topology.plan.created", { stage_id: stage.id, ok: planDocument.ok, active_moves: activeMoves.length, digest: planDocument.approval.digest });
    return planDocument;
  }

  function apply(stageId, applyOptions = {}) {
    const approvalDigest = String(applyOptions.approvalDigest || "").trim();
    const verifyMode = String(applyOptions.verifyMode || "quick");
    const planDocument = plan(stageId, { persist: true });
    if (!planDocument.ok) throw codedError("Topology plan is not executable", "TOPOLOGY_PLAN_BLOCKED", { plan: planDocument });
    if (!approvalDigest || !safeEqual(approvalDigest, planDocument.approval.digest)) {
      throw codedError("Exact topology plan digest approval is required", "TOPOLOGY_APPROVAL_REQUIRED", { expected_digest: planDocument.approval.digest });
    }
    if (requireClean && !applyOptions.allowDirty) assertCleanWorkingTree(root, dataRoot);
    const currentDigest = hashTree(root, config);
    if (currentDigest !== planDocument.baseline.tree_digest) throw codedError("Repository changed after plan generation", "TOPOLOGY_BASELINE_DRIFT");

    return withLock(dataRoot, () => {
      const runId = applyOptions.runId || `${stageId}-${new Date().toISOString().replace(/[:.]/g, "-")}-${crypto.randomUUID().slice(0, 8)}`;
      const runDir = path.join(dataRoot, "runs", runId);
      fs.mkdirSync(path.join(runDir, "backups"), { recursive: true, mode: 0o700 });
      const state = {
        run_id: runId,
        stage_id: stageId,
        status: "applying",
        started_at: new Date().toISOString(),
        approval_digest: approvalDigest,
        before_tree_digest: currentDigest,
        git_head: gitHead(root),
        moves: [],
        rewritten_files: [],
        verification: [],
      };
      writeState(runDir, state);
      logger.write("info", "topology.apply.started", { run_id: runId, stage_id: stageId, digest: approvalDigest });

      try {
        const activeMoves = planDocument.moves.filter((move) => move.source_exists);
        const sourceToTarget = activeMoves.map(({ source, target }) => ({ source, target }));
        const rewritePlan = buildRewritePlan(root, walkFiles(root, config), sourceToTarget);
        backupFiles(root, runDir, rewritePlan.map((item) => item.path));

        for (const move of activeMoves) {
          const sourceAbsolute = path.join(root, move.source);
          const targetAbsolute = path.join(root, move.target);
          const sourceDigest = hashTree(sourceAbsolute, config, { root: sourceAbsolute });
          fs.mkdirSync(path.dirname(targetAbsolute), { recursive: true });
          fs.renameSync(sourceAbsolute, targetAbsolute);
          createCompatibilityAlias(sourceAbsolute, targetAbsolute, config.alias_strategy || "symlink");
          state.moves.push({ source: move.source, target: move.target, source_digest: sourceDigest, alias_strategy: config.alias_strategy || "symlink" });
          writeState(runDir, state);
        }

        for (const rewrite of rewritePlan) {
          const currentPath = mapRepositoryPath(rewrite.path, sourceToTarget);
          const absolutePath = path.join(root, currentPath);
          if (!fs.existsSync(absolutePath) || fs.lstatSync(absolutePath).isSymbolicLink()) continue;
          const before = fs.readFileSync(absolutePath, "utf8");
          const after = rewriteContent(root, rewrite.path, before, sourceToTarget);
          if (after === before) continue;
          fs.writeFileSync(absolutePath, after);
          state.rewritten_files.push({ original_path: rewrite.path, current_path: currentPath, before_digest: digest(before), after_digest: digest(after) });
          writeState(runDir, state);
        }

        state.after_tree_digest = hashTree(root, config);
        state.status = "verifying";
        writeState(runDir, state);
        state.verification = runVerification(root, config, verifyMode);
        state.status = "applied";
        state.completed_at = new Date().toISOString();
        state.proof = { algorithm: "sha256", digest: digest(stableStringify({ ...state, proof: undefined })) };
        writeState(runDir, state);
        appendHistory(dataRoot, state);
        logger.write("info", "topology.apply.completed", { run_id: runId, stage_id: stageId, moves: state.moves.length, rewritten_files: state.rewritten_files.length, digest: state.proof.digest });
        return state;
      } catch (error) {
        state.status = "failed";
        state.error = { code: error.code || "TOPOLOGY_APPLY_FAILED", message: error.message };
        writeState(runDir, state);
        logger.write("error", "topology.apply.failed", { run_id: runId, stage_id: stageId, code: state.error.code, error: state.error.message });
        try {
          const rollbackState = rollback(runId, { automatic: true, skipLock: true });
          error.rollback = rollbackState;
        } catch (rollbackError) {
          error.rollback_error = rollbackError.message;
        }
        throw error;
      }
    });
  }

  function rollback(runId, rollbackOptions = {}) {
    const execute = () => {
      const runDir = path.join(dataRoot, "runs", String(runId));
      const statePath = path.join(runDir, "state.json");
      if (!fs.existsSync(statePath)) throw codedError(`Unknown topology run: ${runId}`, "TOPOLOGY_RUN_NOT_FOUND");
      const state = readJson(statePath, "topology run state");
      if (state.status === "rolled_back" && state.rollback && state.rollback.verified) return state;
      logger.write("warn", "topology.rollback.started", { run_id: runId, automatic: Boolean(rollbackOptions.automatic) });

      restoreBackups(root, runDir, state);
      for (const move of [...(state.moves || [])].reverse()) {
        const sourceAbsolute = path.join(root, move.source);
        const targetAbsolute = path.join(root, move.target);
        removeCompatibilityAlias(sourceAbsolute);
        if (fs.existsSync(targetAbsolute)) {
          fs.mkdirSync(path.dirname(sourceAbsolute), { recursive: true });
          fs.renameSync(targetAbsolute, sourceAbsolute);
        }
        pruneEmptyParents(path.dirname(targetAbsolute), root);
      }

      const rollbackDigest = hashTree(root, config);
      const verified = rollbackDigest === state.before_tree_digest;
      state.status = verified ? "rolled_back" : "rollback_mismatch";
      state.rollback = {
        automatic: Boolean(rollbackOptions.automatic),
        completed_at: new Date().toISOString(),
        expected_tree_digest: state.before_tree_digest,
        actual_tree_digest: rollbackDigest,
        verified,
      };
      state.proof = { algorithm: "sha256", digest: digest(stableStringify({ ...state, proof: undefined })) };
      writeState(runDir, state);
      appendHistory(dataRoot, state);
      logger.write(verified ? "info" : "error", "topology.rollback.completed", { run_id: runId, verified, digest: state.proof.digest });
      if (!verified) throw codedError("Rollback proof does not match the pre-migration tree", "TOPOLOGY_ROLLBACK_PROOF_FAILED", { state });
      return state;
    };
    return rollbackOptions.skipLock ? execute() : withLock(dataRoot, execute);
  }

  function verifyRun(runId) {
    const runDir = path.join(dataRoot, "runs", String(runId));
    const state = readJson(path.join(runDir, "state.json"), "topology run state");
    const checks = [];
    if (state.status === "applied") {
      for (const move of state.moves || []) {
        const sourceAbsolute = path.join(root, move.source);
        const targetAbsolute = path.join(root, move.target);
        const aliasOk = fs.existsSync(sourceAbsolute) && fs.lstatSync(sourceAbsolute).isSymbolicLink();
        const targetOk = fs.existsSync(targetAbsolute);
        const targetDigest = targetOk ? hashTree(targetAbsolute, config, { root: targetAbsolute }) : null;
        checks.push({ id: `alias:${move.source}`, ok: aliasOk, expected: move.target });
        checks.push({ id: `target:${move.target}`, ok: targetOk && targetDigest === move.source_digest, expected_digest: move.source_digest, actual_digest: targetDigest });
      }
      for (const file of state.rewritten_files || []) {
        const absolutePath = path.join(root, file.current_path);
        const actual = fs.existsSync(absolutePath) ? digest(fs.readFileSync(absolutePath)) : null;
        checks.push({ id: `rewrite:${file.current_path}`, ok: actual === file.after_digest, expected_digest: file.after_digest, actual_digest: actual });
      }
    } else if (state.status === "rolled_back") {
      checks.push({ id: "rollback-tree", ok: hashTree(root, config) === state.before_tree_digest, expected_digest: state.before_tree_digest, actual_digest: hashTree(root, config) });
    } else {
      checks.push({ id: "state", ok: false, status: state.status });
    }
    const result = { ok: checks.every((check) => check.ok), run_id: runId, status: state.status, checks, verified_at: new Date().toISOString() };
    result.proof = { algorithm: "sha256", digest: digest(stableStringify(result)) };
    persistLatest(dataRoot, "verification", result);
    return result;
  }

  function listRuns(limit = 30) {
    const historyPath = path.join(dataRoot, "history.jsonl");
    if (!fs.existsSync(historyPath)) return [];
    return fs.readFileSync(historyPath, "utf8").split(/\r?\n/).filter(Boolean).slice(-Math.min(200, Math.max(1, Number(limit) || 30))).map((line) => JSON.parse(line));
  }

  return { root, dataRoot, config, logger, scan, plan, apply, rollback, verifyRun, listRuns };
}

function buildDependencyGraph(root, files) {
  const nodes = [];
  const edges = [];
  const unresolved = [];
  for (const relativePath of files) {
    if (!/\.(?:cjs|js|mjs|ts|tsx)$/i.test(relativePath)) continue;
    nodes.push(relativePath);
    const text = safeRead(path.join(root, relativePath));
    for (const record of extractSpecifiers(text)) {
      const resolved = resolveSpecifier(root, relativePath, record.specifier);
      if (resolved) edges.push({ from: relativePath, to: resolved, specifier: record.specifier, kind: record.kind });
      else if (record.specifier.startsWith(".")) unresolved.push({ from: relativePath, specifier: record.specifier, kind: record.kind });
    }
  }
  return { nodes: nodes.sort(), edges: uniqueBy(edges, (edge) => `${edge.from}:${edge.to}:${edge.specifier}`), unresolved: uniqueBy(unresolved, (edge) => `${edge.from}:${edge.specifier}`) };
}

function extractSpecifiers(text) {
  const records = [];
  for (const [index, pattern] of SPECIFIER_PATTERNS.entries()) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(text))) records.push({ specifier: match[2], kind: index === 0 ? "require" : index === 1 ? "dynamic-import" : "module" });
  }
  return uniqueBy(records, (record) => `${record.kind}:${record.specifier}`);
}

function resolveSpecifier(root, fromRelative, specifier) {
  if (!specifier || (!specifier.startsWith(".") && !specifier.startsWith("/"))) return null;
  const base = specifier.startsWith("/") ? path.join(root, specifier.slice(1)) : path.resolve(root, path.dirname(fromRelative), specifier);
  const candidates = [];
  for (const extension of MODULE_EXTENSIONS) candidates.push(`${base}${extension}`);
  for (const extension of MODULE_EXTENSIONS.slice(1)) candidates.push(path.join(base, `index${extension}`));
  for (const candidate of candidates) {
    try {
      if (fs.statSync(candidate).isFile()) return normalizePath(path.relative(root, candidate));
    } catch {}
  }
  return null;
}

function summarizeStage(root, files, graph, stage, config) {
  const moves = stage.moves.map((move) => buildMovePlan(root, files, graph, stage, move, config));
  return {
    id: stage.id,
    title: stage.title,
    risk: stage.risk,
    active_moves: moves.filter((move) => move.source_exists).length,
    blocked_moves: moves.filter((move) => move.blocked_reasons.length > 0).length,
    files_to_move: moves.reduce((sum, move) => sum + move.file_count, 0),
    references_affected: moves.reduce((sum, move) => sum + move.module_edges_affected + move.text_references_affected, 0),
  };
}

function buildMovePlan(root, files, graph, stage, move, config) {
  const source = normalizeRelative(move.source);
  const target = normalizeRelative(move.target);
  const sourceAbsolute = path.join(root, source);
  const targetAbsolute = path.join(root, target);
  const targetExists = fs.existsSync(targetAbsolute);
  let sourcePresent = fs.existsSync(sourceAbsolute);
  let alreadyApplied = false;
  if (sourcePresent) {
    try {
      const stat = fs.lstatSync(sourceAbsolute);
      alreadyApplied = stat.isSymbolicLink() && targetExists && fs.realpathSync(sourceAbsolute) === fs.realpathSync(targetAbsolute);
    } catch {}
  }
  const sourceExists = sourcePresent && !alreadyApplied && fs.statSync(sourceAbsolute).isDirectory();
  const protectedRoots = new Set(config.protected_roots || []);
  const blockedReasons = [];
  if (protectedRoots.has(source)) blockedReasons.push("source_is_protected");
  if (source === target || target.startsWith(`${source}/`)) blockedReasons.push("invalid_nested_target");
  if (targetExists && !alreadyApplied) blockedReasons.push("target_already_exists");
  if (path.isAbsolute(move.source) || path.isAbsolute(move.target)) blockedReasons.push("absolute_paths_forbidden");
  const sourceFiles = sourceExists ? walkFiles(sourceAbsolute, config, { base: root }) : [];
  const moduleEdges = graph.edges.filter((edge) => pathWithin(edge.from, source) || pathWithin(edge.to, source));
  const textReferences = sourceExists ? findTextReferences(root, files, source) : [];
  const riskScore = Math.min(100, Math.round(sourceFiles.length * 0.2 + moduleEdges.length * 2 + textReferences.length * 0.5 + (stage.risk === "high" ? 25 : stage.risk === "medium" ? 12 : 4)));
  return {
    source,
    target,
    source_exists: sourceExists,
    already_applied: alreadyApplied,
    target_exists: targetExists,
    blocked_reasons: blockedReasons,
    file_count: sourceFiles.length,
    module_edges_affected: moduleEdges.length,
    text_references_affected: textReferences.length,
    inbound_module_edges: moduleEdges.filter((edge) => !pathWithin(edge.from, source) && pathWithin(edge.to, source)).slice(0, 100),
    sample_text_references: textReferences.slice(0, 50),
    risk_score: riskScore,
    compatibility_alias: { strategy: config.alias_strategy || "symlink", old_path: source, target_path: target },
  };
}

function buildRewritePlan(root, files, moves) {
  const results = [];
  for (const relativePath of files) {
    if (relativePath === "config/topology-consolidation.json") continue;
    const text = safeRead(path.join(root, relativePath));
    const rewritten = rewriteContent(root, relativePath, text, moves);
    if (rewritten !== text) results.push({ path: relativePath, before_digest: digest(text), after_digest: digest(rewritten) });
  }
  return results;
}

function rewriteContent(root, originalRelativePath, text, moves) {
  let output = text;
  const futureFrom = mapRepositoryPath(originalRelativePath, moves);
  for (const pattern of SPECIFIER_PATTERNS) {
    pattern.lastIndex = 0;
    output = output.replace(pattern, (full, quote, specifier) => {
      const resolved = resolveSpecifier(root, originalRelativePath, specifier);
      const mapped = resolved && mapRepositoryPath(resolved, moves);
      if (!mapped || mapped === resolved) return full;
      let next = normalizePath(path.relative(path.dirname(futureFrom), mapped));
      if (!next.startsWith(".")) next = `./${next}`;
      if (!path.extname(specifier)) {
        next = next.replace(/\/(?:index)\.(?:cjs|js|mjs|json|ts|tsx)$/i, "").replace(/\.(?:cjs|js|mjs|json|ts|tsx)$/i, "");
      }
      return full.replace(`${quote}${specifier}${quote}`, `${quote}${next}${quote}`);
    });
  }
  for (const move of moves) {
    const escaped = escapeRegex(move.source);
    const rootToken = new RegExp(`(^|[^A-Za-z0-9_./-])${escaped}(?=\\/|[\\s"'\`]|$)`, "gm");
    output = output.replace(rootToken, (_, prefix) => `${prefix}${move.target}`);
    const dotToken = new RegExp(`(^|[\\s"'\`(=:])\\./${escaped}(?=\\/|[\\s"'\`]|$)`, "gm");
    output = output.replace(dotToken, (_, prefix) => `${prefix}./${move.target}`);
  }
  return output;
}

function findTextReferences(root, files, source) {
  const references = [];
  const pattern = new RegExp(`(^|[^A-Za-z0-9_.-])${escapeRegex(source)}(?=\\/|[\\s"'\`]|$)`, "m");
  for (const relativePath of files) {
    if (pathWithin(relativePath, source)) continue;
    const text = safeRead(path.join(root, relativePath));
    if (pattern.test(text)) references.push(relativePath);
  }
  return references;
}

function mapRepositoryPath(relativePath, moves) {
  const normalized = normalizePath(relativePath);
  for (const move of moves) {
    if (normalized === move.source) return move.target;
    if (normalized.startsWith(`${move.source}/`)) return `${move.target}${normalized.slice(move.source.length)}`;
  }
  return normalized;
}

function createCompatibilityAlias(sourceAbsolute, targetAbsolute, strategy) {
  if (strategy !== "symlink") throw codedError(`Unsupported alias strategy: ${strategy}`, "TOPOLOGY_ALIAS_STRATEGY_UNSUPPORTED");
  fs.mkdirSync(path.dirname(sourceAbsolute), { recursive: true });
  const relativeTarget = normalizePath(path.relative(path.dirname(sourceAbsolute), targetAbsolute));
  fs.symlinkSync(relativeTarget, sourceAbsolute, "dir");
}

function removeCompatibilityAlias(sourceAbsolute) {
  if (!fs.existsSync(sourceAbsolute)) return;
  const stat = fs.lstatSync(sourceAbsolute);
  if (!stat.isSymbolicLink()) throw codedError(`Compatibility alias path is no longer a symlink: ${sourceAbsolute}`, "TOPOLOGY_ALIAS_TAMPERED");
  fs.unlinkSync(sourceAbsolute);
}

function backupFiles(root, runDir, relativePaths) {
  for (const relativePath of uniqueBy(relativePaths, (value) => value)) {
    const source = path.join(root, relativePath);
    if (!fs.existsSync(source) || fs.lstatSync(source).isSymbolicLink()) continue;
    const destination = path.join(runDir, "backups", relativePath);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(source, destination);
  }
}

function restoreBackups(root, runDir, state) {
  for (const file of state.rewritten_files || []) {
    const backup = path.join(runDir, "backups", file.original_path);
    const current = path.join(root, file.current_path);
    if (!fs.existsSync(backup)) continue;
    fs.mkdirSync(path.dirname(current), { recursive: true });
    fs.copyFileSync(backup, current);
  }
}

function runVerification(root, config, mode) {
  if (mode === "none") return [];
  const commands = config.verification && config.verification[mode];
  if (!Array.isArray(commands)) throw codedError(`Unknown verification mode: ${mode}`, "TOPOLOGY_VERIFY_MODE_INVALID");
  return commands.map((command) => {
    const startedAt = Date.now();
    const result = spawnSync("bash", ["-lc", command], { cwd: root, encoding: "utf8", timeout: Number(config.verification_timeout_ms || 900000), env: { ...process.env, CYVX_TOPOLOGY_VERIFICATION: "1" } });
    const record = { command, status: result.status, signal: result.signal || null, elapsed_ms: Date.now() - startedAt, stdout: truncate(result.stdout), stderr: truncate(result.stderr) };
    if (result.status !== 0) throw codedError(`Verification command failed: ${command}`, "TOPOLOGY_VERIFICATION_FAILED", { verification: record });
    return record;
  });
}

function assertCleanWorkingTree(root, dataRoot) {
  const result = spawnSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8" });
  if (result.status !== 0) throw codedError("Unable to inspect git working tree", "TOPOLOGY_GIT_STATUS_FAILED");
  const stateRelative = normalizePath(path.relative(root, dataRoot));
  const dirty = result.stdout.split(/\r?\n/).filter(Boolean).filter((line) => !stateRelative.startsWith("..") || !line.slice(3).startsWith(stateRelative));
  if (dirty.length > 0) throw codedError("Topology apply requires a clean git working tree", "TOPOLOGY_DIRTY_WORKTREE", { files: dirty.slice(0, 50) });
}

function hashTree(start, config, options = {}) {
  if (!fs.existsSync(start)) return digest("");
  const base = options.root || start;
  const files = walkAllFiles(start, config, { base });
  const hash = crypto.createHash("sha256");
  for (const relativePath of files) {
    const absolutePath = path.join(base, relativePath);
    const stat = fs.lstatSync(absolutePath);
    hash.update(relativePath).update("\0");
    if (stat.isSymbolicLink()) hash.update(`link:${fs.readlinkSync(absolutePath)}`);
    else hash.update(fs.readFileSync(absolutePath));
    hash.update("\0");
  }
  return hash.digest("hex");
}

function walkFiles(start, config, options = {}) {
  return walkAllFiles(start, config, options).filter((relativePath) => isTextFile(relativePath, config));
}

function walkAllFiles(start, config, options = {}) {
  if (!fs.existsSync(start)) return [];
  const base = options.base || start;
  const exclude = new Set([...(config.exclude || []), ...DEFAULT_EXCLUDES]);
  const results = [];
  const stack = [start];
  while (stack.length) {
    const current = stack.pop();
    let entries = [];
    try { entries = fs.readdirSync(current, { withFileTypes: true }); } catch { continue; }
    for (const entry of entries) {
      if (exclude.has(entry.name)) continue;
      const absolutePath = path.join(current, entry.name);
      const relativePath = normalizePath(path.relative(base, absolutePath));
      if (entry.isSymbolicLink()) results.push(relativePath);
      else if (entry.isDirectory()) stack.push(absolutePath);
      else if (entry.isFile()) results.push(relativePath);
    }
  }
  return results.sort();
}

function isTextFile(relativePath, config) {
  const extension = path.extname(relativePath).toLowerCase();
  const extensions = new Set(config.text_extensions || Array.from(DEFAULT_TEXT_EXTENSIONS));
  return extensions.has(extension) || ["Dockerfile", "Procfile", "LICENSE"].includes(path.basename(relativePath));
}

function persistLatest(dataRoot, type, value) {
  const directory = path.join(dataRoot, "latest");
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  atomicWrite(path.join(directory, `${type}.json`), `${JSON.stringify(value, null, 2)}\n`);
}

function persistPlan(dataRoot, stageId, value) {
  const directory = path.join(dataRoot, "plans");
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  atomicWrite(path.join(directory, `${stageId}.json`), `${JSON.stringify(value, null, 2)}\n`);
  persistLatest(dataRoot, "plan", value);
}

function writeState(runDir, state) {
  atomicWrite(path.join(runDir, "state.json"), `${JSON.stringify(state, null, 2)}\n`);
}

function appendHistory(dataRoot, state) {
  fs.mkdirSync(dataRoot, { recursive: true, mode: 0o700 });
  fs.appendFileSync(path.join(dataRoot, "history.jsonl"), `${JSON.stringify({ run_id: state.run_id, stage_id: state.stage_id, status: state.status, started_at: state.started_at, completed_at: state.completed_at || state.rollback && state.rollback.completed_at || null, proof: state.proof || null })}\n`, { mode: 0o600 });
}

function withLock(dataRoot, callback) {
  fs.mkdirSync(dataRoot, { recursive: true, mode: 0o700 });
  const lockPath = path.join(dataRoot, "topology.lock");
  let handle;
  try { handle = fs.openSync(lockPath, "wx", 0o600); }
  catch { throw codedError("Another topology operation is already running", "TOPOLOGY_LOCKED"); }
  try {
    fs.writeFileSync(handle, JSON.stringify({ pid: process.pid, started_at: new Date().toISOString() }));
    return callback();
  } finally {
    try { fs.closeSync(handle); } catch {}
    try { fs.unlinkSync(lockPath); } catch {}
  }
}

function validateConfig(config) {
  if (!config || typeof config !== "object" || Array.isArray(config)) throw codedError("Topology config must be an object", "TOPOLOGY_CONFIG_INVALID");
  if (!config.version || !Array.isArray(config.stages)) throw codedError("Topology config requires version and stages", "TOPOLOGY_CONFIG_FIELDS_REQUIRED");
  const stageIds = new Set();
  const sources = new Set();
  for (const stage of config.stages) {
    if (!stage.id || stageIds.has(stage.id)) throw codedError("Topology stage IDs must be unique", "TOPOLOGY_STAGE_INVALID");
    stageIds.add(stage.id);
    if (!Array.isArray(stage.moves)) throw codedError(`Topology stage ${stage.id} requires moves`, "TOPOLOGY_STAGE_MOVES_REQUIRED");
    for (const move of stage.moves) {
      const source = normalizeRelative(move.source);
      normalizeRelative(move.target);
      if (sources.has(source)) throw codedError(`Topology source appears in multiple stages: ${source}`, "TOPOLOGY_DUPLICATE_SOURCE");
      sources.add(source);
    }
  }
}

function getStage(config, stageId) {
  const stage = config.stages.find((item) => item.id === stageId);
  if (!stage) throw codedError(`Unknown topology stage: ${stageId}`, "TOPOLOGY_STAGE_NOT_FOUND");
  return stage;
}

function normalizeRelative(value) {
  const normalized = normalizePath(String(value || "").replace(/^\.\//, ""));
  if (!normalized || normalized === "." || normalized.startsWith("../") || path.isAbsolute(normalized)) throw codedError(`Invalid repository-relative path: ${value}`, "TOPOLOGY_PATH_INVALID");
  return normalized.replace(/\/$/, "");
}

function pruneEmptyParents(directory, stop) {
  let current = directory;
  const boundary = path.resolve(stop);
  while (current.startsWith(boundary) && current !== boundary) {
    try {
      if (fs.readdirSync(current).length > 0) break;
      fs.rmdirSync(current);
      current = path.dirname(current);
    } catch { break; }
  }
}

function gitHead(root) {
  const result = spawnSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" });
  return result.status === 0 ? result.stdout.trim() : null;
}

function createLogger(filePath) {
  return {
    filePath,
    write(level, event, fields = {}) {
      fs.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });
      fs.appendFileSync(filePath, `${JSON.stringify(redact({ timestamp: new Date().toISOString(), level, event, ...fields }))}\n`, { mode: 0o600 });
    },
  };
}

function readJson(filePath, label) {
  try { return JSON.parse(fs.readFileSync(filePath, "utf8")); }
  catch (error) { throw codedError(`Unable to read ${label}: ${error.message}`, "TOPOLOGY_JSON_INVALID", { path: filePath }); }
}

function safeRead(filePath) { try { return fs.readFileSync(filePath, "utf8"); } catch { return ""; } }
function atomicWrite(filePath, content) { fs.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 }); const temporary = `${filePath}.${process.pid}.${crypto.randomUUID()}.tmp`; fs.writeFileSync(temporary, content, { mode: 0o600 }); fs.renameSync(temporary, filePath); }
function digest(value) { return crypto.createHash("sha256").update(value).digest("hex"); }
function stableStringify(value) { if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`; if (value && typeof value === "object") return `{${Object.keys(value).filter((key) => value[key] !== undefined).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`; return JSON.stringify(value); }
function normalizePath(value) { return String(value).split(path.sep).join("/").replace(/^\.\//, ""); }
function pathWithin(value, prefix) { const normalized = normalizePath(value); return normalized === prefix || normalized.startsWith(`${prefix}/`); }
function escapeRegex(value) { return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
function safeEqual(left, right) { const a = Buffer.from(String(left)); const b = Buffer.from(String(right)); return a.length === b.length && crypto.timingSafeEqual(a, b); }
function truncate(value, max = 12000) { const text = String(value || ""); return text.length <= max ? text : `${text.slice(0, max)}\n...[truncated]`; }
function uniqueBy(values, key) { return Array.from(new Map(values.map((value) => [key(value), value])).values()); }
function redact(value) { if (Array.isArray(value)) return value.map(redact); if (!value || typeof value !== "object") return value; return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, /token|secret|password|authorization|cookie/i.test(key) ? "[REDACTED]" : redact(child)])); }
function codedError(message, code, fields = {}) { const error = new Error(message); error.code = code; Object.assign(error, fields); return error; }

module.exports = {
  createTopologyConsolidation,
  buildDependencyGraph,
  extractSpecifiers,
  resolveSpecifier,
  rewriteContent,
  mapRepositoryPath,
  hashTree,
  stableStringify,
};
