#!/usr/bin/env node
"use strict";

const path = require("node:path");
const { renderAllAssets } = require("../services/content-growth");

function main() {
  const output = path.resolve(process.argv[2] || path.join(process.cwd(), "dist", "field-manual"));
  const manifest = renderAllAssets(output);
  process.stdout.write(`${JSON.stringify({ ok: true, output, files: manifest.files.length, posts: manifest.posts }, null, 2)}\n`);
}

if (require.main === module) {
  try { main(); }
  catch (error) {
    process.stderr.write(`${JSON.stringify({ ok: false, error: error.message })}\n`);
    process.exit(1);
  }
}

module.exports = { main };
