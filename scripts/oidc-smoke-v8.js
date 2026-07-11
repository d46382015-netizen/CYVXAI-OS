#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const { WorkloadIdentity } = require("../core/security/workload_identity");

async function main(argv = process.argv.slice(2), env = process.env) {
  const optional = argv.includes("--optional");
  const exchange = argv.includes("--exchange") || Boolean(env.CYVX_WORKLOAD_IDENTITY_EXCHANGE_URL);
  const identity = new WorkloadIdentity({ env });
  if (!identity.available()) {
    const result = { ok: optional, skipped: true, reason: "github_oidc_unavailable", identity: identity.snapshot() };
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (!optional) process.exitCode = 1;
    return result;
  }
  const token = await identity.token();
  const claims = decodeClaims(token);
  const result = {
    ok: true,
    skipped: false,
    claims: sanitizeClaims(claims),
    identity: identity.snapshot(),
    exchanged: false,
  };
  if (exchange) {
    if (!identity.exchangeUrl && optional) result.exchange = { skipped: true, reason: "broker_unconfigured" };
    else {
      const credentials = await identity.exchange({ subjectToken: token });
      result.exchanged = true;
      result.exchange = sanitizeCredentialMetadata(credentials);
    }
  }
  const output = env.CYVX_OIDC_EVIDENCE_FILE || "/tmp/cyvx-oidc-evidence.json";
  fs.writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`, { mode: 0o600 });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  return result;
}

function decodeClaims(token) {
  const parts = String(token || "").split(".");
  if (parts.length !== 3) throw new Error("OIDC token is malformed");
  return JSON.parse(Buffer.from(parts[1].replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(parts[1].length / 4) * 4, "="), "base64").toString("utf8"));
}

function sanitizeClaims(claims) {
  return {
    iss: claims.iss || null,
    aud: claims.aud || null,
    sub: claims.sub || null,
    repository: claims.repository || null,
    repository_owner: claims.repository_owner || null,
    ref: claims.ref || null,
    sha: claims.sha || null,
    workflow: claims.workflow || null,
    environment: claims.environment || null,
    actor: claims.actor || null,
    exp: claims.exp || null,
  };
}

function sanitizeCredentialMetadata(value) {
  const object = value && typeof value === "object" ? value : {};
  return {
    token_type: object.token_type || null,
    expires_in: object.expires_in || null,
    scope: object.scope || null,
    provider: object.provider || null,
    credentials_present: Boolean(object.access_token || object.token || object.credentials),
  };
}

if (require.main === module) main().catch((error) => {
  process.stderr.write(`${JSON.stringify({ ok: false, code: error.code || "OIDC_SMOKE_FAILED", error: error.message })}\n`);
  process.exit(1);
});

module.exports = { decodeClaims, main, sanitizeClaims, sanitizeCredentialMetadata };
