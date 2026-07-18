#!/usr/bin/env node
"use strict";

const path = require("node:path");
const { buildAll } = require("../apps/field-manual/lib/pipeline");

function arg(name) {
  const prefix = `--${name}=`;
  const found = process.argv.find((value) => value.startsWith(prefix));
  return found ? found.slice(prefix.length) : null;
}

buildAll({
  outDir: arg("out") ? path.resolve(arg("out")) : undefined,
  slug: arg("slug") || undefined,
  useAi: process.argv.includes("--ai")
}).then((result) => {
  process.stdout.write(`${JSON.stringify({
    ok: true,
    event: "field_manual.built",
    out_dir: result.outDir,
    posts: result.manifest.post_count,
    files: result.manifest.files.length,
    duration_ms: result.manifest.duration_ms
  }, null, 2)}\n`);
}).catch((error) => {
  process.stderr.write(`${JSON.stringify({
    ok: false,
    error: error.message,
    validation_errors: error.validation_errors || []
  }, null, 2)}\n`);
  process.exit(1);
});
