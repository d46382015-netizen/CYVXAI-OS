"use strict";

function augmentRealityEngine(PlatformKernel, models) {
  if (PlatformKernel.prototype.__cyvxRealityEngineAugmented) return;
  PlatformKernel.prototype.__cyvxRealityEngineAugmented = true;

  PlatformKernel.prototype.realityEngine = function realityEngine(input = {}) {
    const state = this.snapshot();
    const thesis = safeCall(() => this.thesisEngine(), {});
    const decision = safeCall(() => this.decisionIntelligence(), {});
    const reality = safeCall(() => this.reality(), {});
    const portfolio = safeCall(() => this.portfolio(), {});
    const proof = safeCall(() => this.proof(), {});
    const repositoryHealth = safeCall(() => this.repositoryHealth(), {});
    const decisionImprovementRate = safeCall(() => this.decisionImprovementRate(), {});

    const outcomes = Array.isArray(state.outcomes) ? state.outcomes : [];
    const decisions = Array.isArray(state.decisions) ? state.decisions : [];
    const simulations = Array.isArray(state.simulations) ? state.simulations : [];
    const predictions = Array.isArray(state.thesisPredictions) ? state.thesisPredictions : [];
    const loops = Array.isArray(state.thesisLoops) ? state.thesisLoops : [];
    const calibrations = Array.isArray(state.decisionCalibrationRecords) ? state.decisionCalibrationRecords : [];
    const memories = Array.isArray(state.decisionMemories) ? state.decisionMemories : [];
    const trusts = Array.isArray(state.trusts) ? state.trusts : [];
    const opportunities = Array.isArray(state.opportunities) ? state.opportunities : [];
    const patterns = Array.isArray(state.patterns) ? state.patterns : [];

    const verifiedOutcomeVolume = outcomes.filter((item) => item && (item.actual_outcome != null || item.measured != null || item.value != null)).length;
    const loopCount = Math.max(verifiedOutcomeVolume, outcomes.length, decisions.length, predictions.length, loops.length, calibrations.length);
    const predictionErrorSeries = seriesFrom(outcomes, ["prediction_error", "reality_gap.prediction_error", "delta.prediction_error"]);
    const calibrationSeries = seriesFrom(calibrations, ["calibration_accuracy", "decision_quality_score", "improvement_rate"]);
    const trustSeries = trusts.map((item) => numberFrom(item && (item.trust_score != null ? item.trust_score : item.score)));
    const errorTrend = trend(predictionErrorSeries);
    const calibrationTrend = trend(calibrationSeries);
    const trustTrend = trend(trustSeries);
    const proofDensity = proofDensityScore(proof);
    const lessWrongSignal = verifiedOutcomeVolume > 0 && (errorTrend < 0 || calibrationTrend > 0 || decisionImprovementRateScore(decisionImprovementRate) > 0);

    const opportunitiesMap = buildOpportunityMap({
      opportunityCount: opportunities.length,
      patternCount: patterns.length,
      loopCount,
      verifiedOutcomeVolume,
      errorTrend,
      calibrationTrend,
      trustTrend,
    });
    const barriers = buildBarrierMap({
      verifiedOutcomeVolume,
      loopCount,
      predictionErrorSeries,
      calibrationSeries,
      trustSeries,
    });
    const strategicPaths = buildStrategicPaths({
      loopCount,
      verifiedOutcomeVolume,
      proofDensity,
      decisionImprovementRate,
    });
    const deploymentPaths = buildDeploymentPaths({
      verifiedOutcomeVolume,
      loopCount,
      proofDensity,
    });
    const predictionEngine = buildPredictionEngine({
      state,
      proofDensity,
      errorTrend,
      calibrationTrend,
      trustTrend,
      loopCount,
    });
    const realityVerificationPlan = buildRealityVerificationPlan({
      verifiedOutcomeVolume,
      errorTrend,
      calibrationTrend,
    });
    const endgameModel = buildEndgameModel({
      verifiedOutcomeVolume,
      loopCount,
    });

    const realityDomains = {
      geography: {
        coverage: "Public structured data",
        share: "40-60%",
        sources: ["U.S. Census", "TIGER/Line", "USGS", "National Map", "State GIS portals", "County GIS portals"],
        entities: ["Country", "State", "County", "City", "Zip Code", "Census Tract", "Parcel", "Building", "Land Use"],
      },
      population: {
        coverage: "Public structured data",
        share: "40-60%",
        sources: ["Census", "ACS", "State demographic agencies"],
        entities: ["Population", "Migration", "Households", "Age", "Income", "Education", "Language", "Veterans"],
      },
      real_estate: {
        coverage: "Public structured + local operational data",
        share: "15-25%",
        sources: ["County assessor data", "Parcel data", "Zillow research datasets", "HUD"],
        entities: ["Parcel", "Property", "Owner", "Assessment", "Sale", "Permit", "Zoning"],
      },
      transportation: {
        coverage: "Public structured + operational data",
        share: "15-25%",
        sources: ["USDOT", "FAA", "FRA", "State DOTs", "Transit agencies"],
        entities: ["Road", "Bridge", "Tunnel", "Rail", "Airport", "Port", "Transit", "Fleet", "Route"],
      },
      energy: {
        coverage: "Public structured + operator data",
        share: "10-20%",
        sources: ["EIA", "DOE", "FERC", "Regional grid operators"],
        entities: ["Power Plant", "Substation", "Transmission Line", "Pipeline", "Solar Farm", "Wind Farm", "Battery Storage"],
      },
      water: {
        coverage: "Public structured + operator data",
        share: "10-20%",
        sources: ["EPA", "USGS", "State environmental agencies"],
        entities: ["River", "Reservoir", "Dam", "Water Plant", "Wastewater Plant", "Aquifer"],
      },
      telecommunications: {
        coverage: "Public structured + operator data",
        share: "10-20%",
        sources: ["FCC", "Broadband maps", "Carrier coverage maps"],
        entities: ["Fiber Route", "Cell Tower", "Data Center", "Internet Exchange", "Network"],
      },
      government: {
        coverage: "Public structured + institutional data",
        share: "40-60%",
        sources: ["Federal agencies", "State agencies", "County portals", "City portals"],
        entities: ["Agency", "Department", "Program", "Grant", "Budget", "Official", "Policy"],
      },
      economics: {
        coverage: "Public structured data",
        share: "40-60%",
        sources: ["BEA", "BLS", "FRED", "Treasury"],
        entities: ["Industry", "Employment", "GDP", "Wages", "Inflation", "Investment"],
      },
      finance: {
        coverage: "Public structured data",
        share: "15-25%",
        sources: ["SEC", "FDIC", "Federal Reserve"],
        entities: ["Company", "Bank", "Fund", "Debt", "Equity", "Loan"],
      },
      corporate: {
        coverage: "Public semi-structured data",
        share: "15-25%",
        sources: ["SEC filings", "OpenCorporates", "State registries"],
        entities: ["Corporation", "Subsidiary", "Board", "Executive", "Investor"],
      },
      healthcare: {
        coverage: "Public structured data",
        share: "15-25%",
        sources: ["CMS", "HHS", "State health departments"],
        entities: ["Hospital", "Clinic", "Provider", "Insurer", "Patient Population", "Medical Device"],
      },
      education: {
        coverage: "Public structured data",
        share: "15-25%",
        sources: ["Department of Education", "NCES"],
        entities: ["School", "College", "University", "Program", "Research Center"],
      },
      research: {
        coverage: "Public semi-structured data",
        share: "10-20%",
        sources: ["NSF", "NIH", "Universities"],
        entities: ["Grant", "Research Lab", "Patent", "Publication", "Technology"],
      },
      workforce: {
        coverage: "Public structured + organizational data",
        share: "15-25%",
        sources: ["BLS", "State labor departments"],
        entities: ["Occupation", "Certification", "Skill", "Training Pipeline"],
      },
      manufacturing: {
        coverage: "Public semi-structured + operational data",
        share: "10-20%",
        sources: ["Census Economic Census", "Industry associations"],
        entities: ["Factory", "Supplier", "Distributor", "Warehouse"],
      },
      agriculture: {
        coverage: "Public structured + operational data",
        share: "10-20%",
        sources: ["USDA", "NASS"],
        entities: ["Farm", "Crop", "Livestock", "Processor", "Storage"],
      },
      supply_chains: {
        coverage: "Operational data",
        share: "5-15%",
        sources: ["Transportation", "Customs", "Port data"],
        entities: ["Supplier", "Customer", "Shipment", "Route", "Inventory"],
      },
      environment: {
        coverage: "Public structured data",
        share: "40-60%",
        sources: ["EPA", "NOAA", "USGS"],
        entities: ["Flood Zone", "Wildfire Risk", "Air Quality", "Water Quality", "Drought"],
      },
      public_safety: {
        coverage: "Public structured + operational data",
        share: "5-15%",
        sources: ["FBI", "DHS", "State agencies"],
        entities: ["Emergency Service", "Incident", "Response Area", "Resource"],
      },
      housing: {
        coverage: "Public structured + local operational data",
        share: "15-25%",
        sources: ["HUD", "Census", "Local permit data"],
        entities: ["Housing Unit", "Permit", "Development", "Vacancy", "Rent"],
      },
      media: {
        coverage: "Public semi-structured data",
        share: "5-15%",
        sources: ["FCC", "Public media datasets"],
        entities: ["News Outlet", "Publication", "Broadcast Station"],
      },
      information: {
        coverage: "Public semi-structured data",
        share: "15-25%",
        sources: ["Research databases", "Government reports"],
        entities: ["Dataset", "Report", "Indicator", "Signal"],
      },
      technology: {
        coverage: "Public semi-structured + organizational data",
        share: "10-20%",
        sources: ["SEC", "Company APIs", "Public registries"],
        entities: ["Software", "Platform", "Cloud Region", "Data Center", "AI System"],
      },
      legal: {
        coverage: "Public semi-structured data",
        share: "5-15%",
        sources: ["Court systems", "PACER", "State courts"],
        entities: ["Case", "Court", "Judge", "Statute", "Regulation"],
      },
      political: {
        coverage: "Public structured data",
        share: "5-15%",
        sources: ["Election agencies", "FEC"],
        entities: ["Candidate", "Campaign", "Election", "Donation"],
      },
      defense: {
        coverage: "Public semi-structured + procurement data",
        share: "5-15%",
        sources: ["DoD public releases", "Federal procurement"],
        entities: ["Installation", "Contract", "Program", "Vendor"],
      },
      social: {
        coverage: "Human knowledge",
        share: "5-15%",
        sources: ["Community datasets", "Association data", "Public surveys"],
        entities: ["Community", "Association", "Network", "Demographic Group"],
      },
      access: {
        coverage: "Organizational data",
        share: "10-20%",
        sources: ["System policies", "Identity providers", "Directory services"],
        entities: ["Public Access", "Customer Access", "Employee Access", "Partner Access", "Vendor Access", "Regulatory Access", "Administrative Access", "Ownership Access"],
      },
      control: {
        coverage: "Organizational data",
        share: "10-20%",
        sources: ["Governance systems", "Policy systems", "Automation systems"],
        entities: ["Owner", "Operator", "Manager", "Executive", "Board", "Agency", "Policy", "Automation"],
      },
      flows: {
        coverage: "Organizational + operational data",
        share: "5-15%",
        sources: ["Financial rails", "Logistics systems", "Utility telemetry", "Network telemetry"],
        entities: ["Money", "Information", "People", "Energy", "Materials", "Authority", "Trust", "Attention"],
      },
      bottlenecks: {
        coverage: "Operational data",
        share: "5-15%",
        sources: ["Telemetry", "Operations logs", "Capacity reporting"],
        entities: ["Capacity", "Delay", "Dependency", "Single Point of Failure", "Shortage", "Congestion"],
      },
      opportunity: {
        coverage: "Organizational + human knowledge",
        share: "5-15%",
        sources: ["Utilization data", "Operations data", "Market data"],
        entities: ["Underutilized Assets", "Fragmentation", "Automation Potential", "Growth", "Coordination Gaps"],
      },
      meta: {
        coverage: "Meta layer",
        share: "100%",
        sources: ["RealityOS model outputs", "Calibration records", "Learning logs"],
        entities: ["Assumptions", "Confidence", "Unknowns", "Blind Spots", "Knowledge Gaps", "Model Accuracy"],
        known_states: ["Known", "Known Unknown", "Unknown Unknown"],
      },
    };

    const ingestionPriority = [
      "State GIS",
      "County GIS",
      "City Open Data",
      "Census",
      "FRED",
      "BLS",
      "BEA",
      "USAspending",
      "SEC",
      "USDOT",
      "EIA",
      "NWS/NOAA",
      "FCC",
      "CMS",
    ];

    const realityOsModel = {
      name: "RealityOS vΩ",
      reality: "Reality",
      layers: {
        observation: ["Observe", "Read", "Orient", "Understand"],
        reality: ["Entity Engine", "Relationship Engine", "Flow Engine", "Access Engine", "Control Engine", "Time Engine"],
        intelligence: ["Signal Engine", "Trust Engine", "Prediction Engine", "Opportunity Engine", "Risk Engine", "Bottleneck Engine", "Causality Engine", "Intelligence Engine"],
        decision: ["Goal Engine", "Assumption Engine", "Priority Engine", "Intervention Engine", "Value Engine", "Decision Engine"],
        operations: ["Allocation Engine", "Coordination Engine", "Execution Engine", "Optimization Engine", "Governance Engine"],
        learning: ["Measure", "Compare", "Calibrate", "Learn", "Knowledge Gap Engine", "Meta Engine"],
        resilience: ["Resilience Engine", "Recovery", "Adaptation", "Continuity Reality"],
        interface: ["Dashboard", "Mobile Interface", "Alerts", "Recommendations", "Missions", "Executive Console"],
      },
      phone_as_viewport: "The phone is the final presentation layer, not the operating core.",
    };

    const entityModel = {
      abstraction: "Everything = Entity",
      attributes: ["Identity", "State", "Resources", "Capabilities", "Constraints", "Incentives", "Relationships", "Flows", "Access", "Control", "Readings", "Signals", "Predictions", "Opportunities", "Risks", "Bottlenecks", "Priority", "Trust", "Outcomes", "Time"],
      entities: ["People", "Organizations", "Cities", "States", "Countries", "Roads", "Airports", "Utilities", "Power Plants", "Data Centers", "Hospitals", "Universities", "Supply Chains", "Projects", "AI Agents", "Markets", "Events"],
    };

    const compressionPrinciple = {
      raw_reality: ["Millions of Events", "Millions of Entities", "Millions of Relationships"],
      compressed_reality: ["Thousands of Signals", "Hundreds of Issues", "Dozens of Priorities", "Top Actions"],
      principle: "The value is created by compressing reality into attention, not by expanding dashboards.",
    };

    const executiveCore = [
      "Observe",
      "Read",
      "Orient",
      "Understand",
      "Identify Signals",
      "Identify Causes",
      "Identify Constraints",
      "Identify Opportunities",
      "Identify Interventions",
      "Evaluate Value",
      "Prioritize",
      "Decide",
      "Allocate",
      "Coordinate",
      "Execute",
      "Measure",
      "Compare",
      "Calibrate",
      "Learn",
      "Update Assumptions",
      "Identify Knowledge Gaps",
      "Improve",
      "Repeat",
    ];

    const realityLoop = {
      sequence: [
        "Reality",
        "Observe",
        "Verify",
        "Detect Drift",
        "Detect Blind Spots",
        "Identify Constraint",
        "Validate Constraint",
        "Map Dependencies",
        "Map Influence",
        "Analyze Failure Modes",
        "Assess Fragility",
        "Find Leverage Point",
        "Generate Intervention",
        "Evaluate Tradeoffs",
        "Assign Owner",
        "Coordinate",
        "Execute",
        "Measure Outcome",
        "Detect Failure",
        "Compare Expected vs Actual",
        "Identify Failed Assumptions",
        "Calibrate",
        "Store Learning",
        "Update Playbooks",
        "Improve Models",
        "Reduce Reality Gap",
        "Increase Resilience",
        "Reality",
      ],
      purpose: "Continuously compress error, strengthen calibration, and compound institutional intelligence.",
    };
    const learningSystem = {
      unit: ["Observation", "Outcome", "Difference", "Lesson"],
      storage: ["Constraint Pattern", "Intervention", "Outcome", "Lesson"],
      reuse: ["Playbook", "Automation", "Best Practice", "Policy"],
      principle: "Learning becomes reusable.",
    };
    const truthEngine = {
      claim_registry: ["Claim", "Source", "Evidence", "Timestamp", "Location", "Confidence", "Contradictions", "Freshness", "Verification Status"],
      truth_score_formula: "Source Reliability × Evidence Strength × Freshness × Cross-Source Agreement ÷ Contradictions",
      verification_statuses: ["Unverified", "Partially Verified", "Verified", "Conflicting", "Outdated", "False", "Unknown"],
      source_hierarchy: {
        highest_trust: ["Official records", "Sensor/log data", "Direct API data", "Legal filings", "Government datasets", "Audited reports"],
        medium_trust: ["News reports", "Company websites", "Public statements", "Industry databases"],
        lower_trust: ["Social media", "Rumors", "Unattributed claims", "Single-source posts"],
      },
      required_stages: ["Capture Claim", "Identify Source", "Check Timestamp", "Check Location", "Cross-Verify", "Detect Contradictions", "Assign Confidence", "Mark Status"],
      action_rule: "No action unless truth score is above threshold, confidence is above threshold, freshness is valid, contradictions are reviewed, and an owner is assigned.",
      principle: "If it cannot be verified, it can inform attention, but it cannot drive execution.",
    };
    const metaCognitionEngine = {
      loop: ["Reality", "Observe", "Understand", "Evaluate Understanding", "Act"],
      questions: ["Why do we believe this?", "How confident are we?", "What assumptions support this?", "What evidence would prove us wrong?"],
      outputs: ["Confidence review", "Assumption review", "Counterevidence review", "Action eligibility"],
      purpose: "Make the system aware of the quality of its own understanding.",
    };
    const assumptionGraph = {
      chain: ["Fact", "Assumption", "Decision", "Outcome"],
      failure_trace: "If an outcome fails, trace back to the assumption that failed.",
      benefit: "Every intervention becomes traceable and easier to learn from.",
    };
    const realityCoverageMap = {
      states: ["Known", "Known Unknown", "Unknown Unknown"],
      measures: ["Coverage %", "Confidence %", "Blind Spot %"],
      targets: ["Regions", "Organizations", "Infrastructure", "Projects", "Industries"],
      purpose: "Measure how much of reality is actually visible.",
    };
    const causalEngine = {
      chain: ["Signal", "Root Cause", "Constraint", "Intervention"],
      questions: ["What caused this?", "What causes the cause?", "What causes that?"],
      destination: "Root Cause",
    };
    const realityPhysics = {
      flows: ["Money Flow", "Information Flow", "Energy Flow", "Attention Flow", "Authority Flow", "Trust Flow"],
      model: ["Flow", "Constraint", "Accumulation", "Outcome"],
      purpose: "Make each domain behave like a system with governing laws.",
    };
    const frictionEngine = {
      delays: ["Approval Delay", "Information Delay", "Coordination Delay", "Decision Delay", "Execution Delay"],
      question: "What is slowing reality improvement?",
      goal: "Remove friction instead of merely optimizing actions.",
    };
    const opportunityDiscoveryEngine = {
      sources: ["Fragmentation", "Unused Assets", "Unmet Demand", "Coordination Gaps", "Knowledge Gaps"],
      question: "What valuable thing exists but is disconnected?",
      goal: "Surface opportunities hidden in the system.",
    };
    const recursiveLearning = {
      ladder: ["Learn", "Improve Models", "Improve Learning", "Improve Improvement"],
      purpose: "The system learns how to learn.",
    };
    const evolutionEngine = {
      metrics: ["Prediction Accuracy", "Calibration", "Playbook Reuse", "Decision Quality", "Constraint Resolution Rate"],
      question: "Did the system become better?",
      purpose: "Measure whether the system itself evolved.",
    };
    const realityGenome = {
      schema: ["Goals", "Resources", "Capabilities", "Constraints", "Dependencies", "Incentives", "Flows", "Authority", "Trust", "Time"],
      applies_to: ["Person", "Company", "City", "State", "Nation", "Supply Chain"],
      purpose: "Use one schema across every scale of reality.",
    };
    const multiScaleIntelligence = {
      zoom: ["Neighborhood", "City", "Region", "State", "Nation", "Global"],
      purpose: "Let the system zoom in and out seamlessly.",
    };
    const strategicTimeEngine = {
      horizons: ["Now", "Near Future", "Mid-Term", "Long-Term"],
      questions: ["What matters now?", "What matters next?", "What compounds?"],
      purpose: "Track time as strategic context, not just timestamps.",
    };
    const realityMarket = {
      match: ["Problems", "Capabilities", "Resources", "People", "Organizations"],
      questions: ["Who can solve this?", "Who should work together?"],
      purpose: "Match opportunities to capable actors.",
    };
    const executiveCompression = {
      top_views: ["TOP CONSTRAINT", "TOP OPPORTUNITY", "TOP RISK", "TOP MISSION", "TOP ACTION", "EXPECTED IMPACT", "CONFIDENCE", "REALITY GAP"],
      purpose: "Compress the full system into what the operator needs next.",
    };
    const metaReality = {
      self_modeling: ["Models", "Assumptions", "Blind Spots", "Failures", "Learning Process"],
      questions: ["What is RealityOS wrong about?", "What is it missing?", "What should evolve next?"],
      purpose: "Model the system’s own model quality.",
    };
    const controlHierarchy = {
      layers: [
        { layer: "Visibility", question: "What can be seen?" },
        { layer: "Access", question: "Who can interact?" },
        { layer: "Authority", question: "Who can approve?" },
        { layer: "Decision Rights", question: "Who chooses?" },
        { layer: "Resource Control", question: "Who controls money/assets?" },
        { layer: "Workflow Control", question: "Who controls processes?" },
        { layer: "Operational Control", question: "Who controls execution?" },
        { layer: "Policy Control", question: "Who sets rules?" },
        { layer: "Strategic Control", question: "Who sets direction?" },
        { layer: "Outcome Control", question: "Who shapes results?" },
      ],
      capability_model: ["Can Recommend", "Can Approve", "Can Reject", "Can Escalate", "Can Allocate", "Can Execute", "Can Override"],
      resource_domains: ["Device Control", "Decision Control", "Resource Control", "Workflow Control", "Policy Control"],
      principle: "Everything connected is potentially observable; everything observable is potentially understandable; everything understandable is potentially coordinatable; everything coordinatable is potentially improveable.",
    };
    const systemMappingLayer = {
      observation_systems: { entities: ["Cameras", "Sensors", "Dashboards", "Satellites", "Reports"], purpose: "Reality → Signals" },
      communication_systems: { entities: ["Phones", "Networks", "Fiber", "Radio", "Data Centers"], purpose: "Signals → Coordination" },
      mobility_systems: { entities: ["Vehicles", "Fleets", "Transit", "Rail", "Aviation"], purpose: "People / Resources / Equipment → Movement" },
      infrastructure_systems: { entities: ["Power", "Water", "Roads", "Bridges", "Airports", "Ports"], purpose: "Support all other systems" },
    };
    const universalSituationReport = {
      fields: ["TOP CONSTRAINT", "TOP DECISION MAKER", "TOP RESOURCE OWNER", "TOP BOTTLENECK", "TOP LEVERAGE POINT", "TOP MISSION", "TOP RECOMMENDED ACTION", "EXPECTED IMPACT", "CONFIDENCE"],
      template: "Every entity, organization, city, company, or project produces a situation report.",
      example: {
        entity: "City Water System",
        top_constraint: "Aging pump infrastructure",
        top_decision_maker: "Public Works Director",
        top_resource_owner: "City Budget Office",
        top_bottleneck: "Maintenance backlog",
        top_leverage_point: "Predictive maintenance scheduling",
        top_mission: "Reduce service interruptions",
        top_recommended_action: "Replace top 5 failure-prone pumps",
        expected_impact: "35% reduction in outages",
        confidence: "78%",
      },
      control_hierarchy: ["Visibility", "Access", "Authority", "Decision Rights", "Resource Control", "Workflow Control", "Operational Control", "Policy Control", "Strategic Control", "Outcome Control"],
    };
    const metaEngine = {
      purpose: "Improve CYVXAI itself.",
      questions: [
        "Which assumptions are wrong?",
        "Which models are outdated?",
        "Which signals matter most?",
        "Which bottlenecks affect everything?",
        "Which opportunities create 10x leverage?",
        "How can the system improve itself?",
      ],
      assets: [
        "Reality Models",
        "Dependency Maps",
        "Constraint Libraries",
        "Playbooks",
        "Decision Histories",
        "Outcome Histories",
        "Prediction Records",
        "Trust Records",
        "Failure Patterns",
        "Intervention Histories",
        "Optimization Strategies",
      ],
    };
    const successMetrics = {
      reality_gap: "Difference between model and observed reality",
      prediction_accuracy: "Share of predictions confirmed by outcomes",
      calibration_score: "How well confidence matches reality",
      trust_score: "Reliability of signals and sources",
      constraint_resolution_rate: "Rate at which bottlenecks are removed",
      decision_to_reality_latency: "Time from decision to measured effect",
      execution_throughput: "Work completed per unit time",
      intervention_success_rate: "Interventions that improve outcomes",
      learning_velocity: "Speed of reusable learning accumulation",
      playbook_reuse_rate: "How often prior learning is reused",
      objective_alignment_score: "Distance between action and objective",
    };
    const digitalTwinStructure = {
      national: {
        root: "USA",
        children: ["Government", "Economy", "Workforce", "Education", "Healthcare", "Energy", "Transportation", "Logistics", "Housing", "Agriculture", "Water", "Communications", "Security", "Environment", "Technology"],
      },
      scales: ["Company", "City", "State", "Industry", "Supply Chain", "Hospital", "University", "Military Organization", "AI Ecosystem", "Personal Life"],
    };
    const visibilityAuthorityControl = {
      chain: ["Visibility", "Access", "Authority", "Control", "Action", "Effect", "Outcome", "Learning"],
      visibility: ["Can See", "Can Detect", "Can Monitor", "Can Measure", "Can Verify"],
      access: ["Public", "User", "Operator", "Administrator", "Owner", "Regulator", "Partner"],
      authority: ["Can View", "Can Recommend", "Can Approve", "Can Allocate", "Can Direct", "Can Override"],
      control: ["Traffic Management System", "Utility Operations", "Fleet Management", "Project Workflow", "Resource Allocation"],
      actions: ["Route Traffic", "Assign Resources", "Schedule Work", "Deploy Personnel", "Update Policy", "Adjust Workflow"],
      outcomes: ["Reduced Delay", "Increased Throughput", "Lower Cost", "Faster Response", "Higher Capacity"],
    };
    const connectedSystemCategories = {
      observation_systems: ["Cameras", "Sensors", "Satellites", "Reports", "Dashboards"],
      mobility_systems: ["Vehicles", "Fleets", "Transit", "Rail", "Aviation"],
      communication_systems: ["Phones", "Networks", "Fiber", "Radio", "Data Centers"],
      infrastructure_systems: ["Power", "Water", "Roads", "Bridges", "Ports", "Airports"],
      economic_systems: ["Businesses", "Supply Chains", "Markets", "Financial Networks"],
      organizational_systems: ["Governments", "Hospitals", "Universities", "Utilities", "Corporations"],
      decision_systems: ["Policies", "Approvals", "Budgets", "Governance", "Strategy"],
    };
    const realityInterface = {
      interface_stack: ["Reality", "Reality Model", "Reality Graph", "Reality Engine", "Reality Interface", "Human"],
      zoom_stack: [
        { level: "Strategic View", focus: "Nation or organization as a living model", metaphor: "Command center", questions: ["What is growing?", "What is strained?", "What is stable?"] },
        { level: "System View", focus: "A domain as a network of nodes and relationships", metaphor: "Living nervous system", questions: ["What entities exist?", "How are they connected?"] },
        { level: "Flow View", focus: "Money, information, labor, materials, energy, attention", metaphor: "Animated circulation", questions: ["What is moving?", "Where is it blocked?"] },
        { level: "Dependency View", focus: "Hard dependencies and critical chains", metaphor: "Operational backbone", questions: ["What breaks if this fails?", "What must be true?"] },
        { level: "Constraint View", focus: "Capacity, delay, dependency, single point of failure, shortage, congestion", metaphor: "Pressure map", questions: ["What is limiting progress?"] },
        { level: "Ownership View", focus: "Owner, operator, manager, executive, board, agency, policy, automation", metaphor: "Accountability chain", questions: ["Who can change this?"] },
        { level: "Priority View", focus: "Rank opportunities, risks, constraints, and decisions", metaphor: "Attention router", questions: ["What matters now?"] },
      ],
      visual_model: ["3D Globe", "3D Region", "3D Organization", "3D Network"],
      temporal_layer: ["Past", "Present", "Projected"],
      agent_layer: ["Research Agents", "Analysis Agents", "Coordination Agents", "Execution Agents", "Monitoring Agents"],
      end_state: "A navigable operating environment for understanding, coordinating, and improving complex systems.",
    };

    const digitalTwinUsa = {
      geography: "United States",
      entities: ["States", "Counties", "Cities", "Organizations"],
      networks: ["Infrastructure", "Supply Chains", "Energy Networks", "Financial Networks", "Information Networks", "Transportation Networks", "Workforce Networks", "Decision Networks"],
      goal: "Discover what exists, what is connected, what is changing, what matters, what is constrained, what is growing, what is breaking, and what should happen next.",
    };

    const mobileMissionControl = {
      layers: ["Reality", "Observation", "Graph", "Signals", "Intelligence", "Compression", "Attention", "Decision", "Phone"],
      top_views: ["Top Bottleneck", "Top Opportunity", "Top Risk", "Top Action"],
      purpose: "The phone displays the highest-value representation of reality.",
      output_pattern: {
        top_bottleneck: "Workforce shortage",
        top_opportunity: "Regional logistics expansion",
        top_risk: "Grid capacity constraint",
        top_action: "Allocate resources to workforce pipeline",
      },
    };

    const systemMap = {
      core_flow: [
        "Observe",
        "Read",
        "Orient",
        "Understand",
        "Identify Signals",
        "Identify Causes",
        "Identify Constraints",
        "Identify Opportunities",
        "Identify Interventions",
        "Evaluate Value",
        "Prioritize",
        "Decide",
        "Allocate",
        "Coordinate",
        "Execute",
        "Measure",
        "Compare",
        "Calibrate",
        "Learn",
        "Update Assumptions",
        "Identify Knowledge Gaps",
        "Improve",
        "Repeat",
      ],
      operating_rule: "If the loop does not end in verified outcomes, the system is still reporting, not learning.",
      missing_link: "Large volumes of verified outcome data",
    };

    const factMap = {
      facts: [
        { fact: "Architecture exists", evidence: Array.isArray(state.entities) || Array.isArray(state.missions), confidence: 0.99 },
        { fact: "Kernel exists", evidence: typeof this.snapshot === "function", confidence: 0.99 },
        { fact: "Thesis engine exists", evidence: Boolean(thesis && thesis.beliefs), confidence: 0.98 },
        { fact: "Decision intelligence exists", evidence: Boolean(decision && decision.memory_count != null), confidence: 0.98 },
        { fact: "Calibration tracking exists", evidence: calibrations.length > 0 || trusts.length > 0, confidence: 0.95 },
        { fact: "Trust framework exists", evidence: trusts.length > 0, confidence: 0.95 },
        { fact: "Historical replay has begun", evidence: predictions.length > 0 || loops.length > 0, confidence: 0.94 },
        { fact: "Proof framework exists", evidence: Boolean(proof && Object.keys(proof).length), confidence: 0.94 },
        { fact: "Verified outcome volume is present", evidence: verifiedOutcomeVolume > 0, confidence: verifiedOutcomeVolume > 0 ? 0.92 : 0.12 },
      ],
      not_facts: [
        "CYVX improves decisions",
        "CYVX improves outcomes",
        "CYVX becomes less wrong",
        "Customers will pay",
        "Organizations will adopt",
      ],
      verified_outcome_volume: verifiedOutcomeVolume,
      loop_count: loopCount,
      proof_density_percent: proofDensity,
      less_wrong_signal: lessWrongSignal,
    };

    const assumptionMap = [
      buildAssumption("A1", "Prediction accuracy improves with feedback.", 0.45, verifiedOutcomeVolume > 0 ? "Some evidence exists, but the loop is still thin." : "No verified loop volume yet.", "Add repeated prediction-to-outcome records."),
      buildAssumption("A2", "Improved predictions improve decisions.", 0.55, decisionImprovementRateScore(decisionImprovementRate) > 0 ? "Decision quality is directionally positive." : "Decision improvement is not yet demonstrated.", "Show decision quality rising with prediction accuracy."),
      buildAssumption("A3", "Improved decisions improve outcomes.", 0.70, outcomes.length > 0 ? "Outcomes are being recorded." : "Outcome volume is still sparse.", "Tie outcomes to before/after comparisons."),
      buildAssumption("A4", "Organizations value measurable accountability.", 0.35, repositoryHealth && repositoryHealth.score != null ? "Repository health surfaces accountability signals." : "No adoption signal yet.", "Expose accountability as a working product, not a claim."),
      buildAssumption("A5", "Users will tolerate reality measurement.", 0.25, trusts.length > 0 ? "Trust records suggest the idea is tolerated in some contexts." : "Tolerance is not yet proven.", "Reduce friction and make measurement low-cost."),
    ];

    const intelligenceMap = {
      hierarchy: [
        "Data",
        "Observations",
        "Predictions",
        "Decisions",
        "Outcomes",
        "Learning",
        "Calibration",
        "Trust",
      ],
      missing: [
        "Verified outcome volume",
        "Stable baseline comparison",
        "Long-enough feedback loops",
      ],
      current_signals: {
        loop_count: loopCount,
        verified_outcome_volume: verifiedOutcomeVolume,
        prediction_error_trend: round3(errorTrend),
        calibration_trend: round3(calibrationTrend),
        trust_trend: round3(trustTrend),
        decision_improvement_rate: decisionImprovementRate,
      },
      thesis_status: lessWrongSignal ? "Directionally improving" : "Unproven",
    };

    const infrastructureMap = {
      current: [
        "Kernel",
        "Decision intelligence",
        "Thesis engine",
        "Proof layer",
        "Reality graph",
        "Trust records",
      ],
      future: [
        "Outcome dataset",
        "Prediction dataset",
        "Calibration dataset",
        "Benchmark dataset",
        "Replay harness",
        "Baseline comparison service",
      ],
      moat: "Data, not architecture",
    };

    const leverageAnalysis = {
      top_5: [
        "Outcome measurement",
        "Prediction tracking",
        "Calibration",
        "Loop volume",
        "User adoption",
      ],
      highest_leverage_action: "Generate real outcome data.",
      highest_leverage_decision: "Stop expanding architecture and expand evidence.",
      highest_leverage_opportunity: "Decision calibration infrastructure.",
      highest_leverage_experiment: "Historical replay with repeated prediction-to-outcome verification.",
      highest_leverage_risk_reduction: "Shorten feedback loops and require outcome capture.",
    };

    const riskAnalysis = {
      highest_risk: "Building faster than reality validates.",
      main_risks: [
        "Architecture becomes the proxy for value.",
        "Manual data entry blocks outcome volume.",
        "Political resistance blocks measurement.",
        "Long feedback loops delay calibration.",
      ],
    };

    const failureModes = [
      "CYVX becomes AI + dashboards + reports without proving decision improvement.",
      "The repo accumulates abstractions while outcome data remains thin.",
      "Confidence rises faster than calibration.",
    ];

    const compoundingAnalysis = {
      fastest: "Outcome data",
      strongest: "Verified learning",
      longest_lasting: "Calibration history",
      compounding_assets: [
        "Knowledge",
        "Data",
        "Outcome data",
        "Calibration history",
        "Verified learning",
      ],
    };

    const evolutionRoadmap = [
      { stage: "Current", focus: "Architecture", proof: "Platform exists." },
      { stage: "Next", focus: "Evidence", proof: "Verified outcomes start to accumulate." },
      { stage: "Then", focus: "Calibration", proof: "Error trends move downward." },
      { stage: "Then", focus: "Decision improvement", proof: "Baseline comparison turns positive." },
      { stage: "Then", focus: "Adoption", proof: "Users keep using the loop." },
      { stage: "Then", focus: "Infrastructure", proof: "Data becomes the moat." },
    ];

    const oneSentenceCompression = "CYVX succeeds only if prediction-to-outcome loops continuously improve reality through better understanding, better decisions, better execution, and better learning.";

    return {
      powered_by: "CYVX",
      generated_at: new Date().toISOString(),
      objective: input.objective || "Compress the repo toward verified reality loops.",
      executive_summary: {
        thesis: "Evidence is value.",
        current_state: lessWrongSignal ? "Directional improvement is visible." : "Proof is still thin.",
        bottleneck: "Outcome volume",
        proof_threshold: "Repeated prediction -> outcome -> error -> learning loops",
      },
      reality_model: {
        reality_being_modeled: "Organizations allocate attention, time, capital, resources, and effort under uncertainty.",
        value_condition: "CYVX exists only if it improves allocation.",
        central_question: "Can CYVX repeatedly become less wrong than baseline decision-making?",
      },
      fact_map: factMap,
      assumption_map: assumptionMap,
      system_map: systemMap,
      dependency_map: {
        path: [
          "Reality data",
          "Outcome measurement",
          "Prediction tracking",
          "Error calculation",
          "Learning",
        ],
        break_any_link: "CYVX becomes reporting software.",
      },
      intelligence_map: intelligenceMap,
      infrastructure_map: infrastructureMap,
      opportunity_map: opportunitiesMap,
      barrier_map: barriers,
      strategic_paths: strategicPaths,
      deployment_paths: deploymentPaths,
      prediction_engine: predictionEngine,
      decision_engine: buildDecisionEngine({
        loopCount,
        verifiedOutcomeVolume,
        predictionErrorSeries,
        decisionImprovementRate,
      }),
      leverage_analysis: leverageAnalysis,
      risk_analysis: riskAnalysis,
      failure_modes: failureModes,
      reality_verification_plan: realityVerificationPlan,
      compounding_analysis: compoundingAnalysis,
      evolution_roadmap: evolutionRoadmap,
      endgame_model: endgameModel,
      resource_requirements: buildResourceRequirements(),
      fastest_path_to_proof: buildFastestPathToProof({ loopCount, verifiedOutcomeVolume }),
      highest_leverage_opportunity: "Decision calibration infrastructure",
      highest_leverage_decision: "Stop expanding architecture. Start expanding evidence.",
      most_likely_failure_point: "Assuming architecture = value instead of outcome improvement = value.",
      most_important_unknown: "Does CYVX become less wrong over time?",
      what_is_missing: [
        "Large volumes of verified outcomes",
        "Stable baselines",
        "Short feedback loops",
      ],
      what_changes_everything: "Evidence that loop count rises while prediction error falls and decision quality rises.",
      most_important_truth_being_ignored: "The hardest problem is not intelligence; it is obtaining enough real-world outcome data to prove intelligence is improving.",
      one_sentence_compression: oneSentenceCompression,
      reality_os_vOmega: realityOsModel,
      everything_is_entity: entityModel,
      compression_principle: compressionPrinciple,
      executive_core: executiveCore,
      digital_twin_usa: digitalTwinUsa,
      mobile_mission_control: mobileMissionControl,
      reality_domains: realityDomains,
      ingestion_priority: ingestionPriority,
      reality_interface: realityInterface,
      reality_loop: realityLoop,
      learning_system: learningSystem,
      truth_engine: truthEngine,
      meta_cognition_engine: metaCognitionEngine,
      assumption_graph: assumptionGraph,
      reality_coverage_map: realityCoverageMap,
      causal_engine: causalEngine,
      reality_physics: realityPhysics,
      friction_engine: frictionEngine,
      opportunity_discovery_engine: opportunityDiscoveryEngine,
      recursive_learning: recursiveLearning,
      evolution_engine: evolutionEngine,
      reality_genome: realityGenome,
      multi_scale_intelligence: multiScaleIntelligence,
      strategic_time_engine: strategicTimeEngine,
      reality_market: realityMarket,
      executive_compression: executiveCompression,
      meta_reality: metaReality,
      meta_engine: metaEngine,
      control_hierarchy: controlHierarchy,
      system_mapping_layer: systemMappingLayer,
      universal_situation_report: universalSituationReport,
      success_metrics: successMetrics,
      digital_twin_structure: digitalTwinStructure,
      visibility_authority_control: visibilityAuthorityControl,
      connected_system_categories: connectedSystemCategories,
      operating_loop: ["Observe", "Read", "Orient", "Understand", "Identify Signals", "Identify Causes", "Identify Constraints", "Identify Opportunities", "Identify Interventions", "Evaluate Value", "Prioritize", "Decide", "Allocate", "Coordinate", "Execute", "Measure", "Compare", "Calibrate", "Learn", "Update Assumptions", "Identify Knowledge Gaps", "Improve", "Repeat"],
      knowledge_gap_layer: {
        known: "Observed and verified",
        known_unknown: "Explicitly tracked uncertainties",
        unknown_unknown: "Non-centralized reality",
        gap_focus: "The last 10-20% comes from better relationships, entity resolution, flow mapping, causality, and calibration.",
      },
      thesis_status: intelligenceMap.thesis_status,
      repository_health: repositoryHealth,
      thesis: thesis,
      decision_intelligence: decision,
      reality: reality,
      portfolio: portfolio,
      proof: proof,
    };
  };

  function buildAssumption(key, statement, confidence, supportingEvidence, whatWouldChange) {
    return {
      key,
      statement,
      confidence: confidence,
      supporting_evidence: supportingEvidence,
      what_would_change: whatWouldChange,
    };
  }

  function buildOpportunityMap(context) {
    return {
      top_10: [
        opportunity("Decision calibration infrastructure", "Measure whether decisions improved after being made.", 1, 0.95, "Very high"),
        opportunity("Historical replay loops", "Replay old decisions against actual outcomes.", 2, 0.9, "Very high"),
        opportunity("Verified outcome dataset", "Store the evidence that proves learning happened.", 3, 0.92, "Very high"),
        opportunity("Prediction benchmark dataset", "Benchmark predictions against outcomes and baselines.", 4, 0.88, "High"),
        opportunity("Calibration dashboard", "Show error trends over time.", 5, 0.84, "High"),
        opportunity("Baseline comparison service", "Compare CYVX against human and heuristic baselines.", 6, 0.8, "High"),
        opportunity("Outcome capture automation", "Reduce manual data entry friction.", 7, 0.78, "High"),
        opportunity("Trust conversion layer", "Turn verified improvement into trust.", 8, 0.74, "Medium"),
        opportunity("Loop volume amplification", "Increase verified loops per week.", 9, 0.72, "Medium"),
        opportunity("Adoption proof kit", "Package measurable accountability for organizations.", 10, 0.7, "Medium"),
      ],
      top_3: [
        "Decision calibration infrastructure",
        "Historical replay loops",
        "Verified outcome dataset",
      ],
      ranking_basis: {
        impact: "Outcome improvement and measurable accountability",
        effort: "Moderate",
        speed: "Fastest with existing architecture",
        defensibility: "High once data volume compounds",
        sustainability: "High",
        probability: context.verifiedOutcomeVolume > 0 ? "Medium" : "Medium-Low",
      },
    };
  }

  function buildBarrierMap(context) {
    return {
      barriers: [
        barrier("Insufficient outcome data", "Highest", "Missing verified outcome volume", "Automate capture and replay."),
        barrier("Manual data entry", "High", "Data friction blocks loops", "Use default capture paths and integrations."),
        barrier("Political resistance to measurement", "High", "Users may resist accountability", "Make measurement low-cost and transparent."),
        barrier("Long feedback loops", "High", "Learning arrives late", "Shorten cycle time and replay historical data."),
      ],
      root_cause: "Reality is expensive to measure.",
      proof_gap: Math.max(0, 100 - Math.round(proofDensityScore(context))),
    };
  }

  function buildStrategicPaths(context) {
    return [
      pathPlan("Conservative", "Repository auditing", "High", "Low", "Low", "Short", "High", "Moderate", "Existing repo surfaces and proof outputs.", "Does not prove customer value.", "Small teams, low risk."),
      pathPlan("Balanced", "Decision intelligence for engineering teams", "Medium", "Medium", "Medium", "Medium", "Medium", "Medium", "Pairs existing decision intelligence with real outcome capture.", "Needs steady loop volume.", "Productized feedback loops."),
      pathPlan("Aggressive", "Cross-domain decision infrastructure", "Lower", "High", "High", "Long", "Medium", "Medium", "Generalizes beyond one repo.", "Longer adoption curve.", "Platform category expansion."),
      pathPlan("Asymmetric", "Outcome benchmarking network", "Medium", "High", "Very High", "Long", "High", "High", "Turns outcomes into the moat.", "Requires network effects.", "Benchmark dataset becomes defensible."),
      pathPlan("Contrarian", "Evidence before architecture", "High", "Low", "High", "Short", "High", "High", "Least glamorous path, most likely to prove value.", "Counters common product instincts.", "Focuses the whole repo on proof."),
    ];
  }

  function buildDeploymentPaths(context) {
    return {
      geography: [
        deployment("Local", "Single team or single company", "Low", "Low", "Fast", "Manual outcome capture"),
        deployment("Regional", "Multiple teams or departments", "Medium", "Medium", "Medium", "Shared loop taxonomy"),
        deployment("National", "Enterprise or sector-wide rollout", "High", "High", "Slower", "Governance and integration"),
        deployment("International", "Cross-border / global platform", "Very high", "Very high", "Slowest", "Localization and policy"),
      ],
      customer: [
        deployment("Consumer", "Individuals tracking decisions", "Low", "Low", "Fast", "Simple UX"),
        deployment("Enterprise", "Engineering and ops teams", "Medium", "Medium", "Fast", "Integration and trust"),
        deployment("Institutional", "Large organizations and regulated users", "High", "High", "Medium", "Auditability and governance"),
        deployment("Government", "Public-sector decision systems", "Very high", "Very high", "Slow", "Procurement and compliance"),
      ],
      modality: [
        deployment("Digital", "Pure software surfaces and APIs", "Low", "Low", "Fast", "Low operational overhead"),
        deployment("Physical", "Hardware or field operations", "High", "High", "Medium", "Sensor and deployment costs"),
        deployment("Hybrid", "Digital plus physical reality capture", "Medium", "High", "Medium", "Best fit for verified outcomes"),
      ],
    };
  }

  function buildPredictionEngine(context) {
    return {
      short_term: {
        prediction: "Architecture continues progressing.",
        confidence: 0.9,
        success_metrics: ["More routes", "More surfaces", "More state"],
        failure_metrics: ["No new verified outcomes", "UI-only growth"],
        leading_indicators: ["New engine output", "New dashboard sections"],
        lagging_indicators: ["Loop count", "Outcome volume"],
      },
      medium_term: {
        prediction: "Proof becomes the bottleneck.",
        confidence: 0.8,
        success_metrics: ["Proof density rises", "Calibration improves"],
        failure_metrics: ["No reduction in error", "No verified baseline comparison"],
        leading_indicators: ["More outcome records", "Replay frequency"],
        lagging_indicators: ["Proof score", "Trust score"],
      },
      long_term: {
        prediction: "Adoption becomes the bottleneck.",
        confidence: 0.7,
        success_metrics: ["Repeat use", "Cross-team usage", "Willingness to pay"],
        failure_metrics: ["Novelty spikes then decay", "Measurement resistance"],
        leading_indicators: ["User retention", "Loop volume per user"],
        lagging_indicators: ["Expansion", "Platform compounding"],
      },
      what_if_correct: "The model should show rising loop count, falling error, and rising decision quality.",
      what_if_wrong: "The repo will keep accumulating structure without validated outcome improvement.",
      current_signals: {
        loop_count: context.loopCount,
        verified_outcome_volume: context.verifiedOutcomeVolume,
        proof_density_percent: context.proofDensity,
        error_trend: round3(context.errorTrend),
        calibration_trend: round3(context.calibrationTrend),
      },
    };
  }

  function buildDecisionEngine(context) {
    return {
      best_decision: "Generate real outcome data.",
      safest_decision: "Measure one loop at a time with low-friction capture.",
      highest_leverage_decision: "Stop expanding architecture and expand evidence.",
      highest_probability_decision: "Use historical replay before new abstraction.",
      highest_upside_decision: "Build the world's best decision calibration dataset.",
      most_resilient_decision: "Optimize for repeated verified loops.",
      most_scalable_decision: "Turn outcome verification into a dataset and benchmark layer.",
      if_only_one_decision: "Generate real outcome data.",
      why: "That is the only proof path that can falsify or support the core thesis.",
      decision_improvement_rate: context.decisionImprovementRate,
      prediction_error_trend: round3(trend(context.predictionErrorSeries)),
      evidence: [
        "Verified outcome volume",
        "Calibration trend",
        "Decision improvement rate",
      ],
    };
  }

  function buildRealityVerificationPlan(context) {
    return {
      measure: ["Prediction", "Outcome", "Error"],
      repeat: true,
      track: [
        "Error reduction over time",
        "Decision improvement over baseline",
        "Outcome volume",
      ],
      falsify_if: [
        "Prediction error does not fall",
        "Decision quality does not rise",
        "Outcome volume stays thin",
      ],
      strengthen_if: [
        "Loop count rises",
        "Prediction error falls",
        "Decision quality rises",
      ],
      first_true_proof: "Repeated prediction-to-outcome loops with a downward error trend.",
    };
  }

  function buildCompoundingAnalysis() {
    return {
      knowledge: "Moderate",
      data: "High",
      outcome_data: "Very high",
      calibration_history: "Extremely high",
      verified_learning: "Highest",
    };
  }

  function buildEndgameModel(context) {
    const stages = [
      stage(100, "Outcome capture is manual and fragile.", "One team", "Small but real evidence volume"),
      stage(1000, "Verification becomes the bottleneck.", "Shared instrumentation", "Repeatable loop capture"),
      stage(10000, "Calibration dataset becomes valuable.", "Dataset pipeline", "Cross-team baseline comparison"),
      stage(100000, "Adoption and governance dominate.", "Policy and access control", "Multiple orgs using the same loop"),
      stage(1000000, "Network effects and trust dominate.", "Benchmark network", "External comparison and verification"),
      stage(100000000, "The moat is the evidence network.", "Autonomous calibration infrastructure", "Decision reality infrastructure"),
    ];
    return {
      stages,
      what_eventually_breaks: "Manual verification and long feedback loops",
      what_eventually_dominates: "Verified outcomes and calibration history",
      moat: "Decision calibration dataset",
      constraint: "Outcome volume",
    };
  }

  function buildResourceRequirements() {
    return {
      most_critical: [
        "Outcome data",
        "Users",
        "Feedback loops",
        "Time",
        "Patience",
      ],
      not_most_critical: [
        "More architecture",
      ],
    };
  }

  function buildFastestPathToProof(context) {
    return {
      path: [
        "Historical replay",
        "Predictions",
        "Outcomes",
        "Error measurement",
        "Calibration trend",
      ],
      loop_target: context.loopCount > 0 ? context.loopCount : 100,
      recommended_range: "100-1000 loops",
      why: "This is the shortest route from hypothesis to falsification or support.",
    };
  }

  function buildRealityDomains() {
    return {
      geography: {
        coverage: "Public structured data",
        share: "40-60%",
        sources: ["U.S. Census", "TIGER/Line", "USGS", "National Map", "State GIS portals", "County GIS portals"],
        entities: ["Country", "State", "County", "City", "Zip Code", "Census Tract", "Parcel", "Building", "Land Use"],
      },
      population: {
        coverage: "Public structured data",
        share: "40-60%",
        sources: ["Census", "ACS", "State demographic agencies"],
        entities: ["Population", "Migration", "Households", "Age", "Income", "Education", "Language", "Veterans"],
      },
      real_estate: {
        coverage: "Public structured + local operational data",
        share: "15-25%",
        sources: ["County assessor data", "Parcel data", "Zillow research datasets", "HUD"],
        entities: ["Parcel", "Property", "Owner", "Assessment", "Sale", "Permit", "Zoning"],
      },
      transportation: {
        coverage: "Public structured + operational data",
        share: "15-25%",
        sources: ["USDOT", "FAA", "FRA", "State DOTs", "Transit agencies"],
        entities: ["Road", "Bridge", "Tunnel", "Rail", "Airport", "Port", "Transit", "Fleet", "Route"],
      },
      energy: {
        coverage: "Public structured + operator data",
        share: "10-20%",
        sources: ["EIA", "DOE", "FERC", "Regional grid operators"],
        entities: ["Power Plant", "Substation", "Transmission Line", "Pipeline", "Solar Farm", "Wind Farm", "Battery Storage"],
      },
      water: {
        coverage: "Public structured + operator data",
        share: "10-20%",
        sources: ["EPA", "USGS", "State environmental agencies"],
        entities: ["River", "Reservoir", "Dam", "Water Plant", "Wastewater Plant", "Aquifer"],
      },
      telecommunications: {
        coverage: "Public structured + operator data",
        share: "10-20%",
        sources: ["FCC", "Broadband maps", "Carrier coverage maps"],
        entities: ["Fiber Route", "Cell Tower", "Data Center", "Internet Exchange", "Network"],
      },
      government: {
        coverage: "Public structured + institutional data",
        share: "40-60%",
        sources: ["Federal agencies", "State agencies", "County portals", "City portals"],
        entities: ["Agency", "Department", "Program", "Grant", "Budget", "Official", "Policy"],
      },
      economics: {
        coverage: "Public structured data",
        share: "40-60%",
        sources: ["BEA", "BLS", "FRED", "Treasury"],
        entities: ["Industry", "Employment", "GDP", "Wages", "Inflation", "Investment"],
      },
      finance: {
        coverage: "Public structured data",
        share: "15-25%",
        sources: ["SEC", "FDIC", "Federal Reserve"],
        entities: ["Company", "Bank", "Fund", "Debt", "Equity", "Loan"],
      },
      corporate: {
        coverage: "Public semi-structured data",
        share: "15-25%",
        sources: ["SEC filings", "OpenCorporates", "State registries"],
        entities: ["Corporation", "Subsidiary", "Board", "Executive", "Investor"],
      },
      healthcare: {
        coverage: "Public structured data",
        share: "15-25%",
        sources: ["CMS", "HHS", "State health departments"],
        entities: ["Hospital", "Clinic", "Provider", "Insurer", "Patient Population", "Medical Device"],
      },
      education: {
        coverage: "Public structured data",
        share: "15-25%",
        sources: ["Department of Education", "NCES"],
        entities: ["School", "College", "University", "Program", "Research Center"],
      },
      research: {
        coverage: "Public semi-structured data",
        share: "10-20%",
        sources: ["NSF", "NIH", "Universities"],
        entities: ["Grant", "Research Lab", "Patent", "Publication", "Technology"],
      },
      workforce: {
        coverage: "Public structured + organizational data",
        share: "15-25%",
        sources: ["BLS", "State labor departments"],
        entities: ["Occupation", "Certification", "Skill", "Training Pipeline"],
      },
      manufacturing: {
        coverage: "Public semi-structured + operational data",
        share: "10-20%",
        sources: ["Census Economic Census", "Industry associations"],
        entities: ["Factory", "Supplier", "Distributor", "Warehouse"],
      },
      agriculture: {
        coverage: "Public structured + operational data",
        share: "10-20%",
        sources: ["USDA", "NASS"],
        entities: ["Farm", "Crop", "Livestock", "Processor", "Storage"],
      },
      supply_chains: {
        coverage: "Operational data",
        share: "5-15%",
        sources: ["Transportation", "Customs", "Port data"],
        entities: ["Supplier", "Customer", "Shipment", "Route", "Inventory"],
      },
      environment: {
        coverage: "Public structured data",
        share: "40-60%",
        sources: ["EPA", "NOAA", "USGS"],
        entities: ["Flood Zone", "Wildfire Risk", "Air Quality", "Water Quality", "Drought"],
      },
      public_safety: {
        coverage: "Public structured + operational data",
        share: "5-15%",
        sources: ["FBI", "DHS", "State agencies"],
        entities: ["Emergency Service", "Incident", "Response Area", "Resource"],
      },
      housing: {
        coverage: "Public structured + local operational data",
        share: "15-25%",
        sources: ["HUD", "Census", "Local permit data"],
        entities: ["Housing Unit", "Permit", "Development", "Vacancy", "Rent"],
      },
      media: {
        coverage: "Public semi-structured data",
        share: "5-15%",
        sources: ["FCC", "Public media datasets"],
        entities: ["News Outlet", "Publication", "Broadcast Station"],
      },
      information: {
        coverage: "Public semi-structured data",
        share: "15-25%",
        sources: ["Research databases", "Government reports"],
        entities: ["Dataset", "Report", "Indicator", "Signal"],
      },
      technology: {
        coverage: "Public semi-structured + organizational data",
        share: "10-20%",
        sources: ["SEC", "Company APIs", "Public registries"],
        entities: ["Software", "Platform", "Cloud Region", "Data Center", "AI System"],
      },
      legal: {
        coverage: "Public semi-structured data",
        share: "5-15%",
        sources: ["Court systems", "PACER", "State courts"],
        entities: ["Case", "Court", "Judge", "Statute", "Regulation"],
      },
      political: {
        coverage: "Public structured data",
        share: "5-15%",
        sources: ["Election agencies", "FEC"],
        entities: ["Candidate", "Campaign", "Election", "Donation"],
      },
      defense: {
        coverage: "Public semi-structured + procurement data",
        share: "5-15%",
        sources: ["DoD public releases", "Federal procurement"],
        entities: ["Installation", "Contract", "Program", "Vendor"],
      },
      social: {
        coverage: "Human knowledge",
        share: "5-15%",
        sources: ["Community datasets", "Association data", "Public surveys"],
        entities: ["Community", "Association", "Network", "Demographic Group"],
      },
      access: {
        coverage: "Organizational data",
        share: "10-20%",
        sources: ["System policies", "Identity providers", "Directory services"],
        entities: ["Public Access", "Customer Access", "Employee Access", "Partner Access", "Vendor Access", "Regulatory Access", "Administrative Access", "Ownership Access"],
      },
      control: {
        coverage: "Organizational data",
        share: "10-20%",
        sources: ["Governance systems", "Policy systems", "Automation systems"],
        entities: ["Owner", "Operator", "Manager", "Executive", "Board", "Agency", "Policy", "Automation"],
      },
      flows: {
        coverage: "Organizational + operational data",
        share: "5-15%",
        sources: ["Financial rails", "Logistics systems", "Utility telemetry", "Network telemetry"],
        entities: ["Money", "Information", "People", "Energy", "Materials", "Authority", "Trust", "Attention"],
      },
      bottlenecks: {
        coverage: "Operational data",
        share: "5-15%",
        sources: ["Telemetry", "Operations logs", "Capacity reporting"],
        entities: ["Capacity", "Delay", "Dependency", "Single Point of Failure", "Shortage", "Congestion"],
      },
      opportunity: {
        coverage: "Organizational + human knowledge",
        share: "5-15%",
        sources: ["Utilization data", "Operations data", "Market data"],
        entities: ["Underutilized Assets", "Fragmentation", "Automation Potential", "Growth", "Coordination Gaps"],
      },
      meta: {
        coverage: "Meta layer",
        share: "100%",
        sources: ["RealityOS model outputs", "Calibration records", "Learning logs"],
        entities: ["Assumptions", "Confidence", "Unknowns", "Blind Spots", "Knowledge Gaps", "Model Accuracy"],
        known_states: ["Known", "Known Unknown", "Unknown Unknown"],
      },
    };
  }

  function buildIngestionPriority() {
    return [
      "State GIS",
      "County GIS",
      "City Open Data",
      "Census",
      "FRED",
      "BLS",
      "BEA",
      "USAspending",
      "SEC",
      "USDOT",
      "EIA",
      "NWS/NOAA",
      "FCC",
      "CMS",
    ];
  }

  function pathPlan(name, thesis, probability, resources, upside, timeline, risk, scalability, why, downside, fit) {
    return { name, thesis, probability, resources, upside, timeline, risk, scalability, why, downside, fit };
  }

  function deployment(name, requirements, risk, cost, scalability, friction) {
    return { name, requirements, risk, cost, scalability, adoption_friction: friction };
  }

  function opportunity(name, why, rank, score, upside) {
    return { name, why, rank, score, upside };
  }

  function barrier(name, impact, rootCause, mitigation) {
    return { name, impact, root_cause: rootCause, mitigation };
  }

  function stage(users, bottleneck, infra, proofPoint) {
    return { users, bottleneck, infrastructure_requirements: infra, proof_point: proofPoint };
  }

  function safeCall(fn, fallback) {
    try {
      return fn();
    } catch (error) {
      return fallback;
    }
  }

  function numberFrom(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }

  function seriesFrom(records, paths) {
    if (!Array.isArray(records)) return [];
    return records.map((record) => {
      for (const path of paths) {
        const value = valueAtPath(record, path);
        if (value != null && value !== "") return numberFrom(value);
      }
      return 0;
    }).filter((value) => Number.isFinite(value));
  }

  function valueAtPath(object, path) {
    const parts = String(path || "").split(".");
    let current = object;
    for (const part of parts) {
      if (!current || typeof current !== "object") return null;
      current = current[part];
    }
    return current;
  }

  function trend(series) {
    const values = Array.isArray(series) ? series.filter((value) => Number.isFinite(Number(value))).map(Number) : [];
    const n = values.length;
    if (n < 2) return 0;
    const xs = values.map((_, index) => index + 1);
    const sumX = xs.reduce((sum, value) => sum + value, 0);
    const sumY = values.reduce((sum, value) => sum + value, 0);
    const sumXY = values.reduce((sum, value, index) => sum + value * xs[index], 0);
    const sumXX = xs.reduce((sum, value) => sum + value * value, 0);
    const denominator = (n * sumXX) - (sumX * sumX);
    if (!denominator) return 0;
    return Number((((n * sumXY) - (sumX * sumY)) / denominator).toFixed(4));
  }

  function round3(value) {
    return Number(Number(value || 0).toFixed(3));
  }

  function proofDensityScore(proof) {
    if (!proof) return 0;
    if (proof.proof_density_percent != null) return numberFrom(proof.proof_density_percent);
    if (proof.proof_score != null) return numberFrom(proof.proof_score) * 100;
    if (proof.proof_density && proof.proof_density.proof_density_percent != null) return numberFrom(proof.proof_density.proof_density_percent);
    return 0;
  }

  function decisionImprovementRateScore(decisionImprovementRate) {
    if (!decisionImprovementRate) return 0;
    if (decisionImprovementRate.lifetime != null) return numberFrom(decisionImprovementRate.lifetime);
    if (decisionImprovementRate.value != null) return numberFrom(decisionImprovementRate.value);
    return 0;
  }
}

module.exports = {
  augmentRealityEngine,
};
