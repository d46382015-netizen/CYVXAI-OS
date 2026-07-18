"use strict";

const path = require("node:path");

const definitions = [
  ...require(path.join(__dirname, "posts", "secure.json")),
  ...require(path.join(__dirname, "posts", "build.json")),
  ...require(path.join(__dirname, "posts", "sell.json")),
  ...require(path.join(__dirname, "posts", "operate.json")),
  ...require(path.join(__dirname, "posts", "own.json")),
  ...require(path.join(__dirname, "posts", "capital.json")),
  ...require(path.join(__dirname, "posts", "web3.json"))
];

const colors = {
  secure: "#7CFF3A",
  build: "#3B82F6",
  sell: "#FF8A26",
  operate: "#A855F7",
  own: "#F3C44E",
  capital: "#10D98B",
  web3: "#22D3EE"
};

module.exports = definitions.map((definition, index) => {
  const moduleNumber = String(index + 1).padStart(3, "0");
  const slides = [
    { type: "cover", eyebrow: `MODULE ${moduleNumber} • ${definition.pillar.toUpperCase()}`, title: definition.title, body: definition.hook },
    { type: "context", eyebrow: "OUTCOME CONTRACT", title: definition.outcome, body: `TIME  ${definition.time}   •   COST  ${definition.cost}   •   LEVEL  ${definition.difficulty}` },
    { type: "steps", eyebrow: "01 • PREPARE", title: "Set the foundation", body: `${definition.steps[0]}\n\n${definition.steps[1]}` },
    { type: "steps", eyebrow: "02 • EXECUTE", title: "Build the system", body: definition.steps[2] },
    { type: "steps", eyebrow: "03 • CONTROL", title: "Reduce failure", body: definition.steps[3] },
    { type: "verify", eyebrow: "04 • VERIFY", title: "Prove it works", body: definition.steps[4] },
    { type: "cta", eyebrow: "CYVX FIELD MANUAL", title: definition.cta, body: "Build. Secure. Sell. Own.\nFollow for executable systems—not recycled motivation." }
  ];

  const caption = [
    definition.hook,
    "",
    `Outcome: ${definition.outcome}`,
    `Time: ${definition.time} | Cost: ${definition.cost} | Level: ${definition.difficulty}`,
    "",
    ...definition.steps.map((step, stepIndex) => `${stepIndex + 1}. ${step}`),
    "",
    "Verification matters: do not call the system finished until the final check passes.",
    "",
    definition.cta,
    "",
    `Note: ${definition.disclaimer}`
  ].join("\n");

  const reelScript = [
    `HOOK: ${definition.hook}`,
    "",
    "PROBLEM: Most people collect disconnected tips. This module gives you an operating sequence with a measurable finish line.",
    "",
    "STEPS:",
    ...definition.steps.map((step, stepIndex) => `${stepIndex + 1}. ${step}`),
    "",
    `CLOSE: ${definition.cta}`
  ].join("\n");

  return {
    id: `cfm-${moduleNumber}`,
    module: moduleNumber,
    slug: definition.slug,
    pillar: definition.pillar,
    title: definition.title,
    hook: definition.hook,
    outcome: definition.outcome,
    difficulty: definition.difficulty,
    time: definition.time,
    cost: definition.cost,
    status: "approved",
    channels: ["instagram-carousel", "instagram-reel", "tiktok", "facebook", "youtube-short", "linkedin"],
    keywords: definition.title.toLowerCase().match(/[a-z0-9$-]+/g).slice(0, 8),
    cta: definition.cta,
    lead_magnet: "operator-starter-manual",
    disclaimer: definition.disclaimer,
    image_prompt: `Create a premium vertical 4:5 editorial technology poster for CYVX FIELD MANUAL. Topic: ${definition.title}. Pillar: ${definition.pillar.toUpperCase()}. Matte black industrial environment, cinematic central object symbolizing the topic, precise technical grid, restrained luminous ${colors[definition.pillar]} accent, high contrast, realistic materials, clean negative space for headline, sophisticated not gamer-like, no logos, no tiny illegible text.`,
    slides,
    caption,
    reel_script: reelScript,
    publication: {
      recommended_day: (index % 7) + 1,
      recommended_window_local: "11:30–13:30 or 18:30–21:00",
      primary_metric: "saves_per_impression",
      secondary_metrics: ["shares_per_impression", "profile_visit_rate", "follow_conversion_rate", "lead_conversion_rate"]
    }
  };
});
