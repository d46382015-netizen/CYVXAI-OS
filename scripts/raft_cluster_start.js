"use strict";

const {
  buildPeers,
  spawnNode,
  stopCluster,
  waitForCluster,
  waitForLeader,
  withTemporaryDir,
} = require("./raft_cluster_runtime");

async function main() {
  const peers = buildPeers(4101, 3);
  const apiKey = process.env.CYVX_API_KEY || "cyvx-dev-api-key";
  const raftToken = process.env.CYVX_RAFT_TOKEN || "cyvx-dev-raft-token";
  const dbDir = process.env.CYVX_RAFT_DB_DIR || withTemporaryDir("cyvx-raft-cluster");

  const children = peers.map((peer) => spawnNode({
    peer,
    peers,
    apiKey,
    raftToken,
    dbDir,
  }));

  const cleanup = async () => {
    await stopCluster(children);
    process.exit(0);
  };

  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);

  await waitForCluster(peers);
  const leader = await waitForLeader(peers);
  process.stdout.write(`CYVX Raft cluster started. leader=${leader.peer.id} ports=${peers.map((peer) => peer.port).join(",")}\n`);
  process.stdout.write(`apiKey=${apiKey} raftToken=${raftToken} dbDir=${dbDir}\n`);
  process.stdout.write("Press Ctrl-C to stop.\n");

  await new Promise(() => {});
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exit(1);
});
