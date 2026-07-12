#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { SupabaseRuntime } = require("../core/integrations/supabase-runtime");
const { SupabaseServiceRuntime, randomPassword } = require("../core/integrations/supabase-service-runtime");

const root = path.resolve(__dirname, "..");
const secretFile = path.resolve(process.env.CYVX_BOOTSTRAP_SECRET_FILE || path.join(root, ".cyvx", "secrets", "supabase-bootstrap.json"));

function normalizeSingle(value) {
  if (Array.isArray(value)) return value[0] || null;
  return value || null;
}

function readStoredCredentials() {
  try {
    const value = JSON.parse(fs.readFileSync(secretFile, "utf8"));
    return value && typeof value === "object" ? value : {};
  } catch {
    return {};
  }
}

function writeStoredCredentials(value) {
  fs.mkdirSync(path.dirname(secretFile), { recursive: true, mode: 0o700 });
  fs.writeFileSync(secretFile, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  fs.chmodSync(secretFile, 0o600);
}

async function bootstrap(options = {}) {
  const env = options.env || process.env;
  const ownerEmail = String(options.ownerEmail || env.CYVX_OWNER_EMAIL || "").trim().toLowerCase();
  const organizationName = String(options.organizationName || env.CYVX_ORG_NAME || "CYVX").trim();
  const organizationSlug = String(options.organizationSlug || env.CYVX_ORG_SLUG || "cyvx").trim().toLowerCase();
  if (!ownerEmail) throw new Error("CYVX_OWNER_EMAIL is required");

  const runtime = options.runtime || new SupabaseRuntime({ repoRoot: root, env });
  const schema = await runtime.assertCloudWritesReady({ force: true, timeoutMs: 10000 });
  const service = options.service || new SupabaseServiceRuntime({ repoRoot: root, env });
  const stored = readStoredCredentials();
  const password = String(options.ownerPassword || env.CYVX_OWNER_PASSWORD || stored.owner_password || randomPassword());
  const generatedPassword = !options.ownerPassword && !env.CYVX_OWNER_PASSWORD && !stored.owner_password;

  const ensured = await service.ensureUser({
    email: ownerEmail,
    password,
    appMetadata: { cyvx_identity_type: "human" },
    userMetadata: { display_name: env.CYVX_OWNER_NAME || "CYVX Owner" }
  });
  const signedIn = await service.signInWithPassword(ownerEmail, password);
  const userClient = service.createAccessTokenClient(signedIn.session.access_token);

  let organization;
  const created = await userClient.rpc("cyvx_create_organization", {
    org_name: organizationName,
    org_slug: organizationSlug
  });
  if (created.error) {
    const duplicate = created.error.code === "23505" || /duplicate|already exists/i.test(created.error.message || "");
    if (!duplicate) throw created.error;
    const lookup = await service.createServiceClient().from("organizations").select("*").eq("slug", organizationSlug).single();
    if (lookup.error) throw lookup.error;
    organization = lookup.data;
    const membership = await service.createServiceClient().from("organization_members").upsert({
      organization_id: organization.id,
      user_id: ensured.user.id,
      role: "owner",
      active: true,
      invited_by: ensured.user.id
    }, { onConflict: "organization_id,user_id" });
    if (membership.error) throw membership.error;
    const controls = await service.createServiceClient().from("governance_controls").upsert({
      organization_id: organization.id,
      updated_by: ensured.user.id
    }, { onConflict: "organization_id" });
    if (controls.error) throw controls.error;
  } else {
    organization = normalizeSingle(created.data);
  }
  if (!organization || !organization.id) throw new Error("Organization bootstrap did not return an organization");

  if (generatedPassword || stored.owner_email !== ownerEmail) {
    writeStoredCredentials({
      owner_email: ownerEmail,
      owner_password: password,
      organization_id: organization.id,
      organization_slug: organization.slug,
      created_at: new Date().toISOString()
    });
  }

  return {
    ok: true,
    schema_version: schema.applied_version,
    organization: { id: organization.id, slug: organization.slug, name: organization.name },
    owner: { user_id: ensured.user.id, email: ownerEmail, created: ensured.created },
    credentials_file: secretFile,
    generated_password: generatedPassword,
    access_token: signedIn.session.access_token,
    refresh_token: signedIn.session.refresh_token,
    expires_at: signedIn.session.expires_at
  };
}

async function main() {
  const result = await bootstrap();
  const safe = {
    ...result,
    access_token: "[issued-not-printed]",
    refresh_token: "[issued-not-printed]"
  };
  process.stdout.write(`${JSON.stringify(safe)}\n`);
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`${JSON.stringify({ ok: false, error: error.code || "BOOTSTRAP_FAILED", message: error.message })}\n`);
    process.exit(1);
  });
}

module.exports = { bootstrap, normalizeSingle, readStoredCredentials, writeStoredCredentials, secretFile };
