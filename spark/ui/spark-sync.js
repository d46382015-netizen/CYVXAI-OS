"use strict";

import { $, renderGraph, renderOffline, renderStatus, renderWorlds } from "./spark-render.js";

export function createSynchronizer(client, state) {
  const status = async () => {
    try { renderStatus(await client.status()); }
    catch { renderOffline(); }
  };

  const worlds = async () => {
    try { renderWorlds(await client.worlds()); }
    catch { $("world-grid").textContent = "Worlds are temporarily unavailable."; }
  };

  const graph = async () => {
    try {
      const active = await client.activeGraph();
      if (active) {
        state.graph = active;
        renderGraph(active, state.busy);
      }
      return active;
    } catch {
      return null;
    }
  };

  const all = async () => Promise.all([status(), worlds(), graph()]);
  return { all, graph, status, worlds };
}
