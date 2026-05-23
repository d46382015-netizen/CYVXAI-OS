"use strict";

function toOTel(event = {}) {
  return {
    traceId: event.run_id || "uef",
    spanId: event.id || event.eventId || "uef-span",
    name: event.type || "event",
    timestamp: event.ts || Date.now(),
    attributes: {
      path: event.path || null,
      status: event.status || null,
      error: event.message || null,
      actor: event.actor || null,
      key: event.key ?? null,
      ...event.meta,
    },
  };
}

module.exports = {
  toOTel,
};
