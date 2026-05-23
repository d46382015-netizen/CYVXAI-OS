"use strict";

const fs = require("node:fs");

function resolveModel(configPath) {
  const cfg = JSON.parse(fs.readFileSync(configPath, "utf8"));

  if (!cfg.primary) throw new Error("No primary model defined");
  if (!cfg.fallback) throw new Error("No fallback model defined");

  const allowed = [
    "anthropic/claude-sonnet-4-5",
    "openai/gpt-5-mini",
  ];

  if (!allowed.includes(cfg.primary)) {
    throw new Error("Invalid primary model: " + cfg.primary);
  }

  return cfg.primary;
}

module.exports = { resolveModel };
