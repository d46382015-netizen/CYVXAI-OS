export function firstMismatch(a, b) {
  const limit = Math.min(a.length, b.length);
  for (let i = 0; i < limit; i++) {
    if (JSON.stringify(a[i]) !== JSON.stringify(b[i])) {
      return i;
    }
  }
  if (a.length !== b.length) {
    return limit;
  }
  return -1;
}

export function classifyDivergence({ localLog = [], remoteLog = [], localState, remoteState }) {
  const mismatchIndex = firstMismatch(localLog, remoteLog);
  if (mismatchIndex >= 0) {
    const localLength = localLog.length;
    const remoteLength = remoteLog.length;
    if (localLength !== remoteLength) {
      return {
        kind: "missing-event-propagation",
        mismatchIndex,
        localLength,
        remoteLength
      };
    }

    return {
      kind: "nondeterministic-execution-bug",
      mismatchIndex
    };
  }

  if (JSON.stringify(localState) !== JSON.stringify(remoteState)) {
    return {
      kind: "scheduling-mismatch",
      mismatchIndex: -1
    };
  }

  return {
    kind: "converged",
    mismatchIndex: -1
  };
}
