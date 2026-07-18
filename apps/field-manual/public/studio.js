"use strict";

const state = { posts: [], post: null, slide: 0, svg: "" };

async function getJson(path) {
  const response = await fetch(path);
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "Request failed.");
  return payload;
}

function setStatus(message, ok = true) {
  const el = document.querySelector("#studio-status");
  el.textContent = message;
  el.className = `form-message ${ok ? "ok" : "error"}`;
}

function currentSvgUrl() {
  return `/posts/${state.post.slug}/slide-${String(state.slide + 1).padStart(2, "0")}.svg`;
}

async function render() {
  const url = currentSvgUrl();
  const response = await fetch(url);
  if (!response.ok) throw new Error("Slide source is unavailable. Run the Field Manual build.");
  state.svg = await response.text();
  const blob = new Blob([state.svg], { type: "image/svg+xml" });
  const objectUrl = URL.createObjectURL(blob);
  const image = document.querySelector("#slide-preview");
  const old = image.dataset.objectUrl;
  image.src = objectUrl;
  image.dataset.objectUrl = objectUrl;
  if (old) URL.revokeObjectURL(old);
  image.alt = `${state.post.title}, slide ${state.slide + 1}`;
  document.querySelector("#slide-count").textContent = `${state.slide + 1} / ${state.post.slides.length}`;
}

async function choosePost(slug) {
  state.post = state.posts.find((post) => post.slug === slug);
  state.slide = 0;
  await render();
}

function move(delta) {
  state.slide = (state.slide + delta + state.post.slides.length) % state.post.slides.length;
  render().catch((error) => setStatus(error.message, false));
}

async function downloadPng() {
  const img = new Image();
  const svgBlob = new Blob([state.svg], { type: "image/svg+xml" });
  const url = URL.createObjectURL(svgBlob);
  img.onload = () => {
    const canvas = document.createElement("canvas");
    canvas.width = 1080;
    canvas.height = 1350;
    const context = canvas.getContext("2d");
    context.drawImage(img, 0, 0, 1080, 1350);
    URL.revokeObjectURL(url);
    canvas.toBlob((blob) => {
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `${state.post.module}-${state.post.slug}-slide-${String(state.slide + 1).padStart(2, "0")}.png`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(link.href), 2000);
      setStatus("PNG exported at 1080 × 1350.");
      fetch("/api/events", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ type: "studio.export", source: "studio", post_slug: state.post.slug, pillar: state.post.pillar, metadata: { slide: state.slide + 1, format: "png" } }) }).catch(() => {});
    }, "image/png", 1);
  };
  img.onerror = () => { URL.revokeObjectURL(url); setStatus("PNG conversion failed.", false); };
  img.src = url;
}

function downloadSvg() {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([state.svg], { type: "image/svg+xml" }));
  link.download = `${state.post.module}-${state.post.slug}-slide-${String(state.slide + 1).padStart(2, "0")}.svg`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 2000);
  setStatus("SVG source exported.");
}

async function copy(value, label) {
  await navigator.clipboard.writeText(value);
  setStatus(`${label} copied.`);
}

async function init() {
  const payload = await getJson("/api/posts");
  state.posts = payload.posts;
  const select = document.querySelector("#post-select");
  select.innerHTML = state.posts.map((post) => `<option value="${post.slug}">${post.module} • ${post.pillar.toUpperCase()} • ${post.title}</option>`).join("");
  select.addEventListener("change", () => choosePost(select.value).catch((error) => setStatus(error.message, false)));
  document.querySelector("#previous").addEventListener("click", () => move(-1));
  document.querySelector("#next").addEventListener("click", () => move(1));
  document.querySelector("#download-current").addEventListener("click", downloadPng);
  document.querySelector("#download-png").addEventListener("click", downloadPng);
  document.querySelector("#download-svg").addEventListener("click", downloadSvg);
  document.querySelector("#copy-caption").addEventListener("click", () => copy(state.post.caption, "Caption").catch((error) => setStatus(error.message, false)));
  document.querySelector("#copy-reel").addEventListener("click", () => copy(state.post.reel_script, "Reel script").catch((error) => setStatus(error.message, false)));
  await choosePost(state.posts[0].slug);
}

init().catch((error) => setStatus(error.message, false));
