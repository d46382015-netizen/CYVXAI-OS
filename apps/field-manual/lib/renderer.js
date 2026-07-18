"use strict";

const crypto = require("node:crypto");

function escapeXml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function wrap(text, maxChars = 32, maxLines = 8) {
  const paragraphs = String(text || "").split(/\n+/);
  const lines = [];
  for (const paragraph of paragraphs) {
    const words = paragraph.trim().split(/\s+/).filter(Boolean);
    let line = "";
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (candidate.length > maxChars && line) {
        lines.push(line);
        line = word;
      } else {
        line = candidate;
      }
      if (lines.length >= maxLines) break;
    }
    if (line && lines.length < maxLines) lines.push(line);
    if (lines.length < maxLines - 1 && paragraph !== paragraphs.at(-1)) lines.push("");
    if (lines.length >= maxLines) break;
  }
  return lines.slice(0, maxLines);
}

function iconFor(pillar, color) {
  const common = `fill="none" stroke="${color}" stroke-width="14" stroke-linecap="round" stroke-linejoin="round"`;
  const icons = {
    secure: `<path ${common} d="M540 330l170 70v125c0 120-70 210-170 258-100-48-170-138-170-258V400l170-70z"/><rect ${common} x="485" y="500" width="110" height="120" rx="22"/><path ${common} d="M515 500v-28c0-42 50-60 75-28 8 10 12 22 12 36v20"/>`,
    build: `<path ${common} d="M390 430l150-90 150 90-150 90-150-90z"/><path ${common} d="M390 430v175l150 90 150-90V430"/><path ${common} d="M540 520v175"/>`,
    sell: `<path ${common} d="M380 650l130-130 90 90 145-175"/><path ${common} d="M640 435h105v105"/><rect ${common} x="365" y="360" width="320" height="360" rx="36"/>`,
    operate: `<circle ${common} cx="540" cy="530" r="80"/><path ${common} d="M540 350v70M540 640v70M360 530h70M650 530h70M413 403l50 50M617 607l50 50M667 403l-50 50M463 607l-50 50"/>`,
    own: `<path ${common} d="M365 500l175-135 175 135v230H365V500z"/><path ${common} d="M475 730V570h130v160"/><path ${common} d="M330 500l210-165 210 165"/>`,
    capital: `<path ${common} d="M360 680h360M400 680V520M500 680V430M600 680V350M700 680V470"/><path ${common} d="M390 390l120-80 95 55 125-105"/>`,
    web3: `<circle ${common} cx="540" cy="535" r="92"/><circle ${common} cx="380" cy="390" r="44"/><circle ${common} cx="700" cy="390" r="44"/><circle ${common} cx="380" cy="680" r="44"/><circle ${common} cx="700" cy="680" r="44"/><path ${common} d="M415 420l70 65M665 420l-70 65M415 650l70-65M665 650l-70-65"/>`
  };
  return icons[pillar] || icons.build;
}

function textBlock(lines, x, y, options = {}) {
  const size = options.size || 48;
  const weight = options.weight || 700;
  const fill = options.fill || "#F3F6F4";
  const lineHeight = options.lineHeight || Math.round(size * 1.17);
  return lines.map((line, index) =>
    line
      ? `<text x="${x}" y="${y + index * lineHeight}" font-family="Inter,Arial,sans-serif" font-size="${size}" font-weight="${weight}" fill="${fill}">${escapeXml(line)}</text>`
      : ""
  ).join("\n");
}

function renderSlideSvg(post, slide, brand, index) {
  const pillar = brand.pillars.find((item) => item.id === post.pillar);
  const color = pillar?.color || "#7CFF3A";
  const titleLines = wrap(slide.title, slide.type === "cover" ? 18 : 26, slide.type === "cover" ? 5 : 4);
  const bodyLines = wrap(slide.body, slide.type === "cover" ? 38 : 46, slide.type === "cover" ? 5 : 9);
  const titleSize = slide.type === "cover" ? 92 : 66;
  const titleY = slide.type === "cover" ? 760 : 280;
  const bodyY = titleY + titleLines.length * (titleSize * 1.05) + 58;
  const fingerprint = crypto.createHash("sha256").update(`${post.id}:${index}`).digest("hex").slice(0, 12).toUpperCase();

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350" viewBox="0 0 1080 1350" role="img" aria-labelledby="title desc">
  <title id="title">${escapeXml(post.title)} — slide ${index + 1}</title>
  <desc id="desc">${escapeXml(slide.body)}</desc>
  <defs>
    <radialGradient id="glow" cx="50%" cy="37%" r="56%">
      <stop offset="0%" stop-color="${color}" stop-opacity=".26"/>
      <stop offset="42%" stop-color="${color}" stop-opacity=".05"/>
      <stop offset="100%" stop-color="#050706" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="panel" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#111713"/>
      <stop offset="100%" stop-color="#080B09"/>
    </linearGradient>
    <pattern id="grid" width="54" height="54" patternUnits="userSpaceOnUse">
      <path d="M54 0H0V54" fill="none" stroke="${color}" stroke-opacity=".08" stroke-width="1"/>
    </pattern>
    <filter id="soft"><feGaussianBlur stdDeviation="18"/></filter>
  </defs>
  <rect width="1080" height="1350" fill="#050706"/>
  <rect width="1080" height="1350" fill="url(#grid)"/>
  <rect width="1080" height="900" fill="url(#glow)"/>
  <circle cx="540" cy="505" r="270" fill="${color}" opacity=".05" filter="url(#soft)"/>
  <g opacity="${slide.type === "cover" ? 1 : .24}">${iconFor(post.pillar, color)}</g>
  <path d="M70 76h270M740 76h270M70 1274h270M740 1274h270" stroke="${color}" stroke-width="4" opacity=".9"/>
  <path d="M70 76v42M1010 76v42M70 1232v42M1010 1232v42" stroke="${color}" stroke-width="4" opacity=".9"/>
  <rect x="70" y="${slide.type === "cover" ? 690 : 168}" width="940" height="${slide.type === "cover" ? 500 : 965}" rx="34" fill="url(#panel)" stroke="${color}" stroke-opacity=".42" stroke-width="2"/>
  <rect x="102" y="${slide.type === "cover" ? 721 : 201}" width="8" height="54" rx="4" fill="${color}"/>
  <text x="132" y="${slide.type === "cover" ? 760 : 239}" font-family="ui-monospace,monospace" font-size="26" font-weight="700" letter-spacing="2" fill="${color}">${escapeXml(slide.eyebrow)}</text>
  ${textBlock(titleLines, 102, titleY, { size: titleSize, weight: 900, lineHeight: Math.round(titleSize * 1.05) })}
  ${textBlock(bodyLines, 102, bodyY, { size: slide.type === "cover" ? 34 : 35, weight: 500, fill: "#B9C4BE", lineHeight: 48 })}
  <line x1="102" y1="1162" x2="978" y2="1162" stroke="#243029" stroke-width="2"/>
  <text x="102" y="1210" font-family="Arial,sans-serif" font-size="30" font-weight="900" fill="#F3F6F4">CYVX FIELD MANUAL</text>
  <text x="102" y="1248" font-family="ui-monospace,monospace" font-size="21" fill="${color}">BUILD • SECURE • SELL • OWN</text>
  <text x="978" y="1210" text-anchor="end" font-family="ui-monospace,monospace" font-size="24" font-weight="700" fill="#F3F6F4">${String(index + 1).padStart(2, "0")} / ${String(post.slides.length).padStart(2, "0")}</text>
  <text x="978" y="1248" text-anchor="end" font-family="ui-monospace,monospace" font-size="16" fill="#718078">${fingerprint}</text>
</svg>`;
}

module.exports = { renderSlideSvg, escapeXml, wrap };
