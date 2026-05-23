import crypto from "node:crypto";
import { replay } from "../replay/index.js";

function hash(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function validateLocalExecution(events, initialState = {}) {
  const state = replay(events, initialState);
  return {
    state,
    hash: hash(state),
    eventCount: events.length
  };
}

export function validatePeerView(local, remote) {
  return {
    matches: local.hash === remote.hash,
    local,
    remote
  };
}
