"use strict";

const { ExecutionGraph } = require("./graph/execution_graph");
const { replay } = require("./replay/replay_engine");
const { validateSingleSource } = require("./consistency_check");
const { enforceSingleTruthLayer } = require("./graph/graph_guard");

function bootstrapEIP(system = {}) {
  validateSingleSource(system);
  enforceSingleTruthLayer(system);

  const graph = new ExecutionGraph();

  return {
    graph,
    replay: () => replay(graph),
    appendEvent: (event) => graph.appendEvent(event),
    addState: (id, state) => graph.addState(id, state),
    snapshot: () => graph.snapshot(),
  };
}

module.exports = {
  bootstrapEIP,
};
