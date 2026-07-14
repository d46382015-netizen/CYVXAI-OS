#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");

function apply(file, replacements) {
  let source = fs.readFileSync(file, "utf8");
  for (const [search, replacement, label, expected = 1] of replacements) {
    const count = source.split(search).length - 1;
    if (count === 0 && source.includes(replacement)) continue;
    if (count !== expected) throw new Error(`${label}: expected ${expected} match(es), found ${count}`);
    source = expected === 1 ? source.replace(search, replacement) : source.split(search).join(replacement);
  }
  fs.writeFileSync(file, source);
}

apply(path.resolve(__dirname, "../api/public.js"), [
  [
    'const { createMissionRuntime } = require("../runtime/missions");',
    'const { createMissionRuntime } = require("../runtime/missions");\nconst { createUniversalOperatorRuntime } = require("../services/operator/universal-server");',
    "public operator import",
  ],
  [
    '  const publicServer = http.createServer(async (req, res) => {',
    '  const operatorRuntime = createUniversalOperatorRuntime({\n    runtime: missions,\n    nodeEnv: options.nodeEnv || process.env.NODE_ENV,\n    corsAllowlist: options.operatorCorsAllowlist || process.env.CYVX_OPERATOR_CORS_ALLOWLIST || process.env.APP_BASE_URL || "",\n    publicBaseUrl: options.publicBaseUrl || process.env.CYVX_PUBLIC_BASE_URL || process.env.APP_BASE_URL || "",\n  });\n\n  const publicServer = http.createServer(async (req, res) => {',
    "create public operator runtime",
  ],
  [
    '      if (isMissionRoute(url.pathname)) return missions.handle(req, res, url);\n      cyvx.integrations.edge.require(req, url);',
    '      if (isMissionRoute(url.pathname)) return missions.handle(req, res, url);\n      if (isOperatorRoute(url.pathname)) return operatorRuntime.handle(req, res, url);\n      cyvx.integrations.edge.require(req, url);',
    "route public operator surfaces",
  ],
  [
    '        const health = publicHealth(cyvx, spark.runtime, missions);',
    '        const health = publicHealth(cyvx, spark.runtime, missions, operatorRuntime);',
    "health and readiness include operator",
    2,
  ],
  [
    '        return sendJson(res, 200, publicStatus(cyvx, spark.runtime, missions));',
    '        return sendJson(res, 200, publicStatus(cyvx, spark.runtime, missions, operatorRuntime));',
    "status includes operator",
  ],
  [
    '    missions,\n    sparkInternalKey,',
    '    missions,\n    operatorRuntime,\n    sparkInternalKey,',
    "return operator runtime",
  ],
  [
    'function isSparkStaticRoute(pathname) {',
    'function isOperatorRoute(pathname) {\n  return pathname === "/operator" || pathname === "/universal" || pathname === "/revenue" || pathname === "/operator/revenue" ||\n    pathname.startsWith("/e/") || pathname.startsWith("/c/") || pathname.startsWith("/v/") ||\n    pathname.startsWith("/api/v1/operator") || pathname.startsWith("/api/v2/operator") || pathname.startsWith("/api/v3/revenue");\n}\n\nfunction isSparkStaticRoute(pathname) {',
    "operator route predicate",
  ],
  [
    'function publicHealth(cyvx, sparkRuntime, missionRuntime) {',
    'function publicHealth(cyvx, sparkRuntime, missionRuntime, operatorRuntime) {',
    "health signature",
  ],
  [
    '  const sparkHealthy = sparkHealth.status === "ok";\n  const integrationsHealthy = !integrations.required || integrations.ready;\n  const ok = cyvxHealthy && sparkHealthy && integrationsHealthy && Boolean(mission.dependencies.database && mission.dependencies.database.ready);',
    '  let operator = { universal: { ok: false }, revenue: { database: false } };\n  try { operator = operatorRuntime ? operatorRuntime.health() : operator; } catch (error) { operator = { universal: { ok: false, error: error.message }, revenue: { database: false } }; }\n  const sparkHealthy = sparkHealth.status === "ok";\n  const integrationsHealthy = !integrations.required || integrations.ready;\n  const operatorHealthy = Boolean(operator.universal && operator.universal.ok && operator.revenue && operator.revenue.database);\n  const ok = cyvxHealthy && sparkHealthy && integrationsHealthy && operatorHealthy && Boolean(mission.dependencies.database && mission.dependencies.database.ready);',
    "health requires revenue runtime",
  ],
  [
    '    service: "Spark + CYVX + Mission Runtime",\n    version: "8.1.0-runtime",',
    '    service: "Spark + CYVX + Mission + Universal + Revenue Runtime",\n    version: "8.3.0-runtime",',
    "health service version",
  ],
  [
    '      missions: mission,\n      github: { configured: github.ready },',
    '      missions: mission,\n      universal_operator: operator.universal,\n      revenue_operator: operator.revenue,\n      github: { configured: github.ready },',
    "health service records",
  ],
  [
    'function publicStatus(cyvx, sparkRuntime, missionRuntime) {',
    'function publicStatus(cyvx, sparkRuntime, missionRuntime, operatorRuntime) {',
    "status signature",
  ],
  [
    '  const integrations = cyvx.integrations ? cyvx.integrations.snapshot() : { ready: true, required: false, providers: {} };\n  return {',
    '  const integrations = cyvx.integrations ? cyvx.integrations.snapshot() : { ready: true, required: false, providers: {} };\n  const operator = operatorRuntime ? operatorRuntime.health() : null;\n  return {',
    "status operator snapshot",
  ],
  [
    '    powered_by: "Spark + CYVX + Mission Runtime",\n    version: "8.1.0-runtime",',
    '    powered_by: "Spark + CYVX + Mission + Universal + Revenue Runtime",\n    version: "8.3.0-runtime",',
    "status service version",
  ],
  [
    '    mission_runtime: missionRuntime ? missionRuntime.readiness() : null,\n    github:',
    '    mission_runtime: missionRuntime ? missionRuntime.readiness() : null,\n    universal_operator: operator && operator.universal || null,\n    revenue_operator: operator && operator.revenue || null,\n    github:',
    "status operator records",
  ],
  [
    '    links: { spark: "/", cyvx_os: "/os", missions: "/missions", health: "/healthz", readiness: "/readyz", worlds: "/api/public/worlds" },',
    '    links: { spark: "/", cyvx_os: "/os", missions: "/missions", operator: "/operator", revenue: "/revenue", health: "/healthz", readiness: "/readyz", worlds: "/api/public/worlds" },',
    "status public links",
  ],
  [
    '    process.stdout.write(`${JSON.stringify({ event: "cyvx.public.ready", ports: runtime.ports, powered_by: "Spark + CYVX + Mission Runtime" })}\\n`);',
    '    process.stdout.write(`${JSON.stringify({ event: "cyvx.public.ready", ports: runtime.ports, powered_by: "Spark + CYVX + Mission + Universal + Revenue Runtime" })}\\n`);',
    "startup product label",
  ],
  [
    '  assertDistinctPorts, canonicalSparkApiPath, createPublicRuntime, isAllowedPublicSparkApi, isMissionRoute,',
    '  assertDistinctPorts, canonicalSparkApiPath, createPublicRuntime, isAllowedPublicSparkApi, isMissionRoute, isOperatorRoute,',
    "export operator predicate",
  ],
]);

apply(path.resolve(__dirname, "../start.sh"), [
  [
    'echo "Health:       http://${CYVX_PUBLIC_HOST}:${PUBLIC_PORT}/healthz"',
    'echo "Operator:     http://${CYVX_PUBLIC_HOST}:${PUBLIC_PORT}/operator"\necho "Revenue:      http://${CYVX_PUBLIC_HOST}:${PUBLIC_PORT}/revenue"\necho "Health:       http://${CYVX_PUBLIC_HOST}:${PUBLIC_PORT}/healthz"',
    "public startup links",
  ],
]);

apply(path.resolve(__dirname, "../.github/workflows/deploy-public.yml"), [
  [
    '      - spark/**\n      - ui/**',
    '      - spark/**\n      - services/operator/**\n      - services/revenue/**\n      - runtime/missions/**\n      - ui/**',
    "public deployment paths",
    2,
  ],
  [
    '          curl -fsS "$BASE/os" | grep \'CYVX\'\n          curl -fsS "$BASE/healthz" | node -e',
    '          curl -fsS "$BASE/os" | grep \'CYVX\'\n          curl -fsS "$BASE/operator" | grep \'CYVX Universal Operator\'\n          curl -fsS "$BASE/revenue" | grep \'Venture Revenue Engine\'\n          curl -fsS "$BASE/api/v3/revenue/health" | grep \'cyvx-venture-revenue-engine\'\n          curl -fsS "$BASE/healthz" | node -e',
    "public revenue smoke tests",
  ],
]);

apply(path.resolve(__dirname, "../render.yaml"), [
  [
    '      - key: CYVX_EMAIL_REPLY_TO\n        sync: false\n      - key: RESEND_API_KEY\n        sync: false',
    '      - key: CYVX_EMAIL_REPLY_TO\n        sync: false\n      - key: CYVX_BUSINESS_POSTAL_ADDRESS\n        sync: false\n      - key: RESEND_API_KEY\n        sync: false',
    "Render postal address variables",
    2,
  ],
]);

process.stdout.write(`${JSON.stringify({ ok: true })}\n`);