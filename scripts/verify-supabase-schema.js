"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { SupabaseRuntime, EXPECTED_SCHEMA_VERSION } = require("../core/integrations/supabase-runtime");

const root = path.resolve(__dirname, "..");
const contractPath = path.join(root, "supabase", "schema-contract.json");
const migrationsDir = path.join(root, "supabase", "migrations");

function fail(code, details) {
  process.stderr.write(`${JSON.stringify({ ok: false, error: code, ...details })}\n`);
  process.exit(1);
}

if (!fs.existsSync(contractPath)) fail("SCHEMA_CONTRACT_MISSING", { file: contractPath });
if (!fs.existsSync(migrationsDir)) fail("MIGRATIONS_MISSING", { directory: migrationsDir });

const contract = JSON.parse(fs.readFileSync(contractPath, "utf8"));
const migrationFiles = fs.readdirSync(migrationsDir)
  .filter((name) => /^\d+_.+\.sql$/.test(name))
  .sort();
if (migrationFiles.length < 4) fail("MIGRATION_SET_INCOMPLETE", { migration_files: migrationFiles });

const sql = migrationFiles.map((name) => fs.readFileSync(path.join(migrationsDir, name), "utf8")).join("\n").toLowerCase();
const requiredTokens = [
  "force row level security",
  "cyvx_is_org_member",
  "cyvx_has_org_role",
  "cyvx_is_active_agent",
  "cyvx_agent_assigned",
  "cyvx_schema_status",
  "organization_members_last_owner",
  "agents_creation_grant",
  "foundry_runs_grant_binding",
  "deployments_grant_binding",
  "spend_grant_binding",
  "cyvx_artifacts_select",
  "cyvx_artifacts_insert"
];

for (const token of requiredTokens) {
  if (!sql.includes(token)) fail("REQUIRED_SCHEMA_PRIMITIVE_MISSING", { token });
}

for (const table of contract.tables) {
  if (!sql.includes(`public.${table}`)) fail("CONTRACT_TABLE_MISSING", { table });
}

for (const table of contract.append_only_tables) {
  const expected = table === "evidence_records" ? "evidence_append_only"
    : table === "foundry_spend_receipts" ? "spend_receipts_append_only"
      : `${table}_append_only`;
  if (!sql.includes(expected)) fail("APPEND_ONLY_TRIGGER_MISSING", { table, expected });
}

for (const capability of contract.required_grant_capabilities) {
  if (!sql.includes(`'${capability}'`)) fail("GRANT_CAPABILITY_MISSING", { capability });
}

const forbidden = [
  "revoke all on all tables in schema public",
  "grant all on all tables in schema public",
  "service_role_key",
  "supabase_service_role_key",
  "alter table storage.objects disable row level security"
];
for (const token of forbidden) {
  if (sql.includes(token)) fail("FORBIDDEN_SCHEMA_PATTERN", { token });
}

if (Number(contract.version) !== Number(EXPECTED_SCHEMA_VERSION)) {
  fail("SCHEMA_VERSION_DRIFT", {
    contract_version: contract.version,
    runtime_version: EXPECTED_SCHEMA_VERSION
  });
}

for (const table of contract.service_only_write_tables) {
  const escaped = table.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const directWritePolicy = new RegExp(`create\\s+policy[\\s\\S]{0,120}on\\s+public\\.${escaped}[\\s\\S]{0,100}for\\s+(insert|update|delete|all)\\s+to\\s+authenticated`, "i");
  if (directWritePolicy.test(sql)) fail("SERVICE_ONLY_TABLE_HAS_DIRECT_WRITE_POLICY", { table });
}

async function main() {
  let live = { skipped: true };
  if (process.env.CYVX_VERIFY_LIVE_SUPABASE_SCHEMA === "true") {
    const runtime = new SupabaseRuntime({ repoRoot: root, schemaCacheMs: 0 });
    live = await runtime.schemaStatus({ force: true, timeoutMs: Number(process.env.CYVX_SUPABASE_PROBE_TIMEOUT_MS || 10000) });
    if (!live.ready) fail("LIVE_SCHEMA_NOT_READY", { live });
  }

  process.stdout.write(`${JSON.stringify({
    ok: true,
    capability: "supabase-production-schema",
    schema: contract.schema,
    version: contract.version,
    project_ref: contract.project_ref,
    migrations: migrationFiles,
    table_count: contract.tables.length,
    service_only_write_tables: contract.service_only_write_tables.length,
    append_only_tables: contract.append_only_tables.length,
    live
  })}\n`);
}

main().catch((error) => fail(error.code || "SCHEMA_VERIFY_FAILED", { message: error.message }));
