"use strict";

const NAME = "http-plugin";

function install(uef) {
  if (uef.__httpPluginInstalled) return;
  uef.__httpPluginInstalled = true;

  uef.on("request", (req = {}) => {
    uef.record({
      type: "HTTP_REQUEST",
      path: req.path || req.url || "/",
      method: req.method || "GET",
      actor: req.actor || "system",
      run_id: req.run_id || req.trace_id || null,
      meta: {
        service: req.service || req.meta?.service || null,
        host: req.host || req.meta?.host || null,
        ...req.meta,
      },
      caused_by: req.caused_by || [],
    });
  });

  uef.on("response", (res = {}) => {
    uef.record({
      type: "HTTP_RESPONSE",
      path: res.path || res.url || "/",
      method: res.method || "GET",
      actor: res.actor || "system",
      run_id: res.run_id || res.trace_id || null,
      status: res.status || res.statusCode || 200,
      meta: {
        service: res.service || res.meta?.service || null,
        host: res.host || res.meta?.host || null,
        ...res.meta,
      },
      caused_by: res.caused_by || [],
    });
  });

  uef.on("error", (err = {}) => {
    uef.record({
      type: "HTTP_ERROR",
      path: err.path || err.url || "/",
      method: err.method || "GET",
      actor: err.actor || "system",
      run_id: err.run_id || err.trace_id || null,
      message: err.message || String(err.error || "error"),
      meta: {
        service: err.service || err.meta?.service || null,
        host: err.host || err.meta?.host || null,
        ...err.meta,
      },
      caused_by: err.caused_by || [],
    });
  });
}

module.exports = {
  name: NAME,
  install,
};
