#!/usr/bin/env node
"use strict";

const { tick, daemon } = require("../core/agency-daemon/daemon");

const mode = process.argv[2] || "once";

if (mode === "start") {
  const state = daemon();
  console.log(JSON.stringify({ started: true, state }, null, 2));
} else {
  console.log(JSON.stringify(tick({ goal: process.argv.slice(2).join(" ") }), null, 2));
}
