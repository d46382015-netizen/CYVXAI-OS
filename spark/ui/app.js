"use strict";

(async () => {
  const [{ SparkClient }, render, syncModule, createModule, controlModule] = await Promise.all([
    import("./spark-client.js"),
    import("./spark-render.js"),
    import("./spark-sync.js"),
    import("./spark-create-actions.js"),
    import("./spark-control-actions.js"),
  ]);

  const client = new SparkClient();
  const state = { graph: null, busy: false };
  const elements = {
    intention: render.$("intention"),
    worldName: render.$("world-name"),
    offerName: render.$("offer-name"),
    offerDescription: render.$("offer-description"),
    price: render.$("price"),
    location: render.$("location"),
    contactEmail: render.$("contact-email"),
    paymentUrl: render.$("payment-url"),
  };

  render.$("owner-id").value = client.ownerId;
  const sync = syncModule.createSynchronizer(client, state);
  const setBusy = (value) => {
    state.busy = Boolean(value);
    render.$("ignite-form").querySelector("button[type='submit']").disabled = state.busy;
    if (state.graph) render.renderGraph(state.graph, state.busy);
  };

  createModule.installCreateActions({ client, state, elements, sync, setBusy });
  controlModule.installControlActions({ client, state, sync, setBusy });
  await sync.all();
  setInterval(sync.all, 12000);
})().catch((error) => {
  const status = document.getElementById("form-status");
  if (status) status.textContent = error.message;
  console.error(error);
});
