import { GlobalEventView } from "./ledger.js";
import { classifyDivergence } from "./divergence.js";
import { validateLocalExecution, validatePeerView } from "./validation.js";

export class DistributedConsensusNetwork {
  constructor({ nodeId = "node", replayFn = null } = {}) {
    this.nodeId = nodeId;
    this.replayFn = replayFn;
    this.view = new GlobalEventView();
    this.peers = new Map();
  }

  registerNode(nodeId, store, initialState = {}) {
    this.peers.set(nodeId, { store, initialState });
    this.view.ingest(nodeId, store.events || []);
  }

  receiveEvents(nodeId, events) {
    return this.view.ingest(nodeId, events);
  }

  broadcastValidationHash(nodeId) {
    const peer = this.peers.get(nodeId);
    if (!peer) throw new Error(`unknown node: ${nodeId}`);
    return validateLocalExecution(peer.store.events, peer.initialState);
  }

  comparePeerHashes() {
    const results = [];
    for (const [nodeId, peer] of this.peers.entries()) {
      const local = validateLocalExecution(peer.store.events, peer.initialState);
      for (const [otherId, otherPeer] of this.peers.entries()) {
        if (nodeId === otherId) continue;
        const remote = validateLocalExecution(otherPeer.store.events, otherPeer.initialState);
        results.push({
          pair: [nodeId, otherId],
          ...validatePeerView(local, remote)
        });
      }
    }
    return results;
  }

  validateAll() {
    const recon = this.view.reconstructed();
    const results = [];
    for (const [nodeId, peer] of this.peers.entries()) {
      const local = validateLocalExecution(peer.store.events, peer.initialState);
      const remote = {
        state: this.replayFn ? this.replayFn(recon, peer.initialState) : local.state,
        hash: this.replayFn ? validateLocalExecution(recon, peer.initialState).hash : local.hash
      };
      results.push({
        nodeId,
        ...validatePeerView(local, remote)
      });
    }
    return results;
  }

  detectDivergence() {
    const nodes = [...this.peers.entries()];
    if (nodes.length < 2) return null;
    const [aId, aPeer] = nodes[0];
    const [bId, bPeer] = nodes[1];
    return classifyDivergence({
      localLog: aPeer.store.events,
      remoteLog: bPeer.store.events,
      localState: validateLocalExecution(aPeer.store.events, aPeer.initialState).state,
      remoteState: validateLocalExecution(bPeer.store.events, bPeer.initialState).state
    });
  }

  converge() {
    const results = this.comparePeerHashes();
    return {
      globalHash: this.view.hash(),
      peers: results,
      divergence: this.detectDivergence()
    };
  }
}
