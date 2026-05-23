"use strict";

const { ExecutionGraph } = require("../graph/execution_graph");

function replay(graph) {
  const executionGraph = graph instanceof ExecutionGraph ? graph : graph?.executionGraph;
  if (!executionGraph) {
    throw new Error("EIP replay requires an execution graph");
  }

  const state = {};

  for (const event of executionGraph.events) {
    if (event.type === "SET") {
      state[event.key] = event.value;
      continue;
    }
    if (event.type === "PATCH" && event.path) {
      state[event.path] = event.value;
    }
  }

  return state;
}

module.exports = {
  replay,
};
