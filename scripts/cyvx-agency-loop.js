#!/usr/bin/env node
"use strict";

const { deliberate } = require("../core/agency-runtime/autonomous_agency");

const goal = process.argv.slice(2).join(" ") || "Build one measurable autonomous agency outcome.";
console.log(JSON.stringify(deliberate({ goal }), null, 2));
