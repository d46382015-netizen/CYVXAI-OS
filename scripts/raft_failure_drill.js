"use strict";

const {
  buildPeers,
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
  const peers = buildPeers(4301, 3);
  const apiKey = process.env.CYVX_API_KEY || "cyvx-dev-api-key";
  const raftToken = process.env.CYVX_RAFT_TOKEN || "cyvx-dev-raft-token";
  const dbDir = process.env.CYVX_RAFT_DB_DIR || withTemporaryDir("cyvx-raft-failure");

  const majorityFault = {
    dropPeers: ["cyvx-node-3"],
  };
  const minorityFault = {
    dropAll: true,
  };

  const children = [
    spawnNode({ peer: peers[0], peers, apiKey, raftToken, dbDir, failurePlan: majorityFault }),
    spawnNode({ peer: peers[1], peers, apiKey, raftToken, dbDir, failurePlan: majorityFault }),
    spawnNode({ peer: peers[2], peers, apiKey, raftToken, dbDir, failurePlan: minorityFault }),
  ];

  try {
    await waitForCluster(peers);
    let leader = await waitForLeader(peers);

    await submitWorkload(leader.peer, apiKey, {
      id: "drill-1",
      type: "workload:create",
      payload: { id: "drill-1", phase: "initial" },
    });

    const oldLeaderIndex = peers.findIndex((peer) => peer.id === leader.peer.id);
    if (oldLeaderIndex >= 0) {
      const victim = children[oldLeaderIndex];
      victim.kill("SIGKILL");
      await new Promise((resolve) => victim.once("exit", resolve));
      children[oldLeaderIndex] = spawnNode({
        peer: peers[oldLeaderIndex],
        peers,
        apiKey,
        raftToken,
        dbDir,
      });
    }

    await waitForCluster(peers);
    leader = await waitForLeader(peers);

    await submitWorkload(leader.peer, apiKey, {
      id: "drill-2",
      type: "workload:create",
      payload: { id: "drill-2", phase: "post-recovery" },
    });

    const healedFingerprints = [];
    for (const peer of peers) {
      const state = await fetchState(peer, apiKey);
      healedFingerprints.push(raftFingerprint(state));
    }
    if ([...new Set(healedFingerprints)].length !== 1) {
      throw new Error(`drill did not converge after restart: ${stableStringify(healedFingerprints)}`);
    }

    process.stdout.write("raft failure drill passed\n");
  } finally {
    await stopCluster(children);
  }
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exit(1);
});
