import { EU } from "../eu/index.js";

export class Runtime {
  constructor() {
    this.eus = new Map();
    this.euTypes = new Map();
  }

  registerType(name, EuClass = EU) {
    this.euTypes.set(name, EuClass);
    return this;
  }

  register(id, eu) {
    this.eus.set(id, eu);
    return eu;
  }

  ensure(id, type = "default", initialState = {}) {
    if (this.eus.has(id)) return this.eus.get(id);
    const EuClass = this.euTypes.get(type) || EU;
    const eu = new EuClass(initialState);
    eu.id = id;
    eu.type = type;
    this.eus.set(id, eu);
    return eu;
  }

  get(id) {
    return this.eus.get(id) || null;
  }
}
