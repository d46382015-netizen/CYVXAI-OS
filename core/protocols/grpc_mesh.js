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

const { response } = require("../shared/attribution");

class GrpcMesh {
  describe() {
    return response("grpc-mesh", {
      transport: "grpc",
      mTLS: true,
      streaming: true,
    });
  }
}

module.exports = { GrpcMesh };
