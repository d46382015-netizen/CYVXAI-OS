function equal(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

export class CausalGraph {
  constructor() {
    this.nodes = [];
    this.edges = [];
  }

  addNode(event) {
    this.nodes.push(event);
  }

  addEdge(from, to) {
    this.edges.push({ from, to });
  }
}

export function firstDivergence(a, b) {
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    if (!equal(a[i], b[i])) return i;
  }
  return -1;
}

export function link(graph, parentEvent, childEvents = []) {
  graph.addNode(parentEvent);
  for (const child of childEvents) {
    graph.addNode(child);
    graph.addEdge(parentEvent.id, child.id);
  }
}
