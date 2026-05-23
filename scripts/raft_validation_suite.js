"use strict";

const {
  buildPeers,
  fetchRaftState,
  fetchState,
  raftFingerprint,
  spawnNode,
  stableStringify,
  stopCluster,
  submitWorkload,
  waitForCluster,
  waitForLeader,
  withTemporaryDir,
} = require("./raft_cluster_runtime");

async function main() {
  const peers = buildPeers(4201, 3);
  const apiKey = process.env.CYVX_API_KEY || "cyvx-dev-api-key";
  const raftToken = process.env.CYVX_RAFT_TOKEN || "cyvx-dev-raft-token";
  const dbDir = process.env.CYVX_RAFT_DB_DIR || withTemporaryDir("cyvx-raft-validate");

  const children = peers.map((peer) => spawnNode({
    peer,
    peers,
    apiKey,
    raftToken,
    dbDir,
  }));

  try {
    await waitForCluster(peers);
    const leader = await waitForLeader(peers);

    await submitWorkload(leader.peer, apiKey, {
      id: "workload-1",
      type: "workload:create",
      payload: { id: "workload-1", name: "alpha", value: "one" },
    });
    await submitWorkload(leader.peer, apiKey, {
      id: "workload-2",
      type: "workload:create",
      payload: { id: "workload-2", name: "beta", value: "two" },
    });

    let lastStates = [];
    let lastFingerprints = [];
    let converged = false;
    for (let attempt = 0; attempt < 60; attempt += 1) {
      const fingerprints = [];
      const states = [];
      converged = true;
      for (const peer of peers) {
        const state = await fetchRaftState(peer, apiKey);
        states.push({ peer: peer.id, state });
        fingerprints.push(raftFingerprint(state));
        if (Number(state?.commitIndex ?? -1) < 1) {
          converged = false;
          break;
        }
        if (!Array.isArray(state?.log) || state.log.length < 2) {
          converged = false;
          break;
        }
      }
      const uniqueFingerprints = [...new Set(fingerprints)];
      lastStates = states;
      lastFingerprints = uniqueFingerprints;
      if (converged && uniqueFingerprints.length === 1) {
        process.stdout.write("raft validation suite passed\n");
        process.stdout.write(uniqueFingerprints[0] + "\n");
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    if (!converged || lastFingerprints.length !== 1) {
      throw new Error("cluster did not converge: " + stableStringify(lastStates));
    }
  } finally {
    await stopCluster(children);
  }
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exit(1);
});
