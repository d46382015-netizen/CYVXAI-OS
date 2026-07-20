#!/usr/bin/env node
"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const {
  POSTS,
  PUBLICATION_POSTS,
  EXPANDED_CATALOG_PROOF,
  validateExpandedCatalog,
  renderAllAssets,
} = require("../services/content-growth");

function sha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function run(command, args) {
  const result = spawnSync(command, args, { cwd: process.cwd(), stdio: "inherit", env: process.env });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}

function verifyFiles(root, manifest) {
  const records = manifest.files.map((relative) => {
    const absolute = path.join(root, relative);
    if (!fs.existsSync(absolute)) throw new Error(`Missing rendered Field Manual asset: ${relative}`);
    const buffer = fs.readFileSync(absolute);
    if (relative.endsWith(".svg")) {
      const source = buffer.toString("utf8");
      if (!source.includes('width="1080" height="1350"')) throw new Error(`Invalid Field Manual dimensions: ${relative}`);
      if (!source.includes("CYVX FIELD MANUAL")) throw new Error(`Missing Field Manual identity: ${relative}`);
    }
    return { path: relative, bytes: buffer.length, sha256: sha256(buffer) };
  });
  return {
    records,
    aggregate_sha256: sha256(Buffer.from(records.map((record) => `${record.path}:${record.bytes}:${record.sha256}`).join("\n"))),
    total_bytes: records.reduce((total, record) => total + record.bytes, 0),
  };
}

function main() {
  for (const file of [
    "services/content-growth/publication-catalog.js",
    "services/content-growth/catalog-expanded.js",
    "services/content-growth/renderer.js",
    "services/content-growth/ui.js",
    "services/content-growth/server.js",
    "scripts/render-field-manual.js",
  ]) run(process.execPath, ["--check", file]);

  run(process.execPath, ["--test", "test/field-manual.test.js", "test/field-manual-security.test.js", "test/field-manual-public-gateway.test.js"]);

  const catalog = validateExpandedCatalog();
  const output = fs.mkdtempSync(path.join(os.tmpdir(), "cyvx-field-manual-content-"));
  const manifest = renderAllAssets(output);
  const files = verifyFiles(output, manifest);
  const publicationSourceHash = sha256(Buffer.from(PUBLICATION_POSTS.map((post) => `${post.id}:${post.source_sha256}`).join("\n")));

  if (catalog.posts !== 33 || catalog.slides !== 234) throw new Error("Expanded Field Manual catalog proof is incomplete");
  if (POSTS.length !== 33 || PUBLICATION_POSTS.length !== 30) throw new Error("Field Manual post counts do not match production contract");
  if (manifest.files.length !== 237) throw new Error(`Expected 237 Field Manual files; received ${manifest.files.length}`);

  const proof = {
    schema_version: 1,
    ok: true,
    generated_at: new Date().toISOString(),
    catalog: EXPANDED_CATALOG_PROOF,
    publication_modules: PUBLICATION_POSTS.length,
    launch_modules: POSTS.length - PUBLICATION_POSTS.length,
    rendered_files: manifest.files.length,
    rendered_slides: manifest.posts.reduce((total, post) => total + post.slides, 0),
    download_assets: manifest.files.filter((file) => file.startsWith("downloads/")).length,
    total_bytes: files.total_bytes,
    aggregate_asset_sha256: files.aggregate_sha256,
    publication_source_sha256: publicationSourceHash,
    source_hashes_verified: PUBLICATION_POSTS.every((post) => /^[a-f0-9]{64}$/.test(post.source_sha256)),
    files: files.records,
  };

  const proofDirectory = path.resolve(process.env.CYVX_FIELD_CONTENT_PROOF_DIR || path.join(process.cwd(), "artifacts", "field-manual-content"));
  fs.mkdirSync(proofDirectory, { recursive: true });
  fs.writeFileSync(path.join(proofDirectory, "verification.json"), `${JSON.stringify(proof, null, 2)}\n`, "utf8");
  fs.writeFileSync(path.join(proofDirectory, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify({
    ok: true,
    event: "field_manual_content.verified",
    posts: proof.catalog.posts,
    slides: proof.rendered_slides,
    files: proof.rendered_files,
    aggregate_asset_sha256: proof.aggregate_asset_sha256,
    publication_source_sha256: proof.publication_source_sha256,
    proof_directory: proofDirectory,
  })}\n`);
}

try { main(); }
catch (error) {
  process.stderr.write(`${JSON.stringify({ ok: false, event: "field_manual_content.verification_failed", error: error.message })}\n`);
  process.exit(1);
}
