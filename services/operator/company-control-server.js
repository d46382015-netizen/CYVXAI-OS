"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { RuntimeError } = require("../../runtime/missions/base");
const { CompanyControlPlane } = require("./company-control-plane");

function createCompanyControlHttpRuntime(options = {}) {
  const { runtime, authenticate, sendJson, readBody, match } = options;
  if (!runtime || !authenticate || !sendJson || !readBody || !match) {
    throw new Error("createCompanyControlHttpRuntime requires runtime HTTP dependencies");
  }
  const control = options.control || new CompanyControlPlane(runtime, { fetch: options.fetch });
  const bodyLimit = Number(options.bodyLimit || process.env.CYVX_OPERATOR_BODY_LIMIT || 256 * 1024);
  const uiFile = path.resolve(options.companyControlUiFile || path.join(runtime.repoRoot, "ui", "company-control.html"));

  function route(pathname) {
    return pathname === "/company-control" || pathname.startsWith("/api/v5/company-control");
  }

  async function handle(req, res, url, context = {}) {
    if (!route(url.pathname)) return false;
    const correlationId = context.correlationId || null;

    if (req.method === "GET" && url.pathname === "/company-control") {
      if (!fs.existsSync(uiFile)) throw new RuntimeError("UI_NOT_FOUND", "Company control UI is unavailable", 404);
      const body = fs.readFileSync(uiFile);
      res.statusCode = 200;
      res.setHeader("content-type", "text/html; charset=utf-8");
      res.setHeader("content-length", body.length);
      res.end(body);
      return true;
    }

    if (req.method === "GET" && url.pathname === "/api/v5/company-control/health") {
      sendJson(res, 200, { ok: true, company_control: control.health() }, correlationId);
      return true;
    }

    const auth = authenticate(req);
    auth.correlation_id = correlationId;
    const input = ["GET", "HEAD"].includes(req.method) ? {} : await readBody(req, bodyLimit);
    let params;

    if ((params = match(url.pathname, "/api/v5/company-control/entities/:id")) && req.method === "GET") {
      sendJson(res, 200, { ok: true, company_control: control.snapshot(params.id, auth) }, correlationId); return true;
    }
    if ((params = match(url.pathname, "/api/v5/company-control/entities/:id/compile")) && req.method === "POST") {
      sendJson(res, 201, { ok: true, compilation: control.compileMission(params.id, input, auth) }, correlationId); return true;
    }
    if ((params = match(url.pathname, "/api/v5/company-control/entities/:id/truth")) && req.method === "POST") {
      sendJson(res, 201, { ok: true, truth: control.transitionTruth(params.id, input, auth) }, correlationId); return true;
    }
    if ((params = match(url.pathname, "/api/v5/company-control/entities/:id/decisions")) && req.method === "POST") {
      sendJson(res, 201, { ok: true, decision: control.recordDecision(params.id, input, auth) }, correlationId); return true;
    }
    if ((params = match(url.pathname, "/api/v5/company-control/decisions/:id/resolve")) && req.method === "POST") {
      sendJson(res, 200, { ok: true, decision: control.resolveDecision(params.id, input, auth) }, correlationId); return true;
    }
    if ((params = match(url.pathname, "/api/v5/company-control/entities/:id/experiments")) && req.method === "POST") {
      sendJson(res, 201, { ok: true, experiment: control.createExperiment(params.id, input, auth) }, correlationId); return true;
    }
    if ((params = match(url.pathname, "/api/v5/company-control/experiments/:id/observations")) && req.method === "POST") {
      sendJson(res, 201, { ok: true, result: control.observeExperiment(params.id, input, auth) }, correlationId); return true;
    }
    if ((params = match(url.pathname, "/api/v5/company-control/experiments/:id/evaluate")) && req.method === "POST") {
      sendJson(res, 200, { ok: true, experiment: control.evaluateExperiment(params.id, input, auth) }, correlationId); return true;
    }
    if ((params = match(url.pathname, "/api/v5/company-control/entities/:id/next-actions")) && req.method === "GET") {
      sendJson(res, 200, { ok: true, ranking: control.rankNextActions(params.id, auth) }, correlationId); return true;
    }
    if ((params = match(url.pathname, "/api/v5/company-control/entities/:id/cycles")) && req.method === "POST") {
      sendJson(res, 201, { ok: true, cycle: control.startCycle(params.id, input, auth) }, correlationId); return true;
    }
    if ((params = match(url.pathname, "/api/v5/company-control/cycles/:id/advance")) && req.method === "POST") {
      sendJson(res, 200, { ok: true, cycle: control.advanceCycle(params.id, input, auth) }, correlationId); return true;
    }
    if ((params = match(url.pathname, "/api/v5/company-control/entities/:id/effects")) && req.method === "POST") {
      sendJson(res, 201, { ok: true, effect: control.reserveEffect(params.id, input, auth) }, correlationId); return true;
    }
    if ((params = match(url.pathname, "/api/v5/company-control/effects/:id/settle")) && req.method === "POST") {
      sendJson(res, 200, { ok: true, effect: control.settleEffect(params.id, input, auth) }, correlationId); return true;
    }
    if ((params = match(url.pathname, "/api/v5/company-control/entities/:id/sagas")) && req.method === "POST") {
      sendJson(res, 201, { ok: true, saga: control.createSaga(params.id, input, auth) }, correlationId); return true;
    }
    if ((params = match(url.pathname, "/api/v5/company-control/sagas/:id/steps")) && req.method === "POST") {
      sendJson(res, 201, { ok: true, step: control.addSagaStep(params.id, input, auth) }, correlationId); return true;
    }
    if ((params = match(url.pathname, "/api/v5/company-control/sagas/:id/compensate")) && req.method === "POST") {
      sendJson(res, 200, { ok: true, saga: control.compensateSaga(params.id, input, auth) }, correlationId); return true;
    }
    if (url.pathname === "/api/v5/company-control/providers" && req.method === "GET") {
      sendJson(res, 200, { ok: true, providers: control.listProviders(auth) }, correlationId); return true;
    }
    if (url.pathname === "/api/v5/company-control/providers" && req.method === "POST") {
      sendJson(res, 201, { ok: true, provider: control.upsertProvider(input, auth) }, correlationId); return true;
    }
    if ((params = match(url.pathname, "/api/v5/company-control/entities/:id/deployments")) && req.method === "POST") {
      sendJson(res, 201, { ok: true, deployment: control.recordDeployment(params.id, input, auth) }, correlationId); return true;
    }
    if ((params = match(url.pathname, "/api/v5/company-control/deployments/:id/verify")) && req.method === "POST") {
      sendJson(res, 200, { ok: true, deployment: await control.verifyDeployment(params.id, auth) }, correlationId); return true;
    }
    if (url.pathname === "/api/v5/company-control/notifications" && req.method === "GET") {
      sendJson(res, 200, { ok: true, notifications: control.listNotifications(auth, url.searchParams.get("entity_id") || null) }, correlationId); return true;
    }
    if (url.pathname === "/api/v5/company-control/notifications" && req.method === "POST") {
      sendJson(res, 201, { ok: true, notification: control.notify(input, auth) }, correlationId); return true;
    }
    if ((params = match(url.pathname, "/api/v5/company-control/notifications/:id/ack")) && req.method === "POST") {
      sendJson(res, 200, { ok: true, notification: control.acknowledgeNotification(params.id, auth) }, correlationId); return true;
    }
    if ((params = match(url.pathname, "/api/v5/company-control/entities/:id/usage")) && req.method === "POST") {
      sendJson(res, 201, { ok: true, usage: control.meterUsage(params.id, input, auth) }, correlationId); return true;
    }
    if ((params = match(url.pathname, "/api/v5/company-control/entities/:id/slos")) && req.method === "POST") {
      sendJson(res, 201, { ok: true, slo: control.defineSlo(params.id, input, auth) }, correlationId); return true;
    }
    if ((params = match(url.pathname, "/api/v5/company-control/slos/:id/observations")) && req.method === "POST") {
      sendJson(res, 201, { ok: true, observation: control.recordSloObservation(params.id, input, auth) }, correlationId); return true;
    }
    if ((params = match(url.pathname, "/api/v5/company-control/entities/:id/vertical-packs")) && req.method === "POST") {
      sendJson(res, 201, { ok: true, pack: control.installVerticalPack(params.id, input, auth) }, correlationId); return true;
    }
    if ((params = match(url.pathname, "/api/v5/company-control/entities/:id/evidence")) && req.method === "GET") {
      sendJson(res, 200, { ok: true, verification: control.verifyEvidence(params.id, auth) }, correlationId); return true;
    }

    throw new RuntimeError("NOT_FOUND", "Company control route not found", 404);
  }

  return { control, route, handle, health: () => control.health() };
}

module.exports = { createCompanyControlHttpRuntime };
