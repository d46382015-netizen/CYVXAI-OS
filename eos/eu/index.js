export class EU {
  constructor(initialState = {}) {
    this.state = initialState;
  }

  transition(state, event) {
    if (event?.type === "state:set") {
      return {
        state: event.payload?.state ?? state,
        events: []
      };
    }

    if (event?.type === "state:merge") {
      return {
        state: { ...state, ...(event.payload ?? {}) },
        events: []
      };
    }

    return {
      state,
      events: []
    };
  }
}
