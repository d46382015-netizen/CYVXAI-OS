"use strict";

const ROLE_PERMISSIONS = Object.freeze({
  owner: ["*"],
  admin: [
    "integrations:read", "integrations:write", "flags:read", "flags:write",
    "jobs:read", "jobs:write", "email:send", "billing:read", "billing:write",
    "analytics:write", "ai:score", "actions:execute", "deployments:approve",
  ],
  operator: [
    "integrations:read", "flags:read", "jobs:read", "jobs:write",
    "email:send", "billing:read", "analytics:write", "ai:score", "actions:execute",
  ],
  developer: ["integrations:read", "flags:read", "jobs:read", "analytics:write", "ai:score"],
  viewer: ["integrations:read", "flags:read", "jobs:read", "billing:read"],
  service: ["integrations:read", "flags:read", "jobs:read", "jobs:write", "email:send", "analytics:write", "ai:score", "actions:execute"],
});

const PRIVILEGED_PERMISSIONS = new Set([
  "integrations:write", "flags:write", "email:send", "billing:write",
  "actions:execute", "deployments:approve",
]);

class AuthorizationPolicy {
  constructor(options = {}) {
    this.requireMfaForPrivileged = options.requireMfaForPrivileged ?? truthy(process.env.CYVX_REQUIRE_MFA_FOR_PRIVILEGED ?? "true");
  }

  can(context, permission, options = {}) {
    if (!context || !context.authenticated) return false;
    if (!sameTenant(context, options.tenantId)) return false;
    const permissions = permissionsFor(context.roles || [context.role]);
    if (!permissions.has("*") && !permissions.has(permission)) return false;
    if ((options.requireMfa || (this.requireMfaForPrivileged && PRIVILEGED_PERMISSIONS.has(permission))) && context.kind !== "service") {
      return context.aal === "aal2";
    }
    return true;
  }

  require(context, permission, options = {}) {
    if (!context || !context.authenticated) throw denied("AUTHENTICATION_REQUIRED", 401, "Authentication is required.");
    if (!sameTenant(context, options.tenantId)) throw denied("TENANT_ACCESS_DENIED", 403, "The authenticated identity does not control this tenant.");
    const permissions = permissionsFor(context.roles || [context.role]);
    if (!permissions.has("*") && !permissions.has(permission)) throw denied("PERMISSION_DENIED", 403, `Permission ${permission} is required.`);
    if ((options.requireMfa || (this.requireMfaForPrivileged && PRIVILEGED_PERMISSIONS.has(permission))) && context.kind !== "service" && context.aal !== "aal2") {
      throw denied("MFA_REQUIRED", 403, "A verified second factor is required for this operation.");
    }
    return context;
  }

  snapshot() {
    return {
      roles: Object.keys(ROLE_PERMISSIONS),
      privileged_permissions: [...PRIVILEGED_PERMISSIONS],
      require_mfa_for_privileged: this.requireMfaForPrivileged,
    };
  }
}

function permissionsFor(roles) {
  const result = new Set();
  for (const rawRole of Array.isArray(roles) ? roles : [roles]) {
    const role = normalizeRole(rawRole);
    for (const permission of ROLE_PERMISSIONS[role] || []) result.add(permission);
  }
  return result;
}

function sameTenant(context, requestedTenantId) {
  if (!requestedTenantId) return true;
  if (context.kind === "service" && context.tenant_id === "*") return true;
  return Boolean(context.tenant_id) && String(context.tenant_id) === String(requestedTenantId);
}

function normalizeRole(value) {
  const role = String(value || "viewer").trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(ROLE_PERMISSIONS, role) ? role : "viewer";
}

function denied(code, statusCode, message) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  return error;
}

function truthy(value) {
  return ["1", "true", "yes", "on"].includes(String(value || "").trim().toLowerCase());
}

module.exports = {
  AuthorizationPolicy,
  PRIVILEGED_PERMISSIONS,
  ROLE_PERMISSIONS,
  normalizeRole,
  permissionsFor,
  sameTenant,
};
