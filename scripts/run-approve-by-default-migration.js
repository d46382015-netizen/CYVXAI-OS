#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const target = path.join(__dirname, "apply-approve-by-default-migration.js");
let source = fs.readFileSync(target, "utf8");
const broken = "process.stdout.write(`" + "${JSON.stringify(result, null, 2)}" + "\\n`);";
const fixed = 'process.stdout.write(JSON.stringify(result, null, 2) + "\\n");';
if (source.includes(broken)) {
  source = source.replace(broken, fixed);
  fs.writeFileSync(target, source);
}
require(target);
