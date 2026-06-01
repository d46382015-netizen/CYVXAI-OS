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
const { JsonFileStore } = require("./file_store");
const { PlatformKernel, buildSeedState, normalizePlatformState } = require("./kernel");
const { augmentPlatformKernel } = require("./phase9");
const { augmentKernelV1 } = require("./kernel_v1");
const { augmentCoordinationPlatform } = require("./coordination_v1_clean");
const { augmentIntelligencePlatform } = require("./intelligence_v1");
const { augmentThesisPlatform } = require("./thesis_v1");
const { augmentDecisionIntelligence } = require("./decision_intelligence_v1");
const { augmentRealityEngine } = require("./reality_engine_v1");

augmentPlatformKernel(PlatformKernel, models);
augmentKernelV1(PlatformKernel, models);
augmentCoordinationPlatform(PlatformKernel, models);
augmentIntelligencePlatform(PlatformKernel, models);
augmentThesisPlatform(PlatformKernel, models);
augmentDecisionIntelligence(PlatformKernel, models);
augmentRealityEngine(PlatformKernel, models);

module.exports = {
  ...models,
  JsonFileStore,
  PlatformKernel,
  buildSeedState,
  normalizePlatformState,
};
