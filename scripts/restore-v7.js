#!/usr/bin/env node
"use strict";

const { downloadBackup, listRemoteBackups, restoreBackup, verifyBackup } = require("../core/production/backup_manager");

async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  let inputPath = args.input;
  if (!inputPath && (args.remote || args.latest)) {
    let key = args.remote;
    if (!key || key === true || args.latest) {
      const backups = await listRemoteBackups({});
      if (!backups.length) throw new Error("no remote backups were found");
      key = backups[0].key;
    }
    const downloaded = await downloadBackup({ key, outputPath: args.download });
    inputPath = downloaded.output_path;
  }
  if (!inputPath) throw new Error("provide --input FILE, --remote KEY, or --latest");
  const options = { inputPath, targetRoot: args.target, force: Boolean(args.force) };
  const result = args.verify || args["dry-run"] ? verifyBackup(options) : restoreBackup(options);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

function parseArgs(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith("--")) continue;
    const [rawKey, inline] = item.slice(2).split("=", 2);
    if (inline !== undefined) result[rawKey] = inline;
    else if (argv[index + 1] && !argv[index + 1].startsWith("--")) result[rawKey] = argv[++index];
    else result[rawKey] = true;
  }
  return result;
}

if (require.main === module) main().catch((error) => {
  process.stderr.write(`${JSON.stringify({ ok: false, code: error.code || "RESTORE_FAILED", error: error.message })}\n`);
  process.exit(1);
});

module.exports = { main, parseArgs };
