#!/usr/bin/env node
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

const { createApiServer } = require("../api");
const { CyvxController } = require("../core/controller");
const { PlatformKernel } = require("../core/platform");
const { GitHubIntegration } = require("../core/integrations/github");
const { buildGithubProofCase } = require("../core/integrations/github_proof");
const { analyzeProofLedger, loadProofLedger, recordProofRunFromProof } = require("../core/platform/proof_ledger");

const COMMANDS = [
  "status", "health", "graph", "agents", "missions", "simulations", "simulate", "command", "report",
  "events", "observations", "reality", "reality-engine", "portfolio", "decisions", "outcomes", "knowledge", "capabilities", "goals", "initiatives", "constraints", "opportunities", "trust", "patterns", "recommendations", "priorities", "intelligence", "dashboard", "repository-health", "repo-health", "proof", "thesis", "thesis-report", "thesis-dashboard", "github", "github-repository", "github-health", "github-proof", "scan-self", "self-scan-mission",
  "criteria", "reality-objects", "significance", "interventions", "evolution", "cir", "kernel",
  "decision-intelligence", "daily-decision-brief", "truth-model", "decision-improvement",
  "humans", "resources", "assign", "approvals", "queue", "nba", "coordination", "workflow",
  "onboard", "model-company", "leaderboard", "roadmap", "cluster", "workloads", "actions", "metrics", "healthz", "ask", "serve",
];

async function main() {
  const [command = "help", ...args] = process.argv.slice(2);
  if (command === "help" || args.includes("--help")) {
    console.log("CYVX commands (" + COMMANDS.length + "+):\n" + COMMANDS.join(", ") + "\n");
    return;
  }

  if (command === "serve") {
    const controller = new CyvxController({ port: Number(process.env.CYVX_PORT || 3000) });
    await controller.boot();
    const { server } = createApiServer(controller, {});
    server.listen(Number(process.env.CYVX_PORT || 3000), "0.0.0.0");
    return;
  }

  const kernel = new PlatformKernel({ filePath: process.env.CYVX_PLATFORM_STATE });

  switch (command) {
    case "status":
      print(kernel.status());
      return;
    case "health":
    case "healthz":
      print(kernel.health());
      return;
    case "scan-self": {
      const { spawnSync } = require("child_process");
      const result = spawnSync(process.execPath, ["./scripts/cyvx-scan-self.js"], { stdio: "inherit" });
      process.exit(result.status || 0);
    }

    case "self-scan-mission": {
      const { spawnSync } = require("child_process");
      const result = spawnSync(process.execPath, ["./scripts/cyvx-self-scan-mission.js"], { stdio: "inherit" });
      process.exit(result.status || 0);
    }

    case "repository-health":
    case "repo-health": {
      const github = new GitHubIntegration(parseQuery(args));
      print(await github.repositoryHealth(parseQuery(args)));
      return;
    }
    case "proof":
    case "github":
    case "github-proof": {
      const query = parseQuery(args);
      const port = query.port || process.env.CYVX_PORT;
      if (port) {
        try {
          const base = "http://127.0.0.1:" + port;
          const params = new URLSearchParams(query).toString();
          const output = await call("GET", base + "/api/v1/proof" + (params ? "?" + params : ""));
          print(output);
          return;
        } catch (error) {
          // fall back to the local proof builder.
        }
      }
      const proof = await buildGithubProofCase(kernel, query);
      const recorded = recordProofRunFromProof(proof, { ledgerPath: query.ledgerPath || process.env.CYVX_PROOF_LEDGER_PATH || null });
      proof.proof_ledger_entry = recorded.entry;
      proof.proof_ledger = recorded.tribunal;
      proof.tribunal = recorded.tribunal;
      print(proof);
      return;
    }
    case "github-health": {
      const github = new GitHubIntegration(parseQuery(args));
      print(await github.repositoryHealth(parseQuery(args)));
      return;
    }
    case "github-repository": {
      const github = new GitHubIntegration(parseQuery(args));
      print(await github.repositorySnapshot(parseQuery(args)));
      return;
    }
    case "proof-ledger":
    case "tribunal": {
      const query = parseQuery(args);
      if (process.env.CYVX_PORT || query.port) {
        try {
          const base = "http://127.0.0.1:" + (query.port || process.env.CYVX_PORT);
          const route = command === "proof-ledger" ? "/api/v1/proof-ledger" : "/api/v1/tribunal";
          const output = await call("GET", base + route);
          print(output);
          return;
        } catch (error) {}
      }
      const ledger = loadProofLedger({ ledgerPath: query.ledgerPath || process.env.CYVX_PROOF_LEDGER_PATH || null });
      print(analyzeProofLedger(ledger));
      return;
    }
    case "thesis":
    case "thesis-report":
    case "thesis-dashboard": {
      const query = parseQuery(args);
      if (process.env.CYVX_PORT || query.port) {
        try {
          const base = "http://127.0.0.1:" + (query.port || process.env.CYVX_PORT);
          const route = command === "thesis" ? "/api/v1/thesis" : "/api/v1/thesis-report";
          const output = await call("GET", base + route);
          print(output);
          return;
        } catch (error) {}
      }
      print(command === "thesis" ? kernel.thesisDashboard(query) : kernel.thesisReport(query));
      return;
    }
    case "decision-intelligence":
    case "daily-decision-brief":
    case "truth-model":
    case "decision-improvement": {
      const query = parseQuery(args);
      if (process.env.CYVX_PORT || query.port) {
        try {
          const base = "http://127.0.0.1:" + (query.port || process.env.CYVX_PORT);
          const route = command === "decision-intelligence" ? "/api/v1/decision-intelligence" : command === "daily-decision-brief" ? "/api/v1/daily-decision-brief" : command === "truth-model" ? "/api/v1/truth-model" : "/api/v1/decision-intelligence";
          const output = await call("GET", base + route);
          print(output);
          return;
        } catch (error) {}
      }
      if (command === "decision-improvement") {
        print(kernel.decisionImprovementRate());
        return;
      }
      print(command === "decision-intelligence" ? kernel.decisionIntelligence() : command === "daily-decision-brief" ? kernel.dailyDecisionBrief() : kernel.truthModel());
      return;
    }
    case "graph":
      print({ graph: kernel.graph() });
      return;
    case "agents":
      print({ agents: kernel.agents() });
      return;
    case "missions":
      print({ missions: kernel.missions() });
      return;
    case "simulations":
      print({ simulations: kernel.simulations() });
      return;
    case "events":
      print({ events: kernel.events(parseQuery(args)) });
      return;
    case "observations":
      print({ observations: kernel.observations(parseQuery(args)) });
      return;
    case "reality":
      print({ reality: kernel.reality(), observations: kernel.observations() });
      return;
    case "reality-engine": {
      const query = parseQuery(args);
      if (process.env.CYVX_PORT || query.port) {
        try {
          const base = "http://127.0.0.1:" + (query.port || process.env.CYVX_PORT);
          const output = await call("GET", base + "/api/v1/reality-engine");
          print(output);
          return;
        } catch (error) {}
      }
      print(kernel.realityEngine(query));
      return;
    }
    case "portfolio":
      print({ portfolio: kernel.portfolio(), missions: kernel.missions() });
      return;
    case "decisions":
      print({ decisions: kernel.decisions() });
      return;
    case "outcomes":
      print({ outcomes: kernel.outcomes() });
      return;
    case "knowledge":
      print({ knowledgeRecords: kernel.knowledgeRecords() });
      return;
    case "capabilities":
      print({ capabilities: kernel.capabilities() });
      return;
    case "humans":
      print({ humans: kernel.humans() });
      return;
    case "resources":
      print({ resources: kernel.resources() });
      return;
    case "assign":
      print({ assignment: kernel.assignMission(parseQuery(args)) });
      return;
    case "approvals":
      print({ approvals: kernel.approvals() });
      return;
    case "queue":
      print({ queue: kernel.queue(parseQuery(args)) });
      return;
    case "nba":
      print({ nextBestAction: kernel.nextBestAction(parseQuery(args)) });
      return;
    case "workflow":
    case "coordination":
      print(kernel.coordinateScenario(parseQuery(args)));
      return;
    case "onboard":
      print(kernel.modelCompany(parseModelCompanyArgs(args)));
      return;
    case "goals":
      print({ goals: kernel.goals() });
      return;
    case "initiatives":
      print({ initiatives: kernel.initiatives() });
      return;
    case "constraints":
      print({ constraints: kernel.constraints() });
      return;
    case "opportunities":
      print({ opportunities: kernel.opportunities() });
      return;
    case "trust":
      print({ trusts: kernel.trusts() });
      return;
    case "patterns":
      print({ patterns: kernel.patterns() });
      return;
    case "recommendations": {
      if (!kernel.recommendations().length) kernel.refreshIntelligence(parseQuery(args));
      print({ recommendations: kernel.recommendations() });
      return;
    }
    case "priorities": {
      if (!kernel.priorities().length) kernel.refreshIntelligence(parseQuery(args));
      print({ priorities: kernel.priorities() });
      return;
    }
    case "intelligence": {
      if (!kernel.recommendations().length || !kernel.priorities().length) kernel.refreshIntelligence(parseQuery(args));
      print(kernel.intelligence(parseQuery(args)));
      return;
    }
    case "criteria":
      print({ criteria: kernel.criteria() });
      return;
    case "reality-objects":
      print({ realityObjects: kernel.realityObjects() });
      return;
    case "significance":
      print({ significanceRecords: kernel.significanceRecords() });
      return;
    case "interventions":
      print({ interventions: kernel.interventions() });
      return;
    case "evolution":
      print({ evolutionRecommendations: kernel.evolutionRecommendations() });
      return;
    case "cir":
      print(kernel.cir());
      return;
    case "kernel":
      print(kernel.kernel());
      return;
    case "model-company":
      print(kernel.modelCompany(parseModelCompanyArgs(args)));
      return;
    case "simulate":
      print(kernel.runSimulation({
        scenario: args[0] || "outage",
        recommendation: args.slice(1).join(" ") || "Add verification gates",
      }));
      return;
    case "command":
    case "ask":
      print(kernel.command({ command: args.join(" ") || "model my company" }));
      return;
    case "report": {
      const executive = kernel.executive();
      const report = kernel.createReport({
        title: args.join(" ") || "Executive report",
        scope: "executive",
        summary: executive.answers.whatShouldWeDo || "Executive summary generated.",
        findings: [executive.answers.whatIsHappening || "Platform state loaded."],
        recommendations: (executive.recommendations || []).map((item) => item.title),
      });
      print({ report: report, executive: executive });
      return;
    }
    default:
      break;
  }

  const endpoint = routeFor(command, args);
  if (!endpoint) {
    console.error("Unknown command: " + command);
    process.exitCode = 1;
    return;
  }
  const output = await call(endpoint.method, endpoint.path, endpoint.body);
  print(output);
}

function print(value) {
  console.log(JSON.stringify(value, null, 2));
}

function parseQuery(args) {
  const query = {};
  for (const arg of args) {
    const index = String(arg).indexOf("=");
    if (index > 0) {
      const key = arg.slice(0, index).replace(/^--/, "");
      query[key] = arg.slice(index + 1);
    }
  }
  return query;
}

function parseModelCompanyArgs(args) {
  const input = { companyName: args[0] || "Acme Robotics" };
  for (const arg of args.slice(1)) {
    const index = String(arg).indexOf("=");
    if (index > 0) {
      const key = arg.slice(0, index).replace(/^--/, "");
      const value = arg.slice(index + 1);
      if (["employees", "cloudSpend", "systems", "teams"].includes(key)) {
        input[key] = Number(value);
      } else {
        input[key] = value;
      }
    }
  }
  return input;
}

function routeFor(command, args) {
  const query = parseQuery(args);
  const base = "http://127.0.0.1:" + (query.port || process.env.CYVX_PORT || 3000);
  switch (command) {
    case "leaderboard": return { method: "GET", path: base + "/v1/leaderboard" };
    case "dashboard": return { method: "GET", path: base + "/api/v1/dashboard" };
    case "roadmap": return { method: "GET", path: base + "/v1/roadmap" };
    case "cluster": return { method: "GET", path: base + "/api/v1/cluster" };
    case "workloads": return { method: "GET", path: base + "/api/v1/workloads" };
    case "actions": return { method: "GET", path: base + "/api/v1/actions" };
    case "metrics": return { method: "GET", path: base + "/metrics" };
    case "ask": return { method: "POST", path: base + "/ask", body: { task: args.join(" ") || "optimize:cluster" } };
    case "reality-engine": return { method: "GET", path: base + "/api/v1/reality-engine" };
    default:
      return null;
  }
}

async function call(method, url, body) {
  const res = await fetch(url, {
    method: method,
    headers: { "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { status: res.status, body: text };
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = {
  COMMANDS,
  main,
  routeFor,
};
