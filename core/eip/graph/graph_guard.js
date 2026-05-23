"use strict";

function enforceSingleTruthLayer(system) {
  const forbidden = [
    "machineState",
    "liveState",
    "volatileState",
    "cachedState",
    "derivedState",
  ];

  for (const key of forbidden) {
    if (system && Object.prototype.hasOwnProperty.call(system, key) && system[key]) {
      throw new Error("EIP CONSOLIDATION VIOLATION: " + key + " must be removed");
    }
  }

  return true;
}

module.exports = {
  enforceSingleTruthLayer,
};
