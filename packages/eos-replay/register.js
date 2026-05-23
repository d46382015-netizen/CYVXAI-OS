"use strict";

const http = require("node:http");
const { createRecorder } = require("./recorder");

function wrapHandler(handler, recorder = createRecorder()) {
  if (typeof handler !== "function") return handler;

  return function eosReplayHandler(req, res) {
    const start = Date.now();
    const requestId = `${req.method || "GET"} ${req.url || "/"}`;

    recorder.call({
      kind: "http.request",
      requestId,
      method: req.method || "GET",
      url: req.url || "/",
      headers: req.headers || {},
    });

    res.on("finish", () => {
      recorder.ret({
        kind: "http.response",
        requestId,
        statusCode: res.statusCode,
        latency_ms: Date.now() - start,
      });
    });

    res.on("close", () => {
      if (!res.writableEnded) {
        recorder.error({
          kind: "http.aborted",
          requestId,
          latency_ms: Date.now() - start,
        });
      }
    });

    try {
      const result = handler.call(this, req, res);
      if (result && typeof result.then === "function") {
        return result.catch((error) => {
          recorder.error({
            kind: "http.error",
            requestId,
            message: error.message,
          });
          throw error;
        });
      }
      return result;
    } catch (error) {
      recorder.error({
        kind: "http.error",
        requestId,
        message: error.message,
      });
      throw error;
    }
  };
}

function register(options = {}) {
  const recorder = options.recorder || createRecorder(options);
  const originalCreateServer = http.createServer;

  http.createServer = function patchedCreateServer(...args) {
    if (args.length === 1 && typeof args[0] === "function") {
      return originalCreateServer.call(http, wrapHandler(args[0], recorder));
    }
    if (args.length >= 2 && typeof args[1] === "function") {
      return originalCreateServer.call(http, args[0], wrapHandler(args[1], recorder));
    }
    return originalCreateServer.apply(http, args);
  };

  return {
    recorder,
    restore() {
      http.createServer = originalCreateServer;
    },
  };
}

module.exports = {
  register,
  wrapHandler,
};
