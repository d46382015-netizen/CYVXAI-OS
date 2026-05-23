"use strict";

function validateSingleSource(system) {
  const stateSources = [
    system?.machineState,
    system?.liveState,
    system?.cache,
    system?.snapshotState,
  ].filter(Boolean);

  if (stateSources.length > 1) {
    throw new Error("EIP CONSOLIDATION FAILED: multiple state sources detected");
  }

  return true;
}

module.exports = {
  validateSingleSource,
};
