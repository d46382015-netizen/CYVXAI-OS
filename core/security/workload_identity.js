"use strict";

class WorkloadIdentity {
  constructor(options = {}) {
    this.env = options.env || process.env;
    this.fetch = options.fetch || globalThis.fetch;
    this.audience = String(options.audience || this.env.CYVX_WORKLOAD_IDENTITY_AUDIENCE || "cyvx-production").trim();
    this.exchangeUrl = String(options.exchangeUrl || this.env.CYVX_WORKLOAD_IDENTITY_EXCHANGE_URL || "").trim();
    this.metrics = { requested: 0, exchanged: 0, failures: 0, last_success_at: null, last_error: null };
  }

  available() {
    return Boolean(this.env.ACTIONS_ID_TOKEN_REQUEST_URL && this.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN && typeof this.fetch === "function");
  }

  configured() { return this.available() && Boolean(this.exchangeUrl); }

  async token() {
    if (!this.available()) throw coded("GITHUB_OIDC_UNAVAILABLE", "GitHub Actions OIDC environment is not available.");
    this.metrics.requested += 1;
    try {
      const requestUrl = new URL(this.env.ACTIONS_ID_TOKEN_REQUEST_URL);
      requestUrl.searchParams.set("audience", this.audience);
      const response = await this.fetch(requestUrl, {
        headers: { authorization: `Bearer ${this.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN}`, accept: "application/json" },
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) throw new Error(`GitHub OIDC token request failed with HTTP ${response.status}`);
      const body = await response.json();
      if (!body || !body.value) throw new Error("GitHub OIDC response did not include a token");
      this.metrics.last_success_at = new Date().toISOString();
      this.metrics.last_error = null;
      return String(body.value);
    } catch (error) {
      this.metrics.failures += 1;
      this.metrics.last_error = error.message;
      throw error;
    }
  }

  async exchange(options = {}) {
    if (!this.exchangeUrl) throw coded("WORKLOAD_IDENTITY_BROKER_UNCONFIGURED", "CYVX_WORKLOAD_IDENTITY_EXCHANGE_URL is not configured.");
    try {
      const subjectToken = options.subjectToken || await this.token();
      const response = await this.fetch(this.exchangeUrl, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({
          grant_type: "urn:ietf:params:oauth:grant-type:token-exchange",
          subject_token_type: "urn:ietf:params:oauth:token-type:jwt",
          requested_token_type: "urn:ietf:params:oauth:token-type:access_token",
          subject_token: subjectToken,
          audience: options.audience || this.audience,
          scope: options.scope || this.env.CYVX_WORKLOAD_IDENTITY_SCOPE || "deploy migrate backup",
          environment: options.environment || this.env.CYVX_ENV || "production",
        }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) throw new Error(`Workload identity exchange failed with HTTP ${response.status}: ${await safeText(response)}`);
      const credentials = await response.json();
      this.metrics.exchanged += 1;
      this.metrics.last_success_at = new Date().toISOString();
      this.metrics.last_error = null;
      return credentials;
    } catch (error) {
      this.metrics.failures += 1;
      this.metrics.last_error = error.message;
      throw error;
    }
  }

  snapshot() {
    return {
      github_oidc_available: this.available(),
      exchange_configured: Boolean(this.exchangeUrl),
      audience: this.audience,
      exchange_host: safeHost(this.exchangeUrl),
      metrics: { ...this.metrics },
    };
  }
}

function safeHost(value) { try { return new URL(value).host; } catch { return null; } }
function coded(code, message) { const error = new Error(message); error.code = code; return error; }
async function safeText(response) { try { return (await response.text()).slice(0, 500); } catch { return ""; } }

module.exports = { WorkloadIdentity };
