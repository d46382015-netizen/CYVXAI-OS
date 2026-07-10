#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createBackup, pruneRemoteBackups, restoreBackup, verifyBackup } = require("../core/production/backup_manager");

async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args["self-test"]) return selfTest();
  const result = await createBackup({
    dataRoot: args["data-root"],
    outputPath: args.output,
    upload: Boolean(args.upload),
  });
  if (args.prune && result.uploaded) result.prune = await pruneRemoteBackups({});
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

async function selfTest() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cyvx-backup-source-"));
  const restored = fs.mkdtempSync(path.join(os.tmpdir(), "cyvx-backup-target-"));
  fs.rmSync(restored, { recursive: true, force: true });
  fs.mkdirSync(path.join(root, "nested"), { recursive: true });
  fs.writeFileSync(path.join(root, "state.json"), JSON.stringify({ ok: true, value: 42 }));
  fs.writeFileSync(path.join(root, "nested", "evidence.txt"), "CYVX recovery proof\n");
  const key = "self-test-key-that-is-at-least-thirty-two-characters";
  const output = path.join(os.tmpdir(), `cyvx-self-test-${process.pid}.cyvxbak`);
  const backup = await createBackup({ dataRoot: root, outputPath: output, encryptionKey: key, upload: false });
  const verified = verifyBackup({ inputPath: output, encryptionKey: key });
  const recovery = restoreBackup({ inputPath: output, targetRoot: restored, encryptionKey: key });
  const source = fs.readFileSync(path.join(root, "nested", "evidence.txt"), "utf8");
  const target = fs.readFileSync(path.join(restored, "nested", "evidence.txt"), "utf8");
  if (source !== target) throw new Error("restored content does not match source content");
  const result = { ok: true, backup, verified, recovery, content_match: true };
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  fs.rmSync(root, { recursive: true, force: true });
  fs.rmSync(restored, { recursive: true, force: true });
  fs.rmSync(output, { force: true });
  return result;
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
  process.stderr.write(`${JSON.stringify({ ok: false, code: error.code || "BACKUP_FAILED", error: error.message })}\n`);
  process.exit(1);
});

module.exports = { main, parseArgs, selfTest };
