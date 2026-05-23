import crypto from "node:crypto";

function depthOf(event) {
  return Number(event?.vector_clock?.depth ?? event?.causal_parents?.length ?? 0);
}

function processPriority(event, priorities) {
  const value = priorities?.[event.process_id];
  return Number.isFinite(value) ? value : 0;
}

function tieBreak(event) {
  return crypto.createHash("sha256").update(event.id).digest("hex");
}

export class Scheduler {
  constructor({ processPriority = {} } = {}) {
    this.processPriority = processPriority;
    this.queue = [];
    this.logicalTime = 0;
  }

  enqueue(event) {
    this.queue.push(event);
    this.queue.sort((a, b) => {
      const depthDelta = depthOf(a) - depthOf(b);
      if (depthDelta !== 0) return depthDelta;

      const priorityDelta = processPriority(a, this.processPriority) - processPriority(b, this.processPriority);
      if (priorityDelta !== 0) return priorityDelta;

      return tieBreak(a).localeCompare(tieBreak(b));
    });
  }

  hasNext() {
    return this.queue.length > 0;
  }

  next() {
    return this.queue.shift() || null;
  }

  commit(events = []) {
    this.logicalTime += 1;
    for (const event of events) {
      this.enqueue(event);
    }
  }
}
