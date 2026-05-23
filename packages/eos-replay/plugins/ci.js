"use strict";

const NAME = "ci-plugin";

function install(uef) {
  if (uef.__ciPluginInstalled) return;
  uef.__ciPluginInstalled = true;

  uef.on("ci-step", (step = {}) => {
    uef.record({
      type: "CI_STEP",
      run_id: step.run_id || step.trace_id || null,
      actor: step.actor || "ci",
      key: step.name || step.step || null,
      value: step.status || step.result || step.payload || null,
      meta: {
        service: step.service || step.meta?.service || "ci",
        job: step.job || step.meta?.job || null,
        ...step.meta,
      },
      caused_by: step.caused_by || [],
    });
  });

  uef.on("ci-failure", (failure = {}) => {
    uef.record({
      type: "CI_FAILURE",
      run_id: failure.run_id || failure.trace_id || null,
      actor: failure.actor || "ci",
      key: failure.step || failure.name || null,
      value: failure.error || failure.message || failure.payload || null,
      message: failure.message || String(failure.error || "ci failure"),
      meta: {
        service: failure.service || failure.meta?.service || "ci",
        job: failure.job || failure.meta?.job || null,
        ...failure.meta,
      },
      caused_by: failure.caused_by || [],
    });
  });
}

module.exports = {
  name: NAME,
  install,
};
