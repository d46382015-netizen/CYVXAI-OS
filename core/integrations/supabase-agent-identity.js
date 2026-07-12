"use strict";

const {
  SupabaseServiceRuntime,
  deterministicAgentEmail,
  randomPassword,
  decodeJwtPayload
} = require("./supabase-service-runtime");

class SupabaseAgentIdentityIssuer {
  constructor(options = {}) {
    this.service = options.service || new SupabaseServiceRuntime(options);
    this.logger = options.logger || { write() {} };
  }

  async issue(input = {}) {
    const organizationId = String(input.organizationId || "").trim();
    const agentId = String(input.agentId || "").trim();
    if (!organizationId || !agentId) throw new TypeError("organizationId and agentId are required");

    const serviceClient = this.service.createServiceClient();
    const { data: agent, error: agentError } = await serviceClient
      .from("agents")
      .select("id,organization_id,status,token_version,name")
      .eq("organization_id", organizationId)
      .eq("id", agentId)
      .maybeSingle();
    if (agentError) throw agentError;
    if (!agent) {
      const error = new Error("Agent is not registered in the target organization");
      error.code = "AGENT_NOT_FOUND";
      error.status = 404;
      throw error;
    }
    if (agent.status !== "active") {
      const error = new Error(`Agent status ${agent.status} cannot receive a token`);
      error.code = "AGENT_NOT_ACTIVE";
      error.status = 409;
      throw error;
    }

    const email = deterministicAgentEmail(organizationId, agentId);
    const password = randomPassword();
    const claims = {
      organization_id: organizationId,
      agent_id: agentId,
      agent_token_version: Number(agent.token_version)
    };
    const ensured = await this.service.ensureUser({
      email,
      password,
      appMetadata: claims,
      userMetadata: {
        cyvx_identity_type: "agent",
        cyvx_agent_name: agent.name || agentId
      }
    });
    const signedIn = await this.service.signInWithPassword(email, password);
    const payload = decodeJwtPayload(signedIn.session.access_token) || {};
    const appMetadata = payload.app_metadata || {};
    if (
      appMetadata.organization_id !== organizationId ||
      appMetadata.agent_id !== agentId ||
      Number(appMetadata.agent_token_version) !== Number(agent.token_version)
    ) {
      const error = new Error("Issued Supabase token is missing required CYVX agent claims");
      error.code = "AGENT_TOKEN_CLAIMS_INVALID";
      error.status = 500;
      throw error;
    }

    this.logger.write("info", "supabase.agent_token_issued", {
      organization_id: organizationId,
      agent_id: agentId,
      auth_user_id: ensured.user.id,
      token_version: Number(agent.token_version),
      created_identity: ensured.created
    });

    return {
      organization_id: organizationId,
      agent_id: agentId,
      auth_user_id: ensured.user.id,
      token_version: Number(agent.token_version),
      access_token: signedIn.session.access_token,
      refresh_token: signedIn.session.refresh_token,
      expires_at: signedIn.session.expires_at,
      expires_in: signedIn.session.expires_in,
      token_type: signedIn.session.token_type,
      created_identity: ensured.created
    };
  }

  async revoke(input = {}) {
    const organizationId = String(input.organizationId || "").trim();
    const agentId = String(input.agentId || "").trim();
    if (!organizationId || !agentId) throw new TypeError("organizationId and agentId are required");
    const serviceClient = this.service.createServiceClient();
    const { data: current, error: readError } = await serviceClient
      .from("agents")
      .select("token_version")
      .eq("organization_id", organizationId)
      .eq("id", agentId)
      .single();
    if (readError) throw readError;
    const nextVersion = Number(current.token_version) + 1;
    const { error: updateError } = await serviceClient
      .from("agents")
      .update({ token_version: nextVersion })
      .eq("organization_id", organizationId)
      .eq("id", agentId);
    if (updateError) throw updateError;

    const email = deterministicAgentEmail(organizationId, agentId);
    const authUser = await this.service.findUserByEmail(email);
    if (authUser) {
      const { error } = await serviceClient.auth.admin.updateUserById(authUser.id, {
        app_metadata: {
          organization_id: organizationId,
          agent_id: agentId,
          agent_token_version: nextVersion
        }
      });
      if (error) throw error;
    }
    this.logger.write("warn", "supabase.agent_tokens_revoked", {
      organization_id: organizationId,
      agent_id: agentId,
      token_version: nextVersion
    });
    return { organization_id: organizationId, agent_id: agentId, token_version: nextVersion };
  }
}

module.exports = {
  SupabaseAgentIdentityIssuer
};
