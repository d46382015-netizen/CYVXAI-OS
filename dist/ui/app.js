"use strict";

const state = {
  status: null,
  health: null,
  platform: null,
  executive: null,
  kernel: null,
  cir: null,
  coordination: null,
  nextBestAction: null,
  intelligence: null,
  recommendations: null,
  priorities: null,
  humans: null,
  resources: null,
  assignments: null,
  approvals: null,
  queue: null,
  commandResult: null,
  selectedEntityId: "company",
  selectedMissionId: null,
  selectedAgentId: null,
  selectedSimulationId: null,
  liveFeed: [],
  graphFilter: "all",
  searchQuery: "",
  workflowResult: null,
  workflowDomain: "cloud-operations",
  repositoryHealth: null,
  proof: null,
  thesis: null,
  realityEngine: null,
  realityLevel: "strategic-view",
};

const dom = {
  connectionState: id("connectionState"),
  platformHealth: id("platformHealth"),
  heroMetrics: id("heroMetrics"),
  summaryGrid: id("summaryGrid"),
  summaryNote: id("summaryNote"),
  overviewCards: id("overviewCards"),
  overviewTags: id("overviewTags"),
  graphSvg: id("graphSvg"),
  entityDetail: id("entityDetail"),
  twinDetail: id("twinDetail"),
  agentsList: id("agentsList"),
  missionsList: id("missionsList"),
  simulationsList: id("simulationsList"),
  decisionsList: id("decisionsList"),
  knowledgeList: id("knowledgeList"),
  capabilitiesList: id("capabilitiesList"),
  governanceList: id("governanceList"),
  strategyList: id("strategyList"),
  trustList: id("trustList"),
  opportunitiesList: id("opportunitiesList"),
  patternsList: id("patternsList"),
  observationsList: id("observationsList"),
  realityList: id("realityList"),
  portfolioList: id("portfolioList"),
  kernelOverviewList: id("kernelOverviewList"),
  constitutionList: id("constitutionList"),
  realityObjectsList: id("realityObjectsList"),
  significanceList: id("significanceList"),
  interventionQueueList: id("interventionQueueList"),
  outcomesEvidenceList: id("outcomesEvidenceList"),
  evolutionList: id("evolutionList"),
  cirList: id("cirList"),
  coordinationOverviewList: id("coordinationOverviewList"),
  humanRolesList: id("humanRolesList"),
  resourceAllocationList: id("resourceAllocationList"),
  assignmentQueueList: id("assignmentQueueList"),
  approvalGatesList: id("approvalGatesList"),
  executionQueueList: id("executionQueueList"),
  nextBestActionList: id("nextBestActionList"),
  crossDomainList: id("crossDomainList"),
  workflowOutput: id("workflowOutput"),
  repositoryHealthOutput: id("repositoryHealthOutput"),
  proofOutput: id("proofOutput"),
  realityInterfaceTabs: id("realityInterfaceTabs"),
  realityMetricsList: id("realityMetricsList"),
  realityDomainList: id("realityDomainList"),
  realityLevelTitle: id("realityLevelTitle"),
  realityLevelDescription: id("realityLevelDescription"),
  realityLevelChips: id("realityLevelChips"),
  realityViewport: id("realityViewport"),
  realityDetailViewport: id("realityDetailViewport"),
  realityTimelineTags: id("realityTimelineTags"),
  realityLoopTags: id("realityLoopTags"),
  truthEngineList: id("truthEngineList"),
  controlModelList: id("controlModelList"),
  workflowDomain: id("workflowDomain"),
  searchInput: id("searchInput"),
  clearSearchBtn: id("clearSearchBtn"),
  workflowRunBtn: id("workflowRunBtn"),
  patternIntelligenceList: id("patternIntelligenceList"),
  recommendationIntelligenceList: id("recommendationIntelligenceList"),
  priorityIntelligenceList: id("priorityIntelligenceList"),
  intelligenceSummaryList: id("intelligenceSummaryList"),
  executiveAnswers: id("executiveAnswers"),
  executiveRecommendations: id("executiveRecommendations"),
  eventsList: id("eventsList"),
  commandInput: id("commandInput"),
  commandOutput: id("commandOutput"),
  companyName: id("companyName"),
  companyEmployees: id("companyEmployees"),
  companySpend: id("companySpend"),
  companySystems: id("companySystems"),
  companyTeams: id("companyTeams"),
  missionTitle: id("missionTitle"),
  missionObjective: id("missionObjective"),
  simulationScenario: id("simulationScenario"),
  simulationRecommendation: id("simulationRecommendation"),
  modelCompanyBtn: id("modelCompanyBtn"),
  refreshBtn: id("refreshBtn"),
  commandRunBtn: id("commandRunBtn"),
  missionLaunchBtn: id("missionLaunchBtn"),
  missionCreateBtn: id("missionCreateBtn"),
  simulationRunBtn: id("simulationRunBtn"),
};

function id(name) {
  return document.getElementById(name);
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString();
}

function formatPercent(value) {
  return (Number(value || 0) * 100).toFixed(0) + "%";
}

function formatDate(value) {
  try {
    return new Date(value).toLocaleString();
  } catch (error) {
    return String(value || "");
  }
}

function escapeHtml(value) {
  return String(value || "").replace(/[&<>"]/g, function (ch) {
    return ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
    })[ch] || ch;
  });
}

function safeJson(value) {
  try {
    return JSON.stringify(value, null, 2);
  } catch (error) {
    return JSON.stringify({ error: error.message }, null, 2);
  }
}

function matchesSearch(item, query) {
  if (!query) return true;
  return safeJson(item).toLowerCase().includes(query);
}

function filterCollection(items) {
  const query = String(state.searchQuery || "").trim().toLowerCase();
  const list = Array.isArray(items) ? items : [];
  return query ? list.filter(function (item) { return matchesSearch(item, query); }) : list;
}

function setSearchQuery(value) {
  state.searchQuery = String(value || "");
  if (dom.searchInput && dom.searchInput.value !== state.searchQuery) {
    dom.searchInput.value = state.searchQuery;
  }
  renderAll();
}

async function runOperatorWorkflow() {
  const domain = (dom.workflowDomain && dom.workflowDomain.value) || state.workflowDomain || "cloud-operations";
  state.workflowDomain = domain;
  const result = await requestJson("/api/v1/coordination", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ domain: domain }),
  });
  state.workflowResult = result;
  pushFeed("Operator workflow completed: " + domain);
  setOutput(result);
  if (dom.workflowOutput) dom.workflowOutput.textContent = safeJson(result);
  await sync();
}

function setOutput(payload) {
  dom.commandOutput.textContent = safeJson(payload);
  state.commandResult = payload;
}

function pushFeed(message) {
  if (!message) return;
  state.liveFeed.unshift({ at: new Date().toISOString(), message: message });
  state.liveFeed = state.liveFeed.slice(0, 8);
  renderEvents();
}

async function requestJson(url, options) {
  const response = await fetch(url, options || {});
  const text = await response.text();
  let data = {};
  if (text) {
    try {
      data = JSON.parse(text);
    } catch (error) {
      data = { raw: text };
    }
  }
  if (!response.ok) {
    throw new Error(data.error || response.statusText || "Request failed");
  }
  return data;
}

async function sync() {
  try {
    const results = await Promise.all([
      requestJson("/status"),
      requestJson("/health"),
      requestJson("/api/v1/platform"),
      requestJson("/api/v1/executive"),
      requestJson("/api/v1/reality"),
      requestJson("/api/v1/observations"),
      requestJson("/api/v1/kernel"),
      requestJson("/api/v1/cir"),
      requestJson("/api/v1/coordination"),
      requestJson("/api/v1/intelligence"),
      requestJson("/api/v1/patterns"),
      requestJson("/api/v1/recommendations"),
      requestJson("/api/v1/priorities"),
      requestJson("/api/v1/next-best-action"),
      requestJson("/api/v1/humans"),
      requestJson("/api/v1/resources"),
      requestJson("/api/v1/assignments"),
      requestJson("/api/v1/approvals"),
      requestJson("/api/v1/queue"),
      requestJson("/api/v1/repository-health"),
      requestJson("/api/v1/proof"),
      requestJson("/api/v1/reality-engine"),
    ]);
    state.status = results[0];
    state.health = results[1];
    state.platform = results[2];
    state.executive = results[3];
    state.reality = results[4];
    state.observations = results[5];
    state.kernel = results[6];
    state.cir = results[7];
    state.coordination = results[8];
    state.intelligence = results[9];
    state.recommendations = results[11] && results[11].recommendations ? results[11].recommendations : [];
    state.priorities = results[12] && results[12].priorities ? results[12].priorities : [];
    state.nextBestAction = results[13] ? (results[13].nextBestAction || (results[13].nextBestActions && results[13].nextBestActions[0]) || results[13]) : null;
    state.humans = results[14] && results[14].humans ? results[14].humans : [];
    state.resources = results[15] && results[15].resources ? results[15].resources : [];
    state.assignments = results[16] && results[16].assignments ? results[16].assignments : [];
    state.approvals = results[17] && results[17].approvals ? results[17].approvals : [];
    state.queue = results[18] && results[18].queue ? results[18].queue : [];
    state.repositoryHealth = results[19] || (results[20] && results[20].repositoryHealth) || null;
    state.proof = results[20] ? (results[20].proof || results[20]) : null;
    state.realityEngine = results[21] || null;
    if (!state.realityLevel) state.realityLevel = "strategic-view";
    state.thesis = results[3] ? (results[3].thesis || results[3].thesis_dashboard || null) : null;
    if (!state.selectedEntityId && state.platform && state.platform.entities && state.platform.entities.length) {
      state.selectedEntityId = state.platform.entities[0].id;
    }
    if (!state.selectedMissionId && state.platform && state.platform.missions && state.platform.missions.length) {
      state.selectedMissionId = state.platform.missions[0].id;
    }
    renderAll();
  } catch (error) {
    state.connection = false;
    dom.connectionState.textContent = "Offline";
    pushFeed("Sync failed: " + error.message);
    setOutput({ error: error.message });
  }
}

function renderAll() {
  const platform = state.platform || {};
  const status = state.status || {};
  const health = state.health || {};
  const entities = Array.isArray(platform.entities) ? platform.entities : [];
  const relationships = Array.isArray(platform.relationships) ? platform.relationships : [];
  const agents = Array.isArray(platform.agents) ? platform.agents : [];
  const missions = Array.isArray(platform.missions) ? platform.missions : [];
  const simulations = Array.isArray(platform.simulations) ? platform.simulations : [];
  const reports = Array.isArray(platform.reports) ? platform.reports : [];
  const commands = Array.isArray(platform.commands) ? platform.commands : [];
  const goals = Array.isArray(platform.goals) ? platform.goals : [];
  const initiatives = Array.isArray(platform.initiatives) ? platform.initiatives : [];
  const objectives = Array.isArray(platform.objectives) ? platform.objectives : [];
  const constraints = Array.isArray(platform.constraints) ? platform.constraints : [];
  const opportunities = Array.isArray(platform.opportunities) ? platform.opportunities : [];
  const trusts = Array.isArray(platform.trusts) ? platform.trusts : [];
  const patterns = Array.isArray(platform.patterns) ? platform.patterns : [];
  const recommendations = Array.isArray(state.recommendations) ? state.recommendations : Array.isArray(platform.recommendations) ? platform.recommendations : [];
  const priorities = Array.isArray(state.priorities) ? state.priorities : Array.isArray(platform.priorities) ? platform.priorities : [];
  const intelligence = state.intelligence || platform.intelligence || {};
  const observations = Array.isArray(state.observations && state.observations.observations ? state.observations.observations : platform.observations) ? (state.observations && state.observations.observations ? state.observations.observations : platform.observations) : [];
  const reality = state.reality && state.reality.reality ? state.reality.reality : state.reality || platform.reality || {};
  const portfolio = state.reality && state.reality.portfolio ? state.reality.portfolio : platform.portfolio || {};
  const kernel = state.kernel || {};
  const cir = state.cir || {};
  const decisions = Array.isArray(platform.decisions) ? platform.decisions : [];
  const outcomes = Array.isArray(platform.outcomes) ? platform.outcomes : [];
  const knowledgeRecords = Array.isArray(platform.knowledgeRecords) ? platform.knowledgeRecords : [];
  const capabilities = Array.isArray(platform.capabilities) ? platform.capabilities : [];
  const events = Array.isArray(platform.events) ? platform.events : [];
  const query = String(state.searchQuery || "").trim().toLowerCase();
  const filteredEntities = filterCollection(entities);
  const filteredRelationships = filterCollection(relationships);
  const filteredAgents = filterCollection(agents);
  const filteredMissions = filterCollection(missions);
  const filteredSimulations = filterCollection(simulations);
  const filteredDecisions = filterCollection(decisions);
  const filteredOutcomes = filterCollection(outcomes);
  const filteredKnowledgeRecords = filterCollection(knowledgeRecords);
  const filteredCapabilities = filterCollection(capabilities);
  const filteredEvents = filterCollection(events);
  const filteredTrusts = filterCollection(trusts);
  const filteredOpportunities = filterCollection(opportunities);
  const filteredPatterns = filterCollection(patterns);
  const filteredObservations = filterCollection(observations);
  const filteredRecommendations = filterCollection(recommendations);
  const filteredPriorities = filterCollection(priorities);

  dom.connectionState.textContent = status.powered_by ? "Live" : "Connecting";
  dom.platformHealth.textContent = "Health: " + ((health.label || "unknown").toUpperCase());

  renderHeroMetrics(status, health, platform);
  renderSummary(entities, relationships, agents, missions, simulations, reports, commands, goals, initiatives, objectives, constraints, opportunities, trusts, patterns, decisions, outcomes, knowledgeRecords, capabilities, events, health, platform);
  renderOverview(entities, relationships, agents, missions, simulations, reports, commands, goals, initiatives, objectives, constraints, opportunities, trusts, patterns, decisions, outcomes, knowledgeRecords, capabilities, events, health, platform);
  renderGraph(platform.graph || { nodes: entities, edges: relationships }, filteredEntities, filteredRelationships);
  renderAgents(filteredAgents, filteredMissions);
  renderMissions(filteredMissions, filteredAgents);
  renderSimulations(filteredSimulations, filteredMissions);
  renderStrategy(goals, initiatives, objectives, constraints);
  renderTrust(filteredTrusts, filteredSimulations, filteredDecisions);
  renderObservations(filteredObservations, reality);
  renderReality(reality, observations);
  renderPortfolio(portfolio, filteredMissions, goals, objectives);
  renderKernel(kernel, platform);
  renderCoordination(state.coordination || {}, state.nextBestAction || {}, platform);
  renderCir(cir);
  renderOpportunities(filteredOpportunities, filteredPatterns, filteredMissions);
  renderIntelligence(filteredPatterns, filteredRecommendations, filteredPriorities, intelligence);
  renderRealityInterface(state.realityEngine, platform, filteredEntities, filteredRelationships);
  renderDecisions(filteredDecisions, filteredMissions, filteredOutcomes);
  renderKnowledge(filteredKnowledgeRecords, filteredMissions, filteredOutcomes);
  renderCapabilities(filteredCapabilities, filteredEntities, filteredMissions);
  renderGovernance(platform);
  renderExecutive(state.executive || platform.executive || {}, platform);
  renderEvents(filteredEvents);
  renderDetails(platform);
  if (dom.repositoryHealthOutput) dom.repositoryHealthOutput.textContent = safeJson(state.repositoryHealth || {});
  if (dom.proofOutput) dom.proofOutput.textContent = safeJson(state.proof || {});
  if (dom.workflowOutput) dom.workflowOutput.textContent = safeJson(state.workflowResult || {});
  setOutput(state.commandResult || state.workflowResult || platform);
}

function renderHeroMetrics(status, health, platform) {
  const metrics = [
    ["Entities", platform.entities ? platform.entities.length : 0, platform.tenant ? platform.tenant.name : ""],
    ["Agents", platform.agents ? platform.agents.length : 0, "registry online"],
    ["Missions", platform.missions ? platform.missions.length : 0, "mission control"],
    ["Simulations", platform.simulations ? platform.simulations.length : 0, "simulation chamber"],
    ["Events", platform.events ? platform.events.length : 0, "event stream"],
    ["Health", health.score != null ? formatPercent(health.score) : "--", health.label || "unknown"],
  ];
  dom.heroMetrics.innerHTML = metrics.map(function (metric) {
    return '<div class="metric-card"><span>' + escapeHtml(metric[0]) + '</span><strong>' + escapeHtml(metric[1]) + '</strong><small>' + escapeHtml(metric[2]) + '</small></div>';
  }).join("");
}

function renderSummary(entities, relationships, agents, missions, simulations, reports, commands, goals, initiatives, objectives, constraints, opportunities, trusts, patterns, decisions, outcomes, knowledgeRecords, capabilities, events, health, platform) {
  const items = [
    ["Reality Graph", entities.length + " entities", relationships.length + " relationships"],
    ["Agent OS", agents.length + " agents", "lifecycle ready"],
    ["Mission Control", missions.length + " missions", "execution flow"],
    ["Simulation Chamber", simulations.length + " simulations", "outcomes tracked"],
    ["Strategy", goals.length + " goals", initiatives.length + " initiatives"],
    ["Decision Center", decisions.length + " decisions", outcomes.length + " outcomes"],
    ["Trust", trusts.length + " records", patterns.length + " patterns"],
    ["Knowledge", knowledgeRecords.length + " records", capabilities.length + " capabilities"],
    ["Constraints", constraints.length + " blocks", opportunities.length + " opportunities"],
    ["Commands", commands.length + " commands", platform.user ? platform.user.name : ""],
  ];
  dom.summaryGrid.innerHTML = items.map(function (item) {
    return '<div class="summary-card"><span>' + escapeHtml(item[0]) + '</span><strong>' + escapeHtml(item[1]) + '</strong><div class="card-sub">' + escapeHtml(item[2]) + '</div></div>';
  }).join("");
  dom.summaryNote.textContent = 'Platform posture: ' + (health.label || 'unknown') + '. ' + (state.executive && state.executive.answers ? state.executive.answers.whatShouldWeDo : '') + ' ' + ((state.reality && state.reality.reality) ? ('Drift ' + formatPercent(state.reality.reality.reality_drift || 0)) : '') + (state.proof ? (' Proof ' + formatPercent(state.proof.proof_score || 0) + ' | Repo ' + ((state.repositoryHealth && state.repositoryHealth.clean) ? 'clean' : 'dirty')) : '') + (state.realityEngine ? (' | ' + state.realityEngine.one_sentence_compression) : '');
}

function renderOverview(entities, relationships, agents, missions, simulations, reports, commands, goals, initiatives, objectives, constraints, opportunities, trusts, patterns, decisions, outcomes, knowledgeRecords, capabilities, events, health, platform) {
  const topMission = missions[0] || {};
  const topSimulation = simulations[0] || {};
  const topDecision = decisions[0] || {};
  const topGoal = goals[0] || {};
  const cards = [
    { label: 'Platform', value: platform.tenant ? platform.tenant.name : 'n/a', sub: platform.user ? platform.user.name : 'owner' },
    { label: 'Risk', value: health.label || 'unknown', sub: 'score ' + (health.score != null ? health.score.toFixed(2) : '--') },
    { label: 'Top Goal', value: topGoal.title || 'n/a', sub: formatPercent(topGoal.confidence || 0) + ' confidence' },
    { label: 'Top Mission', value: topMission.title || 'n/a', sub: formatPercent(topMission.confidence || 0) + ' confidence' },
    { label: 'Top Simulation', value: topSimulation.title || 'n/a', sub: formatPercent(topSimulation.confidence || 0) + ' confidence' },
    { label: 'Top Decision', value: topDecision.title || 'n/a', sub: formatPercent(topDecision.confidence || 0) + ' confidence' },
    { label: 'Trust', value: formatNumber(trusts.length), sub: formatNumber(patterns.length) + ' patterns' },
    { label: 'Knowledge', value: formatNumber(knowledgeRecords.length), sub: formatNumber(capabilities.length) + ' capabilities' },
  ];
  dom.overviewCards.innerHTML = cards.map(function (card) {
    return '<div class="metric-card"><span>' + escapeHtml(card.label) + '</span><strong>' + escapeHtml(card.value) + '</strong><small>' + escapeHtml(card.sub) + '</small></div>';
  }).join("");
  dom.overviewTags.innerHTML = [
    '<span class="pill good">' + escapeHtml((health.label || 'unknown').toUpperCase()) + '</span>',
    '<span class="pill">' + escapeHtml(platform.economics ? String(platform.economics.roi || 'ROI ready') : 'ROI ready') + '</span>',
    '<span class="pill">' + escapeHtml(platform.workflow && platform.workflow.cadence ? platform.workflow.cadence : 'continuous') + '</span>'
  ].join("");
}

function renderGraph(graph, entities, relationships) {
  const nodes = Array.isArray(graph.nodes) && graph.nodes.length ? graph.nodes : entities;
  const edges = Array.isArray(graph.edges) ? graph.edges : relationships;
  const positions = {};
  const centerX = 500;
  const centerY = 280;
  const radius = 220;
  const step = Math.max(1, nodes.length - 1);

  nodes.forEach(function (node, index) {
    if (node.id === 'company') {
      positions[node.id] = { x: centerX, y: centerY, r: 58 };
      return;
    }
    const angle = (index / step) * Math.PI * 2 - Math.PI / 2;
    const distance = radius + (index % 3) * 34;
    positions[node.id] = {
      x: centerX + Math.cos(angle) * distance,
      y: centerY + Math.sin(angle) * distance,
      r: 36 + (index % 4) * 2,
    };
  });

  const svgParts = [];
  svgParts.push('<defs><linearGradient id="nodeGlow" x1="0%" x2="100%" y1="0%" y2="100%"><stop offset="0%" stop-color="#86f5c5"/><stop offset="100%" stop-color="#7fb3ff"/></linearGradient></defs>');
  edges.forEach(function (edge) {
    const from = positions[edge.from];
    const to = positions[edge.to];
    if (!from || !to) return;
    svgParts.push('<line class="graph-edge" x1="' + from.x.toFixed(1) + '" y1="' + from.y.toFixed(1) + '" x2="' + to.x.toFixed(1) + '" y2="' + to.y.toFixed(1) + '" />');
  });
  nodes.forEach(function (node) {
    const pos = positions[node.id];
    if (!pos) return;
    svgParts.push(
      '<g class="graph-node" data-node-id="' + escapeHtml(node.id) + '" data-kind="' + escapeHtml(node.kind || node.label || '') + '" transform="translate(' + pos.x.toFixed(1) + ',' + pos.y.toFixed(1) + ')">' +
        '<circle r="' + pos.r + '" />' +
        '<circle r="' + Math.max(10, pos.r - 14) + '" fill="rgba(0,0,0,0.18)" stroke="url(#nodeGlow)" stroke-width="1" />' +
        '<text y="-2">' + escapeHtml(node.label || node.name || node.id) + '</text>' +
        '<text y="14" class="card-sub">' + escapeHtml(node.kind || node.type || '') + '</text>' +
      '</g>'
    );
  });
  dom.graphSvg.innerHTML = svgParts.join('');
  dom.graphSvg.querySelectorAll('[data-node-id]').forEach(function (nodeEl) {
    nodeEl.addEventListener('click', function () {
      selectEntity(nodeEl.dataset.nodeId);
    });
  });
}

function renderAgents(agents, missions) {
  dom.agentsList.innerHTML = agents.map(function (agent) {
    const mission = missions.find(function (item) { return item.owner_id === agent.id; });
    return '<div class="agent-card" data-agent-id="' + escapeHtml(agent.id) + '">' +
      '<div class="card-row"><strong>' + escapeHtml(agent.name || agent.id) + '</strong><span class="pill">' + escapeHtml(agent.role || 'agent') + '</span></div>' +
      '<div class="card-sub">' + escapeHtml(agent.lifecycle || 'deploy') + ' | ' + escapeHtml(agent.status || 'idle') + '</div>' +
      '<div class="inline-meta"><span class="pill good">ROI ' + escapeHtml(String(agent.economics && agent.economics.roi != null ? agent.economics.roi : 0)) + '</span><span class="pill">$' + formatNumber(agent.economics && agent.economics.cost_per_hour ? agent.economics.cost_per_hour : 0) + '/hr</span></div>' +
      '<div class="card-sub">Memory ' + formatNumber(agent.memory && agent.memory.episodes ? agent.memory.episodes : 0) + ' episodes. ' + (mission ? 'Owner: ' + escapeHtml(mission.title) : 'No mission assigned.') + '</div>' +
    '</div>';
  }).join('');
}

function renderMissions(missions, agents) {
  dom.missionsList.innerHTML = missions.map(function (mission) {
    const owner = agents.find(function (agent) { return agent.id === mission.owner_id; });
    const progress = Number(mission.progress || 0);
    const assigned = owner ? owner.name : 'Unassigned';
    return '<div class="mission-card" data-mission-id="' + escapeHtml(mission.id) + '">' +
      '<div class="card-row"><strong>' + escapeHtml(mission.title) + '</strong><span class="pill">' + escapeHtml(mission.stage || 'discover') + '</span></div>' +
      '<div class="card-sub">' + escapeHtml(mission.objective || mission.summary || '') + '</div>' +
      '<div class="progress"><span style="width:' + Math.max(6, progress * 100) + '%"></span></div>' +
      '<div class="inline-meta"><span class="pill good">' + formatPercent(mission.confidence || 0) + ' confidence</span><span class="pill">ROI ' + escapeHtml(String(mission.roi || 0)) + '</span><span class="pill">Owner: ' + escapeHtml(assigned) + '</span></div>' +
      '<div class="row-actions">' +
        '<button class="button" data-action="simulate" data-mission-id="' + escapeHtml(mission.id) + '">Simulate</button>' +
        '<button class="button" data-action="assign" data-mission-id="' + escapeHtml(mission.id) + '">Assign Planner</button>' +
      '</div>' +
    '</div>';
  }).join('');

  dom.missionsList.querySelectorAll('[data-action="simulate"]').forEach(function (button) {
    button.addEventListener('click', function () {
      runSimulationForMission(button.dataset.missionId);
    });
  });
  dom.missionsList.querySelectorAll('[data-action="assign"]').forEach(function (button) {
    button.addEventListener('click', function () {
      assignPlannerToMission(button.dataset.missionId);
    });
  });
}

function renderSimulations(simulations, missions) {
  dom.simulationsList.innerHTML = simulations.map(function (simulation) {
    const mission = missions.find(function (item) { return item.id === simulation.linked_mission_id; });
    return '<div class="sim-card" data-simulation-id="' + escapeHtml(simulation.id) + '">' +
      '<div class="card-row"><strong>' + escapeHtml(simulation.title) + '</strong><span class="pill">' + escapeHtml(simulation.scenario || 'scenario') + '</span></div>' +
      '<div class="card-sub">' + escapeHtml(simulation.recommendation || '') + '</div>' +
      '<div class="inline-meta"><span class="pill good">' + formatPercent(simulation.confidence || 0) + '</span><span class="pill">ROI ' + escapeHtml(String(simulation.roi || 0)) + '</span><span class="pill">Mission: ' + escapeHtml(mission ? mission.title : 'none') + '</span></div>' +
    '</div>';
  }).join('');
}


function renderObservations(observations, reality) {
  dom.observationsList.innerHTML = observations.slice(0, 8).map(function (observation) {
    return '<div class="answer-card">' +
      '<span class="card-kicker">Observation</span>' +
      '<strong>' + escapeHtml(observation.title || observation.summary || observation.id) + '</strong>' +
      '<small>Source ' + escapeHtml(observation.source || 'cyvx') + ' | Confidence ' + formatPercent(observation.confidence || 0) + '</small>' +
      '<div class="card-sub">' + escapeHtml(JSON.stringify(observation.observed_change || observation.observed_state || {})) + '</div>' +
    '</div>';
  }).join('');
}

function renderReality(reality, observations) {
  const items = [
    ['Graph freshness', formatPercent(reality.graph_freshness || 0), 'reality calibration'],
    ['Graph confidence', formatPercent(reality.graph_confidence || 0), 'observation quality'],
    ['Reality drift', formatPercent(reality.reality_drift || 0), observations.length + ' observations'],
  ];
  dom.realityList.innerHTML = items.map(function (item) {
    return '<div class="metric-card"><span>' + escapeHtml(item[0]) + '</span><strong>' + escapeHtml(item[1]) + '</strong><small>' + escapeHtml(item[2]) + '</small></div>';
  }).join('');
}

function renderKernel(kernel, platform) {
  const criteria = Array.isArray(platform.criteria) ? platform.criteria : [];
  const realityObjects = Array.isArray(platform.realityObjects) ? platform.realityObjects : [];
  const significanceRecords = Array.isArray(platform.significanceRecords) ? platform.significanceRecords : [];
  const interventions = Array.isArray(platform.interventions) ? platform.interventions : [];
  const outcomes = Array.isArray(platform.outcomes) ? platform.outcomes : [];
  const evolutionRecommendations = Array.isArray(platform.evolutionRecommendations) ? platform.evolutionRecommendations : [];
  dom.kernelOverviewList.textContent = safeJson({ counts: kernel.counts || {}, services: kernel.services || {}, cir: kernel.cir || {} });
  dom.constitutionList.textContent = safeJson(criteria.slice(0, 6));
  dom.realityObjectsList.textContent = safeJson(realityObjects.slice(0, 6));
  dom.significanceList.textContent = safeJson((kernel.topSignificanceRecords || significanceRecords).slice(0, 6));
  dom.interventionQueueList.textContent = safeJson((kernel.topInterventions || interventions).slice(0, 6));
  dom.outcomesEvidenceList.textContent = safeJson((kernel.recentOutcomes || outcomes).slice(0, 6));
  dom.evolutionList.textContent = safeJson((kernel.evolutionRecommendations || evolutionRecommendations).slice(0, 6));
}

function renderCir(cir) {
  dom.cirList.textContent = safeJson(cir || {});
}

function renderPortfolio(portfolio, missions, goals, objectives) {
  const items = [
    ['Missions', portfolio.mission_count || missions.length || 0, 'portfolio size'],
    ['Overlap', formatPercent(portfolio.overlap || 0), 'redundancy'],
    ['Alignment', formatPercent(portfolio.strategic_alignment || 0), 'capability fit'],
    ['Objectives', portfolio.objective_span || objectives.length || 0, 'strategic reach'],
    ['Goals', portfolio.goal_span || goals.length || 0, 'top-level intent'],
  ];
  dom.portfolioList.innerHTML = items.map(function (item) {
    return '<div class="summary-card"><span>' + escapeHtml(item[0]) + '</span><strong>' + escapeHtml(item[1]) + '</strong><div class="card-sub">' + escapeHtml(item[2]) + '</div></div>';
  }).join('');
}

function renderDecisions(decisions, missions, outcomes) {
  dom.decisionsList.innerHTML = decisions.map(function (decision) {
    const mission = missions.find(function (item) { return item.id === decision.related_mission_id; });
    const outcome = outcomes.find(function (item) { return item.decision_id === decision.id; });
    return '<div class="answer-card">' +
      '<span class="card-kicker">Decision</span>' +
      '<strong>' + escapeHtml(decision.title || decision.id) + '</strong>' +
      '<small>Confidence ' + formatPercent(decision.confidence || 0) + ' | Mission ' + escapeHtml(mission ? mission.title : 'n/a') + '</small>' +
      '<small>Alternatives ' + escapeHtml(String((decision.alternatives || []).length)) + ' | Outcome ' + escapeHtml(outcome ? outcome.status || 'recorded' : 'pending') + '</small>' +
      '<div class="card-sub">Expected impact ' + escapeHtml(String(decision.expected_impact && decision.expected_impact.value != null ? decision.expected_impact.value : 0)) + ' | Risks ' + escapeHtml(String((decision.risks || []).length)) + '</div>' +
    '</div>';
  }).join('');
}

function renderKnowledge(knowledgeRecords, missions, outcomes) {
  dom.knowledgeList.innerHTML = knowledgeRecords.map(function (record) {
    const mission = missions.find(function (item) { return item.id === record.mission_id; });
    const outcome = outcomes.find(function (item) { return item.id === record.outcome_id; });
    return '<div class="answer-card">' +
      '<span class="card-kicker">Knowledge</span>' +
      '<strong>' + escapeHtml(record.title || record.id) + '</strong>' +
      '<small>Mission ' + escapeHtml(mission ? mission.title : 'n/a') + ' | Outcome ' + escapeHtml(outcome ? outcome.title : 'n/a') + '</small>' +
      '<div class="card-sub">' + escapeHtml(record.lesson_learned || record.future_recommendation || '') + '</div>' +
    '</div>';
  }).join('');
}

function renderCapabilities(capabilities, entities, missions) {
  dom.capabilitiesList.innerHTML = capabilities.map(function (capability) {
    const linkedEntity = entities.find(function (item) { return (capability.linked_entity_ids || []).includes(item.id); });
    const mission = missions.find(function (item) { return item.target_entity_ids && linkedEntity && item.target_entity_ids.includes(linkedEntity.id); });
    return '<div class="answer-card">' +
      '<span class="card-kicker">Capability</span>' +
      '<strong>' + escapeHtml(capability.title || capability.name || capability.id) + '</strong>' +
      '<small>Current ' + escapeHtml(String(capability.current || 0)) + ' | Potential ' + escapeHtml(String(capability.potential || 0)) + '</small>' +
      '<small>Growth ' + escapeHtml(String(capability.growth_rate || 0)) + ' | Impact ' + escapeHtml(String(capability.impact || 0)) + '</small>' +
      '<div class="card-sub">' + escapeHtml(linkedEntity ? linkedEntity.label : 'No linked entity') + (mission ? ' | Mission ' + escapeHtml(mission.title) : '') + '</div>' +
    '</div>';
  }).join('');
}

function renderGovernance(platform) {
  const missions = Array.isArray(platform.missions) ? platform.missions : [];
  dom.governanceList.innerHTML = missions.slice(0, 5).map(function (mission) {
    const governance = mission.governance || {};
    return '<div class="answer-card">' +
      '<span class="card-kicker">Autonomy ' + escapeHtml(String(mission.autonomy_level != null ? mission.autonomy_level : 1)) + '</span>' +
      '<strong>' + escapeHtml(mission.title || mission.id) + '</strong>' +
      '<small>Approval ' + escapeHtml(String(!!governance.approval_required)) + ' | Override ' + escapeHtml(String(!!governance.operator_override)) + '</small>' +
      '<div class="card-sub">Policy ' + escapeHtml(governance.policy_status || 'unknown') + ' | Reversible ' + escapeHtml(String(governance.reversible !== false)) + '</div>' +
    '</div>';
  }).join('');
}

function renderExecutive(executive, platform) {
  const answers = executive.answers || {};
  const items = [
    ['What is happening?', answers.whatIsHappening || ''],
    ['Why?', answers.why || ''],
    ['What happens next?', answers.whatNext || ''],
    ['What should we do?', answers.whatShouldWeDo || ''],
    ['What can CYVX automate?', answers.whatCanCyvxAutomate || ''],
    ['What creates the most value?', answers.whatCreatesMostValue || ''],
  ];
  dom.executiveAnswers.innerHTML = items.map(function (item) {
    return '<div class="answer-card"><span class="card-kicker">' + escapeHtml(item[0]) + '</span><strong>' + escapeHtml(item[1]) + '</strong></div>';
  }).join('');

  const forecast = executive.forecast || {};
  const recommendations = Array.isArray(executive.recommendations) ? executive.recommendations : [];
  const intelligence = executive.intelligence || {};
  const thesis = executive.thesis || state.thesis || {};
  const decision = executive.decision_intelligence || state.decisionIntelligence || {};
  const brief = executive.daily_decision_brief || state.dailyDecisionBrief || {};
  const truth = executive.truth_model || state.truthModel || {};
  const executiveCards = [
    '<div class="answer-card"><span class="card-kicker">Forecast</span><strong>' + escapeHtml(forecast.likelyOutcome || 'n/a') + '</strong><small>Confidence ' + escapeHtml(String(forecast.confidence != null ? forecast.confidence : '--')) + ' | Horizon ' + escapeHtml(String(forecast.horizonDays || '--')) + ' days</small></div>',
    '<div class="answer-card"><span class="card-kicker">Predicted CIR Impact</span><strong>' + escapeHtml(String(intelligence.predictedCirImpact != null ? intelligence.predictedCirImpact : executive.predictedCirImpact != null ? executive.predictedCirImpact : '--')) + '</strong><small>Patterns ' + escapeHtml(String(intelligence.patternCount != null ? intelligence.patternCount : 0)) + ' | Recommendations ' + escapeHtml(String(intelligence.recommendationCount != null ? intelligence.recommendationCount : 0)) + ' | Priorities ' + escapeHtml(String(intelligence.priorityCount != null ? intelligence.priorityCount : 0)) + '</small></div>'
  ];
  executiveCards.unshift(
    `<div class="answer-card"><span class="card-kicker">Thesis Confidence</span><strong>${escapeHtml(String(thesis.thesis_confidence != null ? thesis.thesis_confidence : thesis.confidence != null ? thesis.confidence : "--"))}</strong><small>Uncertainty ${escapeHtml(String(thesis.uncertainty != null ? thesis.uncertainty : "--"))} | Verdicts S:${escapeHtml(String(thesis.verdicts && thesis.verdicts.supported != null ? thesis.verdicts.supported : 0))} P:${escapeHtml(String(thesis.verdicts && thesis.verdicts.partially_supported != null ? thesis.verdicts.partially_supported : 0))} U:${escapeHtml(String(thesis.verdicts && thesis.verdicts.unknown != null ? thesis.verdicts.unknown : 0))} C:${escapeHtml(String(thesis.verdicts && thesis.verdicts.contradicted != null ? thesis.verdicts.contradicted : 0))}</small></div>`
  );
  if (thesis.most_valuable_next_experiment) {
    executiveCards.unshift(
      `<div class="answer-card"><span class="card-kicker">Single Highest-Value Next Experiment</span><strong>${escapeHtml(thesis.most_valuable_next_experiment.hypothesis || thesis.most_valuable_next_experiment.recommended_action || "n/a")}</strong><small>Expected gain ${escapeHtml(String(thesis.most_valuable_next_experiment.information_gain_expected != null ? thesis.most_valuable_next_experiment.information_gain_expected : "--"))}</small></div>`
    );
  }
  if (thesis.evidence_summary) {
    executiveCards.unshift(
      `<div class="answer-card"><span class="card-kicker">Evidence Summary</span><strong>${escapeHtml(String(thesis.evidence_summary.predictions_created != null ? thesis.evidence_summary.predictions_created : 0))} predictions</strong><small>Loops ${escapeHtml(String(thesis.evidence_summary.historical_loops_reconstructed != null ? thesis.evidence_summary.historical_loops_reconstructed : 0))} | Trust updates ${escapeHtml(String(thesis.evidence_summary.trust_updates_generated != null ? thesis.evidence_summary.trust_updates_generated : 0))}</small></div>`
    );
  }
  executiveCards.unshift(
    `<div class="answer-card"><span class="card-kicker">Decision Improvement Rate</span><strong>${escapeHtml(String(decision.improvement_rate && decision.improvement_rate.lifetime != null ? decision.improvement_rate.lifetime : decision.lifetime != null ? decision.lifetime : "--"))}</strong><small>30d ${escapeHtml(String(decision.improvement_rate && decision.improvement_rate.last_30_days != null ? decision.improvement_rate.last_30_days : "--"))} | 90d ${escapeHtml(String(decision.improvement_rate && decision.improvement_rate.last_90_days != null ? decision.improvement_rate.last_90_days : "--"))}</small></div>`,
    `<div class="answer-card"><span class="card-kicker">Daily Decision Brief</span><strong>${escapeHtml(String(brief.what_matters_most || 'n/a'))}</strong><small>Action ${escapeHtml(String(brief.recommended_action || 'n/a'))} | Confidence ${escapeHtml(String(brief.confidence != null ? brief.confidence : decision.decision_quality_score != null ? decision.decision_quality_score : '--'))}</small><div class="card-sub">Why ${escapeHtml(String(brief.why_it_matters || ''))}</div></div>`,
    `<div class="answer-card"><span class="card-kicker">Truth Model</span><strong>Observed / Inferred / Predicted / Recommended / Validated</strong><small>${escapeHtml(String(truth.observed && truth.observed.summary ? truth.observed.summary : 'n/a'))}</small><div class="card-sub">${escapeHtml(String(truth.inferred && truth.inferred.summary ? truth.inferred.summary : ''))} | ${escapeHtml(String(truth.predicted && truth.predicted.summary ? JSON.stringify(truth.predicted.summary) : ''))}</div></div>`
  );
  if (intelligence.topPatterns && intelligence.topPatterns[0]) {
    executiveCards.push('<div class="answer-card"><span class="card-kicker">Top Pattern</span><strong>' + escapeHtml(intelligence.topPatterns[0].title || intelligence.topPatterns[0].id) + '</strong><small>Confidence ' + formatPercent(intelligence.topPatterns[0].confidence || 0) + ' | Frequency ' + escapeHtml(String(intelligence.topPatterns[0].frequency || 0)) + '</small></div>');
  }
  if (intelligence.topRecommendations && intelligence.topRecommendations[0]) {
    executiveCards.push('<div class="answer-card"><span class="card-kicker">Top Recommendation</span><strong>' + escapeHtml(intelligence.topRecommendations[0].title || intelligence.topRecommendations[0].id) + '</strong><small>Confidence ' + formatPercent(intelligence.topRecommendations[0].confidence || 0) + '</small></div>');
  }
  if (intelligence.highestPriorityItems && intelligence.highestPriorityItems[0]) {
    executiveCards.push('<div class="answer-card"><span class="card-kicker">Highest Priority</span><strong>' + escapeHtml(intelligence.highestPriorityItems[0].title || intelligence.highestPriorityItems[0].targetType || intelligence.highestPriorityItems[0].id) + '</strong><small>Score ' + escapeHtml(String(intelligence.highestPriorityItems[0].score || 0)) + '</small></div>');
  }
  executiveCards.push.apply(executiveCards, recommendations.map(function (item) {
    return '<div class="answer-card"><span class="card-kicker">Recommendation</span><strong>' + escapeHtml(item.title) + '</strong><small>Confidence ' + formatPercent(item.confidence || 0) + ' | ROI ' + escapeHtml(String(item.roi || 0)) + '</small></div>';
  }));
  dom.executiveRecommendations.innerHTML = executiveCards.join('');
}

function renderRealityInterface(realityEngine, platform, entities, relationships) {
  const interfaceData = realityEngine && realityEngine.reality_interface ? realityEngine.reality_interface : {};
  const levels = Array.isArray(interfaceData.zoom_stack) && interfaceData.zoom_stack.length ? interfaceData.zoom_stack : [
    { level: "Strategic View", focus: "Nation or organization as a living model", metaphor: "Command center", questions: ["What is growing?", "What is strained?", "What is stable?"] },
    { level: "System View", focus: "A domain as a network of nodes and relationships", metaphor: "Living nervous system", questions: ["What entities exist?", "How are they connected?"] },
    { level: "Flow View", focus: "Money, information, labor, materials, energy, attention", metaphor: "Animated circulation", questions: ["What is moving?", "Where is it blocked?"] },
    { level: "Dependency View", focus: "Hard dependencies and critical chains", metaphor: "Operational backbone", questions: ["What breaks if this fails?", "What must be true?"] },
    { level: "Constraint View", focus: "Capacity, delay, dependency, single point of failure, shortage, congestion", metaphor: "Pressure map", questions: ["What is limiting progress?"] },
    { level: "Ownership View", focus: "Owner, operator, manager, executive, board, agency, policy, automation", metaphor: "Accountability chain", questions: ["Who can change this?"] },
    { level: "Priority View", focus: "Rank opportunities, risks, constraints, and decisions", metaphor: "Attention router", questions: ["What matters now?"] },
  ];
  const key = String(state.realityLevel || "strategic-view");
  const selectedLevel = levels.find(function (item) { return item.level.toLowerCase().replace(/\s+/g, "-") === key; }) || levels[0];
  const metrics = realityEngine && realityEngine.success_metrics ? realityEngine.success_metrics : {};
  const domains = realityEngine && realityEngine.reality_domains ? realityEngine.reality_domains : {};
  const loopSequence = (realityEngine && realityEngine.reality_loop && realityEngine.reality_loop.sequence) || [];
  const timeline = interfaceData.temporal_layer || ["Past", "Present", "Projected"];
  const interfaceStack = interfaceData.interface_stack || ["Reality", "Reality Model", "Reality Graph", "Reality Engine", "Reality Interface", "Human"];
  const selectedEntity = entities.find(function (item) { return item.id === state.selectedEntityId; }) || entities[0] || {};
  const selectedRelationships = relationships.filter(function (item) { return item.from === selectedEntity.id || item.to === selectedEntity.id; }).slice(0, 6);
  const topDomains = Object.entries(domains).slice(0, 8);
  const truth = realityEngine && realityEngine.truth_engine ? realityEngine.truth_engine : {};
  const metaCognition = realityEngine && realityEngine.meta_cognition_engine ? realityEngine.meta_cognition_engine : {};
  const assumptionGraph = realityEngine && realityEngine.assumption_graph ? realityEngine.assumption_graph : {};
  const coverageMap = realityEngine && realityEngine.reality_coverage_map ? realityEngine.reality_coverage_map : {};
  const causalEngine = realityEngine && realityEngine.causal_engine ? realityEngine.causal_engine : {};
  const frictionEngine = realityEngine && realityEngine.friction_engine ? realityEngine.friction_engine : {};
  const opportunityEngine = realityEngine && realityEngine.opportunity_discovery_engine ? realityEngine.opportunity_discovery_engine : {};
  const recursiveLearning = realityEngine && realityEngine.recursive_learning ? realityEngine.recursive_learning : {};
  const evolutionEngine = realityEngine && realityEngine.evolution_engine ? realityEngine.evolution_engine : {};
  const realityGenome = realityEngine && realityEngine.reality_genome ? realityEngine.reality_genome : {};
  const strategicTimeEngine = realityEngine && realityEngine.strategic_time_engine ? realityEngine.strategic_time_engine : {};
  const executiveCompression = realityEngine && realityEngine.executive_compression ? realityEngine.executive_compression : {};
  const metaReality = realityEngine && realityEngine.meta_reality ? realityEngine.meta_reality : {};
  const controlHierarchy = realityEngine && realityEngine.control_hierarchy ? realityEngine.control_hierarchy : {};
  const systemMappingLayer = realityEngine && realityEngine.system_mapping_layer ? realityEngine.system_mapping_layer : {};
  const universalSituationReport = realityEngine && realityEngine.universal_situation_report ? realityEngine.universal_situation_report : {};

  if (dom.realityInterfaceTabs) {
    dom.realityInterfaceTabs.innerHTML = interfaceStack.map(function (item) {
      return '<span class="pill">' + escapeHtml(item) + '</span>';
    }).join('');
  }

  if (dom.realityMetricsList) {
    dom.realityMetricsList.innerHTML = Object.entries(metrics).map(function (entry) {
      return '<div class="answer-card"><span class="card-kicker">' + escapeHtml(entry[0].replace(/_/g, ' ')) + '</span><strong>' + escapeHtml(entry[1]) + '</strong></div>';
    }).join('');
  }

  if (dom.realityDomainList) {
    dom.realityDomainList.innerHTML = topDomains.map(function (entry) {
      const domain = entry[1] || {};
      return '<div class="answer-card"><span class="card-kicker">' + escapeHtml(entry[0].replace(/_/g, ' ')) + '</span><strong>' + escapeHtml(domain.coverage || 'domain') + '</strong><small>' + escapeHtml((domain.share || '') + ' | ' + ((domain.sources || []).slice(0, 2).join(', '))) + '</small><div class="card-sub">' + escapeHtml((domain.entities || []).slice(0, 4).join(' • ')) + '</div></div>';
    }).join('');
  }

  if (dom.realityLevelTitle) dom.realityLevelTitle.textContent = selectedLevel.level;
  if (dom.realityLevelDescription) dom.realityLevelDescription.textContent = selectedLevel.focus + '. ' + selectedLevel.metaphor + '.';
  if (dom.realityLevelChips) {
    dom.realityLevelChips.innerHTML = levels.map(function (item) {
      const levelKey = item.level.toLowerCase().replace(/\s+/g, '-');
      return '<button class="chip' + (levelKey === key ? ' active' : '') + '" data-reality-level="' + escapeHtml(levelKey) + '">' + escapeHtml(item.level) + '</button>';
    }).join('');
    dom.realityLevelChips.querySelectorAll('[data-reality-level]').forEach(function (button) {
      button.addEventListener('click', function () {
        state.realityLevel = button.dataset.realityLevel;
        renderRealityInterface(realityEngine, platform, entities, relationships);
      });
    });
  }

  const worldCount = formatNumber((platform.entities || []).length);
  const relationshipCount = formatNumber((platform.relationships || []).length);
  const systemCount = formatNumber(Object.keys(domains).length);
  const outcomeCount = formatNumber((platform.outcomes || []).length);

  if (dom.realityViewport) {
    dom.realityViewport.innerHTML = '<div class="reality-card-title">' + escapeHtml(selectedLevel.level) + '</div><strong>' + escapeHtml(selectedLevel.metaphor) + '</strong><div class="detail-meta">' + escapeHtml(selectedLevel.focus) + '</div><div class="reality-stat-row"><span class="pill good">Entities ' + worldCount + '</span><span class="pill">Relationships ' + relationshipCount + '</span><span class="pill">Domains ' + systemCount + '</span><span class="pill">Outcomes ' + outcomeCount + '</span></div><div class="card-sub">Questions: ' + escapeHtml(selectedLevel.questions.join(' | ')) + '</div><div class="card-sub">Meta-cognition: ' + escapeHtml((metaCognition.questions || []).slice(0, 2).join(' | ')) + '. Coverage: ' + escapeHtml((coverageMap.measures || []).join(' | ')) + '.</div>';
  }

  if (dom.realityDetailViewport) {
    dom.realityDetailViewport.innerHTML = '<div class="reality-card-title">Selected Entity</div><strong>' + escapeHtml(selectedEntity.label || selectedEntity.name || 'n/a') + '</strong><div class="detail-meta">' + escapeHtml(selectedEntity.kind || '') + ' | ' + escapeHtml(selectedEntity.state || '') + ' | ' + escapeHtml(selectedEntity.health || '') + '</div><div class="detail-body">Dependencies and influence chains become visible here. Top relations: ' + escapeHtml(selectedRelationships.map(function (item) { return item.label || item.kind || (item.from + '→' + item.to); }).join(' • ') || 'n/a') + '.</div><div class="reality-stat-row"><span class="pill warning">Visibility: ' + escapeHtml((realityEngine && realityEngine.visibility_authority_control && realityEngine.visibility_authority_control.visibility ? realityEngine.visibility_authority_control.visibility[0] : 'Can See')) + '</span><span class="pill">Access: Public → Owner</span><span class="pill danger">Authority: Approvals</span></div><div class="card-sub">Effect chain: ' + escapeHtml((realityEngine && realityEngine.visibility_authority_control && realityEngine.visibility_authority_control.chain ? realityEngine.visibility_authority_control.chain.join(' → ') : 'Visibility → Access → Authority → Control → Action → Effect → Outcome → Learning')) + '.</div>';
  }

  if (dom.realityTimelineTags) dom.realityTimelineTags.innerHTML = timeline.map(function (item) { return '<span class="pill">' + escapeHtml(item) + '</span>'; }).join('');
  if (dom.realityLoopTags) dom.realityLoopTags.innerHTML = loopSequence.map(function (item) { return '<span class="pill good">' + escapeHtml(item) + '</span>'; }).join('');
  if (dom.truthEngineList) {
    const truthItems = [
      ['Truth Score', truth.truth_score_formula || 'Source Reliability × Evidence Strength × Freshness × Cross-Source Agreement ÷ Contradictions'],
      ['Statuses', (truth.verification_statuses || []).join(' • ')],
      ['Highest Trust', (truth.source_hierarchy && truth.source_hierarchy.highest_trust || []).join(' • ')],
      ['Medium Trust', (truth.source_hierarchy && truth.source_hierarchy.medium_trust || []).join(' • ')],
      ['Lower Trust', (truth.source_hierarchy && truth.source_hierarchy.lower_trust || []).join(' • ')],
      ['Meta-Cognition', (metaCognition.questions || []).join(' • ')],
      ['Assumption Graph', (assumptionGraph.chain || []).join(' → ')],
      ['Coverage Map', (coverageMap.states || []).join(' • ') + ' | ' + (coverageMap.measures || []).join(' • ')],
      ['Causal Engine', (causalEngine.chain || []).join(' → ')],
      ['Friction Engine', (frictionEngine.delays || []).join(' • ')],
      ['Opportunity Engine', (opportunityEngine.sources || []).join(' • ')],
      ['Recursive Learning', (recursiveLearning.ladder || []).join(' → ')],
      ['Evolution Engine', (evolutionEngine.metrics || []).join(' • ')],
      ['Reality Genome', (realityGenome.schema || []).join(' • ')],
      ['Strategic Time', (strategicTimeEngine.horizons || []).join(' • ')],
      ['Executive Compression', (executiveCompression.top_views || []).join(' • ')],
      ['Meta-Reality', (metaReality.questions || []).join(' • ')],
      ['Action Rule', truth.action_rule || 'No action unless verifiable.'],
      ['Principle', truth.principle || 'If it cannot be verified, it can inform attention, but it cannot drive execution.'],
    ];
    dom.truthEngineList.innerHTML = truthItems.map(function (item) {
      return '<div class="answer-card"><span class="card-kicker">' + escapeHtml(item[0]) + '</span><strong>' + escapeHtml(item[1]) + '</strong></div>';
    }).join('');
  }

  if (dom.controlModelList) {
    const hierarchy = (controlHierarchy.layers || []).map(function (item) { return item.layer + ': ' + item.question; });
    const capabilities = controlHierarchy.capability_model || [];
    const resources = controlHierarchy.resource_domains || [];
    const mapping = [
      ['Observation Systems', ((systemMappingLayer.observation_systems || {}).entities || []).join(' • '), (systemMappingLayer.observation_systems || {}).purpose || ''],
      ['Communication Systems', ((systemMappingLayer.communication_systems || {}).entities || []).join(' • '), (systemMappingLayer.communication_systems || {}).purpose || ''],
      ['Mobility Systems', ((systemMappingLayer.mobility_systems || {}).entities || []).join(' • '), (systemMappingLayer.mobility_systems || {}).purpose || ''],
      ['Infrastructure Systems', ((systemMappingLayer.infrastructure_systems || {}).entities || []).join(' • '), (systemMappingLayer.infrastructure_systems || {}).purpose || ''],
    ];
    const report = universalSituationReport.example || {};
    const reportItems = [
      ['Universal Situation Report', universalSituationReport.template || ''],
      ['Control Hierarchy', hierarchy.join(' | ')],
      ['Control Capabilities', capabilities.join(' • ')],
      ['Resource Domains', resources.join(' • ')],
      ['System Mapping', mapping.map(function (item) { return item[0] + ': ' + item[1]; }).join(' | ')],
      ['City Water Example', 'Constraint ' + (report.top_constraint || '') + ' | Maker ' + (report.top_decision_maker || '') + ' | Owner ' + (report.top_resource_owner || '')],
      ['Mission', report.top_mission || ''],
      ['Recommended Action', report.top_recommended_action || ''],
      ['Expected Impact', report.expected_impact || ''],
      ['Confidence', report.confidence || ''],
      ['Principle', controlHierarchy.principle || ''],
    ];
    dom.controlModelList.innerHTML = reportItems.map(function (item) {
      return '<div class="answer-card"><span class="card-kicker">' + escapeHtml(item[0]) + '</span><strong>' + escapeHtml(item[1]) + '</strong></div>';
    }).join('');
  }
}

function renderEvents(events) {
  const items = filterCollection(state.liveFeed).concat((events || []).slice(0, 10).map(function (event) {
    return { at: event.at || event.created_at, message: (event.event_type || event.type || 'event') + ': ' + (event.summary || '') };
  }));
  dom.eventsList.innerHTML = items.slice(0, 12).map(function (item) {
    return '<div class="event-card"><div class="card-row"><span class="card-kicker">' + escapeHtml(formatDate(item.at)) + '</span></div><strong>' + escapeHtml(item.message) + '</strong></div>';
  }).join('');
}

function renderStrategy(goals, initiatives, objectives, constraints) {
  dom.strategyList.innerHTML = [
    ['Goal', goals],
    ['Initiative', initiatives],
    ['Objective', objectives],
  ].map(function (group) {
    const label = group[0];
    const items = group[1];
    const top = items[0] || {};
    return '<div class="answer-card">' +
      '<span class="card-kicker">' + escapeHtml(label) + '</span>' +
      '<strong>' + escapeHtml(top.title || top.name || 'n/a') + '</strong>' +
      '<small>Count ' + escapeHtml(String(items.length)) + ' | Confidence ' + formatPercent(top.confidence || 0) + '</small>' +
      '<div class="card-sub">' + escapeHtml(top.description || top.state || '') + '</div>' +
    '</div>';
  }).join('');
  dom.constraintsList.innerHTML = constraints.map(function (constraint) {
    return '<div class="answer-card">' +
      '<span class="card-kicker">Constraint</span>' +
      '<strong>' + escapeHtml(constraint.title || constraint.id) + '</strong>' +
      '<small>Severity ' + escapeHtml(constraint.severity || 'medium') + ' | Confidence ' + formatPercent(constraint.confidence || 0) + '</small>' +
      '<div class="card-sub">' + escapeHtml(constraint.blocker || constraint.description || '') + '</div>' +
    '</div>';
  }).join('');
}

function renderTrust(trusts, simulations, decisions) {
  dom.trustList.innerHTML = trusts.slice(0, 6).map(function (trust) {
    const simulation = simulations.find(function (item) { return item.id === trust.subject_id; });
    const decision = decisions.find(function (item) { return item.id === trust.subject_id; });
    return '<div class="answer-card">' +
      '<span class="card-kicker">Trust</span>' +
      '<strong>' + escapeHtml(trust.subject_title || trust.subject_id || 'n/a') + '</strong>' +
      '<small>Score ' + escapeHtml(String(trust.trust_score != null ? trust.trust_score : trust.score || 0)) + ' | Trend ' + escapeHtml(String(trust.trust_trend != null ? trust.trust_trend : 0)) + '</small>' +
      '<div class="card-sub">' + escapeHtml((trust.calibration ? 'Calibration ' + String(trust.calibration.error || 0) : '')) + (simulation ? ' | Simulation' : '') + (decision ? ' | Decision' : '') + '</div>' +
    '</div>';
  }).join('');
}

function renderOpportunities(opportunities, patterns, missions) {
  dom.opportunitiesList.innerHTML = opportunities.slice(0, 6).map(function (opportunity) {
    const mission = missions.find(function (item) { return item.id === opportunity.mission_id; });
    return '<div class="answer-card">' +
      '<span class="card-kicker">Opportunity</span>' +
      '<strong>' + escapeHtml(opportunity.title || opportunity.id) + '</strong>' +
      '<small>Value ' + escapeHtml(String(opportunity.expected_value || 0)) + ' | Confidence ' + formatPercent(opportunity.confidence || 0) + '</small>' +
      '<div class="card-sub">Effort ' + escapeHtml(String(opportunity.effort || 0)) + ' | Risk ' + escapeHtml(String(opportunity.risk || 0)) + (mission ? ' | Mission ' + escapeHtml(mission.title) : '') + '</div>' +
    '</div>';
  }).join('');
  dom.patternsList.innerHTML = patterns.slice(0, 6).map(function (pattern) {
    return '<div class="answer-card">' +
      '<span class="card-kicker">Pattern</span>' +
      '<strong>' + escapeHtml(pattern.title || pattern.id) + '</strong>' +
      '<small>Frequency ' + escapeHtml(String(pattern.frequency || 0)) + ' | Confidence ' + formatPercent(pattern.confidence || 0) + '</small>' +
      '<div class="card-sub">' + escapeHtml(pattern.description || pattern.kind || '') + '</div>' +
    '</div>';
  }).join('');
}

function renderIntelligence(patterns, recommendations, priorities, intelligence) {
  setJsonPanel(dom.patternIntelligenceList, patterns.slice(0, 8));
  setJsonPanel(dom.recommendationIntelligenceList, recommendations.slice(0, 8));
  setJsonPanel(dom.priorityIntelligenceList, priorities.slice(0, 8));
  setJsonPanel(dom.intelligenceSummaryList, intelligence || {});
}

function renderDetails(platform) {
  const entities = Array.isArray(platform.entities) ? platform.entities : [];
  const missions = Array.isArray(platform.missions) ? platform.missions : [];
  const entity = entities.find(function (item) { return item.id === state.selectedEntityId; }) || entities[0] || {};
  const mission = missions.find(function (item) { return item.id === state.selectedMissionId; }) || missions[0] || {};
  const twin = platform.digitalTwin || {};

  dom.entityDetail.innerHTML = '<span class="card-kicker">Selected Entity</span><strong>' + escapeHtml(entity.label || entity.name || 'n/a') + '</strong><div class="detail-meta">' + escapeHtml(entity.kind || '') + ' | ' + escapeHtml(entity.state || '') + ' | ' + escapeHtml(entity.health || '') + '</div><div class="detail-body">Risk ' + escapeHtml(String(entity.risk && entity.risk.score != null ? entity.risk.score.toFixed(2) : '--')) + '. Ownership ' + escapeHtml(entity.ownership || 'platform') + '. Impact ' + escapeHtml(String(entity.impact != null ? entity.impact : '--')) + '.</div>';
  dom.twinDetail.innerHTML = '<span class="card-kicker">Digital Twin</span><strong>' + formatNumber(twin.entityCount || entities.length) + ' entities</strong><div class="detail-meta">' + formatNumber(twin.relationshipCount || 0) + ' relationships</div><div class="detail-body">Onboarded at ' + escapeHtml(formatDate(twin.generatedAt || platform.created_at)) + '. Summary: ' + escapeHtml((twin.summary && twin.summary.posture) || 'active') + '.</div><div class="row-actions"><button class="button" id="focusMissionBtn">Focus Mission</button><button class="button" id="focusEntityBtn">Focus Entity</button></div>';

  const focusMissionBtn = id('focusMissionBtn');
  if (focusMissionBtn) {
    focusMissionBtn.addEventListener('click', function () {
      if (mission.id) {
        state.selectedMissionId = mission.id;
        renderDetails(platform);
        renderMissions(missions, platform.agents || []);
      }
    });
  }

  const focusEntityBtn = id('focusEntityBtn');
  if (focusEntityBtn) {
    focusEntityBtn.addEventListener('click', function () {
      if (entity.id) {
        state.selectedEntityId = entity.id;
        renderDetails(platform);
      }
    });
  }
}

function selectEntity(idValue) {
  state.selectedEntityId = idValue;
  renderDetails(state.platform || {});
}

async function modelCompany() {
  const payload = {
    command: 'model my company',
    companyName: dom.companyName.value.trim() || 'Acme Robotics',
    employees: Number(dom.companyEmployees.value || 0),
    cloudSpend: Number(dom.companySpend.value || 0),
    systems: Number(dom.companySystems.value || 0),
    teams: Number(dom.companyTeams.value || 0),
  };
  const result = await requestJson('/api/v1/commands', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  pushFeed('Modeled company: ' + payload.companyName);
  setOutput(result);
  await sync();
}

async function submitCommand() {
  const payload = {
    command: dom.commandInput.value.trim() || 'Model my company',
    companyName: dom.companyName.value.trim() || 'Acme Robotics',
    employees: Number(dom.companyEmployees.value || 0),
    cloudSpend: Number(dom.companySpend.value || 0),
    systems: Number(dom.companySystems.value || 0),
    teams: Number(dom.companyTeams.value || 0),
    mission_id: state.selectedMissionId,
    agent_id: state.selectedAgentId,
  };
  const result = await requestJson('/api/v1/commands', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  pushFeed('Command executed');
  setOutput(result);
  await sync();
}

async function createMission() {
  const payload = {
    title: dom.missionTitle.value.trim() || 'New mission',
    objective: dom.missionObjective.value.trim() || '',
    target_entity_ids: [state.selectedEntityId || 'company'],
    confidence: 0.82,
    roi: 2.1,
    risk: 0.18,
  };
  const result = await requestJson('/api/v1/missions', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  pushFeed('Mission created: ' + payload.title);
  setOutput(result);
  await sync();
}

async function runSimulation() {
  const payload = {
    scenario: dom.simulationScenario.value.trim() || 'outage',
    recommendation: dom.simulationRecommendation.value.trim() || 'Add verification gates',
    linked_mission_id: state.selectedMissionId,
    confidence: 0.88,
    roi: 3.1,
  };
  const result = await requestJson('/api/v1/simulations', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  pushFeed('Simulation completed: ' + payload.scenario);
  setOutput(result);
  await sync();
}

async function runSimulationForMission(missionId) {
  state.selectedMissionId = missionId;
  dom.simulationScenario.value = missionId || 'outage';
  await runSimulation();
}

async function assignPlannerToMission(missionId) {
  const platform = state.platform || {};
  const agent = (platform.agents || [])[1] || (platform.agents || [])[0];
  if (!agent) return;
  const result = await requestJson('/api/v1/commands', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      command: 'assign agent',
      mission_id: missionId,
      agent_id: agent.id,
    }),
  });
  pushFeed('Mission assigned: ' + missionId);
  setOutput(result);
  await sync();
}

function setJsonPanel(node, value) {
  if (!node) return;
  node.textContent = safeJson(value);
}

function renderCoordination(coordination, nextBestAction) {
  setJsonPanel(dom.coordinationOverviewList, coordination);
  setJsonPanel(dom.humanRolesList, state.humans || coordination.humans || []);
  setJsonPanel(dom.resourceAllocationList, state.resources || coordination.resources || []);
  setJsonPanel(dom.assignmentQueueList, state.assignments || coordination.assignments || []);
  setJsonPanel(dom.approvalGatesList, state.approvals || coordination.approvals || []);
  setJsonPanel(dom.executionQueueList, state.queue || coordination.queue || []);
  const resolvedNextBestAction = nextBestAction && nextBestAction.nextBestAction ? nextBestAction.nextBestAction : nextBestAction;
  setJsonPanel(dom.nextBestActionList, resolvedNextBestAction || coordination.nextBestAction || {});
  setJsonPanel(dom.crossDomainList, coordination.domains || {});
}

function bindNavigation() {
  document.querySelectorAll('[data-target]').forEach(function (button) {
    button.addEventListener('click', function () {
      const target = document.getElementById(button.dataset.target);
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });

  document.querySelectorAll('[data-graph-filter]').forEach(function (button) {
    button.addEventListener('click', function () {
      state.graphFilter = button.dataset.graphFilter;
      document.querySelectorAll('[data-graph-filter]').forEach(function (chip) {
        chip.classList.toggle('active', chip === button);
      });
      renderAll();
    });
  });
}

function bindControls() {
  dom.modelCompanyBtn.addEventListener('click', modelCompany);
  dom.refreshBtn.addEventListener('click', sync);
  dom.commandRunBtn.addEventListener('click', submitCommand);
  dom.missionLaunchBtn.addEventListener('click', submitCommand);
  dom.missionCreateBtn.addEventListener('click', createMission);
  dom.simulationRunBtn.addEventListener('click', runSimulation);
  if (dom.workflowRunBtn) dom.workflowRunBtn.addEventListener('click', runOperatorWorkflow);
  if (dom.workflowDomain) dom.workflowDomain.addEventListener('change', function () { state.workflowDomain = dom.workflowDomain.value; });
  if (dom.searchInput) dom.searchInput.addEventListener('input', function () { setSearchQuery(dom.searchInput.value); });
  if (dom.clearSearchBtn) dom.clearSearchBtn.addEventListener('click', function () { setSearchQuery(''); });

  const graph = dom.graphSvg;
  graph.addEventListener('click', function (event) {
    const node = event.target.closest('[data-node-id]');
    if (node) {
      selectEntity(node.dataset.nodeId);
    }
  });
}

function bootstrap() {
  bindNavigation();
  bindControls();
  if (dom.workflowDomain) dom.workflowDomain.value = state.workflowDomain;
  if (dom.searchInput) dom.searchInput.value = state.searchQuery;
  state.liveFeed.unshift({ at: new Date().toISOString(), message: 'CYVX cockpit initialized' });
  sync();
  setInterval(sync, 30000);
}

window.addEventListener('DOMContentLoaded', bootstrap);
window.__cyvxSelectEntity = selectEntity;
