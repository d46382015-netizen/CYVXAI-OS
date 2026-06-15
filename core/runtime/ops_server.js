"use strict";

const http = require("node:http");
const { handleEdgeRoute, sendJson } = require("./edge_routes");

function createOperationsServer(control) {
  return http.createServer((req, res) => {
    control.begin(req, res);
    if (handleEdgeRoute(req, res, control)) return;
    sendJson(res, 404, { ok: false, error: "not_found" });
  });
}

function listen(server, port, host = "127.0.0.1") {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.off("error", reject);
      resolve();
    });
  });
}

function close(server) {
  if (!server || !server.listening) return Promise.resolve();
  return new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

module.exports = { close, createOperationsServer, listen };
