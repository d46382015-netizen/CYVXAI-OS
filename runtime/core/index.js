"use strict";

const { LIFECYCLE, STAGE_STATES, ExecutionContext } = require("./context");
const {
  RISK_LEVELS,
  CapabilityError,
  CapabilityRegistry,
  canonicalJson,
  sha256,
} = require("./capability-registry");
const { ensureInside, registerBuiltinCapabilities } = require("./builtins");
const {
  RUN_STATES,
  CoreRuntimeError,
  CyvxCore,
  ensureSchema,
  redact,
  checkedJson,
  valueAtPath,
  compare,
} = require("./kernel");

function createCyvxCore(missionRuntime, options = {}) {
  if (!missionRuntime?.db) throw new TypeError("createCyvxCore requires the existing CYVX mission runtime");
  return new CyvxCore({
    db: missionRuntime.db,
    logger: options.logger || missionRuntime.logger || missionRuntime.store?.logger,
    workspaceRoot: options.workspaceRoot || missionRuntime.repoRoot,
    ...options,
  });
}

module.exports = {
  LIFECYCLE,
  STAGE_STATES,
  RUN_STATES,
  RISK_LEVELS,
  ExecutionContext,
  CapabilityError,
  CapabilityRegistry,
  CoreRuntimeError,
  CyvxCore,
  createCyvxCore,
  ensureSchema,
  ensureInside,
  registerBuiltinCapabilities,
  canonicalJson,
  sha256,
  redact,
  checkedJson,
  valueAtPath,
  compare,
};
