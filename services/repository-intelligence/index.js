"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const TEXT_EXTENSIONS = new Set([".cjs", ".css", ".html", ".js", ".json", ".md", ".mjs", ".sh", ".sql", ".ts", ".tsx", ".yaml", ".yml"]);
const DEFAULT_EXCLUDES = new Set([".git", "node_modules", "dist", "coverage", ".next", ".cache", "vendor"]);
const SEVERITY_PENALTY = Object.freeze({ critical: 35, high: 20, medium: 10, low: 4, info: 0 });
const SEVERITY_RANK = Object.freeze({ critical: 5, high: 4, medium: 3, low: 2, info: 1 });

function createRepositoryIntelligence(options = {}) {
  const root = path.resolve(options.root || process.cwd());
  const dataRoot = path.resolve(options.dataRoot || process.env.CYVX_REPOSITORY_INTELLIGENCE_ROOT || path.join(os.homedir(), ".cyvx", "repository-intelligence"));
  const contractPath = path.resolve(options.contractPath || path.join(root, "config", "repository-contract.json"));
  const contract = options.contract || readJson(contractPath, "repository contract");
  validateContract(contract);
  const logger = options.logger || createJsonlLogger(path.join(dataRoot, "repository-intelligence.jsonl"));

  function scan(scanOptions = {}) {
    const startedAt = Date.now();
    const generatedAt = new Date().toISOString();
    const inventory = buildInventory(root, contract);
    const checks = evaluateRepository(root, contract, inventory);
    const dimensions = scoreDimensions(checks, contract.weights || {});
    const failed = checks.filter((check) => check.status === "fail");
    const warnings = checks.filter((check) => check.status === "warn");
    const critical = failed.filter((check) => check.severity === "critical");
    const score = weightedScore(dimensions, contract.weights || {});
    const recommendations = createRecommendations(checks);
    const status = critical.length > 0 || score < 60 ? "at-risk" : score < 80 ? "strengthening" : score < 90 ? "production-capable" : "compounding";
    const snapshot = {
      ok: critical.length === 0,
      service: "cyvx-repository-intelligence",
      schema_version: 1,
      contract_version: contract.version,
      generated_at: generatedAt,
      elapsed_ms: Date.now() - startedAt,
      root,
      status,
      readiness_score: score,
      dimensions,
      inventory,
      summary: {
        passed: checks.filter((check) => check.status === "pass").length,
        warnings: warnings.length,
        failed: failed.length,
        critical: critical.length,
        high: checks.filter((check) => check.status !== "pass" && check.severity === "high").length,
        recommendations: recommendations.length,
      },
      checks,
      recommendations,
      next_best_action: recommendations[0] || null,
      mission: buildMission(score, recommendations, contract),
    };
    snapshot.proof = {
      algorithm: "sha256",
      digest: digest(stableStringify(snapshot)),
    };

    if (scanOptions.persist !== false) persistSnapshot(dataRoot, snapshot, logger);
    logger.write("info", "repository_intelligence.scan.completed", {
      status,
      readiness_score: score,
      critical: critical.length,
      failed: failed.length,
      warnings: warnings.length,
      digest: snapshot.proof.digest,
      elapsed_ms: snapshot.elapsed_ms,
    });
    return snapshot;
  }

  function latest(options = {}) {
    const latestPath = path.join(dataRoot, "latest.json");
    if (fs.existsSync(latestPath)) return readJson(latestPath, "repository intelligence snapshot");
    return scan({ persist: options.persist !== false });
  }

  function history(limit = 30) {
    const historyPath = path.join(dataRoot, "history.jsonl");
    if (!fs.existsSync(historyPath)) return [];
    const safeLimit = Math.min(500, Math.max(1, Number(limit) || 30));
    return fs.readFileSync(historyPath, "utf8").split(/\r?\n/).filter(Boolean).slice(-safeLimit).map((line) => JSON.parse(line));
  }

  function prometheus(snapshot = latest({ persist: false })) {
    const lines = [
      "# HELP cyvx_repository_readiness_score Overall repository production-readiness score.",
      "# TYPE cyvx_repository_readiness_score gauge",
      `cyvx_repository_readiness_score ${snapshot.readiness_score}`,
      "# HELP cyvx_repository_critical_findings Critical repository findings.",
      "# TYPE cyvx_repository_critical_findings gauge",
      `cyvx_repository_critical_findings ${snapshot.summary.critical}`,
      "# HELP cyvx_repository_failed_checks Failed repository checks.",
      "# TYPE cyvx_repository_failed_checks gauge",
      `cyvx_repository_failed_checks ${snapshot.summary.failed}`,
      "# HELP cyvx_repository_warning_checks Repository warning checks.",
      "# TYPE cyvx_repository_warning_checks gauge",
      `cyvx_repository_warning_checks ${snapshot.summary.warnings}`,
    ];
    for (const [name, value] of Object.entries(snapshot.dimensions)) {
      lines.push(`cyvx_repository_dimension_score{dimension="${metricLabel(name)}"} ${value.score}`);
    }
    return `${lines.join("\n")}\n`;
  }

  return { root, dataRoot, contract, logger, scan, latest, history, prometheus };
}

function buildInventory(root, contract) {
  const packageJson = readJson(path.join(root, "package.json"), "package.json");
  const packageLockPath = path.join(root, "package-lock.json");
  const packageLock = fs.existsSync(packageLockPath) ? readJson(packageLockPath, "package-lock.json") : null;
  const topLevelDirectories = listDirectories(root).filter((name) => !DEFAULT_EXCLUDES.has(name) && !name.startsWith("."));
  const workflowFiles = listFiles(path.join(root, ".github", "workflows"), root, (file) => /\.ya?ml$/i.test(file));
  const testFiles = walkFiles(root, { include: (file) => /(?:^|\/)test(?:s)?\/.*\.(?:test|spec)\.[cm]?js$/i.test(file) });
  const documentationFiles = walkFiles(root, { include: (file) => /(?:^|\/)docs\/.*\.md$/i.test(file) || /(?:^|\/)(?:README|API|CLI)\.md$/i.test(file) });
  const sourceRoots = contract.source_roots || ["api", "core", "runtime", "services", "scripts", "cli", "ui", "spark", "status"];
  const sourceFiles = sourceRoots.flatMap((sourceRoot) => walkFiles(path.join(root, sourceRoot), {
    base: root,
    include: (file) => /\.(?:cjs|js|mjs|ts|tsx)$/i.test(file) && !/\.(?:test|spec)\.[cm]?[jt]s$/i.test(file),
  }));
  const workflowText = workflowFiles.map((relativePath) => safeRead(path.join(root, relativePath))).join("\n");
  const categories = classifyDirectories(topLevelDirectories, contract.categories || {}, contract.ignored_top_level || []);
  const capabilityInventory = (contract.capabilities || []).map((capability) => {
    const paths = capability.paths || [];
    const requiredScripts = capability.required_scripts || [];
    const presentPaths = paths.filter((relativePath) => fs.existsSync(path.join(root, relativePath)));
    const presentScripts = requiredScripts.filter((script) => Boolean(packageJson.scripts && packageJson.scripts[script]));
    const denominator = paths.length + requiredScripts.length || 1;
    return {
      id: capability.id,
      title: capability.title,
      paths,
      required_scripts: requiredScripts,
      present_paths: presentPaths,
      present_scripts: presentScripts,
      readiness_score: Math.round(((presentPaths.length + presentScripts.length) / denominator) * 100),
    };
  });
  return {
    package: {
      name: packageJson.name,
      version: packageJson.version,
      lock_version: packageLock && packageLock.packages && packageLock.packages[""] ? packageLock.packages[""].version : packageLock && packageLock.version || null,
      node_engine: packageJson.engines && packageJson.engines.node || null,
      script_count: Object.keys(packageJson.scripts || {}).length,
      dependency_count: Object.keys(packageJson.dependencies || {}).length,
      dev_dependency_count: Object.keys(packageJson.devDependencies || {}).length,
    },
    top_level: {
      directory_count: topLevelDirectories.length,
      directories: topLevelDirectories.sort(),
      classified: categories.classified,
      unclassified: categories.unclassified,
      target_directory_count: Number(contract.targets && contract.targets.max_top_level_directories || 18),
    },
    workflows: {
      count: workflowFiles.length,
      files: workflowFiles,
      node_versions: Array.from(new Set(Array.from(workflowText.matchAll(/node-version\s*:\s*["']?([0-9]+)/gi), (match) => Number(match[1])))).sort((a, b) => a - b),
      uses_pull_request_target: /\bpull_request_target\s*:/m.test(workflowText),
    },
    tests: { count: testFiles.length, files: testFiles },
    documentation: { count: documentationFiles.length, files: documentationFiles },
    source: { count: sourceFiles.length },
    capabilities: capabilityInventory,
  };
}

function evaluateRepository(root, contract, inventory) {
  const checks = [];
  const add = (check) => checks.push(normalizeCheck(check));
  const minimumNode = Number(contract.minimum_node_major || 22);

  for (const relativePath of contract.required_paths || []) {
    const exists = fs.existsSync(path.join(root, relativePath));
    add({ id: `required-path:${relativePath}`, dimension: "architecture", severity: "critical", status: exists ? "pass" : "fail", message: exists ? `${relativePath} is connected` : `${relativePath} is missing`, evidence: relativePath, remediation: `Restore or replace the required production path: ${relativePath}`, impact: 10, effort: 3 });
  }

  const packageJson = readJson(path.join(root, "package.json"), "package.json");
  for (const script of contract.required_scripts || []) {
    const exists = Boolean(packageJson.scripts && packageJson.scripts[script]);
    add({ id: `required-script:${script}`, dimension: "runtime", severity: "critical", status: exists ? "pass" : "fail", message: exists ? `npm run ${script} is available` : `npm run ${script} is missing`, evidence: exists ? packageJson.scripts[script] : null, remediation: `Add and verify a connected ${script} command`, impact: 10, effort: 2 });
  }

  const engineMajor = parseNodeMajor(inventory.package.node_engine);
  add({ id: "node-engine", dimension: "runtime", severity: "critical", status: engineMajor >= minimumNode ? "pass" : "fail", message: `Node engine requires ${inventory.package.node_engine || "an unspecified version"}`, evidence: { required_major: minimumNode, detected_major: engineMajor }, remediation: `Set package engines.node to >=${minimumNode}`, impact: 10, effort: 1 });

  const oldWorkflowVersions = inventory.workflows.node_versions.filter((version) => version < minimumNode);
  add({ id: "workflow-node-consistency", dimension: "automation", severity: "high", status: oldWorkflowVersions.length === 0 ? "pass" : "fail", message: oldWorkflowVersions.length === 0 ? `GitHub Actions use Node ${minimumNode}+` : `GitHub Actions still reference Node ${oldWorkflowVersions.join(", ")}`, evidence: inventory.workflows.node_versions, remediation: `Upgrade every actions/setup-node entry to Node ${minimumNode}+`, impact: 9, effort: 2 });

  const packageVersionMatches = !inventory.package.lock_version || inventory.package.version === inventory.package.lock_version;
  add({ id: "package-lock-version", dimension: "maintainability", severity: "medium", status: packageVersionMatches ? "pass" : "warn", message: packageVersionMatches ? "package and lockfile versions match" : `package.json ${inventory.package.version} differs from package-lock ${inventory.package.lock_version}`, evidence: inventory.package, remediation: "Regenerate package-lock.json from the canonical package.json release", impact: 6, effort: 1 });

  const thresholds = contract.targets || {};
  add(minimumCountCheck("test-count", "verification", inventory.tests.count, Number(thresholds.minimum_tests || 10), "automated tests", "Add connected unit, integration, contract, and runtime tests", "high"));
  add(minimumCountCheck("workflow-count", "automation", inventory.workflows.count, Number(thresholds.minimum_workflows || 3), "GitHub workflows", "Add CI, security, recovery, and controlled release automation", "medium"));
  add(minimumCountCheck("documentation-count", "documentation", inventory.documentation.count, Number(thresholds.minimum_documents || 8), "operational documents", "Document architecture, runtime, security, recovery, and release operation", "medium"));

  const ratio = inventory.source.count === 0 ? 0 : inventory.tests.count / inventory.source.count;
  const minimumRatio = Number(thresholds.minimum_test_to_source_ratio || 0.03);
  add({ id: "test-source-ratio", dimension: "verification", severity: "medium", status: ratio >= minimumRatio ? "pass" : "warn", message: `Test-to-source proxy is ${(ratio * 100).toFixed(1)}%`, evidence: { tests: inventory.tests.count, source_files: inventory.source.count, ratio }, remediation: "Add focused tests beside high-risk runtime, payment, governance, persistence, and recovery boundaries", impact: 7, effort: 5 });

  const topLimit = Number(thresholds.max_top_level_directories || 18);
  add({ id: "top-level-fragmentation", dimension: "maintainability", severity: "medium", status: inventory.top_level.directory_count <= topLimit ? "pass" : "warn", message: `${inventory.top_level.directory_count} top-level directories detected; target is ${topLimit}`, evidence: inventory.top_level.directories, remediation: "Consolidate optional domains under apps/, packages/, services/, platform/, or research/ without breaking imports", impact: 7, effort: 8 });

  const maxUnclassified = Number(thresholds.max_unclassified_directories || 2);
  add({ id: "unclassified-directories", dimension: "architecture", severity: "medium", status: inventory.top_level.unclassified.length <= maxUnclassified ? "pass" : "warn", message: `${inventory.top_level.unclassified.length} top-level directories are outside the repository contract`, evidence: inventory.top_level.unclassified, remediation: "Classify each active directory or move it into the canonical repository spine", impact: 7, effort: 4 });

  add({ id: "pull-request-target", dimension: "security", severity: "critical", status: inventory.workflows.uses_pull_request_target ? "fail" : "pass", message: inventory.workflows.uses_pull_request_target ? "A workflow uses pull_request_target" : "No pull_request_target workflows detected", evidence: inventory.workflows.uses_pull_request_target, remediation: "Replace pull_request_target or isolate all untrusted checkout and secret access", impact: 10, effort: 4 });

  const leakedSecrets = findCommittedSecrets(root, contract.secret_scan_roots || [".github", "api", "config", "runtime", "scripts", "services"]);
  add({ id: "committed-secrets", dimension: "security", severity: "high", status: leakedSecrets.length === 0 ? "pass" : "warn", message: leakedSecrets.length === 0 ? "No high-confidence committed secret material detected" : `${leakedSecrets.length} high-confidence secret findings detected`, evidence: leakedSecrets, remediation: "Revoke exposed credentials, remove them from Git history, and use encrypted environment secrets", impact: 10, effort: 6 });

  const readmeText = safeRead(path.join(root, "README.md"));
  const readmeMentionsVersion = readmeText.includes(inventory.package.version);
  add({ id: "readme-release-drift", dimension: "documentation", severity: "low", status: readmeMentionsVersion ? "pass" : "warn", message: readmeMentionsVersion ? `README declares release ${inventory.package.version}` : `README does not identify package release ${inventory.package.version}`, evidence: inventory.package.version, remediation: "Replace version-layered README history with one current product, architecture, run, verify, deploy, and proof narrative", impact: 5, effort: 3 });

  for (const capability of inventory.capabilities) {
    const pass = capability.readiness_score === 100;
    add({ id: `capability:${capability.id}`, dimension: "product", severity: "high", status: pass ? "pass" : "warn", message: `${capability.title} is ${capability.readiness_score}% represented in the repository contract`, evidence: capability, remediation: `Complete the missing paths or commands for ${capability.title}`, impact: 8, effort: 4 });
  }

  const staleChecklistPath = path.join(root, "docs", "operations", "CYVX_REMAINING_TASKS.md");
  if (fs.existsSync(staleChecklistPath)) {
    const remaining = safeRead(staleChecklistPath).split(/\r?\n/).filter((line) => /^-\s+/.test(line) && !line.includes("Completed")).length;
    add({ id: "legacy-remaining-checklist", dimension: "learning", severity: "low", status: remaining <= 3 ? "pass" : "warn", message: `${remaining} legacy checklist entries remain outside the measured evolution queue`, evidence: "docs/operations/CYVX_REMAINING_TASKS.md", remediation: "Retire static remaining-task lists in favor of repository-intelligence recommendations and measured outcomes", impact: 5, effort: 2 });
  }

  const proofPaths = contract.proof_paths || ["evidence", "artifacts", "observability", "operations"];
  const proofPresent = proofPaths.filter((relativePath) => fs.existsSync(path.join(root, relativePath)));
  add({ id: "proof-surfaces", dimension: "evidence", severity: "high", status: proofPresent.length >= Math.ceil(proofPaths.length / 2) ? "pass" : "warn", message: `${proofPresent.length}/${proofPaths.length} proof surfaces are present`, evidence: proofPresent, remediation: "Connect runtime outcomes to retained evidence, metrics, audit logs, and recovery proof", impact: 8, effort: 5 });

  return checks.sort((a, b) => String(a.id).localeCompare(String(b.id)));
}

function scoreDimensions(checks, weights) {
  const names = new Set([...Object.keys(weights), ...checks.map((check) => check.dimension)]);
  const result = {};
  for (const name of names) {
    const relevant = checks.filter((check) => check.dimension === name);
    const penalty = relevant.reduce((total, check) => {
      if (check.status === "pass") return total;
      const base = SEVERITY_PENALTY[check.severity] || 0;
      return total + (check.status === "warn" ? Math.ceil(base / 2) : base);
    }, 0);
    result[name] = {
      score: Math.max(0, 100 - penalty),
      checks: relevant.length,
      failed: relevant.filter((check) => check.status === "fail").length,
      warnings: relevant.filter((check) => check.status === "warn").length,
    };
  }
  return result;
}

function weightedScore(dimensions, weights) {
  const entries = Object.entries(dimensions);
  if (entries.length === 0) return 0;
  const totalWeight = entries.reduce((sum, [name]) => sum + Number(weights[name] || 1), 0);
  const total = entries.reduce((sum, [name, value]) => sum + value.score * Number(weights[name] || 1), 0);
  return Math.round(total / totalWeight);
}

function createRecommendations(checks) {
  return checks.filter((check) => check.status !== "pass").map((check) => ({
    id: check.id,
    title: check.remediation,
    dimension: check.dimension,
    severity: check.severity,
    evidence: check.evidence,
    expected_impact: check.impact,
    effort: check.effort,
    confidence: check.confidence,
    priority_score: Math.round(((check.impact * check.confidence * 100) / Math.max(1, check.effort)) + (SEVERITY_RANK[check.severity] || 1) * 10),
  })).sort((a, b) => b.priority_score - a.priority_score || b.expected_impact - a.expected_impact || a.effort - b.effort);
}

function buildMission(score, recommendations, contract) {
  const tasks = recommendations.slice(0, Number(contract.targets && contract.targets.mission_task_limit || 7)).map((item) => ({
    id: item.id,
    action: item.title,
    priority_score: item.priority_score,
    evidence: item.evidence,
    success_signal: `Repository check ${item.id} passes on the next scan`,
  }));
  return {
    title: "CYVX Repository Evolution Mission",
    objective: "Increase production readiness by removing the highest-value verified repository constraints.",
    baseline_score: score,
    target_score: Math.min(100, Math.max(90, score + 8)),
    tasks,
    stop_condition: "Stop automatic remediation before any destructive move, credential change, external deployment, purchase, legal filing, or irreversible production action.",
    success_metric: "The next persisted scan has zero critical findings, no new high findings, and a higher proof-backed readiness score.",
  };
}

function persistSnapshot(dataRoot, snapshot, logger) {
  fs.mkdirSync(dataRoot, { recursive: true, mode: 0o700 });
  atomicWrite(path.join(dataRoot, "latest.json"), `${JSON.stringify(snapshot, null, 2)}\n`);
  atomicWrite(path.join(dataRoot, "latest.md"), renderMarkdown(snapshot));
  fs.appendFileSync(path.join(dataRoot, "history.jsonl"), `${JSON.stringify(compactHistory(snapshot))}\n`, { mode: 0o600 });
  logger.write("info", "repository_intelligence.snapshot.persisted", { path: path.join(dataRoot, "latest.json"), digest: snapshot.proof.digest });
}

function compactHistory(snapshot) {
  return {
    generated_at: snapshot.generated_at,
    status: snapshot.status,
    readiness_score: snapshot.readiness_score,
    dimensions: Object.fromEntries(Object.entries(snapshot.dimensions).map(([name, value]) => [name, value.score])),
    summary: snapshot.summary,
    proof: snapshot.proof,
  };
}

function renderMarkdown(snapshot) {
  const rows = Object.entries(snapshot.dimensions).map(([name, value]) => `| ${name} | ${value.score} | ${value.failed} | ${value.warnings} |`).join("\n");
  const recommendations = snapshot.recommendations.slice(0, 10).map((item, index) => `${index + 1}. **${item.title}** — ${item.severity}, priority ${item.priority_score}`).join("\n") || "No active recommendations.";
  return `# CYVX Repository Intelligence\n\nGenerated: ${snapshot.generated_at}\n\n- Status: **${snapshot.status}**\n- Readiness: **${snapshot.readiness_score}/100**\n- Critical findings: **${snapshot.summary.critical}**\n- Proof: \`${snapshot.proof.digest}\`\n\n## Dimensions\n\n| Dimension | Score | Failed | Warnings |\n|---|---:|---:|---:|\n${rows}\n\n## Next Best Actions\n\n${recommendations}\n`;
}

function classifyDirectories(directories, categories, ignored) {
  const ignoredSet = new Set(ignored || []);
  const known = new Set();
  const classified = {};
  for (const [category, values] of Object.entries(categories)) {
    classified[category] = directories.filter((directory) => values.includes(directory));
    for (const value of values) known.add(value);
  }
  return { classified, unclassified: directories.filter((directory) => !known.has(directory) && !ignoredSet.has(directory)).sort() };
}

function findCommittedSecrets(root, scanRoots) {
  const patterns = [
    { id: "private-key", regex: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
    { id: "stripe-live-secret", regex: /\bsk_live_[A-Za-z0-9]{20,}\b/ },
    { id: "github-token", regex: /\bgh[pousr]_[A-Za-z0-9]{30,}\b/ },
    { id: "aws-access-key", regex: /\bAKIA[0-9A-Z]{16}\b/ },
  ];
  const findings = [];
  for (const scanRoot of scanRoots) {
    const absoluteRoot = path.join(root, scanRoot);
    for (const relativePath of walkFiles(absoluteRoot, { base: root, maxBytes: 512 * 1024 })) {
      if (/\.(?:png|jpe?g|gif|webp|zip|gz|pdf|sqlite|db)$/i.test(relativePath)) continue;
      const text = safeRead(path.join(root, relativePath));
      for (const pattern of patterns) {
        if (pattern.regex.test(text)) findings.push({ pattern: pattern.id, path: relativePath });
      }
    }
  }
  return uniqueBy(findings, (finding) => `${finding.pattern}:${finding.path}`);
}

function minimumCountCheck(id, dimension, actual, minimum, label, remediation, severity) {
  return { id, dimension, severity, status: actual >= minimum ? "pass" : "warn", message: `${actual} ${label} detected; minimum contract is ${minimum}`, evidence: { actual, minimum }, remediation, impact: 7, effort: 4 };
}

function normalizeCheck(check) {
  return {
    id: String(check.id),
    dimension: String(check.dimension || "maintainability"),
    severity: SEVERITY_RANK[check.severity] ? check.severity : "medium",
    status: ["pass", "warn", "fail"].includes(check.status) ? check.status : "fail",
    message: String(check.message || check.id),
    evidence: check.evidence === undefined ? null : check.evidence,
    remediation: String(check.remediation || "Investigate and resolve the failed repository contract"),
    impact: Math.min(10, Math.max(1, Number(check.impact || 5))),
    effort: Math.min(10, Math.max(1, Number(check.effort || 3))),
    confidence: Math.min(1, Math.max(0.1, Number(check.confidence || 0.9))),
  };
}

function validateContract(contract) {
  if (!contract || typeof contract !== "object" || Array.isArray(contract)) throw codedError("Repository contract must be an object", "REPOSITORY_CONTRACT_INVALID");
  if (!contract.version) throw codedError("Repository contract version is required", "REPOSITORY_CONTRACT_VERSION_REQUIRED");
  if (!Array.isArray(contract.required_paths) || !Array.isArray(contract.required_scripts)) throw codedError("Repository contract requires required_paths and required_scripts arrays", "REPOSITORY_CONTRACT_FIELDS_REQUIRED");
}

function walkFiles(start, options = {}) {
  if (!fs.existsSync(start)) return [];
  const base = options.base || start;
  const maxBytes = Number(options.maxBytes || 2 * 1024 * 1024);
  const results = [];
  const stack = [start];
  while (stack.length) {
    const current = stack.pop();
    let entries;
    try { entries = fs.readdirSync(current, { withFileTypes: true }); } catch { continue; }
    for (const entry of entries) {
      if (DEFAULT_EXCLUDES.has(entry.name)) continue;
      const absolutePath = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(absolutePath);
      else if (entry.isFile()) {
        let size = 0;
        try { size = fs.statSync(absolutePath).size; } catch { continue; }
        if (size > maxBytes) continue;
        const relativePath = path.relative(base, absolutePath).split(path.sep).join("/");
        if (options.include && !options.include(relativePath, absolutePath)) continue;
        results.push(relativePath);
      }
    }
  }
  return results.sort();
}

function listDirectories(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name);
}

function listFiles(directory, base, predicate = () => true) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).filter((entry) => entry.isFile() && predicate(entry.name)).map((entry) => path.relative(base, path.join(directory, entry.name)).split(path.sep).join("/"));
}

function parseNodeMajor(engine) {
  const match = String(engine || "").match(/([0-9]+)/);
  return match ? Number(match[1]) : 0;
}

function readJson(filePath, label) {
  try { return JSON.parse(fs.readFileSync(filePath, "utf8")); }
  catch (error) { throw codedError(`Unable to read ${label}: ${error.message}`, "REPOSITORY_JSON_INVALID", { path: filePath }); }
}

function safeRead(filePath) {
  try {
    const extension = path.extname(filePath).toLowerCase();
    if (extension && !TEXT_EXTENSIONS.has(extension)) return "";
    return fs.readFileSync(filePath, "utf8");
  } catch { return ""; }
}

function atomicWrite(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });
  const temporary = `${filePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
  fs.writeFileSync(temporary, content, { mode: 0o600 });
  fs.renameSync(temporary, filePath);
}

function createJsonlLogger(filePath) {
  return {
    filePath,
    write(level, event, fields = {}) {
      fs.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });
      fs.appendFileSync(filePath, `${JSON.stringify(redact({ timestamp: new Date().toISOString(), level, event, ...fields }))}\n`, { mode: 0o600 });
    },
  };
}

function redact(value) {
  if (Array.isArray(value)) return value.map(redact);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, /token|secret|password|authorization|cookie/i.test(key) ? "[REDACTED]" : redact(child)]));
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

function digest(value) { return crypto.createHash("sha256").update(value).digest("hex"); }
function metricLabel(value) { return String(value).replace(/[^a-zA-Z0-9_]/g, "_"); }
function uniqueBy(values, key) { return Array.from(new Map(values.map((value) => [key(value), value])).values()); }
function codedError(message, code, fields = {}) { const error = new Error(message); error.code = code; Object.assign(error, fields); return error; }

module.exports = {
  createRepositoryIntelligence,
  buildInventory,
  evaluateRepository,
  scoreDimensions,
  weightedScore,
  stableStringify,
};
