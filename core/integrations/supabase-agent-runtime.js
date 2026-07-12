"use strict";

const { SupabaseRuntime } = require("./supabase-runtime");
const { SupabaseServiceRuntime } = require("./supabase-service-runtime");
const { SupabaseAgentIdentityIssuer } = require("./supabase-agent-identity");
const { SupabasePersistenceAdapter } = require("./supabase-persistence-adapter");

function createSupabaseAgentRuntime(options = {}) {
  const runtime = options.runtime || new SupabaseRuntime(options);
  const service = options.service || new SupabaseServiceRuntime(options);
  const identities = options.identities || new SupabaseAgentIdentityIssuer({ ...options, service });
  const persistence = options.persistence || new SupabasePersistenceAdapter({ ...options, runtime, service });

  return Object.freeze({
    runtime,
    service,
    identities,
    persistence,
    async readiness() {
      return runtime.schemaStatus({ force: true });
    },
    async assertReady() {
      return runtime.assertCloudWritesReady({ force: true });
    }
  });
}

module.exports = {
  createSupabaseAgentRuntime,
  SupabaseRuntime,
  SupabaseServiceRuntime,
  SupabaseAgentIdentityIssuer,
  SupabasePersistenceAdapter
};
