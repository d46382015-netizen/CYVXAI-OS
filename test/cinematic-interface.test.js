"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const publicHtml = read("ui/public.html");
const controlHtml = read("ui/index.html");
const publicJs = read("ui/experience.js");
const controlJs = ["ui/control.js", "ui/control-core.js", "ui/control-mission-read.js", "ui/control-mission-execute.js", "ui/control-bootstrap.js"].map(read).join("\n");
const publicExperience = read("api/public-experience.js");
const runtimeEntrypoint = read("api/runtime-cinematic.js");

const visibleControlIds = [
  "authButton", "commandForm", "missionForm", "missionStream", "missionCatalog",
  "missionDetail", "proofForm", "evidenceGrid", "runtimeTopology", "runtimeJson",
];

const productionEndpoints = [
  "/api/public/status", "/api/v1/runtime/readiness", "/api/v1/auth/token",
  "/api/v1/missions", "/validate", "/plan", "/approval-request", "/decide",
  "/assign-agent", "/execute", "/evidence", "/evaluate", "/learn-capability",
  "/api/v1/evidence/verify", "/export", "/proof", "/api/v1/self-scan",
];

test("public experience exposes real runtime and production destinations", () => {
  assert.match(publicHtml, /id="realityField"/);
  assert.match(publicHtml, /href="\/control"/);
  assert.match(publicHtml, /href="\/missions"/);
  assert.match(publicHtml, /href="\/operator"/);
  assert.match(publicHtml, /href="\/spark"/);
  assert.match(publicHtml, /data-action="live-status"/);
  for (const endpoint of ["/api/public/status", "/healthz", "/api/public/worlds"]) {
    assert.ok(publicJs.includes(endpoint), `${endpoint} must power the public experience`);
  }
});

test("every visible control-room primitive is connected to browser runtime logic", () => {
  for (const id of visibleControlIds) {
    assert.ok(controlHtml.includes(`id="${id}"`), `${id} must exist in control room HTML`);
    if (!["authButton"].includes(id)) assert.ok(controlJs.includes(id), `${id} must be wired in control room JavaScript`);
  }
  assert.match(controlHtml, /id="authButton"[^>]+data-action="auth"/);
  assert.match(controlHtml, /id="connectButton"[^>]+type="submit"/);
  assert.match(controlHtml, /id="createMissionButton"[^>]+type="submit"/);
  assert.match(controlJs, /#authForm.*connectOperator/);
  assert.match(controlJs, /#missionForm.*createMission/);
  assert.match(controlJs, /action === "auth"/);
  for (const endpoint of productionEndpoints) {
    assert.ok(controlJs.includes(endpoint), `${endpoint} must be called by production control logic`);
  }
  assert.match(controlJs, /localStorage/);
  assert.match(controlJs, /setInterval/);
  assert.match(controlJs, /runSelectedToIdle/);
  assert.match(controlJs, /recordProof/);
});

test("public root and control routes are intercepted without replacing Spark APIs", () => {
  assert.match(publicExperience, /\["\/", "public\.html"\]/);
  assert.match(publicExperience, /\["\/control", "index\.html"\]/);
  assert.match(publicExperience, /return delegate\(req, res\)/);
  assert.match(runtimeEntrypoint, /public-experience/);
  assert.match(runtimeEntrypoint, /createRuntimeV7/);
});

test("cinematic browser sources are valid text without transfer corruption", () => {
  const source = [publicHtml, controlHtml, publicJs, controlJs, publicExperience, runtimeEntrypoint].join("\n");
  assert.doesNotMatch(source, /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/);
  assert.doesNotMatch(source, /TODO|mock data|fake data/i);
});
