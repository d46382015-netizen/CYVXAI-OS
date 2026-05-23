"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { resolveModel } = require("./model_guard");

function main() {
  console.log("[EOS] boot starting...");

  const root = process.cwd();
  const configPath = path.join(root, "config", "models.lock.json");

  execFileSync("sh", [path.join(root, "runtime", "gateway_guard.sh")], {
    stdio: "inherit",
    env: {
      ...process.env,
      CYVX_GATEWAY_REQUIRED: process.env.CYVX_GATEWAY_REQUIRED || "0",
    },
  });

  const cfg = JSON.parse(fs.readFileSync(configPath, "utf8"));
  if (cfg.allow_runtime_changes !== false) {
    throw new Error("Runtime model mutation is forbidden");
  }

  const model = resolveModel(configPath);
  console.log("[EOS] model locked:", model);

  if (!model.includes("/")) {
    throw new Error("Malformed model id");
  }

  console.log("[EOS] boot OK - system stabilized");
}

if (require.main === module) {
  main();
}
