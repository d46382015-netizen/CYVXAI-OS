"use strict";

import { $, renderGraph, showToast } from "./spark-render.js";
import { ignitePayload } from "./spark-client.js";

export function installCreateActions({ client, state, elements, sync, setBusy }) {
  $("ignite-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (state.busy) return;
    setBusy(true);
    $("form-status").textContent = "Modeling reality and generating a bounded mission…";
    try {
      client.setOwner($("owner-id").value);
      state.graph = await client.ignite(ignitePayload(elements, client.ownerId));
      $("form-status").textContent = "Spark created. Review the mission, then approve bounded execution.";
      renderGraph(state.graph, state.busy);
      await sync.status();
      $("workspace").scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (error) {
      $("form-status").textContent = error.message;
      showToast(error.message, "error");
    } finally {
      setBusy(false);
    }
  });

  $("new-spark-button").addEventListener("click", () => {
    state.graph = null;
    client.clearActiveSpark();
    $("workspace").classList.add("hidden");
    $("ignite-form").reset();
    $("owner-id").value = client.ownerId;
    $("form-status").textContent = "";
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
}
