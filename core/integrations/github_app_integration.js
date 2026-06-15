"use strict";

const { GitHubIntegration } = require("./github");

class GitHubAppIntegration extends GitHubIntegration {
  constructor(options = {}) {
    super(options.fallbackOptions || options);
    this.appClient = options.appClient;
    this.installationIdProvider = options.installationIdProvider || (() => options.installationId || null);
  }

  async requestJson(pathname, options = {}) {
    const installationId = await this.installationIdProvider();
    if (installationId && this.appClient && typeof this.appClient.requestInstallationJson === "function") {
      return this.appClient.requestInstallationJson(installationId, pathname, options);
    }
    return super.requestJson(pathname, options);
  }

  async authenticationHealth() {
    const installationId = await this.installationIdProvider();
    const appConfigured = Boolean(this.appClient && typeof this.appClient.configured === "function" && this.appClient.configured());
    return {
      mode: installationId && appConfigured ? "github_app_installation" : this.token ? "static_token" : "anonymous",
      installation_connected: Boolean(installationId),
      app: this.appClient && typeof this.appClient.health === "function" ? this.appClient.health() : null,
      fallback_token_configured: Boolean(this.token),
    };
  }
}

module.exports = { GitHubAppIntegration };
