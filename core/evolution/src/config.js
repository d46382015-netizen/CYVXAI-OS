export function loadConfig(env = process.env) {
  return {
    apiBaseUrl: env.CYVX_API_URL || "http://127.0.0.1:8080",
    bindAddress: env.CYVX_BRIDGE_ADDR || "127.0.0.1",
    port: Number.parseInt(env.CYVX_BRIDGE_PORT || "8090", 10),
    tickMs: Number.parseInt(env.CYVX_TICK_MS || "5000", 10),
    populationSize: Number.parseInt(env.CYVX_AGENT_POPULATION || "8", 10),
    tenant: env.CYVX_TENANT || "default",
    environment: env.CYVX_ENVIRONMENT || "production",
    autoTick: env.CYVX_AUTO_TICK !== "false"
  };
}

