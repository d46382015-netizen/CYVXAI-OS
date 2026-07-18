"use strict";

const state = { brand: null, posts: [], filter: "all" };

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { "content-type": "application/json", ...(options.headers || {}) },
    ...options
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "Request failed.");
  return payload;
}

function event(type, data = {}) {
  fetch("/api/events", {
    method: "POST",
    headers: { "content-type": "application/json" },
    keepalive: true,
    body: JSON.stringify({ type, source: "landing", ...data })
  }).catch(() => {});
}

function renderPillars() {
  const target = document.querySelector("#pillars");
  target.innerHTML = state.brand.pillars.map((pillar) => `
    <article class="pillar" style="--pillar:${pillar.color}">
      <i></i><b>${pillar.name}</b><span>${pillar.promise}</span>
    </article>`).join("");
}

function renderFilters() {
  const target = document.querySelector("#filters");
  const options = [{ id: "all", name: "All 30" }, ...state.brand.pillars];
  target.innerHTML = options.map((option) => `
    <button class="filter ${state.filter === option.id ? "active" : ""}" data-filter="${option.id}">${option.name}</button>`).join("");
  target.querySelectorAll("[data-filter]").forEach((button) => button.addEventListener("click", () => {
    state.filter = button.dataset.filter;
    renderFilters();
    renderPosts();
    event("post.filter", { pillar: state.filter });
  }));
}

function pillarColor(id) {
  return state.brand.pillars.find((pillar) => pillar.id === id)?.color || "#7CFF3A";
}

function renderPosts() {
  const target = document.querySelector("#posts");
  const posts = state.filter === "all" ? state.posts : state.posts.filter((post) => post.pillar === state.filter);
  target.innerHTML = posts.map((post) => `
    <article class="post-card" style="--card-accent:${pillarColor(post.pillar)}" data-slug="${post.slug}" tabindex="0">
      <div class="post-visual"></div>
      <div class="post-body">
        <div class="post-meta"><span>${post.pillar.toUpperCase()} • ${post.module}</span><span>${post.time}</span></div>
        <h3>${escapeHtml(post.title)}</h3><p>${escapeHtml(post.hook)}</p>
        <div class="card-action">Open publication package →</div>
      </div>
    </article>`).join("");
  target.querySelectorAll("[data-slug]").forEach((card) => {
    const open = () => showPost(card.dataset.slug);
    card.addEventListener("click", open);
    card.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") open(); });
  });
}

function showPost(slug) {
  const post = state.posts.find((item) => item.slug === slug);
  if (!post) return;
  document.querySelector("#modal-meta").textContent = `${post.pillar.toUpperCase()} • MODULE ${post.module} • ${post.slides.length} SLIDES`;
  document.querySelector("#modal-title").textContent = post.title;
  document.querySelector("#modal-copy").textContent = `${post.caption}\n\n--- REEL SCRIPT ---\n\n${post.reel_script}`;
  document.querySelector("#post-modal").classList.add("open");
  event("post.view", { post_slug: post.slug, pillar: post.pillar });
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char]));
}

async function handleLead(eventObject) {
  eventObject.preventDefault();
  const message = document.querySelector("#form-message");
  message.className = "form-message";
  message.textContent = "Securing your manual…";
  try {
    const payload = await api("/api/leads", {
      method: "POST",
      body: JSON.stringify({
        name: document.querySelector("#name").value,
        email: document.querySelector("#email").value,
        interest: document.querySelector("#interest").value,
        consent: document.querySelector("#consent").checked,
        source: "field-manual-landing",
        campaign: "launch-30"
      })
    });
    message.className = "form-message ok";
    message.innerHTML = `You are in. <a href="${payload.download_url}" target="_blank" rel="noopener">Open the Operator Starter Manual →</a>`;
    event("leadmagnet.download", { source: "lead-success" });
  } catch (error) {
    message.className = "form-message error";
    message.textContent = error.message;
  }
}

async function init() {
  const [brand, postPayload] = await Promise.all([api("/api/brand"), api("/api/posts")]);
  state.brand = brand;
  state.posts = postPayload.posts;
  renderPillars();
  renderFilters();
  renderPosts();
  document.querySelector("#lead-form").addEventListener("submit", handleLead);
  document.querySelector("#modal-close").addEventListener("click", () => document.querySelector("#post-modal").classList.remove("open"));
  document.querySelector("#post-modal").addEventListener("click", (e) => { if (e.target.id === "post-modal") e.currentTarget.classList.remove("open"); });
  event("page.view", { metadata: { path: location.pathname } });
}

init().catch((error) => {
  document.querySelector("#posts").innerHTML = `<p>Content could not load: ${escapeHtml(error.message)}</p>`;
});
