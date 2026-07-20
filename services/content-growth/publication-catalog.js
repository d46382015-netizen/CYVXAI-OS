"use strict";

const crypto = require("node:crypto");

const ALLOWED_PILLARS = new Set(["secure", "build", "sell", "operate", "own", "capital", "web3"]);
const DEFINITIONS = [
  ...require("./posts/secure.json"),
  ...require("./posts/build-a.json"),
  ...require("./posts/build-b.json"),
  ...require("./posts/sell.json"),
  ...require("./posts/operate.json"),
  ...require("./posts/own.json"),
  ...require("./posts/capital.json"),
  ...require("./posts/web3.json"),
];

const PUBLICATION_COLORS = Object.freeze({
  SECURE: "#7CFF3A",
  BUILD: "#3B82F6",
  SELL: "#FF8A26",
  OPERATE: "#A855F7",
  OWN: "#F3C44E",
  CAPITAL: "#10D98B",
  WEB3: "#22D3EE",
});

function requiredString(value, field, index) {
  const output = String(value || "").trim();
  if (!output) throw new Error(`Field Manual definition ${index + 1} requires ${field}`);
  if (output.length > 4000) throw new Error(`Field Manual definition ${index + 1} ${field} is too long`);
  return output;
}

function validateDefinitions(definitions) {
  if (!Array.isArray(definitions) || definitions.length !== 30) {
    throw new Error(`Field Manual publication catalog must contain exactly 30 modules; received ${definitions.length}`);
  }
  const slugs = new Set();
  for (const [index, definition] of definitions.entries()) {
    const pillar = requiredString(definition.pillar, "pillar", index).toLowerCase();
    const slug = requiredString(definition.slug, "slug", index);
    if (!ALLOWED_PILLARS.has(pillar)) throw new Error(`Unsupported Field Manual pillar: ${pillar}`);
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new Error(`Invalid Field Manual slug: ${slug}`);
    if (slugs.has(slug)) throw new Error(`Duplicate Field Manual slug: ${slug}`);
    slugs.add(slug);
    for (const field of ["title", "hook", "outcome", "difficulty", "time", "cost", "cta", "disclaimer"]) {
      requiredString(definition[field], field, index);
    }
    if (!Array.isArray(definition.steps) || definition.steps.length !== 5) {
      throw new Error(`Field Manual module ${slug} requires exactly five steps`);
    }
    definition.steps.forEach((step, stepIndex) => requiredString(step, `steps[${stepIndex}]`, index));
  }
  return definitions;
}

function buildCaption(definition) {
  return [
    definition.hook,
    "",
    `Outcome: ${definition.outcome}`,
    `Time: ${definition.time} | Cost: ${definition.cost} | Level: ${definition.difficulty}`,
    "",
    ...definition.steps.map((step, index) => `${index + 1}. ${step}`),
    "",
    "Verification matters: do not call the system finished until the final check passes.",
    "",
    definition.cta,
    "",
    `Note: ${definition.disclaimer}`,
  ].join("\n");
}

function buildReelScript(definition) {
  return [
    `HOOK: ${definition.hook}`,
    "",
    "PROBLEM: Most people collect disconnected tips. This module gives you an operating sequence with a measurable finish line.",
    "",
    "STEPS:",
    ...definition.steps.map((step, index) => `${index + 1}. ${step}`),
    "",
    `CLOSE: ${definition.cta}`,
  ].join("\n");
}

function buildSlides(definition) {
  return [
    { kind: "cover", eyebrow: "CYVX FIELD MANUAL", title: definition.title.toUpperCase(), body: definition.hook },
    { eyebrow: "OUTCOME CONTRACT", title: definition.outcome.toUpperCase(), body: `TIME  ${definition.time}   •   COST  ${definition.cost}   •   LEVEL  ${definition.difficulty}` },
    { eyebrow: "01 / PREPARE", title: "SET THE FOUNDATION.", body: `${definition.steps[0]}\n\n${definition.steps[1]}` },
    { eyebrow: "02 / EXECUTE", title: "BUILD THE SYSTEM.", body: definition.steps[2] },
    { eyebrow: "03 / CONTROL", title: "REDUCE FAILURE.", body: definition.steps[3] },
    { eyebrow: "04 / VERIFY", title: "PROVE IT WORKS.", body: definition.steps[4] },
    { kind: "cta", eyebrow: "CYVX FIELD MANUAL", title: definition.cta.toUpperCase(), body: "BUILD. SECURE. SELL. OPERATE. OWN.\nFOLLOW FOR EXECUTABLE SYSTEMS." },
  ];
}

function transformDefinition(definition, index) {
  const sequence = index + 4;
  const id = `POST_${String(sequence).padStart(3, "0")}`;
  const category = definition.pillar.toUpperCase();
  const source = JSON.stringify(definition);
  return Object.freeze({
    id,
    source_id: `CFM_${String(index + 1).padStart(3, "0")}`,
    source_sha256: crypto.createHash("sha256").update(source).digest("hex"),
    slug: definition.slug,
    category,
    module: `${category} / ${String(sequence).padStart(3, "0")}`,
    keyword: null,
    title: definition.title,
    hook: definition.hook,
    outcome: definition.outcome,
    difficulty: definition.difficulty,
    time: definition.time,
    cost: definition.cost,
    cta: definition.cta,
    disclaimer: definition.disclaimer,
    status: "approved",
    channels: Object.freeze(["instagram-carousel", "instagram-reel", "tiktok", "facebook", "youtube-short", "linkedin"]),
    keywords: Object.freeze((definition.title.toLowerCase().match(/[a-z0-9$-]+/g) || []).slice(0, 8)),
    image_prompt: `Create a premium vertical 4:5 editorial technology poster for CYVX FIELD MANUAL. Topic: ${definition.title}. Pillar: ${category}. Matte black industrial environment, cinematic central object, precise technical grid, restrained luminous ${PUBLICATION_COLORS[category]} accent, high contrast, realistic materials, clean negative space, sophisticated not gamer-like, no logos, no tiny illegible text.`,
    slides: Object.freeze(buildSlides(definition).map(Object.freeze)),
    caption: buildCaption(definition),
    reel_script: buildReelScript(definition),
    publication: Object.freeze({
      recommended_day: (index % 7) + 1,
      recommended_window_local: "11:30–13:30 or 18:30–21:00",
      primary_metric: "saves_per_impression",
      secondary_metrics: Object.freeze(["shares_per_impression", "profile_visit_rate", "follow_conversion_rate", "lead_conversion_rate"]),
    }),
  });
}

validateDefinitions(DEFINITIONS);
const PUBLICATION_POSTS = Object.freeze(DEFINITIONS.map(transformDefinition));

function validatePublicationPosts(posts = PUBLICATION_POSTS) {
  const ids = new Set();
  const slugs = new Set();
  for (const post of posts) {
    if (!/^POST_\d{3}$/.test(post.id)) throw new Error(`Invalid publication post id: ${post.id}`);
    if (ids.has(post.id)) throw new Error(`Duplicate publication post id: ${post.id}`);
    if (slugs.has(post.slug)) throw new Error(`Duplicate publication post slug: ${post.slug}`);
    if (!PUBLICATION_COLORS[post.category]) throw new Error(`Missing color for publication category: ${post.category}`);
    if (!Array.isArray(post.slides) || post.slides.length !== 7) throw new Error(`Publication post ${post.id} must contain seven slides`);
    ids.add(post.id);
    slugs.add(post.slug);
  }
  return true;
}

validatePublicationPosts();

module.exports = { PUBLICATION_COLORS, PUBLICATION_POSTS, DEFINITIONS, validateDefinitions, validatePublicationPosts };
