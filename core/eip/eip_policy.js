"use strict";

const EIP_POLICY = Object.freeze({
  enforceSingleExecutionGraph: true,
  forbidParallelStateModels: true,
  requireEventAppendOnly: true,
  requireReplayAsTruth: true,
});

module.exports = {
  EIP_POLICY,
};
