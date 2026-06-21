"use strict";

import { $, renderGraph, showToast } from "./spark-render.js";

export function installControlActions({ client, state, sync, setBusy }) {
  $("approve-button").addEventListener("click", async () => {
    if (!state.graph || state.busy) return;
    setBusy(true);
    try {
      state.graph = await client.approve(state.graph.spark.id);
      renderGraph(state.graph, state.busy);
      showToast("Approved. CYVX can now execute only the displayed bounded mission.");
    } catch (error) {
      showToast(error.message, "error");
    } finally {
      setBusy(false);
    }
  });

  $("execute-button").addEventListener("click", async () => {
    if (!state.graph || state.busy) return;
    setBusy(true);
    try {
      state.graph = await client.execute(state.graph.spark.id);
      renderGraph(state.graph, state.busy);
      await Promise.all([sync.status(), sync.worlds()]);
      showToast(state.graph.world?.status === "operational" ? "World launched and proof recorded." : "Mission advanced.");
    } catch (error) {
      showToast(error.message, "error");
    } finally {
      setBusy(false);
    }
  });

  $("copy-world-button").addEventListener("click", async () => {
    const path = state.graph?.world?.public_path;
    if (!path) return;
    const url = new URL(path, window.location.origin).href;
    try {
      await navigator.clipboard.writeText(url);
      showToast("Public World link copied.");
    } catch {
      showToast(url);
    }
  });

  $("refresh-worlds").addEventListener("click", async () => {
    $("refresh-worlds").disabled = true;
    awaitЃНе№Њ№ЭЅЙ±‘М ¤м(ЂЂЂЂђ ‰Й•™Й•Н µЭЅЙ±‘М€¤№‘ҐН…‰±•ђЂфЃ™…±Н”м(ЂЃф¤м)ф