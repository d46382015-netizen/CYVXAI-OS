"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { hashTree } = require("./index");

const MODULE_EXTENSIONS = ["", ".js", ".cjs", ".mjs", ".json", ".ts", ".tsx"];
const SPECIFIER_PATTERNS = [
  /\brequire\s*\(\s*(["'`])([^"'`]+)\1\s*\)/g,
  /\bimport\s*\(\s*(["'`])([^"'`]+)\1\s*\)/g,
  /\b(?:import|export)\s+(?:[^"'`]*?\s+from\s+)?(["'`])([^"'`]+)\1/g,
];
const TEXT_EXTENSIONS = new Set([".cjs", ".css", ".html", ".js", ".json", ".md", ".mjs", ".sh", ".sql", ".ts", ".tsx", ".yaml", ".yml"]);
const EXCLUDES = new Set([".git", "node_modules", "dist", "coverage", ".next", ".cache", "vendor"]);

function restoreAndRewrite(options) {
  const root = path.resolve(options.root);
  const statePath = path.resolve(options.statePath);
  const proofDir = path.resolve(options.proofDir);
  const config = options.config;
  const moves = options.moves;
  const state = readJson(statePath);
  const runDir = path.dirname(statePath);

  for (const record of state.rewritten_files || []) {
    const backup = path.join(runDir, "backups", record.original_path);
    const current = path.join(root, record.current_path);
    if (!fs.existsSync(backup)) throw new Error(`Missing rollback backup for ${record.original_path}`);
    fs.mkdirSync(path.dirname(current), { recursive: true });
    fs.copyFileSync(backup, current);
  }

  const records = [];
  for (const currentPath of walkTextFiles(root)) {
    if (currentPath === "config/topology-consolidation.json") continue;
    const absolute = path.join(root, currentPath);
    const originalPath = reverseMapRepositoryPath(currentPath, moves);
    const before = fs.readFileSync(absolute, "utf8");
    const after = rewriteContent(root, originalPath, currentPath, before, moves);
    if (after === before) continue;
    const backup = path.join(runDir, "backups", originalPath);
    if (!fs.existsSync(backup)) {
      fs.mkdirSync(path.dirname(backup), { recursive: true });
      fs.writeFileSync(backup, before);
    }
    fs.writeFileSync(absolute, after);
    records.push({
      original_path: originalPath,
      current_path: currentPath,
      before_digest: digest(before),
      after_digest: digest(after),
    });
  }

  state.rewritten_files = records;
  state.status = "verifying";
  state.after_tree_digest = hashTree(root, config);
  writeJson(statePath, state);
  writeJson(path.join(proofDir, "safe-rewrite-manifest.json"), { rewritten_files: records });
  return state;
}

function rewriteContent(root, originalRelativePath, currentRelativePath, text, moves) {
  let output = text;
  for (const pattern of SPECIFIER_PATTERNS) {
    pattern.lastIndex = 0;
    output = output.replace(pattern, (full, quote, specifier) => {
      const resolved = resolveSpecifier(root, originalRelativePath, specifier);
      const mapped = resolved && mapRepositoryPath(resolved, moves);
      if (!mapped) return full;
      let next = normalizePath(path.relative(path.dirname(currentRelativePath), mapped));
      if (!next.startsWith(".")) next = `./${next}`;
      if (!path.extname(specifier)) {
        next = next.replace(/\/(?:index)\.(?:cjs|js|mjs|json|ts|tsx)$/i, "").replace(/\.(?:cjs|js|mjs|json|ts|tsx)$/i, "");
      }
      return full.replace(`${quote}${specifier}${quote}`, `${quote}${next}${quote}`);
    });
  }

  for (const move of moves) {
    const escaped = escapeRegex(move.source);
    output = output.replace(new RegExp(`(^|[^A-Za-z0-9_./-])${escaped}\/`, "gm"), (_, prefix) => `${prefix}${move.target}/`);
    output = output.replace(new RegExp(`(^|[\\s"'\`(=:])\\./${escaped}\/`, "gm"), (_, prefix) => `${prefix}./${move.target}/`);
  }
  return output;
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

function mapRepositoryPath(relativePath, moves) {
  const normalized = normalizePath(relativePath);
  for (const move of moves) {
    if (normalized === move.source) return move.target;
    if (normalized.startsWith(`${move.source}/`)) return `${move.target}${normalized.slice(move.source.length)}`;
  }
  return normalized;
}

function reverseMapRepositoryPath(relativePath, moves) {
  const normalized = normalizePath(relativePath);
  for (const move of moves) {
    if (normalized === move.target) return move.source;
    if (normalized.startsWith(`${move.target}/`)) return `${move.source}${normalized.slice(move.target.length)}`;
  }
  return normalized;
}

function walkTextFiles(root) {
  const results = [];
  const stack = [root];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (EXCLUDES.has(entry.name)) continue;
      const absolute = path.join(current, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) stack.push(absolute);
      else if (entry.isFile()) {
        const relative = normalizePath(path.relative(root, absolute));
        if (TEXT_EXTENSIONS.has(path.extname(relative).toLowerCase()) || ["Dockerfile", "Procfile", "LICENSE"].includes(path.basename(relative))) results.push(relative);
      }
    }
  }
  return results.sort();
}

function readJson(filePath) { return JSON.parse(fs.readFileSync(filePath, "utf8")); }
function writeJson(filePath, value) { fs.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 }); fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 }); }
function normalizePath(value) { return String(value).split(path.sep).join("/").replace(/^\.\//, ""); }
function escapeRegex(value) { return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
function digest(value) { return crypto.createHash("sha256").update(value).digest("hex"); }

module.exports = {
  restoreAndRewrite,
  rewriteContent,
  resolveSpecifier,
  mapRepositoryPath,
  reverseMapRepositoryPath,
};
