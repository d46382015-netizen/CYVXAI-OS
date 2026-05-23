import { loadConfig } from "./config.js";
import { CyvxBridge } from "./bridge.js";
import { createBridgeServer } from "./server.js";

const config = loadConfig();
const bridge = new CyvxBridge(config, () => {});
const server = createBridgeServer(bridge);

server.listen(config.port, config.bindAddress, () => {
  console.log(`CYVX bridge listening on http://${config.bindAddress}:${config.port}`);
  console.log(`Connected to Go control plane at ${config.apiBaseUrl}`);
});

if (config.autoTick) {
  const run = async () => {
    try {
      await bridge.tick();
    } catch (error) {
      console.error("bridge tick failed", error);
    }
  };
  await run();
  setInterval(run, config.tickMs).unref();
}

