#!/usr/bin/env node
"use strict";
require("../apps/field-manual/server").start().catch((error) => {
  process.stderr.write(`${JSON.stringify({ ok: false, error: error.message })}\n`);
  process.exit(1);
});
