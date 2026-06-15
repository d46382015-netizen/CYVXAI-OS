"use strict";

(function () {
  const state = { payload: null, loading: false };

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function ensurePanel() {
    if (document.getElementById("githubControlPlane")) return;
    const panel = el("section", "github-control-plane");
    panel.id = "githubControlPlane";
    panel.innerHTML = `
      <div class="gh-head">
        <div>
          <span class="kicker">Live Connector</span>
          <h2>GitHub Reality Connection</h2>
          <p>Turn commits, issues, pull requests, reviews, checks, and workflows into verified CYVX observations, constraints, missions, decisions, and outcomes.</p>
        </div>
        <div class="gh-actions">
          <button class="gh-button" id="ghOperatorLogin">Unlock</button>
          <button class="gh-button gh-hidden" id="ghOperatorLogout">Lock</button>
          <button class="gh-button primary" id="ghConnect">Connect GitHub</button>
          <button class="gh-button" id="ghRefresh">Refresh</button>
          <button class="gh-button danger gh-hidden" id="ghDisconnect">Disconnect</button>
        </div>
      </div>
      <div class="gh-grid" id="ghStatusGrid"></div>
      <div class="gh-note" id="ghNote">Checking the real GitHub control-plane state…</div>
      <div class="gh-deliveries">
        <div class="gh-deliveries-head"><div><span class="kicker">Proof Stream</span><h3>Recent verified deliveries</h3></div></div>
        <div class="gh-deliveries-list" id="ghDeliveries"><div class="gh-empty">No authenticated delivery data loaded.</div></div>
      </div>`;
    const anchor = document.querySelector(".value-card") || document.querySelector(".hero");
    if (anchor) anchor.insertAdjacentElement("afterend", panel);
    else document.getElementById("app")?.appendChild(panel);
    wirePanel();
  }

  function wirePanel() {
    document.getElementById("ghRefresh").addEventListener("click", loadStatus);
    document.getElementById("ghOperatorLogin").addEventListener("click", unlockOperator);
    document.getElementById("ghOperatorLogout").addEventListener("click", lockOperator);
    document.getElementById("ghConnect").addEventListener("click", () => {
      if (!state.payload?.github?.authenticated) {
        setNote("Unlock the owner session first. The API key is used once and is never saved by this page.", "warn");
        return;
      }
      window.location.href = "/api/github/install?return_to=/";
    });
    document.getElementById("ghDisconnect").addEventListener("click", disconnectGitHub);
    document.getElementById("ghDeliveries").addEventListener("click", async (event) => {
      const button = event.target.closest("[data-gh-retry]");
      if (!button) return;
      button.disabled = true;
      try {
        const response = await fetch(`/api/github/deliveries/${encodeURIComponent(button.dataset.ghRetry)}/retry`, {
          method: "POST",
          credentials: "same-origin",
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || data.error || "Retry failed");
        setNote(`Delivery ${button.dataset.ghRetry} was processed again.`, "ok");
        await loadStatus();
      } catch (error) {
        setNote(error.message, "bad");
      } finally {
        button.disabled = false;
      }
    });
  }

  async function unlockOperator() {
    const apiKey = window.prompt("Enter the CYVX operator API key. It will be sent once over HTTPS and not stored in this page.");
    if (!apiKey) return;
    try {
      const response = await fetch("/api/session/operator", {
        method: "POST",
        credentials: "same-origin",
        headers: { "x-api-key": apiKey },
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || data.error || "Operator authentication failed");
      setNote("Owner session unlocked. You can connect and manage GitHub safely.", "ok");
      await loadStatus();
    } catch (error) {
      setNote(error.message, "bad");
    }
  }

  async function lockOperator() {
    try {
      const response = await fetch("/api/session/operator", {
        method: "DELETE",
        credentials: "same-origin",
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || data.error || "Session lock failed");
      state.payload = null;
      setNote("Owner session locked.", "ok");
      await loadStatus();
    } catch (error) {
      setNote(error.message, "bad");
    }
  }

  async function disconnectGitHub() {
    const installationId = state.payload?.github?.connection?.installation_id;
    if (!installationId) return;
    if (!window.confirm("Disconnect this GitHub installation from CYVX? GitHub itself will remain installed until removed in GitHub settings.")) return;
    try {
      const response = await fetch(`/api/github/installations/${encodeURIComponent(installationId)}`, {
        method: "DELETE",
        credentials: "same-origin",
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || data.error || "Disconnect failed");
      setNote("GitHub connection removed from CYVX.", "ok");
      await loadStatus();
    } catch (error) {
      setNote(error.message, "bad");
    }
  }

  async function loadStatus() {
    if (state.loading) return;
    state.loading = true;
    setNote("Refreshing live GitHub state…", "warn");
    try {
      const response = await fetch(`/api/github/status?ts=${Date.now()}`, { credentials: "same-origin" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || payload.error || "Unable to load GitHub state");
      state.payload = payload;
      render(payload.github || {});
    } catch (error) {
      renderError(error.message);
    } finally {
      state.loading = false;
    }
  }

  function render(github) {
    const readiness = github.readiness || {};
    const connection = github.connection || null;
    const authenticated = Boolean(github.authenticated);
    const grid = document.getElementById("ghStatusGrid");
    grid.replaceChildren(
      statusCard("Control plane", readiness.ready ? "Ready" : "Needs configuration", readiness.ready ? "All required security layers are configured." : readinessSummary(readiness), readiness.ready ? "ok" : "warn"),
      statusCard("Owner session", authenticated ? "Unlocked" : "Locked", authenticated ? "Authenticated with a secure HttpOnly session." : "Unlock with the CYVX operator key to manage GitHub.", authenticated ? "ok" : "warn"),
      statusCard("GitHub account", connection?.github_user?.login || "Not connected", connection?.installation_id ? `Installation ${connection.installation_id}` : "No installation linked to CYVX.", connection ? "ok" : "warn"),
      statusCard("Repository auth", github.repository_auth?.mode || "unavailable", connection?.installation_id ? `Connected installation is active.` : "Waiting for a connected installation.", github.repository_auth?.mode === "github_app_installation" ? "ok" : "warn")
    );

    document.getElementById("ghOperatorLogin").textContent = authenticated ? "Session unlocked" : "Unlock";
    document.getElementById("ghOperatorLogin").disabled = authenticated;
    document.getElementById("ghOperatorLogout").classList.toggle("gh-hidden", !authenticated);
    document.getElementById("ghConnect").disabled = !authenticated || !readiness.oauth_ready;
    document.getElementById("ghConnect").textContent = connection ? "Reconnect GitHub" : "Connect GitHub";
    document.getElementById("ghDisconnect").classList.toggle("gh-hidden", !connection);

    if (!readiness.ready) setNote(`Configuration incomplete: ${readinessSummary(readiness)}`, "warn");
    else if (!authenticated) setNote("The control plane is configured. Unlock the owner session to view deliveries or connect GitHub.", "warn");
    else if (!connection) setNote("Owner session is active. Connect the GitHub App to begin importing repository reality.", "warn");
    else setNote(`Connected as ${connection.github_user?.login || "GitHub user"}. Incoming events become real CYVX records.`, "ok");

    renderDeliveries(Array.isArray(github.recent_deliveries) ? github.recent_deliveries : []);
    cleanConnectedQuery();
  }

  function renderDeliveries(deliveries) {
    const list = document.getElementById("ghDeliveries");
    list.replaceChildren();
    if (!deliveries.length) {
      list.appendChild(el("div", "gh-empty", state.payload?.github?.authenticated ? "No GitHub deliveries have been accepted yet." : "Unlock the owner session to view delivery proof."));
      return;
    }
    deliveries.forEach((delivery) => {
      const row = el("div", "gh-delivery");
      const identity = el("div");
      identity.append(el("b", "", `${delivery.event || "event"}${delivery.action ? ` · ${delivery.action}` : ""}`));
      identity.append(el("small", "", delivery.delivery_id || "unknown delivery"));
      const repo = el("div");
      repo.append(el("b", "", delivery.repository || "No repository"));
      repo.append(el("small", "", delivery.sender ? `Actor: ${delivery.sender}` : "No actor recorded"));
      const status = el("div");
      status.append(statusPill(delivery.status || "unknown"));
      status.append(el("small", "", delivery.completed_at || delivery.failed_at || delivery.accepted_at || ""));
      const action = el("div");
      if (delivery.status === "failed") {
        const retry = el("button", "gh-button", "Retry");
        retry.dataset.ghRetry = delivery.delivery_id;
        action.append(retry);
      } else {
        const created = delivery.mapping?.created || [];
        action.append(el("small", "", created.length ? created.map((item) => item.kind).join(", ") : delivery.mapping?.ignored ? "Acknowledged" : "Processing"));
      }
      row.append(identity, repo, status, action);
      list.appendChild(row);
    });
  }

  function statusCard(label, value, detail, tone) {
    const card = el("div", "gh-card");
    card.append(el("span", "", label));
    card.append(el("strong", "", value));
    const pill = el("span", `gh-status ${tone}`, tone === "ok" ? "Operational" : tone === "bad" ? "Failed" : "Attention");
    card.append(pill);
    card.append(el("small", "", detail));
    return card;
  }

  function statusPill(value) {
    const normalized = String(value || "unknown").toLowerCase();
    const tone = normalized === "completed" ? "ok" : normalized === "failed" ? "bad" : "warn";
    return el("span", `gh-status ${tone}`, normalized);
  }

  function readinessSummary(readiness) {
    const missing = [];
    if (!readiness.webhook_ready) missing.push("webhook secret");
    if (!readiness.app_auth_ready) missing.push("App ID/private key");
    if (!readiness.oauth_ready) missing.push("OAuth/encryption");
    if (!readiness.operator_session_ready) missing.push("operator session/API key");
    return missing.length ? missing.join(", ") : "readiness unknown";
  }

  function setNote(message, tone) {
    const note = document.getElementById("ghNote");
    if (!note) return;
    note.textContent = message;
    note.classList.toggle("gh-error", tone === "bad");
  }

  function renderError(message) {
    const grid = document.getElementById("ghStatusGrid");
    grid.replaceChildren(statusCard("Control plane", "Unavailable", message, "bad"));
    setNote(message, "bad");
  }

  function cleanConnectedQuery() {
    const url = new URL(window.location.href);
    if (!url.searchParams.has("github")) return;
    url.searchParams.delete("github");
    url.searchParams.delete("installation_id");
    window.history.replaceState({}, "", url.pathname + (url.search ? url.search : "") + url.hash);
  }

  function init() {
    ensurePanel();
    loadStatus();
    window.setInterval(loadStatus, 15_000);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
