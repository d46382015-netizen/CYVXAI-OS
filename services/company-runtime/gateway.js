"use strict";

const { createAutonomousCompanyHttpServer } = require("./server");

function createAutonomousCompanyGateway(companyRuntime, options = {}) {
  const transport = createAutonomousCompanyHttpServer(companyRuntime, options);
  const handlers = transport.raw.listeners("request");
  if (handlers.length !== 1) throw new Error(`Expected one autonomous company request handler, received ${handlers.length}`);
  const handle = handlers[0];
  return {
    token: transport.token,
    raw: transport.raw,
    handle(request, response) {
      return handle(request, response);
    },
  };
}

module.exports = { createAutonomousCompanyGateway };
