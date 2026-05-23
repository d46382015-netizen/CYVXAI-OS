"use strict";

const { createUEF } = require("../host");
const httpPlugin = require("../plugins/http");

function normalizeRequest(req = {}) {
  return {
    path: req.url || req.path || "/",
    method: req.method || "GET",
    headers: req.headers || {},
    actor: req.actor || "system",
    run_id: req.run_id || req.trace_id || null,
    meta: req.meta || {},
  };
}

function withUEF(handler, options = {}) {
  if (typeof handler !== "function") {
    throw new TypeError("withUEF(handler, options) requires a handler");
  }

  const uef = options.uef || createUEF(options);
  if (options.httpPlugin !== false) {
    uef.use(httpPlugin);
  }

  return async function wrappedUEFHandler(req, res) {
    const request = normalizeRequest(req);
    uef.dispatch("request", request);

    try {
      const result = await handler(req, res, uef);
      uef.dispatch("response", {
        ...request,
        status: res?.statusCode || result?.statusCode || result?.status || 200,
        meta: { ...(request.meta || {}), adapter: "nextjs" },
      });
      return result;
    } catch (error) {
      uef.dispatch("error", {
        ...request,
        message: error.message,
        meta: { ...(request.meta || {}), adapter: "nextjs" },
      });
      throw error;
    }
  };
}

module.exports = {
  withUEF,
};
