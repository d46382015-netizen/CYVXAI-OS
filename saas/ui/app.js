"use strict";

const health = document.getElementById("health");
const output = document.getElementById("output");
const workspace = document.getElementById("workspace");
const connect = document.getElementById("connect");

async function request(path, options = {}) {
  const response = await fetch(path, options);
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || `Request failed: ${response.status}`);
  return payload;
}

async function checkHealth() {
  try {
    const result = await request("/healthz");
    health.textContent = "Service online";
    health.className = "status ok";
    output.textContent = JSON.stringify(result, null, 2);
  } catch (error) {
    health.textContent = "Service unavailable";
    health.className = "status bad";
    output.textContent = error.message;
  }
}

connect.addEventListener("click", async () => {
  workspace.classList.remove("hidden");
  document.getElementById("auth-message").textContent = "Console connected to the CYVX SaaS runtime.";
  await checkHealth();
});

checkHealth();
