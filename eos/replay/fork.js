export function fork(events, index) {
  return {
    base: events.slice(0, index),
    branch: []
  };
}
