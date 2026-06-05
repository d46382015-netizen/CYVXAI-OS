"use strict";

const fs = require("fs");
const path = require("path");
const { deliberate, snapshot } = require("../agency-runtime/autonomous_agency");

const ROOT = path.join(__dirname, "..", "..");
const stateFile = path.join(ROOT, "data/agency-daemon/state.json");
const logFile = path.join(ROOT, "logs/agency-daemon.log");

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2));
}

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); }
  catch { return fallback; }
}

function log(event) {
  fs.mkdirSync(path.dirname(logFile), { recursive: true });
  fs.appendFileSync(logFile, JSON.stringify({ at: new Date().toISOString(), ...event }) + "\n");
}

function tick(input = {}) {
  const goal = input.goal || process.env.CYVX_DAEMON_GOAL || "Continuously improve the user's reality through one measurable next mission.";
  const session = deliberate({ goal, reality: input.reality || "Autonomous daemon tick" });

  const state = {
    status: "running",
    last_tick_at: new Date().toISOString(),
    ticks: (readJson(stateFile, { ticks: 0 }).ticks || 0) + 1,
    latest_session_id: session.id,
    latest_mission: session.mission,
    latest_decision: session.decision,
    runtime: snapshot()
  };

  writeJson(stateFile, state);
  log({ event: "agency_daemon_tick", mission: session.mission.title, next_action: session.mission.next_action });
  return state;
}

function daemon(intervalMs = Number(process.env.CYVX_DAEMON_INTERVAL_MS || 180000)) {
  const first = tick();
  setInterval(() => tick(), intervalMs);
  return first;
}

module.exports = { tick, daemon };
