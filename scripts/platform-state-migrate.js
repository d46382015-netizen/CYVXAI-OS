#!/usr/bin/env node
"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { SqliteStateStore } = require("../core/platform/sqlite_store");

function main(argv = process.argv.slice(2)) {
  const command = argv[0] || "migrate";
  const options = parseOptions(argv.slice(1));
  const home = os.homedir();

  if (command === "migrate") {
    const source = path.resolve(options.from || path.join(home, ".cyvx", "platform-state.json"));
    const destination = path.resolve(options.to || path.join(home, ".cyvx", "platform.db"));
    if (!fs.existsSync(source)) throw new Error(`legacy platform state not found: ${source}`);
    const sourceState = readObject(source);
    if (options.dryRun) return print({ command, dry_run: true, source, destination, source: describe(sourceState) });

    const existed = fs.existsSync(destination);
    const store = new SqliteStateStore(destination, {}, { legacyFilePath: existed ? null : source });
    store.open();
    if (existed) store.importJson(source, { replace: Boolean(options.force) });
    const migrated = store.load();
    const result = {
      command,
      source,
      destination,
      source_preserved: fs.existsSync(source),
      destination_existed: existed,
      verified: checksum(sourceState) === checksum(migrated),
      source_state: describe(sourceState),
      destination_state: describe(migrated),
      persistence: store.metadata(),
      rollback_command: `node scripts/platform-state-migrate.js rollback --from ${shell(destination)} --to ${shell(source + ".rollback")}`,
    };
    store.close();
    if (!result.verified) throw new Error("migration verification failed: source and destination checksums differ");
    return print(result);
  }

  if (command === "rollback") {
    const source = path.resolve(options.from || path.join(home, ".cyvx", "platform.db"));
    const destination = path.resolve(options.to || path.join(home, ".cyvx", "platform-state.json"));
    if (!fs.existsSync(source)) throw new Error(`SQLite platform state not found: ${source}`);
    if (fs.existsSync(destination) && !options.force) {
      throw new Error(`rollback destination already exists: ${destination}; pass --force to replace it after a .bak is created`);
    }
    if (options.dryRun) return print({ command, dry_run: true, source, destination });

    const store = new SqliteStateStore(source);
    const expected = store.load();
    const exported = store.exportJson(destination);
    const actual = readObject(destination);
    const result = {
      command,
      source,
      destination,
      verified: checksum(expected) === checksum(actual),
      state: describe(actual),
      export: exported,
      runtime_switch: "Set CYVX_PLATFORM_BACKEND=json and CYVX_PLATFORM_STATE to the rollback file, then restart CYVX.",
    };
    store.close();
    if (!result.verified) throw new Error("rollback verification failed: SQLite and JSON checksums differ");
    return print(result);
  }

  throw new Error("usage: platform-state-migrate.js <migrate|rollback> [--from path] [--to path] [--force] [--dry-run]");
}

function parseOptions(args) {
  const out = { force: false, dryRun: false };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--force") out.force = true;
    else if (arg === "--dry-run") out.dryRun = true;
    else if (arg === "--from" || arg === "--to") {
      const value = args[index + 1];
      if (!value) throw new Error(`${arg} requires a path`);
      out[arg.slice(2)] = value;
      index += 1;
    } else {
      throw new Error(`unknown option: ${arg}`);
    }
  }
  return out;
}

function readObject(file) {
  const value = JSON.parse(fs.readFileSync(file, "utf8"));
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`state must be a JSON object: ${file}`);
  return value;
}

function checksum(value) {
  return crypto.createHash("sha256").update(stableStringify(value)).digest("hex");
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function describe(value) {
  const collections = Object.fromEntries(Object.entries(value)
    .filter(([, item]) => Array.isArray(item))
    .map(([key, item]) => [key, item.length]));
  return { checksum: checksum(value), bytes: Buffer.byteLength(JSON.stringify(value)), collections };
}

function shell(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function print(value) {
  process.stdout.write(JSON.stringify(value, null, 2) + "\n");
  return value;
}

try {
  main();
} catch (error) {
  console.error(JSON.stringify({ ok: false, error: error.code || "MIGRATION_FAILED", message: error.message }, null, 2));
  process.exitCode = 1;
}

module.exports = { checksum, describe, main, parseOptions, stableStringify };
