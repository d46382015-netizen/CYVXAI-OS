"use strict";

const fs = require("node:fs");
const path = require("node:path");

const DATA_DIR = path.join(__dirname, "..", "data");

function readJson(name) {
  return JSON.parse(fs.readFileSync(path.join(DATA_DIR, name), "utf8"));
}

function loadCatalog() {
  const brand = readJson("brand.json");
  const posts = require(path.join(DATA_DIR, "posts.js"));
  return { brand, posts };
}

function validateCatalog({ brand, posts }) {
  const errors = [];
  if (!brand || typeof brand !== "object") errors.push("brand must be an object");
  if (!Array.isArray(posts)) errors.push("posts must be an array");
  if (errors.length) return { ok: false, errors };

  const pillarIds = new Set((brand.pillars || []).map((pillar) => pillar.id));
  const ids = new Set();
  const slugs = new Set();
  const required = brand.content_contract?.required_fields || [];
  const minSlides = brand.content_contract?.minimum_slides || 6;
  const maxSlides = brand.content_contract?.maximum_slides || 8;

  for (const post of posts) {
    const prefix = post?.slug || post?.id || "unknown";
    for (const field of required) {
      if (post[field] === undefined || post[field] === null || post[field] === "") {
        errors.push(`${prefix}: missing ${field}`);
      }
    }
    if (!pillarIds.has(post.pillar)) errors.push(`${prefix}: unknown pillar ${post.pillar}`);
    if (ids.has(post.id)) errors.push(`${prefix}: duplicate id ${post.id}`);
    if (slugs.has(post.slug)) errors.push(`${prefix}: duplicate slug ${post.slug}`);
    ids.add(post.id);
    slugs.add(post.slug);

    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(post.slug || "")) errors.push(`${prefix}: invalid slug`);
    if (!Array.isArray(post.slides) || post.slides.length < minSlides || post.slides.length > maxSlides) {
      errors.push(`${prefix}: slides must contain ${minSlides}-${maxSlides} entries`);
    }
    const types = new Set((post.slides || []).map((slide) => slide.type));
    for (const type of brand.content_contract?.required_slide_types || []) {
      if (!types.has(type)) errors.push(`${prefix}: missing slide type ${type}`);
    }
    for (const [index, slide] of (post.slides || []).entries()) {
      if (!slide.title || !slide.body || !slide.eyebrow) errors.push(`${prefix}: incomplete slide ${index + 1}`);
    }
    if ((post.caption || "").length < 350) errors.push(`${prefix}: caption is too short`);
    if (!(post.reel_script || "").includes("HOOK:")) errors.push(`${prefix}: reel script lacks hook`);
    if (post.status !== "approved") errors.push(`${prefix}: post is not approved`);
  }

  if (posts.length !== 30) errors.push(`expected 30 launch posts, found ${posts.length}`);
  return { ok: errors.length === 0, errors };
}

function findPost(posts, slug) {
  return posts.find((post) => post.slug === slug) || null;
}

module.exports = { DATA_DIR, loadCatalog, validateCatalog, findPost };
