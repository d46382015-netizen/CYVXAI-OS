/**
 * CYVX — Autonomous Infrastructure Intelligence
 * © 2026 Dakota Lee Jonsgaard. All rights reserved.
 * Creator & Architect: Dakota Lee Jonsgaard
 * https://cyvx.ai | dakota@cyvx.ai
 *
 * This software is the exclusive intellectual property
 * of Dakota Lee Jonsgaard. Unauthorized use prohibited.
 */
"use strict";

const models = require("./models");
const { version } = require("../../package.json");
const { JsonFileStore } = require("./file_store");
const { SqliteStateStore } = require("./sqlite_store");
const { PlatformKernel: BasePlatformKernel, buildSeedState, normalizePlatformState } = require("./kernel");
const { augmentPlatformKernel } = require("./phase9");
const { augmentKernelV1 } = require("./kernel_v1");
const { augmentCoordinationPlatform } = require("./coordination_v1_clean");
const { augmentIntelligencePlatform } = require("./intelligence_v1");
const { augmentThesisPlatform } = require("./thesis_v1");
const { augmentDecisionIntelligence } = require("./decision_intelligence_v1");
const { augmentRealityEngine } = require("./reality_engine_v1");

augmentPlatformKernel(BasePlatformKernel, models);
augmentKernelV1(BasePlatformKernel, models);
augmentCoordinationPlatform(BasePlatformKernel, models);
augmentIntelligencePlatform(BasePlatformKernel, models);
augmentThesisPlatform(BasePlatformKernel, models);
augmentDecisionIntelligence(BasePlatformKernel, models);
augmentRealityEngine(BasePlatformKernel, models);

class PlatformKernel extends BasePlatformKernel {
  mutate(mutator) {
    if (!this.store || typeof this.store.runTransaction !== "function") {
      return super.mutate(mutator);
    }

    let snapshot;
    this.store.runTransaction(() => {
      const draft = models.clone(this.load());
      const result = mutator(draft) || draft;
      snapshot = super.persist(result);
    });
    return snapshot;
  }

  status() {
    const status = super.status();
    return {
      ...status,
      version,
      persistence: this.store && typeof this.store.metadata === "function"
        ? this.store.metadata()
        : { backend: "unknown" },
    };
  }
}

module.exports = {
  ...models,
  JsonFileStore,
  SqliteStateStore,
  PlatformKernel,
  buildSeedState,
  normalizePlatformState,
};
