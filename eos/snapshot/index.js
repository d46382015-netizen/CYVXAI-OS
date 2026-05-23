export function createSnapshot(state, last_event_id) {
  return {
    state,
    last_event_id
  };
}

export function validateSnapshot(snapshot, replayResult) {
  return JSON.stringify(snapshot?.state) === JSON.stringify(replayResult);
}
