"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { COLORS, POSTS, TRIGGERS } = require("./catalog");
const { ensureDirectory } = require("./store");
const { buildDownloadAsset } = require("./downloads");

function escapeXml(value) {
  return String(value || "").replace(/[&<>\"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[char]));
}

function wrapText(text, maxChars) {
  const lines = [];
  for (const segment of String(text || "").split(/\n/)) {
    const words = segment.split(/\s+/).filter(Boolean);
    if (!words.length) { lines.push(""); continue; }
    let line = "";
    for (const word of words) {
      const next = line ? `${line} ${word}` : word;
      if (next.length > maxChars && line) { lines.push(line); line = word; }
      else line = next;
    }
    if (line) lines.push(line);
  }
  return lines;
}

function textBlock(lines, x, y, options = {}) {
  const size = options.size || 44;
  const lineHeight = options.lineHeight || Math.round(size * 1.18);
  const weight = options.weight || 700;
  const fill = options.fill || "#F3F4F6";
  const family = options.family || "JetBrains Mono, IBM Plex Mono, monospace";
  return `<text x="${x}" y="${y}" fill="${fill}" font-family="${family}" font-size="${size}" font-weight="${weight}">${lines.map((line, index) => `<tspan x="${x}" dy="${index === 0 ? 0 : lineHeight}">${escapeXml(line)}</tspan>`).join("")}</text>`;
}

function renderSlideSvg(post, slide, index) {
  const accent = COLORS[post.category] || "#F3F4F6";
  const titleLines = wrapText(slide.title, slide.kind === "cover" ? 18 : 27);
  const bodyLines = slide.body ? wrapText(slide.body, 36) : [];
  const bulletLines = slide.bullets || [];
  const codeLines = slide.code ? String(slide.code).split("\n") : [];
  const progress = `${String(index + 1).padStart(2, "0")} / ${String(post.slides.length).padStart(2, "0")}`;
  let body = "";
  const titleY = slide.kind === "cover" ? 325 : 250;
  body += textBlock(titleLines, 90, titleY, { size: slide.kind === "cover" ? 72 : 52, lineHeight: slide.kind === "cover" ? 82 : 62 });
  let cursor = titleY + (titleLines.length * (slide.kind === "cover" ? 82 : 62)) + 70;
  if (bodyLines.length) {
    body += textBlock(bodyLines, 90, cursor, { size: slide.kind === "cover" ? 36 : 30, lineHeight: 44, weight: 500, fill: slide.kind === "cta" ? accent : "#A1A7B3" });
    cursor += bodyLines.length * 44 + 30;
  }
  bulletLines.forEach((item, bulletIndex) => {
    const lines = wrapText(item, 34);
    body += `<rect x="90" y="${cursor - 18}" width="12" height="12" fill="${accent}"/>`;
    body += textBlock(lines, 130, cursor, { size: 28, lineHeight: 38, weight: 500 });
    cursor += (lines.length * 38) + (bulletIndex === bulletLines.length - 1 ? 0 : 24);
  });
  if (codeLines.length) {
    const panelHeight = Math.max(190, codeLines.length * 42 + 70);
    body += `<rect x="90" y="${cursor - 36}" width="900" height="${panelHeight}" rx="8" fill="#16181C" stroke="#343840"/>`;
    body += textBlock(codeLines, 130, cursor + 20, { size: 26, lineHeight: 42, weight: 500, fill: accent });
  }
  const verticalGrid = Array.from({ length: 13 }, (_, i) => `<line x1="${60 + i * 80}" y1="60" x2="${60 + i * 80}" y2="1290"/>`).join("");
  const horizontalGrid = Array.from({ length: 13 }, (_, i) => `<line x1="60" y1="${60 + i * 102.5}" x2="1020" y2="${60 + i * 102.5}"/>`).join("");
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350" viewBox="0 0 1080 1350" role="img" aria-label="${escapeXml(post.title)} slide ${index + 1}">
  <rect width="1080" height="1350" fill="#0D0E10"/>
  <g opacity="0.55" stroke="#22252A" stroke-width="1">${verticalGrid}${horizontalGrid}</g>
  <rect x="60" y="60" width="960" height="1230" fill="none" stroke="#343840"/>
  <path d="M60 82V60H82 M998 60H1020V82 M60 1268V1290H82 M998 1290H1020V1268" stroke="${accent}" stroke-width="2" fill="none"/>
  <text x="90" y="122" fill="${accent}" font-family="JetBrains Mono, IBM Plex Mono, monospace" font-size="18" font-weight="600" letter-spacing="2">${escapeXml(post.module)}</text>
  <text x="990" y="122" text-anchor="end" fill="#6B7280" font-family="JetBrains Mono, IBM Plex Mono, monospace" font-size="15" letter-spacing="1.5">${escapeXml(slide.eyebrow)}</text>
  ${body}
  <line x1="90" y1="1214" x2="990" y2="1214" stroke="#343840"/>
  <text x="90" y="1260" fill="#6B7280" font-family="JetBrains Mono, IBM Plex Mono, monospace" font-size="14" letter-spacing="1.5">CYVX FIELD MANUAL</text>
  <text x="990" y="1260" text-anchor="end" fill="${accent}" font-family="JetBrains Mono, IBM Plex Mono, monospace" font-size="14" font-weight="700" letter-spacing="1.5">${progress}</text>
</svg>`;
}

function renderAllAssets(outputDirectory) {
  const root = ensureDirectory(outputDirectory);
  const carousels = ensureDirectory(path.join(root, "carousels"));
  const downloads = ensureDirectory(path.join(root, "downloads"));
  const rendered = [];
  for (const post of POSTS) {
    const postDir = ensureDirectory(path.join(carousels, post.id.toLowerCase()));
    post.slides.forEach((slide, index) => {
      const file = path.join(postDir, `slide-${String(index + 1).padStart(2, "0")}.svg`);
      fs.writeFileSync(file, renderSlideSvg(post, slide, index), "utf8");
      rendered.push(file);
    });
  }
  for (const trigger of Object.values(TRIGGERS)) {
    const asset = buildDownloadAsset(trigger.asset);
    if (!asset) continue;
    const file = path.join(downloads, trigger.asset);
    fs.writeFileSync(file, asset);
    rendered.push(file);
  }
  const manifest = {
    generated_at: new Date().toISOString(),
    posts: POSTS.map((post) => ({ id: post.id, category: post.category, keyword: post.keyword, slides: post.slides.length })),
    triggers: TRIGGERS,
    files: rendered.map((file) => path.relative(root, file)),
  };
  fs.writeFileSync(path.join(root, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return manifest;
}

module.exports = { renderSlideSvg, renderAllAssets, wrapText, escapeXml };
