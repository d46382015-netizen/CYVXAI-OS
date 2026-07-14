#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const file = path.resolve(__dirname, "../services/revenue/engine.js");
let source = fs.readFileSync(file, "utf8");
const replacements = [
  [
    '    const rows = this.db.prepare("SELECT * FROM revenue_events WHERE venture_id=? ORDER BY created_at,id").all(ventureId);',
    '    const rows = this.db.prepare("SELECT rowid AS ledger_sequence,* FROM revenue_events WHERE venture_id=? ORDER BY rowid").all(ventureId);',
    "ledger verification order",
  ],
  [
    '    const previous = this.db.prepare("SELECT event_hash FROM revenue_events WHERE venture_id=? ORDER BY created_at DESC,id DESC LIMIT 1").get(ventureId);',
    '    const previous = this.db.prepare("SELECT event_hash FROM revenue_events WHERE venture_id=? ORDER BY rowid DESC LIMIT 1").get(ventureId);',
    "ledger predecessor order",
  ],
];
for (const [search, replacement, label] of replacements) {
  if (source.includes(replacement)) continue;
  const count = source.split(search).length - 1;
  if (count !== 1) throw new Error(`${label}: expected one match, found ${count}`);
  source = source.replace(search, replacement);
}
fs.writeFileSync(file, source);
process.stdout.write(`${JSON.stringify({ ok: true, file })}\n`);