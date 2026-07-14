#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const file = path.resolve(__dirname, "../api/public.js");
let source = fs.readFileSync(file, "utf8");
const line = 'const { createUniversalOperatorRuntime } = require("../services/operator/universal-server");';
const occurrences = source.split(line).length - 1;
if (occurrences < 1) throw new Error("Universal operator import is missing");
if (occurrences > 1) {
  let seen = false;
  source = source.split("\n").filter((entry) => {
    if (entry !== line) return true;
    if (seen) return false;
    seen = true;
    return true;
  }).join("\n");
  if (!source.endsWith("\n")) source += "\n";
  fs.writeFileSync(file, source);
}
process.stdout.write(`${JSON.stringify({ ok: true, occurrences_before: occurrences })}\n`);