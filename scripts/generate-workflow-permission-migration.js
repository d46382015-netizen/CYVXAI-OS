#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const ROOT = path.resolve(process.argv[2] || process.cwd());
const WORKFLOW_ROOT = path.join(ROOT, ".github", "workflows");
const OUTPUT = path.join(ROOT, "artifacts", "policy-migration", "workflow-patch.json");

function sha256(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

function workflowFiles() {
  if (!fs.existsSync(WORKFLOW_ROOT)) return [];
  return fs.readdirSync(WORKFLOW_ROOT)
    .filter((name) => /\.ya?ml$/i.test(name))
    .sort()
    .map((name) => path.join(WORKFLOW_ROOT, name));
}

function replaceTopLevelPermissions(source) {
  const newline = source.includes("\r\n") ? "\r\n" : "\n";
  const lines = source.split(/\r?\n/);
  let start = -1;
  let end = -1;

  for (let index = 0; index < lines.length; index += 1) {
    if (/^permissions\s*:/.test(lines[index])) {
      start = index;
      end = index + 1;
      if (/^permissions\s*:\s*$/.test(lines[index])) {
        while (end < lines.length) {
          const line = lines[end];
          if (!line.trim() || /^\s+#/.test(line) || /^\s+/.test(line)) {
            end += 1;
            continue;
          }
          break;
        }
      }
      break;
    }
  }

  if (start >= 0) {
    lines.splice(start, end - start, "permissions: write-all", "");
  } else {
    const jobsIndex = lines.findIndex((line) => /^jobs\s*:/.test(line));
    if (jobsIndex < 0) throw new Error("Workflow is missing a top-level jobs block");
    lines.splice(jobsIndex, 0, "permissions: write-all", "");
  }

  return `${lines.join(newline).replace(new RegExp(`${newline}+$`), "")}${newline}`;
}

function main() {
  const files = workflowFiles();
  if (!files.length) throw new Error("No workflow files found");
  const patches = [];
  for (const absolute of files) {
    const relative = path.relative(ROOT, absolute).split(path.sep).join("/");
    const before = fs.readFileSync(absolute, "utf8");
    const after = replaceTopLevelPermissions(before);
    patches.push({
      path: relative,
      before_sha256: sha256(before),
      after_sha256: sha256(after),
      changed: before !== after,
      content: after,
    });
  }
  const document = {
    schema_version: 1,
    policy: "approve-by-default",
    workflow_permissions: "write-all",
    generated_at: new Date().toISOString(),
    workflow_count: patches.length,
    changed_count: patches.filter((item) => item.changed).length,
    unchanged_count: patches.filter((item) => !item.changed).length,
    patches,
  };
  document.proof = {
    algorithm: "sha256",
    digest: sha256(JSON.stringify({ ...document, proof: undefined })),
  };
  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, `${JSON.stringify(document, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify({ ok: true, output: path.relative(ROOT, OUTPUT), workflows: document.workflow_count, changed: document.changed_count, proof: document.proof.digest })}\n`);
}

main();
