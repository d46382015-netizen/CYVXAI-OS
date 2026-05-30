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

const COMMANDS = [
  "status", "health", "graph", "agents", "missions", "simulations", "simulate", "command", "report",
  "events", "observations", "reality", "portfolio", "decisions", "outcomes", "knowledge", "capabilities", "goals", "initiatives", "constraints", "opportunities", "trust", "patterns",
  "criteria", "reality-objects", "significance", "interventions", "evolution", "cir", "kernel",
  "humans", "resources", "assign", "approvals", "queue", "nba", "coordination",
  "model-company", "leaderboard", "roadmap", "cluster", "workloads", "actions", "metrics", "healthz", "ask", "serve",
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
    case "coordination":
      print(kernel.coordinateScenario(parseQuery(args)));
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
  const base = "http://127.0.0.1:3000";
  switch (command) {
    case "leaderboard": return { method: "GET", path: base + "/v1/leaderboard" };
    case "roadmap": return { method: "GET", path: base + "/v1/roadmap" };
    case "cluster": return { method: "GET", path: base + "/api/v1/cluster" };
    case "workloads": return { method: "GET", path: base + "/api/v1/workloads" };
    case "actions": return { method: "GET", path: base + "/api/v1/actions" };
    case "metrics": return { method: "GET", path: base + "/metrics" };
    case "ask": return { method: "POST", path: base + "/ask", body: { task: args.join(" ") || "optimize:cluster" } };
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
