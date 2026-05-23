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

const { EventEmitter } = require("node:events");
const path = require("node:path");
const { CyvxDatabase } = require("../db");
const { StatusModel } = require("./governance/status_model");
const { ConstitutionalInvariants } = require("./governance/constitutional_invariants");
const { NetworkingTier } = require("./tier0/networking");
const { HardwareTier } = require("./tier0/hardware");
const { InternetIntelligence } = require("./tier0/internet_intelligence");
const { RaftCluster } = require("./tier1/raft");
const { StorageTier } = require("./tier1/storage");
const { SensorHub } = require("./perception/sensors");
const { IntelligenceEnsemble } = require("./intelligence/ensemble");
const { CausalGraph } = require("./causal/causal_graph");
const { RootCauseAnalyzer } = require("./causal/root_cause");
const { InterventionPlanner } = require("./causal/intervention_planner");
const { PatternMemory } = require("./neural/pattern_memory");
const { CollectiveIntelligenceNetwork } = require("./neural/collective_intelligence");
const { DreamCycle } = require("./neural/dream_cycle");
const { ComputeExchange } = require("./economy/compute_exchange");
const { ComputeFuturesMarket } = require("./economy/futures");
const { CarbonIntelligenceEconomy } = require("./economy/carbon_credits");
const { InfrastructureInsurance } = require("./economy/insurance");
const { BlockchainChain } = require("./blockchain/chain");
const { TokenEconomy } = require("./blockchain/token_economy");
const { ProofOfOptimization } = require("./blockchain/consensus");
const { InfrastructureKG } = require("./knowledge/infrastructure_kg");
const { RunbookAI } = require("./knowledge/runbook_ai");
const { InstitutionalMemory } = require("./knowledge/institutional_memory");
const { SelfHealing } = require("./automation/self_healing");
const { DeploymentIntelligence } = require("./automation/deployment_intelligence");
const { ThreatIntelligence } = require("./security/threat_intelligence");
const { ComplianceEngine } = require("./security/compliance_engine");
const { CostIntelligence } = require("./financial/cost_intelligence");
const { RevenueStreams } = require("./financial/revenue_streams");
const { CompleteFinancialModel } = require("./financial/complete_model");
const { MultiCloudArbitrage } = require("./platform/multi_cloud_arbitrage");
const { KubernetesIntelligence } = require("./platform/kubernetes_intelligence");
const { ServerlessIntelligence } = require("./platform/serverless_intelligence");
const { DecisionSupport } = require("./human/decision_support");
const { CognitiveLoadReducer } = require("./human/cognitive_load_reducer");
const { ExpertiseCapture } = require("./human/expertise_capture");
const { OnboardingIntelligence } = require("./human/onboarding_intelligence");
const { InternetWeather } = require("./global/internet_weather");
const { SupplyChainIntelligence } = require("./global/supply_chain_intelligence");
const { Localization } = require("./global/localization");
const { RegulatoryIntelligence } = require("./global/regulatory_intelligence");
const { SovereignCloud } = require("./global/sovereign_cloud");
const { createEcommerceAgent } = require("./verticals/ecommerce_agent");
const { createFintechAgent } = require("./verticals/fintech_agent");
const { createGamingAgent } = require("./verticals/gaming_agent");
const { createHealthtechAgent } = require("./verticals/healthtech_agent");
const { createMLPlatformAgent } = require("./verticals/ml_platform_agent");
const { createAerospaceAgent } = require("./verticals/aerospace");
const { createAutonomousVehiclesAgent } = require("./verticals/autonomous_vehicles");
const { createBiotechAgent } = require("./verticals/biotech");
const { createEnergyAgent } = require("./verticals/energy");
const { createLegalTechAgent } = require("./verticals/legal_tech");
const { createMediaEntertainmentAgent } = require("./verticals/media_entertainment");
const { createRealEstateAgent } = require("./verticals/real_estate");
const { createSupplyChainAgent } = require("./verticals/supply_chain");
const { SDKGenerator } = require("./ecosystem/sdk_generator");
const { PluginSystem } = require("./ecosystem/plugin_system");
const { TestingFramework } = require("./ecosystem/testing_framework");
const { ObservabilitySDK } = require("./ecosystem/observability_sdk");
const { EcosystemPartnerAPI } = require("./ecosystem/partner_api");
const { Licensing } = require("./revenue/licensing");
const { Metering } = require("./revenue/metering");
const { Marketplace } = require("./revenue/marketplace");
const { PricingOptimizer } = require("./revenue/pricing_optimizer");
const { ValueDemonstrator } = require("./revenue/value_demonstrator");
const { ExpansionEngine } = require("./revenue/expansion_engine");
const { SelfImprovementResearcher } = require("./research/self_improvement_researcher");
const { CompetitiveIntelligence } = require("./research/competitive_intelligence");
const { PatentMonitor } = require("./research/patent_monitor");
const { SlackIntegration } = require("./integrations/slack");
const { PagerDutyIntegration } = require("./integrations/pagerduty");
const { GitHubIntegration } = require("./integrations/github");
const { TerraformIntegration } = require("./integrations/terraform");
const { DatadogIntegration } = require("./integrations/datadog");
const { envelope, attribution } = require("./shared/attribution");
const runtimePlanes = {
  containerRuntime: require("../runtime/container_runtime"),
  namespaceIsolation: require("../runtime/namespace_isolation"),
  sandboxExecutor: require("../runtime/sandbox_executor"),
  seccompFilters: require("../runtime/seccomp_filters"),
  cgroupsManager: require("../runtime/cgroups_manager"),
};
const schedulerPlanes = {
  fairnessEngine: require("../scheduler/fairness_engine"),
  quotaManager: require("../scheduler/quota_manager"),
  resourceLedger: require("../scheduler/resource_ledger"),
  starvationPrevention: require("../scheduler/starvation_prevention"),
};
const observabilityPlanes = {
  distributedTracing: require("../observability/distributed_tracing"),
  highCardinalityEngine: require("../observability/high_cardinality_engine"),
  otelPipeline: require("../observability/otel_pipeline"),
  streamProcessor: require("../observability/stream_processor"),
};
const formalPlanes = {
  autonomyBounds: require("../formal/autonomy_bounds"),
  invariantChecker: require("../formal/invariant_checker"),
  modelValidator: require("../formal/model_validator"),
};
const dataPlanes = {
  complianceRetention: require("../data/compliance_retention"),
  lineageEngine: require("../data/lineage_engine"),
  provenanceTracker: require("../data/provenance_tracker"),
};
const controlPlanes = {
  adaptiveControl: require("../control/adaptive_control"),
  oscillationDetector: require("../control/oscillation_detector"),
  pidController: require("../control/pid_controller"),
  stabilityAnalysis: require("../control/stability_analysis"),
};
const sciencePlanes = {
  experimentPlanner: require("../science/experiment_planner"),
  hypothesisEngine: require("../science/hypothesis_engine"),
  theoryRanker: require("../science/theory_ranker"),
};
const physicsPlanes = {
  entropyBalancer: require("../physics/entropy_balancer"),
  lightSpeedScheduler: require("../physics/light_speed_scheduler"),
};
const thermodynamicsPlanes = {
  energyArbitrage: require("../thermodynamics/energy_arbitrage"),
  entropyEngine: require("../thermodynamics/entropy_engine"),
  heatTopology: require("../thermodynamics/heat_topology"),
  powerFieldOptimizer: require("../thermodynamics/power_field_optimizer"),
};
const civilizationPlanes = {
  computePolitics: require("../civilization/compute_politics"),
  diplomaticEngine: require("../civilization/diplomatic_engine"),
  sovereignMarketplace: require("../civilization/sovereign_marketplace"),
  treatyGraph: require("../civilization/treaty_graph"),
};
const futuresPlanes = {
  parallelTimelines: require("../futures/parallel_timelines"),
  stabilityLandscape: require("../futures/stability_landscape"),
  trajectoryEngine: require("../futures/trajectory_engine"),
};
const internetPlanes = {
  bgpWavePredictor: require("../internet/bgp_wave_predictor"),
  cableRiskEngine: require("../internet/cable_risk_engine"),
  globalWeatherModel: require("../internet/global_weather_model"),
  latencyAtmosphere: require("../internet/latency_atmosphere"),
};
const mlPlanes = {
  driftDetection: require("../ml/drift_detection"),
  evaluationHarness: require("../ml/evaluation_harness"),
  modelRegistry: require("../ml/model_registry"),
  trainingPipeline: require("../ml/training_pipeline"),
};

class CyvxController extends EventEmitter {
  constructor(options = {}) {
    super();
    this.options = {
      version: "6.0.0",
      port: 3000,
      ...options,
    };
    this.db = new CyvxDatabase(options.dbFile);
    this.metrics = { events: 0, evolutionCycles: 0 };
    this.modules = {};
    this.statusModel = new StatusModel();
    this.timers = [];
    this.startedAt = null;
    this.agents = [];
    this.genomePool = null;
    this.workloads = [];
    this.actions = [];
    this.websocketClients = new Set();
  }

  async boot() {
    this.db.open();
    this.startedAt = new Date().toISOString();
    this.modules = this.buildModules();
    this.modules.constitution = new ConstitutionalInvariants();
    this.modules.networking = new NetworkingTier({ nodeId: this.options.nodeId });
    this.modules.hardware = new HardwareTier();
    this.modules.internet = new InternetIntelligence();
    this.modules.raft = new RaftCluster(this.options.nodeId || "cyvx-node-1");
    this.modules.storage = new StorageTier();
    this.modules.perception = new SensorHub(this.modules);
    this.modules.intelligence = new IntelligenceEnsemble();
    this.modules.causalGraph = new CausalGraph();
    this.modules.rootCause = new RootCauseAnalyzer(this.modules.causalGraph);
    this.modules.interventionPlanner = new InterventionPlanner(this.modules.causalGraph);
    this.modules.patternMemory = new PatternMemory();
    this.modules.collective = new CollectiveIntelligenceNetwork();
    this.modules.dreamCycle = new DreamCycle(this.modules.patternMemory);
    this.modules.computeExchange = new ComputeExchange();
    this.modules.futures = new ComputeFuturesMarket();
    this.modules.carbon = new CarbonIntelligenceEconomy();
    this.modules.insurance = new InfrastructureInsurance();
    this.modules.chain = new BlockchainChain();
    this.modules.tokenEconomy = new TokenEconomy();
    this.modules.consensus = new ProofOfOptimization();
    this.modules.knowledgeGraph = new InfrastructureKG();
    this.modules.runbook = new RunbookAI();
    this.modules.memory = new InstitutionalMemory();
    this.modules.selfHealing = new SelfHealing();
    this.modules.deployment = new DeploymentIntelligence();
    this.modules.threat = new ThreatIntelligence();
    this.modules.compliance = new ComplianceEngine();
    this.modules.cost = new CostIntelligence();
    this.modules.revenue = new RevenueStreams();
    this.modules.finance = new CompleteFinancialModel();
    this.modules.arbitrage = new MultiCloudArbitrage();
    this.modules.kubernetes = new KubernetesIntelligence();
    this.modules.serverless = new ServerlessIntelligence();
    this.modules.decisionSupport = new DecisionSupport();
    this.modules.loadReducer = new CognitiveLoadReducer();
    this.modules.expertiseCapture = new ExpertiseCapture();
    this.modules.onboarding = new OnboardingIntelligence();
    this.modules.internetWeather = new InternetWeather();
    this.modules.supplyChain = new SupplyChainIntelligence();
    this.modules.localization = new Localization();
    this.modules.regulatory = new RegulatoryIntelligence();
    this.modules.sovereignCloud = new SovereignCloud();
    this.modules.sdkGenerator = new SDKGenerator();
    this.modules.plugins = new PluginSystem();
    this.modules.testing = new TestingFramework();
    this.modules.observability = new ObservabilitySDK();
    this.modules.partnerApi = new EcosystemPartnerAPI();
    this.modules.licensing = new Licensing();
    this.modules.metering = new Metering();
    this.modules.marketplace = new Marketplace();
    this.modules.pricing = new PricingOptimizer();
    this.modules.value = new ValueDemonstrator();
    this.modules.expansion = new ExpansionEngine();
    this.modules.research = new SelfImprovementResearcher();
    this.modules.competitive = new CompetitiveIntelligence();
    this.modules.patents = new PatentMonitor();
    this.modules.slack = new SlackIntegration();
    this.modules.pagerduty = new PagerDutyIntegration();
    this.modules.github = new GitHubIntegration();
    this.modules.terraform = new TerraformIntegration();
    this.modules.datadog = new DatadogIntegration();
    this.modules.planes = {
      runtime: runtimePlanes,
      scheduler: schedulerPlanes,
      observability: observabilityPlanes,
      formal: formalPlanes,
      data: dataPlanes,
      control: controlPlanes,
      science: sciencePlanes,
      physics: physicsPlanes,
      thermodynamics: thermodynamicsPlanes,
      civilization: civilizationPlanes,
      futures: futuresPlanes,
      internet: internetPlanes,
      ml: mlPlanes,
    };

    this.statusModel.set("controller", "IMPLEMENTING", { tier: "tier-2" });
    this.statusModel.set("networking", "IMPLEMENTING", { tier: "tier-0" });
    this.statusModel.set("hardware", "IMPLEMENTING", { tier: "tier-0" });
    this.statusModel.set("internet", "PLANNING", { tier: "tier-0" });
    this.statusModel.set("raft", "IMPLEMENTING", { tier: "tier-1" });
    this.statusModel.set("storage", "IMPLEMENTING", { tier: "tier-1" });
    this.statusModel.set("runtime", "IMPLEMENTING", { tier: "tier-2" });
    this.statusModel.set("scheduler", "IMPLEMENTING", { tier: "tier-2" });
    this.statusModel.set("observability", "IMPLEMENTING", { tier: "tier-2" });
    this.statusModel.set("formal", "IMPLEMENTING", { tier: "tier-2" });
    this.statusModel.set("data", "IMPLEMENTING", { tier: "tier-2" });
    this.statusModel.set("control", "IMPLEMENTING", { tier: "tier-2" });
    this.statusModel.set("science", "IMPLEMENTING", { tier: "tier-2" });
    this.statusModel.set("physics", "IMPLEMENTING", { tier: "tier-2" });
    this.statusModel.set("thermodynamics", "IMPLEMENTING", { tier: "tier-2" });
    this.statusModel.set("civilization", "IMPLEMENTING", { tier: "tier-2" });
    this.statusModel.set("futures", "IMPLEMENTING", { tier: "tier-2" });
    this.statusModel.set("ml", "IMPLEMENTING", { tier: "tier-2" });

    const pool = this.db.loadGenomePool() || this.seedGenomePool();
    this.genomePool = pool;
    this.agents = this.loadAgents();
    this.db.upsertAgents(this.agents);

    this.startPlaneGroups();
    await this.loadEvolutionModules();
    this.startAutonomousLoop();
    this.scheduleDreamCycle();
    this.emit("boot", this.status());
    return this.status();
  }

  buildModules() {
    return {
      verticals: [
        createFintechAgent(), createHealthtechAgent(), createGamingAgent(), createEcommerceAgent(), createMLPlatformAgent(),
        createAerospaceAgent(), createAutonomousVehiclesAgent(), createBiotechAgent(), createEnergyAgent(),
        createLegalTechAgent(), createMediaEntertainmentAgent(), createRealEstateAgent(), createSupplyChainAgent(),
      ],
    };
  }

  startPlaneGroups() {
    for (const group of Object.values(this.modules.planes || {})) {
      for (const mod of Object.values(group)) {
        if (mod && typeof mod.start === "function") {
          mod.start({ controller: this, db: this.db });
        }
      }
    }
  }

  seedGenomePool() {
    const pool = Array.from({ length: 8 }, (_, i) => ({
      id: `genome-${i + 1}`,
      costWeight: 0.4 + i * 0.03,
      performanceWeight: 0.6 - i * 0.02,
      riskTolerance: 0.3 + i * 0.01,
    }));
    this.db.saveGenomePool(pool);
    return pool;
  }

  loadAgents() {
    return this.genomePool.map((genome, index) => ({
      id: `agent-${index + 1}`,
      credits: 100 - index * 3,
      age: 0,
      wins: 0,
      losses: 0,
      genome: { ...genome },
      specialization: index % 2 === 0 ? "Performance Guardian" : "Cost Optimizer",
    }));
  }

  async loadEvolutionModules() {
    const mod = await import(pathToFileURL(path.join(__dirname, "evolution/sexual_reproduction.js")).href);
    this.evolution = {
      crossoverGenomes: mod.crossoverGenomes,
      reproduce: mod.reproduce,
    };
  }

  startAutonomousLoop() {
    const tick = () => {
      const snapshot = this.snapshot();
      const readings = this.modules.perception.sample(snapshot).readings;
      const intelligence = this.modules.intelligence.evaluate(readings, { horizon: 60 });
      const payload = {
        at: new Date().toISOString(),
        readings,
        intelligence: intelligence.data,
        cluster: snapshot.cluster,
      };
      this.metrics.events += 1;
      this.metrics.evolutionCycles += 1;
      this.db.appendEvent("autonomous-loop", payload);
      this.db.recordMetric("autonomous-loop", payload);
      this.broadcast("event", payload);
      this.emit("event", payload);
      this.lastAutonomousEvent = payload;
    };
    tick();
    const interval = setInterval(tick, 15000);
    interval.unref?.();
    this.timers.push(interval);
  }

  scheduleDreamCycle() {
    const schedule = () => {
      const now = new Date();
      const next = new Date(now);
      next.setUTCHours(3, 0, 0, 0);
      if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
      const timeout = setTimeout(() => {
        const episode = this.modules.patternMemory.episodes.slice(-20);
        const result = this.modules.dreamCycle.enterDreamState(episode);
        this.modules.dreamCycle.consolidateLearning();
        this.db.appendEvent("dream-cycle", result.data);
        this.broadcast("dream", result.data);
        schedule();
      }, next - now);
      timeout.unref?.();
      this.timers.push(timeout);
    };
    schedule();
  }

  snapshot() {
    const agents = this.agents.map((agent) => ({ ...agent, genome: { ...agent.genome } }));
    const leaderboard = [...agents].sort((a, b) => b.credits - a.credits);
    const cluster = {
      nodes: [{ id: "node-1", cpu_capacity: 32, cpu_used: 18, healthy: true, cost_per_hour: 2.75 }],
      workloads: this.workloads.length ? this.workloads : [{ id: "workload-1", cpu_request: 2, replicas: 3, target_latency_ms: 120 }],
      history: this.db.history(null, 20),
    };
    return {
      agents,
      leaderboard,
      cluster,
      genomePool: this.genomePool,
      roadmap: this.roadmap(),
      status: this.status(),
    };
  }

  status() {
    return {
      powered_by: "CYVX",
      creator: attribution.creator,
      version: this.options.version,
      timestamp: new Date().toISOString(),
      startedAt: this.startedAt,
      modules: this.moduleCount(),
      agents: this.agents.length,
      genomePool: this.genomePool?.length || 0,
      evolutionCycles: this.metrics.evolutionCycles,
      events: this.metrics.events,
      moduleStatuses: this.statusModel.snapshot().data.modules.length,
      planeGroups: Object.keys(this.modules.planes || {}).length,
    };
  }

  roadmap() {
    return {
      statusModel: this.statusModel.snapshot().data,
      constitution: this.modules.constitution?.rules || [],
      planes: this.planeRoadmap(),
      tier0: {
        networking: this.modules.networking ? "online" : "offline",
        hardware: this.modules.hardware ? "online" : "offline",
        internet: this.modules.internet ? "online" : "offline",
      },
      tier1: {
        raft: this.modules.raft ? "online" : "offline",
        storage: this.modules.storage ? "online" : "offline",
      },
    };
  }

  moduleCount() {
    return this.countModules(this.modules);
  }

  countModules(value, seen = new Set()) {
    if (!value) return 0;
    if (Array.isArray(value)) {
      return value.reduce((sum, item) => sum + this.countModules(item, seen), 0);
    }
    if (typeof value === "object") {
      if (seen.has(value)) return 0;
      seen.add(value);
      if (typeof value.status === "function" || typeof value.start === "function" || typeof value.tick === "function") {
        return 1;
      }
      return Object.values(value).reduce((sum, item) => sum + this.countModules(item, seen), 0);
    }
    return 0;
  }

  planeRoadmap() {
    const groups = this.modules.planes || {};
    return Object.fromEntries(
      Object.entries(groups).map(([group, mods]) => [
        group,
        Object.fromEntries(
          Object.entries(mods).map(([name, mod]) => [
            name,
            typeof mod?.status === "function" ? (mod.status().data?.status || mod.status().name || "online") : "offline",
          ]),
        ),
      ]),
    );
  }

  leaderboard() {
    return this.snapshot().leaderboard;
  }

  agentsSnapshot() {
    return this.snapshot().agents;
  }

  async ask(task, context = {}) {
    const prompt = typeof task === "string" ? task : JSON.stringify(task);
    const intent = this.classifyTask(prompt);
    const cluster = this.snapshot().cluster;
    let response = { intent, prompt, plan: [], explanation: "" };
    if (intent === "optimize-cluster") {
      const proposal = this.modules.intelligence.evaluate(this.modules.perception.sample(cluster).readings, context);
      response.plan = [proposal.data.winner, this.modules.interventionPlanner.plan("workload-1").data];
      response.explanation = "CYVX optimized cluster placement using perception, intelligence, and causal planning.";
    } else if (intent === "scale-api") {
      response.plan = [this.modules.kubernetes.recommend(cluster).data, this.modules.serverless.tune([{ concurrency: 10, coldStartMs: 120 }]).data];
      response.explanation = "CYVX prepared a scaling plan across Kubernetes and serverless layers.";
    } else {
      response.plan = [this.modules.runbook.generate({ title: "General Ask" }).data];
      response.explanation = "CYVX produced a generic operational plan.";
    }
    this.db.appendEvent("ask", response);
    this.broadcast("ask", response);
    return envelope("ask-response", {
      ...response,
      status: "ok",
    }, this.status());
  }

  submitWorkload(workload) {
    const record = {
      id: workload.id || `workload-${this.workloads.length + 1}`,
      tenant: workload.tenant || "default",
      name: workload.name || "workload",
      cpu_request: Number(workload.cpu_request || 1),
      mem_request_mb: Number(workload.mem_request_mb || 512),
      net_request_mb: Number(workload.net_request_mb || 128),
      replicas: Number(workload.replicas || 1),
      target_latency_ms: Number(workload.target_latency_ms || 120),
      target_availability: Number(workload.target_availability || 0.999),
      constraints: workload.constraints || {},
      assigned_node_id: "node-1",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    this.workloads.push(record);
    this.db.appendEvent("workload", record);
    this.broadcast("workload", record);
    return { accepted: true, workload: record, cluster: this.snapshot().cluster };
  }

  executeAction(action = {}) {
    const result = {
      accepted: true,
      message: "action executed",
      before: this.snapshot().cluster,
      after: this.snapshot().cluster,
      action,
    };
    if (action.type === "scale_up" || action.type === "scale_down") {
      const workload = this.workloads.find((item) => item.id === action.workload_id);
      if (workload) workload.replicas = Math.max(1, Number(action.replicas || workload.replicas));
    }
    if (action.type === "migrate") {
      const workload = this.workloads.find((item) => item.id === action.workload_id);
      if (workload) workload.assigned_node_id = action.node_id || "node-1";
    }
    this.actions.push(result);
    this.db.appendEvent("action", result);
    this.broadcast("action", result);
    return result;
  }

  history() {
    return this.db.history(null, 200);
  }

  classifyTask(task) {
    const text = String(task).toLowerCase();
    if (text.includes("optimize:cluster") || text.includes("optimize cluster")) return "optimize-cluster";
    if (text.includes("scale") || text.includes("capacity")) return "scale-api";
    return "general";
  }

  broadcast(type, payload) {
    const message = JSON.stringify({ type, payload, timestamp: new Date().toISOString() });
    for (const ws of this.websocketClients) {
      if (ws.readyState === 1) ws.send(message);
    }
  }

  registerSocket(ws) {
    this.websocketClients.add(ws);
    ws.on("close", () => this.websocketClients.delete(ws));
    ws.send(JSON.stringify({ type: "hello", payload: this.status() }));
  }

  stop() {
    for (const timer of this.timers) clearInterval(timer) || clearTimeout(timer);
    this.timers = [];
    this.db.upsertAgents(this.agents);
  }
}

function pathToFileURL(file) {
  return require("node:url").pathToFileURL(file);
}

module.exports = { CyvxController };
