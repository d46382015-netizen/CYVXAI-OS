import crypto from "node:crypto";

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function validateEvent(input) {
  if (!isObject(input)) {
    throw new TypeError("event must be an object");
  }

  const { type, payload, process_id, causal_parents = [] } = input;

  if (typeof type !== "string" || type.length === 0) {
    throw new TypeError("event.type must be a non-empty string");
  }
  if (typeof process_id !== "string" || process_id.length === 0) {
    throw new TypeError("event.process_id must be a non-empty string");
  }
  if (!Array.isArray(causal_parents)) {
    throw new TypeError("event.causal_parents must be an array");
  }
  for (const parent of causal_parents) {
    if (typeof parent !== "string" || parent.length === 0) {
      throw new TypeError("event.causal_parents must contain ids");
    }
  }

  return { type, payload, process_id, causal_parents };
}

export function createEvent({
  type,
  payload,
  process_id,
  causal_parents = []
}) {
  const validated = validateEvent({ type, payload, process_id, causal_parents });

  return Object.freeze({
    id: crypto.randomUUID(),
    type: validated.type,
    payload: validated.payload ?? null,
    process_id: validated.process_id,
    timestamp: null,
    vector_clock: Object.freeze({}),
    causal_parents: Object.freeze([...validated.causal_parents])
  });
}
