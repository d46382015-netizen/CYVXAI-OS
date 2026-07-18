"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { loadCatalog, validateCatalog, findPost } = require("./catalog");
const { renderSlideSvg } = require("./renderer");

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function write(file, content) {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, content);
}

function hash(content) {
  return crypto.createHash("sha256").update(content).digest("hex");
}

function safeSlug(value) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value || "")) throw new Error("Invalid slug.");
  return value;
}

function promptPackage(post, brand) {
  return {
    system: [
      `You are the editorial production engine for ${brand.name}.`,
      `Voice: ${brand.voice.traits.join(", ")}.`,
      ...brand.voice.rules,
      "Preserve all safety, legal, financial, cybersecurity, and evidence disclaimers.",
      "Do not invent sources, customers, results, security guarantees, revenue, or investment returns."
    ].join("\n"),
    image_prompt: post.image_prompt,
    adaptation_prompts: {
      reel: `Convert the approved carousel for "${post.title}" into a 45–75 second faceless vertical video. Keep every substantive claim within the approved copy. Use fast visual transitions, readable captions, and a verification-focused close.`,
      linkedin: `Adapt "${post.title}" into a concise LinkedIn document post for operators and small-business owners. Preserve the outcome, numbered actions, limitations, and CTA.`,
      email: `Adapt "${post.title}" into a practical email lesson with subject line, preview text, one core idea, the numbered operating sequence, verification, disclaimer, and one CTA.`
    }
  };
}

async function requestAiEnhancement(post, brand, options = {}) {
  const endpoint = options.endpoint || process.env.CYVX_CONTENT_AI_ENDPOINT;
  if (!endpoint) return { mode: "approved-copy", post, ai_used: false };
  const model = options.model || process.env.CYVX_CONTENT_AI_MODEL;
  if (!model) throw new Error("CYVX_CONTENT_AI_MODEL is required when CYVX_CONTENT_AI_ENDPOINT is set.");
  const token = options.token || process.env.CYVX_CONTENT_AI_TOKEN || "";
  const pkg = promptPackage(post, brand);
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify({
      model,
      temperature: 0.3,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: pkg.system },
        { role: "user", content: JSON.stringify({
          instruction: "Improve clarity and platform adaptation without changing the approved factual substance. Return JSON with caption, reel_script, and image_prompt.",
          post
        }) }
      ]
    })
  });
  if (!response.ok) throw new Error(`AI endpoint returned ${response.status}.`);
  const payload = await response.json();
  const raw = payload.choices?.[0]?.message?.content;
  if (!raw) throw new Error("AI endpoint returned no content.");
  const parsed = JSON.parse(raw);
  return {
    mode: "ai-enhanced",
    ai_used: true,
    post: {
      ...post,
      caption: String(parsed.caption || post.caption),
      reel_script: String(parsed.reel_script || post.reel_script),
      image_prompt: String(parsed.image_prompt || post.image_prompt)
    }
  };
}

function renderLeadMagnetHtml(markdown, brand) {
  const escaped = markdown
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
  const lines = escaped.split("\n");
  let html = "";
  let inList = false;
  for (const line of lines) {
    if (/^### /.test(line)) {
      if (inList) { html += "</ul>"; inList = false; }
      html += `<h3>${line.slice(4)}</h3>`;
    } else if (/^## /.test(line)) {
      if (inList) { html += "</ul>"; inList = false; }
      html += `<h2>${line.slice(3)}</h2>`;
    } else if (/^# /.test(line)) {
      if (inList) { html += "</ul>"; inList = false; }
      html += `<h1>${line.slice(2)}</h1>`;
    } else if (/^- /.test(line)) {
      if (!inList) { html += "<ul>"; inList = true; }
      html += `<li>${line.slice(2)}</li>`;
    } else if (/^\d+\. /.test(line)) {
      if (!inList) { html += "<ol>"; inList = "ol"; }
      html += `<li>${line.replace(/^\d+\. /, "")}</li>`;
    } else if (!line.trim()) {
      if (inList) { html += inList === "ol" ? "</ol>" : "</ul>"; inList = false; }
    } else if (/^\*\*.+\*\*$/.test(line.trim())) {
      html += `<p><strong>${line.trim().slice(2, -2)}</strong></p>`;
    } else {
      html += `<p>${line.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")}</p>`;
    }
  }
  if (inList) html += inList === "ol" ? "</ol>" : "</ul>";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>CYVX Operator Starter Manual</title>
<style>
:root{--ink:${brand.colors.ink};--paper:${brand.colors.paper};--accent:${brand.colors.secure};--muted:${brand.colors.muted}}
*{box-sizing:border-box}body{margin:0;background:#dfe5e1;color:#101411;font-family:Inter,Arial,sans-serif;line-height:1.55}
main{max-width:820px;margin:24px auto;background:var(--paper);padding:72px 76px;box-shadow:0 18px 60px #0003}
h1{font-size:52px;line-height:1;letter-spacing:-2px;margin:0 0 28px}h2{font-size:30px;margin:56px 0 12px;border-top:4px solid var(--accent);padding-top:18px}
h3{font-size:21px;margin:30px 0 8px}p,li{font-size:16px}strong{color:#071f10}ul,ol{padding-left:24px}
.brand{font-weight:900;letter-spacing:1px;color:#173d20}.tag{font-family:monospace;color:#33543b}
footer{margin-top:60px;border-top:1px solid #aab7af;padding-top:20px;color:#536159;font-size:13px}
@media(max-width:700px){main{margin:0;padding:36px 24px}h1{font-size:40px}}
@media print{body{background:#fff}main{box-shadow:none;margin:0;max-width:none}h2{break-before:page}}
</style>
</head>
<body>
<main>
<div class="brand">${brand.name}</div><div class="tag">${brand.tagline}</div>
${html}
<footer>© 2026 Dakota Lee Jonsgaard / CYVX. Educational material. Verify instructions against current provider, legal, financial, and security requirements before acting.</footer>
</main>
<script>
navigator.sendBeacon?.("/api/events",new Blob([JSON.stringify({type:"leadmagnet.view",source:"manual-html"})],{type:"application/json"}));
</script>
</body>
</html>`;
}

async function buildAll(options = {}) {
  const started = Date.now();
  const outDir = path.resolve(options.outDir || path.join(process.cwd(), "dist", "field-manual"));
  const { brand, posts } = loadCatalog();
  const validation = validateCatalog({ brand, posts });
  if (!validation.ok) {
    const error = new Error(`Catalog validation failed:\n${validation.errors.join("\n")}`);
    error.validation_errors = validation.errors;
    throw error;
  }

  const selected = options.slug ? [findPost(posts, safeSlug(options.slug))].filter(Boolean) : posts;
  if (options.slug && selected.length === 0) throw new Error(`Unknown post slug: ${options.slug}`);
  ensureDir(outDir);
  const manifest = {
    product: brand.name,
    version: 1,
    generated_at: new Date().toISOString(),
    post_count: selected.length,
    files: []
  };

  for (const originalPost of selected) {
    const enhanced = options.useAi ? await requestAiEnhancement(originalPost, brand, options) : { post: originalPost, ai_used: false, mode: "approved-copy" };
    const post = enhanced.post;
    const postDir = path.join(outDir, "posts", post.slug);
    ensureDir(postDir);
    const artifacts = {
      caption: `${post.caption.trim()}\n`,
      reel: `${post.reel_script.trim()}\n`,
      imagePrompt: `${post.image_prompt.trim()}\n`,
      prompts: `${JSON.stringify(promptPackage(post, brand), null, 2)}\n`,
      source: `${JSON.stringify(post, null, 2)}\n`
    };
    for (const [name, content] of Object.entries(artifacts)) {
      const filename = {
        caption: "caption.txt",
        reel: "reel-script.txt",
        imagePrompt: "image-prompt.txt",
        prompts: "ai-prompts.json",
        source: "post.json"
      }[name];
      const file = path.join(postDir, filename);
      write(file, content);
      manifest.files.push({ path: path.relative(outDir, file), sha256: hash(content), bytes: Buffer.byteLength(content) });
    }
    post.slides.forEach((slide, index) => {
      const content = renderSlideSvg(post, slide, brand, index);
      const file = path.join(postDir, `slide-${String(index + 1).padStart(2, "0")}.svg`);
      write(file, content);
      manifest.files.push({ path: path.relative(outDir, file), sha256: hash(content), bytes: Buffer.byteLength(content) });
    });
    write(path.join(postDir, "production.json"), `${JSON.stringify({
      slug: post.slug,
      mode: enhanced.mode,
      ai_used: enhanced.ai_used,
      status: "ready",
      slide_count: post.slides.length,
      channels: post.channels,
      primary_metric: post.publication.primary_metric
    }, null, 2)}\n`);
  }

  const markdown = fs.readFileSync(path.join(__dirname, "..", "data", "lead-magnet.md"), "utf8");
  const manualHtml = renderLeadMagnetHtml(markdown, brand);
  write(path.join(outDir, "downloads", "operator-starter-manual.html"), manualHtml);
  write(path.join(outDir, "downloads", "operator-starter-manual.md"), markdown);
  write(path.join(outDir, "catalog.json"), `${JSON.stringify({ brand, posts }, null, 2)}\n`);
  manifest.files.push({ path: "downloads/operator-starter-manual.html", sha256: hash(manualHtml), bytes: Buffer.byteLength(manualHtml) });
  manifest.files.push({ path: "downloads/operator-starter-manual.md", sha256: hash(markdown), bytes: Buffer.byteLength(markdown) });
  manifest.duration_ms = Date.now() - started;
  write(path.join(outDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  return { outDir, manifest, validation };
}

module.exports = { buildAll, requestAiEnhancement, promptPackage, renderLeadMagnetHtml };
