export function apply(state, event) {
  if (event?.type === "state:set") {
    return event.payload?.state ?? state;
  }
  if (event?.type === "state:merge") {
    return { ...state, ...(event.payload ?? {}) };
  }
  return state;
}

export function replay(events, initialState) {
  let state = initialState;

  for (const e of events) {
    state = apply(state, e);
  }

  return state;
}

export function partialReplay(events, index, initialState) {
  return replay(events.slice(0, Math.max(0, index)), initialState);
}
