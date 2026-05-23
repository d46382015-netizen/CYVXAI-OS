#!/usr/bin/env node

import fs from "node:fs/promises";
import process from "node:process";

const BRIDGE_URL = process.env.CYVX_BRIDGE_URL || "http://127.0.0.1:8090";
const API_URL = process.env.CYVX_API_URL || "http://127.0.0.1:8080";

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});

async function main() {
  const [command, ...args] = process.argv.slice(2);
  switch (command) {
    case "status":
      return printJson(await getJson(`${BRIDGE_URL}/api/v1/state`));
    case "agents":
      return printJson(await getJson(`${BRIDGE_URL}/api/v1/agents`));
    case "optimize":
      return printJson(await postJson(`${BRIDGE_URL}/api/v1/tick`, {}));
    case "deploy":
      return deployWorkload(args[0]);
    default:
      usage();
  }
}

async function deployWorkload(filePath) {
  if (!filePath) {
    throw new Error("usage: cyvx deploy <workload.json>");
  }
  const raw = await fs.readFile(filePath, "utf8");
  const workload = JSON.parse(raw);
  const response = await postJson(`${API_URL}/api/v1/workloads`, workload);
  printJson(response);
}

async function getJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`request failed: ${response.status} ${url}`);
  }
  return response.json();
}

async function postJson(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!response.ok) {
    const message = await response.text();
    throw new Error(`request failed: ${response.status} ${message}`);
  }
  return response.json();
}

function printJson(data) {
  process.stdout.write(`${JSON.stringify(data, null, 2)}\n`);
}

function usage() {
  console.log("usage: cyvx <status|agents|optimize|deploy>");
  process.exitCode = 1;
}

