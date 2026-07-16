#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const target = path.join(__dirname, "apply-approve-by-default-migration.js");
let source = fs.readFileSync(target, "utf8");
const marker = "$" + "{JSON.stringify(result, null, 2)}";
const escaped = "\\" + marker;
if (source.includes(marker) && !source.includes(escaped)) {
  source = source.replace(marker, escaped);
  fs.writeFileSync(target, source);
}
require(target);
