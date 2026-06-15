"use strict";

const { sendJson } = require("./service");

function createGitHubOAuthService(options = {}) {
  const clientId = String(options.clientId || process.env.GITHUB_CLIENT_ID || "").trim();
  const clientSecret = String(options.clientSecret || process.env.GITHUB_CLIENT_SECRET || "").trim();
  const appSlug = String(options.appSlug || process.env.GITHUB_APP_SLUG || "").trim();
  const fetchImpl = options.fetch || global.fetch;
  const stateService = options.stateService;
  const authStore = options.authStore;
  const cipher = options.cipher || null;
  const appClient = options.appClient || null;
  const ownerUserId = String(options.ownerUserId || process.env.CYVX_OWNER_ID || "").trim();
  const githubOrigin = String(options.githubOrigin || "https://github.com").replace(/\/$/, "");
  const apiOrigin = String(options.apiOrigin || process.env.CYVX_GITHUB_API_BASE || "https://api.github.com").replace(/\/$/, "");

  if (!stateService) throw new Error("OAuth state service is required");
  if (!authStore) throw new Error("GitHubAuthStore is required");

  function configured() {
    return Boolean(clientId && clientSecret && appSlug && cipher && typeof fetchImpl === "function" && stateService.configured());
  }

  async function handleInstall(req, res, url) {
    if (req.method !== "GET") return sendJson(res, 405, { ok: false, error: "method_not_allowed" }, { allow: "GET" });
    if (!configured()) return sendJson(res, 503, { ok: false, error: "github_oauth_not_configured" });
    const userId = authenticatedUserId(req) || ownerUserId;
    if (!userId) return sendJson(res, 401, { ok: false, error: "authenticated_cyvx_user_required" });
    const issued = stateService.issue({
      user_id: userId,
      return_to: url.searchParams.get("return_to") || "/",
    });
    const installationUrl = new URL(`${githubOrigin}/apps/${encodeURIComponent(appSlug)}/installations/new`);
    installationUrl.searchParams.set("state", issued.state);
    if (url.searchParams.get("suggested_target_id")) installationUrl.searchParams.set("suggested_target_id", url.searchParams.get("suggested_target_id"));
    return redirect(res, installationUrl.toString());
  }

  async function handleCallback(req, res, url) {
    if (req.method !== "GET") return sendJson(res, 405, { ok: false, error: "method_not_allowed" }, { allow: "GET" });
    if (!configured()) return sendJson(res, 503, { ok: false, error: "github_oauth_not_configured" });
    const code = String(url.searchParams.get("code") || "").trim();
    const state = String(url.searchParams.get("state") || "").trim();
    if (!code || !state) return sendJson(res, 400, { ok: false, error: "missing_oauth_code_or_state" });

    let statePayload;
    try {
      statePayload = stateService.verify(state);
    } catch (error) {
      return sendJson(res, error.statusCode || 400, { ok: false, error: error.code || "invalid_oauth_state", message: error.message });
    }

    try {
      const tokenData = await exchangeCode(code);
      const user = await githubRequest("/user", tokenData.access_token);
      const installationsData = await githubRequest("/user/installations?per_page=100", tokenData.access_token);
      const installations = Array.isArray(installationsData.installations) ? installationsData.installations.map(sanitizeInstallation) : [];
      const requestedInstallationId = positiveIntegerOrNull(url.searchParams.get("installation_id"));
      const selectedInstallation = requestedInstallationId
        ? installations.find((item) => item.id === requestedInstallationId) || { id: requestedInstallationId }
        : installations[0] || null;
      const encryptedToken = cipher.encrypt(tokenData.access_token, `github-user:${statePayload.user_id}`);

      authStore.saveConnection(statePayload.user_id, {
        provider: "github",
        github_user: {
          id: user.id || null,
          login: user.login || null,
          avatar_url: user.avatar_url || null,
          html_url: user.html_url || null,
        },
        installation_id: selectedInstallation && selectedInstallation.id || null,
        installations,
        token: encryptedToken,
        token_type: tokenData.token_type || "bearer",
        scope: tokenData.scope || "",
        connected_at: new Date().toISOString(),
      });

      const destination = new URL(statePayload.return_to || "/", publicBase(req));
      destination.searchParams.set("github", "connected");
      if (selectedInstallation && selectedInstallation.id) destination.searchParams.set("installation_id", String(selectedInstallation.id));
      return redirect(res, destination.toString());
    } catch (error) {
      return sendJson(res, error.statusCode || 502, {
        ok: false,
        error: error.code || "github_oauth_exchange_failed",
        message: error.message,
      });
    }
  }

  async function handleInstallations(req, res) {
    if (req.method !== "GET") return sendJson(res, 405, { ok: false, error: "method_not_allowed" }, { allow: "GET" });
    const userId = authenticatedUserId(req) || ownerUserId;
    if (!userId) return sendJson(res, 401, { ok: false, error: "authenticated_cyvx_user_required" });
    const connection = authStore.getConnection(userId);
    return sendJson(res, 200, {
      ok: true,
      connected: Boolean(connection),
      connection: sanitizeConnection(connection),
    });
  }

  async function handleDisconnect(req, res, installationId) {
    if (req.method !== "DELETE") return sendJson(res, 405, { ok: false, error: "method_not_allowed" }, { allow: "DELETE" });
    const userId = authenticatedUserId(req) || ownerUserId;
    if (!userId) return sendJson(res, 401, { ok: false, error: "authenticated_cyvx_user_required" });
    const connection = authStore.getConnection(userId);
    if (!connection) return sendJson(res, 404, { ok: false, error: "github_connection_not_found" });
    const requested = positiveIntegerOrNull(installationId);
    if (requested && connection.installation_id && Number(connection.installation_id) !== requested) {
      return sendJson(res, 403, { ok: false, error: "installation_not_owned_by_user" });
    }
    authStore.deleteConnection(userId);
    if (appClient && connection.installation_id) appClient.clearInstallation(connection.installation_id);
    return sendJson(res, 200, { ok: true, disconnected: true, installation_id: connection.installation_id || requested || null });
  }

  function health() {
    return {
      configured: configured(),
      client_id_configured: Boolean(clientId),
      client_secret_configured: Boolean(clientSecret),
      app_slug_configured: Boolean(appSlug),
      encryption_configured: Boolean(cipher),
      fetch_available: typeof fetchImpl === "function",
      state: stateService.health(),
      store: authStore.health(),
    };
  }

  async function exchangeCode(code) {
    const response = await fetchImpl(`${githubOrigin}/login/oauth/access_token`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "User-Agent": "CYVXAI-OS",
      },
      body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code }),
    });
    const data = await parseResponse(response);
    if (!data.access_token) {
      const error = new Error(data.error_description || data.error || "GitHub did not return an access token");
      error.code = "github_oauth_exchange_failed";
      error.statusCode = 502;
      throw error;
    }
    return data;
  }

  async function githubRequest(pathname, token) {
    const response = await fetchImpl(apiOrigin + pathname, {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "CYVXAI-OS",
      },
    });
    return parseResponse(response);
  }

  return {
    configured,
    handleCallback,
    handleDisconnect,
    handleInstall,
    handleInstallations,
    health,
  };
}

async function parseResponse(response) {
  const text = await response.text();
  let data = {};
  if (text) {
    try { data = JSON.parse(text); }
    catch { data = { raw: text }; }
  }
  if (!response.ok) {
    const error = new Error(data.message || data.error_description || data.error || response.statusText || "GitHub request failed");
    error.statusCode = response.status;
    throw error;
  }
  return data;
}

function sanitizeInstallation(value = {}) {
  return {
    id: Number(value.id) || null,
    account: value.account ? {
      id: value.account.id || null,
      login: value.account.login || null,
      avatar_url: value.account.avatar_url || null,
      type: value.account.type || null,
    } : null,
    repository_selection: value.repository_selection || null,
    permissions: value.permissions || {},
    events: Array.isArray(value.events) ? value.events : [],
    html_url: value.html_url || null,
    created_at: value.created_at || null,
    updated_at: value.updated_at || null,
  };
}

function sanitizeConnection(connection) {
  if (!connection) return null;
  return {
    provider: connection.provider,
    user_id: connection.user_id,
    github_user: connection.github_user || null,
    installation_id: connection.installation_id || null,
    installations: Array.isArray(connection.installations) ? connection.installations : [],
    token_type: connection.token_type || null,
    scope: connection.scope || "",
    connected_at: connection.connected_at || null,
    created_at: connection.created_at || null,
    updated_at: connection.updated_at || null,
  };
}

function authenticatedUserId(req) {
  const value = req.headers["x-cyvx-user-id"];
  return Array.isArray(value) ? String(value[0] || "").trim() : String(value || "").trim();
}

function redirect(res, location) {
  res.statusCode = 302;
  res.setHeader("location", location);
  res.setHeader("cache-control", "no-store");
  res.end();
}

function publicBase(req) {
  const configured = String(process.env.APP_BASE_URL || "").trim();
  if (configured) return configured;
  const proto = String(req.headers["x-forwarded-proto"] || "http").split(",")[0].trim();
  const host = String(req.headers["x-forwarded-host"] || req.headers.host || "localhost").split(",")[0].trim();
  return `${proto}://${host}`;
}

function positiveIntegerOrNull(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

module.exports = { createGitHubOAuthService, sanitizeConnection };
