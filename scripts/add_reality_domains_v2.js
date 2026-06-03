"use strict";

const fs = require("node:fs");
const path = require("node:path");

const FILE = path.join(" + process.cwd() + "", "core/platform/reality_engine_v1.js");

let s = fs.readFileSync(FILE, "utf8");

function mustReplace(source, search, replacement, label) {
  if (!source.includes(search)) throw new Error("Missing " + label);
  return source.replace(search, replacement);
}

function insertAfter(source, anchor, insert, label) {
  const i = source.indexOf(anchor);
  if (i < 0) throw new Error("Missing " + label);
  return source.slice(0, i + anchor.length) + insert + source.slice(i + anchor.length);
}

if (!s.includes("function buildRealityDomains()")) {
  const anchor = `  function buildFastestPathToProof(context) {
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

  function pathPlan(name, thesis, probability, resources, upside, timeline, risk, scalability, why, downside, fit) {
`;
  const insert = `  function buildFastestPathToProof(context) {
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
`;
  if (!s.includes(anchor)) throw new Error("anchor not found");
  s = s.replace(anchor, insert);
}

s = mustReplace(
  s,
  `    const oneSentenceCompression = "CYVX succeeds only if repeated prediction-to-outcome loops reduce error, improve decisions, and compound into a RealityOS stack with the phone as the final presentation layer.";\n`,
  `    const oneSentenceCompression = "CYVX succeeds only if repeated prediction-to-outcome loops reduce error, improve decisions, and compound into a RealityOS stack with the phone as the final presentation layer.";\n`
);

if (!s.includes("reality_domains: realityDomains")) {
  s = s.replace(
    `      mobile_mission_control: mobileMissionControl,`,
    `      mobile_mission_control: mobileMissionControl,\n      reality_domains: realityDomains,\n      ingestion_priority: ingestionPriority,`
  );
}

if (!s.includes("knowledge_gap_layer")) {
  s = s.replace(
    `      mobile_mission_control: mobileMissionControl,\n      reality_domains: realityDomains,\n      ingestion_priority: ingestionPriority,\n      thesis_status: intelligenceMap.thesis_status,`,
    `      mobile_mission_control: mobileMissionControl,\n      reality_domains: realityDomains,\n      ingestion_priority: ingestionPriority,\n      knowledge_gap_layer: {\n        known: "Observed and verified",\n        known_unknown: "Explicitly tracked uncertainties",\n        unknown_unknown: "Non-centralized reality",\n        gap_focus: "The last 10-20% comes from better relationships, entity resolution, flow mapping, causality, and calibration.",\n      },\n      thesis_status: intelligenceMap.thesis_status,`
  );
}

fs.writeFileSync(FILE, s);
console.log("Reality domain registry added.");
