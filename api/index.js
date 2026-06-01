/**
 * CYVX — Autonomous Infrastructure Intelligence
 * © 2026 Dakota Lee Jonsgaard. All rights reserved.
 * Creator & Architect: Dakota Lee Jonsgaard
 * https://cyvx.ai | dakota@cyvx.ai
 *
 * This software is the exclusive intellectual property
 * of Dakota Lee Jonsgaard. Unauthorized use prohibited.
 */
"use strict";

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { WebSocketServer } = require("ws");
const { CyvxController } = require("../core/controller");
const { PlatformKernel, clone, createObservation } = require("../core/platform");
const { buildMetrics } = require("../core/metrics");
const { GitHubIntegration } = require("../core/integrations/github");
const { buildGithubProofCase } = require("../core/integrations/github_proof");
const { analyzeProofLedger, loadProofLedger, recordProofRunFromProof } = require("../core/platform/proof_ledger");
const { attribution } = require("../core/shared/attribution");
const UI_ROOT = path.join(__dirname, "..", "ui");

function githubInputFromUrl(url) {
  const params = Object.fromEntries(url.searchParams.entries());
  return {
    owner: params.owner || params.repository_owner || null,
    repo: params.repo || params.repository || params.repository_name || null,
    repository: params.full_name || params.repository_full_name || params.repository || null,
    full_name: params.full_name || params.repository_full_name || params.repository || null,
    branch: params.branch || params.default_branch || null,
    state: params.state || 'open',
    per_page: params.per_page || params.limit || 30,
  };
}

async function tryGithubProof(platform, url, github) {
  try {
    return await buildGithubProofCase(platform, Object.assign({ github }, githubInputFromUrl(url)));
  } catch (error) {
    return null;
  }
}

function createApiServer(controller, options = {}) {
  const rateLimits = new Map();
  const apiKey = options.apiKey || process.env.CYVX_API_KEY || "";
  const maxPerMinute = Number(options.maxPerMinute || process.env.CYVX_RATE_LIMIT || 120);
  const platform = options.platform || new PlatformKernel({ filePath: options.platformFile || process.env.CYVX_PLATFORM_STATE });
  const githubFactory = options.githubFactory || (() => new GitHubIntegration(options.githubOptions || {}));
  const server = http.createServer(async (req, res) => {
    try {
      if (req.method === "OPTIONS") {
        return text(res, 204, "");
      }
      if (serveUi(req, res)) {
        return;
      }
      if (!authorize(req, apiKey)) {
        return json(res, 401, wrap({ error: "unauthorized" }));
      }
      if (!rateLimit(req, rateLimits, maxPerMinute)) {
        return json(res, 429, wrap({ error: "rate limit exceeded" }));
      }
      const url = new URL(req.url, "http://localhost");
      if (url.pathname === "/healthz" || url.pathname === "/health") return json(res, 200, wrap({ status: "ok" }));
      if (url.pathname === "/status") return json(res, 200, wrap(controller.status()));
      if (url.pathname === "/api/v1/overview") return json(res, 200, wrap(controller.overview()));
      if (url.pathname === "/api/v1/platform") return json(res, 200, wrap(platform.snapshot()));
      if (url.pathname === "/api/v1/github/repository" && req.method === "GET") {
        const github = githubFactory();
        return json(res, 200, wrap(await github.repositorySnapshot(githubInputFromUrl(url))));
      }
      if (url.pathname === "/api/v1/github/health" && req.method === "GET") {
        const github = githubFactory();
        const snapshot = await github.repositorySnapshot(githubInputFromUrl(url));
        return json(res, 200, wrap(github.repositoryHealthFromSnapshot(snapshot)));
      }
      if (url.pathname === "/api/v1/github/proof" && req.method === "GET") {
        const proof = await buildGithubProofCase(platform, Object.assign({ github: githubFactory() }, githubInputFromUrl(url)));
        const recorded = recordProofRunFromProof(proof, { ledgerPath: options.proofLedgerPath || process.env.CYVX_PROOF_LEDGER_PATH || null });
        proof.proof_ledger_entry = recorded.entry;
        proof.proof_ledger = recorded.tribunal;
        proof.tribunal = recorded.tribunal;
        return json(res, 200, wrap({ repositoryHealth: proof.repositoryHealth || proof.repository_health || platform.repositoryHealth(), proof, proofLedger: recorded.tribunal }));
      }
      if (url.pathname === "/api/v1/repository-health") {
        const github = githubFactory();
        try {
          const snapshot = await github.repositorySnapshot(githubInputFromUrl(url));
          return json(res, 200, wrap(github.repositoryHealthFromSnapshot(snapshot)));
        } catch (error) {
          return json(res, 200, wrap(platform.repositoryHealth()));
        }
      }
      if (url.pathname === "/api/v1/proof") {
        const proof = await tryGithubProof(platform, url, githubFactory());
        if (proof) {
          const recorded = recordProofRunFromProof(proof, { ledgerPath: options.proofLedgerPath || process.env.CYVX_PROOF_LEDGER_PATH || null });
          proof.proof_ledger_entry = recorded.entry;
          proof.proof_ledger = recorded.tribunal;
          proof.tribunal = recorded.tribunal;
          return json(res, 200, wrap({ repositoryHealth: proof.repositoryHealth || proof.repository_health || platform.repositoryHealth(), proof, proofLedger: recorded.tribunal }));
        }
        return json(res, 200, wrap({ repositoryHealth: platform.repositoryHealth(), proof: platform.proof() }));
      }
      if (url.pathname === "/api/v1/reality-engine") {
        return json(res, 200, wrap(platform.realityEngine ? platform.realityEngine() : {}));
      }
      if (url.pathname === "/api/v1/proof-ledger") {
        return json(res, 200, wrap({ proofLedger: analyzeProofLedger(loadProofLedger({ ledgerPath: options.proofLedgerPath || process.env.CYVX_PROOF_LEDGER_PATH || null })) }));
      }
      if (url.pathname === "/api/v1/thesis") {
        return json(res, 200, wrap({ thesis: platform.thesisDashboard(), thesisReport: platform.thesisReport(), thesisEngine: platform.thesisEngine(), thesisBeliefs: platform.thesisBeliefs(), thesisVerdicts: platform.thesisVerdicts() }));
      }
      if (url.pathname === "/api/v1/thesis-report") {
        return json(res, 200, wrap({ thesisReport: platform.thesisReport(), thesis: platform.thesisDashboard() }));
      }
      if (url.pathname === "/api/v1/decision-intelligence") {
        return json(res, 200, wrap({ decisionIntelligence: platform.decisionIntelligence(), dailyDecisionBrief: platform.dailyDecisionBrief(), truthModel: platform.truthModel(), decisionImprovementRate: platform.decisionImprovementRate(), decisionMemories: platform.decisionMemories(), decisionQualityRecords: platform.decisionQualityRecords(), decisionCalibrationRecords: platform.decisionCalibrationRecords() }));
      }
      if (url.pathname === "/api/v1/daily-decision-brief") {
        return json(res, 200, wrap({ dailyDecisionBrief: platform.dailyDecisionBrief(), decisionIntelligence: platform.decisionIntelligence(), truthModel: platform.truthModel() }));
      }
      if (url.pathname === "/api/v1/truth-model") {
        return json(res, 200, wrap({ truthModel: platform.truthModel(), decisionIntelligence: platform.decisionIntelligence() }));
      }
      if (url.pathname === "/api/v1/tribunal") {
        return json(res, 200, wrap({ tribunal: analyzeProofLedger(loadProofLedger({ ledgerPath: options.proofLedgerPath || process.env.CYVX_PROOF_LEDGER_PATH || null })) }));
      }
      if (url.pathname === "/api/v1/dashboard") {
        const github = githubFactory();
        let repositoryHealth = platform.repositoryHealth();
        try {
          const snapshot = await github.repositorySnapshot(githubInputFromUrl(url));
          repositoryHealth = github.repositoryHealthFromSnapshot(snapshot);
        } catch (error) {
          repositoryHealth = platform.repositoryHealth();
        }
        return json(res, 200, wrap({
          status: controller.status(),
          overview: controller.overview(),
          health: platform.health(),
          platform: platform.status(),
          executive: platform.executive(),
          repositoryHealth,
          proof: platform.proof(),
          thesis: platform.thesisDashboard(),
          decisionIntelligence: platform.decisionIntelligence(),
          dailyDecisionBrief: platform.dailyDecisionBrief(),
          truthModel: platform.truthModel(),
        }));
      }
      if (url.pathname === "/api/v1/onboard" && req.method === "POST") return json(res, 200, wrap(platform.modelCompany(await readJson(req))));
      if (url.pathname === "/api/v1/observations" && req.method === "GET") return json(res, 200, wrap({ observations: platform.observations() }));
      if (url.pathname === "/api/v1/observations" && req.method === "POST") return json(res, 200, wrap({ observation: platform.createObservation(await readJson(req)) }));
      if (url.pathname === "/api/v1/reality") return json(res, 200, wrap({ reality: platform.reality(), portfolio: platform.portfolio() }));
      if (url.pathname === "/api/v1/criteria" && req.method === "GET") return json(res, 200, wrap({ criteria: platform.criteria() }));
      if (url.pathname === "/api/v1/criteria" && req.method === "POST") return json(res, 200, wrap({ criterion: platform.createCriterion(await readJson(req)) }));
      if (url.pathname === "/api/v1/reality-objects" && req.method === "GET") return json(res, 200, wrap({ realityObjects: platform.realityObjects() }));
      if (url.pathname === "/api/v1/reality-objects" && req.method === "POST") return json(res, 200, wrap({ realityObject: platform.createRealityObject(await readJson(req)) }));
      if (url.pathname === "/api/v1/significance" && req.method === "GET") return json(res, 200, wrap({ significanceRecords: platform.significanceRecords() }));
      if (url.pathname === "/api/v1/significance" && req.method === "POST") return json(res, 200, wrap({ significanceRecord: platform.generateSignificance(await readJson(req)) }));
      if (url.pathname === "/api/v1/goals" && req.method === "GET") return json(res, 200, wrap({ goals: platform.goals() }));
      if (url.pathname === "/api/v1/goals" && req.method === "POST") return json(res, 200, wrap({ goal: platform.createGoal(await readJson(req)) }));
      if (url.pathname === "/api/v1/initiatives" && req.method === "GET") return json(res, 200, wrap({ initiatives: platform.initiatives() }));
      if (url.pathname === "/api/v1/initiatives" && req.method === "POST") return json(res, 200, wrap({ initiative: platform.createInitiative(await readJson(req)) }));
      if (url.pathname === "/api/v1/constraints" && req.method === "GET") return json(res, 200, wrap({ constraints: platform.constraints() }));
      if (url.pathname === "/api/v1/constraints" && req.method === "POST") return json(res, 200, wrap({ constraint: platform.createConstraint(await readJson(req)) }));
      if (url.pathname === "/api/v1/opportunities" && req.method === "GET") return json(res, 200, wrap({ opportunities: platform.opportunities() }));
      if (url.pathname === "/api/v1/opportunities" && req.method === "POST") return json(res, 200, wrap({ opportunity: platform.createOpportunity(await readJson(req)) }));
      if (url.pathname === "/api/v1/trust" && req.method === "GET") return json(res, 200, wrap({ trusts: platform.trusts() }));
      if (url.pathname === "/api/v1/trust" && req.method === "POST") return json(res, 200, wrap({ trust: platform.createTrust(await readJson(req)) }));
      if (url.pathname === "/api/v1/patterns" && req.method === "GET") return json(res, 200, wrap({ patterns: platform.patterns() }));
      if (url.pathname === "/api/v1/patterns" && req.method === "POST") return json(res, 200, wrap({ patterns: platform.generatePatterns(await readJson(req)) }));
      if (url.pathname === "/api/v1/recommendations" && req.method === "GET") return json(res, 200, wrap({ recommendations: platform.recommendations() }));
      if (url.pathname === "/api/v1/recommendations" && req.method === "POST") return json(res, 200, wrap({ recommendations: platform.generateRecommendations(await readJson(req)) }));
      if (url.pathname === "/api/v1/priorities" && req.method === "GET") return json(res, 200, wrap({ priorities: platform.priorities() }));
      if (url.pathname === "/api/v1/priorities" && req.method === "POST") return json(res, 200, wrap({ priorities: platform.calculatePriorities(await readJson(req)) }));
      if (url.pathname === "/api/v1/intelligence") return json(res, 200, wrap(platform.intelligence()));
      if (url.pathname === "/api/v1/entities" && req.method === "GET") return json(res, 200, wrap({ entities: platform.entities() }));
      if (url.pathname === "/api/v1/entities" && req.method === "POST") return json(res, 200, wrap({ entity: platform.createEntity(await readJson(req)) }));
      if (url.pathname === "/api/v1/relationships" && req.method === "GET") return json(res, 200, wrap({ relationships: platform.relationships() }));
      if (url.pathname === "/api/v1/relationships" && req.method === "POST") return json(res, 200, wrap({ relationship: platform.createRelationship(await readJson(req)) }));
      if (url.pathname === "/api/v1/graph") return json(res, 200, wrap(platform.graph()));
      if (url.pathname === "/api/v1/agents" && req.method === "GET") return json(res, 200, wrap({ agents: platform.agents() }));
      if (url.pathname === "/api/v1/agents" && req.method === "POST") return json(res, 200, wrap({ agent: platform.createAgent(await readJson(req)) }));
      if (url.pathname === "/api/v1/missions" && req.method === "GET") return json(res, 200, wrap({ missions: platform.missions() }));
      if (url.pathname === "/api/v1/missions" && req.method === "POST") return json(res, 200, wrap(platform.launchMission(await readJson(req))));
      if (url.pathname === "/api/v1/simulations" && req.method === "GET") return json(res, 200, wrap({ simulations: platform.simulations() }));
      if (url.pathname === "/api/v1/simulations" && req.method === "POST") return json(res, 200, wrap(platform.runSimulation(await readJson(req))));
      if (url.pathname === "/api/v1/reports" && req.method === "GET") return json(res, 200, wrap({ reports: platform.reports() }));
      if (url.pathname === "/api/v1/reports" && req.method === "POST") return json(res, 200, wrap({ report: platform.createReport(await readJson(req)) }));
      if (url.pathname === "/api/v1/objectives" && req.method === "GET") return json(res, 200, wrap({ objectives: platform.objectives() }));
      if (url.pathname === "/api/v1/objectives" && req.method === "POST") return json(res, 200, wrap({ objective: platform.createObjective(await readJson(req)) }));
      if (url.pathname === "/api/v1/decisions" && req.method === "GET") return json(res, 200, wrap({ decisions: platform.decisions() }));
      if (url.pathname === "/api/v1/decisions" && req.method === "POST") return json(res, 200, wrap({ decision: platform.createDecision(await readJson(req)) }));
      if (url.pathname === "/api/v1/interventions" && req.method === "GET") return json(res, 200, wrap({ interventions: platform.interventions() }));
      if (url.pathname === "/api/v1/interventions" && req.method === "POST") return json(res, 200, wrap({ intervention: platform.createIntervention(await readJson(req)) }));
      if (url.pathname === "/api/v1/outcomes" && req.method === "GET") return json(res, 200, wrap({ outcomes: platform.outcomes() }));
      if (url.pathname === "/api/v1/outcomes" && req.method === "POST") return json(res, 200, wrap({ outcome: platform.recordOutcome(await readJson(req)) }));
      if (url.pathname === "/api/v1/knowledge" && req.method === "GET") return json(res, 200, wrap({ knowledgeRecords: platform.knowledgeRecords() }));
      if (url.pathname === "/api/v1/knowledge" && req.method === "POST") return json(res, 200, wrap({ knowledgeRecord: platform.createKnowledgeRecord(await readJson(req)) }));
      if (url.pathname === "/api/v1/capabilities" && req.method === "GET") return json(res, 200, wrap({ capabilities: platform.capabilities() }));
      if (url.pathname === "/api/v1/capabilities" && req.method === "POST") return json(res, 200, wrap({ capability: platform.createCapability(await readJson(req)) }));
      if (url.pathname === "/api/v1/humans" && req.method === "GET") return json(res, 200, wrap({ humans: platform.humans() }));
      if (url.pathname === "/api/v1/humans" && req.method === "POST") return json(res, 200, wrap({ human: platform.createHuman(await readJson(req)) }));
      if (url.pathname === "/api/v1/resources" && req.method === "GET") return json(res, 200, wrap({ resources: platform.resources() }));
      if (url.pathname === "/api/v1/resources" && req.method === "POST") return json(res, 200, wrap({ resource: platform.createResource(await readJson(req)) }));
      if (url.pathname === "/api/v1/assignments" && req.method === "GET") return json(res, 200, wrap({ assignments: platform.assignments() }));
      if (url.pathname === "/api/v1/assignments" && req.method === "POST") return json(res, 200, wrap({ assignment: platform.assignMission(await readJson(req)) }));
      if (url.pathname === "/api/v1/approvals" && req.method === "GET") return json(res, 200, wrap({ approvals: platform.approvals() }));
      if (url.pathname === "/api/v1/approvals" && req.method === "POST") return json(res, 200, wrap({ approval: platform.createApproval(await readJson(req)) }));
      if (url.pathname === "/api/v1/queue" && req.method === "GET") return json(res, 200, wrap({ queue: platform.queue() }));
      if (url.pathname === "/api/v1/queue" && req.method === "POST") return json(res, 200, wrap({ queueItem: platform.enqueueMission(await readJson(req)) }));
      if (url.pathname === "/api/v1/next-best-action" && req.method === "GET") return json(res, 200, wrap({ nextBestActions: platform.nextBestActions() }));
      if (url.pathname === "/api/v1/next-best-action" && req.method === "POST") return json(res, 200, wrap({ nextBestAction: platform.nextBestAction(await readJson(req)) }));
      if (url.pathname === "/api/v1/coordination" && req.method === "GET") return json(res, 200, wrap(platform.coordination()));
      if (url.pathname === "/api/v1/coordination" && req.method === "POST") return json(res, 200, wrap(platform.coordinateScenario(await readJson(req))));
      if (url.pathname === "/api/v1/commands" && req.method === "GET") return json(res, 200, wrap({ commands: platform.commands() }));
      if (url.pathname === "/api/v1/commands" && req.method === "POST") return json(res, 200, wrap(platform.command(await readJson(req))));
      if (url.pathname === "/api/v1/events" && req.method === "GET") return json(res, 200, wrap({ events: platform.events(Object.fromEntries(url.searchParams.entries())) }));
      if (url.pathname === "/api/v1/events" && req.method === "POST") return json(res, 200, wrap({ event: platform.createEvent(await readJson(req)) }));
      if (url.pathname === "/api/v1/executive") return json(res, 200, wrap(platform.executive()));
      if (url.pathname === "/api/v1/evolution" && req.method === "GET") return json(res, 200, wrap({ evolutionRecommendations: platform.evolutionRecommendations() }));
      if (url.pathname === "/api/v1/evolution" && req.method === "POST") return json(res, 200, wrap({ evolutionRecommendation: platform.createEvolutionRecommendation(await readJson(req)) }));
      if (url.pathname === "/api/v1/cir") return json(res, 200, wrap(platform.cir()));
      if (url.pathname === "/api/v1/kernel") return json(res, 200, wrap(platform.kernel()));
      if (url.pathname === "/api/v1/insights") return json(res, 200, wrap({ insights: controller.insights(), health: controller.overview().health }));
      if (url.pathname === "/v1/agents") return json(res, 200, wrap({ agents: controller.agentsSnapshot() }));
      if (url.pathname === "/v1/leaderboard") return json(res, 200, wrap({ leaderboard: controller.leaderboard() }));
      if (url.pathname === "/v1/roadmap") return json(res, 200, wrap(controller.roadmap()));
      if (url.pathname === "/api/v1/cluster") return json(res, 200, wrap(controller.snapshot().cluster));
      if (url.pathname === "/api/v1/metrics/history") return json(res, 200, wrap({ history: controller.history() }));
      if (url.pathname === "/api/v1/status-model") return json(res, 200, wrap(controller.statusModel.snapshot().data));
      if (url.pathname === "/metrics") return text(res, 200, promMetrics(controller));
      if (url.pathname === "/ask" && req.method === "POST") return json(res, 200, wrap(await parseAsk(req, controller)));
      if (url.pathname === "/api/v1/command" && req.method === "POST") return json(res, 200, wrap(await handleCommand(req, controller)));
      if (url.pathname === "/api/v1/workloads") return json(res, 200, wrap(await handleWorkloads(req, controller)));
      if (url.pathname === "/api/v1/actions") return json(res, 200, wrap(await handleActions(req, controller)));
      if (url.pathname === "/api/v1/state") return json(res, 200, wrap(controller.snapshot()));
      return json(res, 404, wrap({ error: "not found" }));
    } catch (error) {
      return json(res, 500, wrap({ error: error.message }));
    }
  });

  const wss = new WebSocketServer({ noServer: true });
  server.on("upgrade", (req, socket, head) => {
    const url = new URL(req.url, "http://localhost");
    if (url.pathname !== "/ws") {
      socket.destroy();
      return;
    }
    if (!authorize(req, apiKey)) {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => controller.registerSocket(ws));
  });

  return { server, wss };
}

function serveUi(req, res) {
  const url = new URL(req.url, "http://localhost");
  const requestPath = url.pathname === "/" ? "/index.html" : url.pathname;
  const relative = requestPath.replace(/^\/+/, "");
  const filePath = path.join(UI_ROOT, relative);
  if (!filePath.startsWith(UI_ROOT) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    return false;
  }
  const type = filePath.endsWith(".html")
    ? "text/html; charset=utf-8"
    : filePath.endsWith(".css")
      ? "text/css; charset=utf-8"
      : filePath.endsWith(".js")
        ? "application/javascript; charset=utf-8"
        : "application/octet-stream";
  res.statusCode = 200;
  res.setHeader("content-type", type);
  res.setHeader("access-control-allow-origin", "*");
  res.setHeader("access-control-allow-headers", "content-type, authorization, x-api-key");
  res.setHeader("access-control-allow-methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
  fs.createReadStream(filePath).pipe(res);
  return true;
}

async function parseAsk(req, controller) {
  const body = await readJson(req);
  return controller.ask(body.task || body.prompt || "", body.context || body);
}

async function handleWorkloads(req, controller) {
  if (req.method === "GET") return { workloads: controller.snapshot().cluster.workloads };
  if (req.method === "POST") {
    const body = await readJson(req);
    return controller.submitWorkload(body);
  }
  return { error: "method not allowed" };
}

async function handleActions(req, controller) {
  if (req.method === "GET") return { actions: controller.actions };
  if (req.method === "POST") {
    const body = await readJson(req);
    return controller.executeAction(body);
  }
  return { error: "method not allowed" };
}

async function handleCommand(req, controller) {
  const body = await readJson(req);
  const command = String(body.command || body.task || body.prompt || "").trim();
  const normalized = command.toLowerCase();
  const mode = String(body.mode || body.type || "").toLowerCase();
  if (mode === "workload" || normalized.startsWith("workload:")) {
    return controller.submitWorkload(body.workload || body);
  }
  if (mode === "action" || normalized.startsWith("action:") || normalized.startsWith("scale") || normalized.includes("migrate")) {
    return controller.executeAction(body.action || inferAction(command, body));
  }
  return controller.ask(command, body.context || body);
}

function inferAction(command, body = {}) {
  const normalized = String(command || "").toLowerCase();
  if (normalized.startsWith("scale")) {
    return {
      type: body.type || "scale_up",
      workload_id: body.workload_id || normalized.replace(/^scale\s+/i, "") || "workload-1",
      replicas: Number(body.replicas || 4),
    };
  }
  if (normalized.includes("migrate")) {
    return {
      type: body.type || "migrate",
      workload_id: body.workload_id || normalized.replace(/^migrate\s+/i, "") || "workload-1",
      node_id: body.node_id || "node-1",
    };
  }
  return body.action || body;
}

function promMetrics(controller) {
  const metrics = buildMetrics(controller).data;
  return [
    "# HELP cyvx_agents_total Number of active agents",
    "# TYPE cyvx_agents_total gauge",
    `cyvx_agents_total ${metrics.agents}`,
    "# HELP cyvx_events_total Number of CYVX events",
    "# TYPE cyvx_events_total counter",
    `cyvx_events_total ${metrics.events}`,
    "# HELP cyvx_evolution_cycles_total Number of evolution cycles",
    "# TYPE cyvx_evolution_cycles_total counter",
    `cyvx_evolution_cycles_total ${metrics.evolutionCycles}`,
  ].join("\n") + "\n";
}

function wrap(payload) {
  return {
    powered_by: "CYVX",
    creator: attribution.creator,
    version: "6.0.0",
    timestamp: new Date().toISOString(),
    ...payload,
  };
}

function authorize(req, apiKey) {
  if (!apiKey) return true;
  const header = req.headers["x-api-key"] || req.headers.authorization || "";
  const token = String(header).replace(/^Bearer\s+/i, "");
  return token === apiKey;
}

function rateLimit(req, buckets, maxPerMinute) {
  const key = req.headers["x-api-key"] || req.socket.remoteAddress || "local";
  const now = Date.now();
  const bucket = buckets.get(key) || { start: now, count: 0 };
  if (now - bucket.start > 60_000) {
    bucket.start = now;
    bucket.count = 0;
  }
  bucket.count += 1;
  buckets.set(key, bucket);
  return bucket.count <= maxPerMinute;
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
      if (data.length > 1_000_000) reject(new Error("payload too large"));
    });
    req.on("end", () => {
      if (!data) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function json(res, status, payload) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json");
  res.setHeader("access-control-allow-origin", "*");
  res.setHeader("access-control-allow-headers", "content-type, authorization, x-api-key");
  res.setHeader("access-control-allow-methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
  res.end(JSON.stringify(payload));
}

function text(res, status, payload) {
  res.statusCode = status;
  res.setHeader("content-type", "text/plain; version=0.0.4");
  res.setHeader("access-control-allow-origin", "*");
  res.setHeader("access-control-allow-headers", "content-type, authorization, x-api-key");
  res.setHeader("access-control-allow-methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
  res.end(payload);
}

async function main() {
  const controller = new CyvxController({
    port: Number(process.env.CYVX_PORT || 3000),
    dbFile: process.env.CYVX_DB || undefined,
  });
  await controller.boot();
  const { server } = createApiServer(controller, {});
  const port = Number(process.env.CYVX_PORT || 3000);
  const host = process.env.CYVX_HOST || "0.0.0.0";
  server.listen(port, host, () => {
    console.log(`CYVX listening on http://${host}:${port}`);
    console.log(JSON.stringify(wrap(controller.status()), null, 2));
  });
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = {
  createApiServer,
  wrap,
};
