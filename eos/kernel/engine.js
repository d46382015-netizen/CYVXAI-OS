import { createEvent } from "../events/event.js";
import { Runtime } from "../runtime/index.js";
import { Scheduler } from "../scheduler/index.js";
import { EventStore } from "../store/store.js";
import { CausalGraph, link as causalLink } from "../causal/index.js";
import { createSnapshot, validateSnapshot } from "../snapshot/index.js";
import { Sandbox } from "../sandbox/index.js";
import { ScenarioEngine } from "../scenario/engine.js";
import { replay } from "../replay/index.js";
import { defaultConfig } from "../config/default.js";
import { startVizServer } from "../viz/server.js";

export class Kernel {
  constructor(config = {}) {
    this.config = { ...defaultConfig, ...config };
    this.runtime = new Runtime();
    this.scheduler = new Scheduler({ processPriority: this.config.processPriority });
    this.store = new EventStore({ dataDir: this.config.dataDir, runId: this.config.runId || "default" });
    this.causal = new CausalGraph();
    this.sandbox = new Sandbox(this.config.sandbox || {});
    this.plugins = [];
    this.vizServer = null;
    this.logicalTime = 0;
  }

  boot() {
    if (this.config.viz === true) {
      this.vizServer = startVizServer({
        port: this.config.vizPort,
        traceFile: this.store.walFile
      });
    }
    return this;
  }

  registerPlugin(plugin) {
    this.plugins.push(plugin);
    return this;
  }

  registerEUType(name, EuClass) {
    this.runtime.registerType(name, EuClass);
    return this;
  }

  enqueue(event) {
    this.scheduler.enqueue(event);
  }

  step() {
    if (!this.scheduler.hasNext()) return null;

    const event = this.scheduler.next();
    const eu = this.runtime.ensure(event.process_id, event.payload?.eu_type || "default", event.payload?.initial_state || {});
    const result = this.sandbox.run(() => eu.transition(eu.state, event));

    eu.state = result.state;
    event.timestamp = this.logicalTime + 1;

    const stateEvent = createEvent({
      type: "state:set",
      payload: { state: result.state },
      process_id: event.process_id,
      causal_parents: [event.id]
    });
    stateEvent.timestamp = this.logicalTime + 1;

    const emitted = (result.events || []).map((item) => {
      const child = createEvent({
        type: item.type,
        payload: item.payload,
        process_id: item.process_id || event.process_id,
        causal_parents: [event.id]
      });
      child.timestamp = this.logicalTime + 1;
      return child;
    });

    this.logicalTime += 1;

    this.store.append(event);
    this.store.append(stateEvent);
    for (const emittedEvent of emitted) {
      this.store.append(emittedEvent);
    }

    causalLink(this.causal, event, [stateEvent, ...emitted]);
    this.scheduler.commit([stateEvent, ...emitted]);

    const snapshot = createSnapshot(eu.state, stateEvent.id);
    if (this.store.events.length % this.config.snapshotInterval === 0) {
      this.store.saveSnapshot(event.process_id, snapshot);
      validateSnapshot(snapshot, replay(this.store.queryByProcess(event.process_id), {}));
    }

    return { event, emitted, state: eu.state };
  }

  run() {
    while (this.scheduler.hasNext()) {
      this.step();
    }
    return this.store.events;
  }

  runScenario(config = {}) {
    const scenario = new ScenarioEngine(config).generate();
    if (Array.isArray(scenario.events)) {
      for (const item of scenario.events) {
        this.enqueue(createEvent(item));
      }
    }
    return scenario;
  }
}
