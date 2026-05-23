#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Kernel } from "../kernel/engine.js";
import { createEvent } from "../events/event.js";
import { replay } from "../replay/index.js";
import { fork } from "../replay/fork.js";
import { CausalGraph, link as causalLink } from "../causal/index.js";
import { startVizServer } from "../viz/server.js";

function parseSimpleYaml(text) {
  const lines = text.split("\n").filter((line) => line.trim() && !line.trim().startsWith("#"));
  const root = {};
  for (const line of lines) {
    const match = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
    if (!match) continue;
    const [, key, raw] = match;
    const value = raw === "" ? {} : Number.isNaN(Number(raw)) ? raw : Number(raw);
    root[key] = value;
  }
  return root;
}

function readScenario(file) {
  const text = fs.readFileSync(file, "utf8");
  if (file.endsWith(".json")) return JSON.parse(text);
  return parseSimpleYaml(text);
}

function usage() {
  return [
    "eos init",
    "eos run scenario.yaml",
    "eos replay run_id",
    "eos fork run_id event_index",
    "eos explain run_id",
    "eos viz"
  ].join("\n");
}

async function main() {
  const [, , command, arg1, arg2] = process.argv;
  const kernel = new Kernel().boot();

  if (!command) {
    process.stdout.write(`${usage()}\n`);
    return;
  }

  if (command === "init") {
    fs.mkdirSync(path.join(process.cwd(), ".eos-data"), { recursive: true });
    process.stdout.write("EOS initialized\n");
    return;
  }

  if (command === "run") {
    const scenario = readScenario(arg1);
    const event = createEvent({
      type: "scenario:start",
      payload: scenario,
      process_id: "scenario"
    });
    kernel.enqueue(event);
    const trace = kernel.run();
    process.stdout.write(`${JSON.stringify({ run_id: kernel.store.runId, events: trace }, null, 2)}\n`);
    return;
  }

  if (command === "replay") {
    const runId = arg1 || "default";
    const store = new Kernel({ runId }).store;
    const state = replay(store.events, {});
    process.stdout.write(`${JSON.stringify({ run_id: runId, state }, null, 2)}\n`);
    return;
  }

  if (command === "fork") {
    const runId = arg1 || "default";
    const index = Number(arg2 || 0);
    const store = new Kernel({ runId }).store;
    process.stdout.write(`${JSON.stringify(fork(store.events, index), null, 2)}\n`);
    return;
  }

  if (command === "explain") {
    const runId = arg1 || "default";
    const store = new Kernel({ runId }).store;
    const events = store.events;
    const point = firstDivergence(events, events);
    process.stdout.write(`${JSON.stringify({ run_id: runId, first_divergence: point }, null, 2)}\n`);
    return;
  }

  if (command === "viz") {
    startVizServer({ port: Number(process.env.EOS_VIZ_PORT || 8787) });
    process.stdout.write("EOS viz server running\n");
    return;
  }

  process.stderr.write(`${usage()}\n`);
  process.exitCode = 1;
}

main();
