import http from "node:http";
import { WebSocketServer, WebSocket } from "ws";

export function createBridgeServer(bridge) {
  const clients = new Set();
  const server = http.createServer(async (req, res) => {
    try {
      if (req.url === "/healthz") {
        sendJSON(res, 200, { status: "ok" });
        return;
      }
      if (req.url === "/api/v1/agents" && req.method === "GET") {
        sendJSON(res, 200, { agents: bridge.agents.map((agent) => agent.toJSON()) });
        return;
      }
      if (req.url === "/api/v1/decisions" && req.method === "GET") {
        sendJSON(res, 200, { decisions: bridge.decisions });
        return;
      }
      if (req.url === "/api/v1/state" && req.method === "GET") {
        sendJSON(res, 200, {
          agents: bridge.agents.map((agent) => agent.toJSON()),
          decisions: bridge.decisions,
          cluster: bridge.lastCluster
        });
        return;
      }
      if (req.url === "/api/v1/tick" && req.method === "POST") {
        const outcome = await bridge.tick();
        sendJSON(res, 200, outcome || { status: "busy" });
        return;
      }
      sendJSON(res, 404, { error: "not found" });
    } catch (error) {
      sendJSON(res, 500, { error: error.message });
    }
  });

  const wss = new WebSocketServer({ noServer: true });
  server.on("upgrade", (req, socket, head) => {
    if (req.url !== "/ws") {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      clients.add(ws);
      ws.on("close", () => clients.delete(ws));
      ws.send(JSON.stringify({ type: "hello", time: new Date().toISOString() }));
    });
  });

  bridge.emit = (event, payload) => {
    const message = JSON.stringify({ type: event, payload });
    for (const client of clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    }
  };

  return server;
}

function sendJSON(res, status, payload) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(payload));
}
