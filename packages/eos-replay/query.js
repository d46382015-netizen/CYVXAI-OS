"use strict";

const { sortEvents } = require("./replay");

function normalizeRange(range = {}) {
  if (!range) return null;
  const from = range.from || range.start || null;
  const to = range.to || range.end || null;
  if (!from && !to) return null;
  return { from, to };
}

function queryEvents(events = [], filters = {}) {
  const ordered = sortEvents(events);
  const type = filters.type || null;
  const actor = filters.actor || filters.service || null;
  const traceId = filters.trace_id || filters.traceId || filters.run_id || filters.runId || null;
  const range = normalizeRange(filters.time_range || filters.range || {});

  return ordered.filter((event) => {
    if (type && event.type !== type) return false;
    if (actor && event.actor !== actor && event.meta?.service !== actor) return false;
    if (traceId && event.run_id !== traceId && event.trace_id !== traceId && event.meta?.trace_id !== traceId) return false;
    if (range) {
      const ts = Number(event.ts || 0);
      if (range.from && ts < Number(range.from)) return false;
      if (range.to && ts > Number(range.to)) return false;
    }
    return true;
  });
}

module.exports = {
  queryEvents,
};
