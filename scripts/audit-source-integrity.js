#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const crypto = require("node:crypto");

const ROOT = path.resolve(process.argv[2] || process.cwd());
const SKIP = new Set([".git", "node_modules", "dist", "coverage", ".next", ".turbo"]);
const EXTENSIONS = new Set([".js", ".mjs", ".cjs"]);
const PATCH_MARKERS = ["*** Begin" + " Patch", "*** End" + " Patch"];

function walk(directory, output = []) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(absolute, output);
    else if (entry.isFile() && EXTENSIONS.has(path.extname(entry.name))) output.push(absolute);
  }
  return output;
}

function appearsToBeModule(source, extension) {
  return extension === ".mjs" || /(^|\n)\s*(?:import\s|export\s)/m.test(source) || /(^|\n)await\b/m.test(source);
}

function normalizedSource(source) {
  return source.startsWith("#!") ? source.replace(/^#![^\n]*(?:\n|$)/, "") : source;
}

function syntaxCheck(file, source) {
  const extension = path.extname(file);
  if (!appearsToBeModule(source, extension)) {
    try {
      // Node executes CommonJS inside a function wrapper, so this provides the
      // same parsing boundary without starting a process for every file.
      Function(normalizedSource(source)); // eslint-disable-line no-new-func
      return { ok: true, error: null };
    } catch (error) {
      return { ok: false, error: `${file}: ${error.name}: ${error.message}` };
    }
  }

  const temporary = path.join(os.tmpdir(), `cyvx-source-audit-${process.pid}-${crypto.randomUUID()}.mjs`);
  try {
    fs.writeFileSync(temporary, normalizedSource(source), { mode: 0o600 });
    const result = spawnSync(process.execPath, ["--check", temporary], { encoding: "utf8" });
    return {
      ok: result.status === 0,
      error: String(result.stderr || result.stdout || "").replaceAll(temporary, file).trim() || null,
    };
  } finally {
    fs.rmSync(temporary, { force: true });
  }
}

function audit(root = ROOT) {
  const files = walk(root).sort();
  const failures = [];
  for (const file of files) {
    const relative = path.relative(root, file).split(path.sep).join("/");
    const source = fs.readFileSync(file, "utf8");
    const markers = PATCH_MARKERS.filter((marker) => source.includes(marker));
    if (markers.length) failures.push({ file: relative, type: "patch_marker", markers });
    const checked = syntaxCheck(file, source);
    if (!checked.ok) failures.push({ file: relative, type: "syntax", error: checked.error });
  }
  const result = {
    ok: failures.length === 0,
    checked_files: files.length,
    failures,
    audited_at: new Date().toISOString(),
  };
  result.proof = crypto.createHash("sha256").update(JSON.stringify(result)).digest("hex");
  return result;
}

if (require.main === module) {
  const result = audit();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.ok) process.exitCode = 1;
}

module.exports = { audit, appearsToBeModule, syntaxCheck, walk };
