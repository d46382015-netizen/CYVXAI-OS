"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const VERSION = "1.0.0";
const DEFAULT_INTERVAL_MS = 6 * 60 * 60 * 1000;
const MAX_BODY_BYTES = 2 * 1024 * 1024;

const DEFAULT_SOURCES = Object.freeze([
  {
    id: "mn_osp_vendor_opportunities",
    name: "Minnesota Office of State Procurement — Solicitations and Contract Opportunities",
    kind: "procurement_index",
    jurisdiction: "US-MN",
    url: "https://mn.gov/admin/osp/vendors/solicitations-and-contract-opportunities/",
    reliability: 0.96,
    collect: true,
  },
  {
    id: "mn_osp_goods_services",
    name: "Minnesota OSP — Goods and Services Solicitation Opportunities",
    kind: "procurement",
    jurisdiction: "US-MN",
    url: "https://mn.gov/admin/osp/vendors/solicitations-and-contract-opportunities/goods-and-services-solicitation-opportunities/",
    reliability: 0.96,
    collect: true,
  },
  {
    id: "mn_osp_professional_technical",
    name: "Minnesota OSP — Professional and Technical Solicitation Postings",
    kind: "procurement",
    jurisdiction: "US-MN",
    url: "https://mn.gov/admin/osp/vendors/solicitations-and-contract-opportunities/professional-and-technical-solicitation-postings/",
    reliability: 0.96,
    collect: true,
  },
  {
    id: "mn_admin_construction",
    name: "Minnesota Administration — Construction Solicitations and Announcements",
    kind: "construction_procurement",
    jurisdiction: "US-MN",
    url: "https://mn.gov/admin/business/vendor-info/construction-projects/solicitations-announcements/",
    reliability: 0.95,
    collect: true,
  },
  {
    id: "mn_mndot_consultant",
    name: "MnDOT — Professional Technical Consultant Services",
    kind: "transportation_procurement",
    jurisdiction: "US-MN",
    url: "https://www.dot.state.mn.us/consult/index.html",
    reliability: 0.96,
    collect: true,
  },
  {
    id: "mn_osp_expiring_contracts",
    name: "Minnesota OSP — Contracts Expiring in Seven Months",
    kind: "renewal_signal",
    jurisdiction: "US-MN",
    url: "https://mn.gov/admin/osp/vendors/solicitations-and-contract-opportunities/contracts-expiring-in-7-months/",
    reliability: 0.95,
    collect: true,
  },
  {
    id: "mn_osp_equity_vendor_directory",
    name: "Minnesota OSP — TG/ED/VO Vendor Directory",
    kind: "vendor_intelligence",
    jurisdiction: "US-MN",
    url: "https://mn.gov/admin/osp/government/procuregoodsandgeneralservices/tgedvo-directory/",
    reliability: 0.95,
    collect: true,
  },
  {
    id: "mn_sos_business_search",
    name: "Minnesota Secretary of State — Business Filings Online",
    kind: "business_registry",
    jurisdiction: "US-MN",
    url: "https://mblsportal.sos.mn.gov/Business/Search",
    reliability: 0.98,
    collect: false,
  },
  {
    id: "mn_swift_supplier_portal",
    name: "Minnesota SWIFT Supplier Portal",
    kind: "supplier_portal",
    jurisdiction: "US-MN",
    url: "https://guest.supplier.systems.state.mn.us/",
    reliability: 0.97,
    collect: false,
  },
]);

const DEFAULT_PROFILE = Object.freeze({
  name: "CYVX Minnesota Revenue Profile",
  service_keywords: [
    "automation", "software", "web", "website", "data", "dashboard", "ai", "artificial intelligence",
    "consulting", "professional services", "technology", "information technology", "workflow", "integration",
    "cleaning", "janitorial", "custodial", "landscaping", "grounds", "facility", "facilities",
    "maintenance", "security", "construction", "small construction", "inspection", "reporting",
  ],
  preferred_regions: ["Minnesota", "MN", "Rochester", "Winona", "Olmsted", "Hennepin", "Ramsey"],
  minimum_score: 35,
  maximum_days_to_due: 120,
});

class JsonStore {
  constructor(filePath) {
    this.filePath = path.resolve(filePath);
    this.lock = Promise.resolve();
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    if (!fs.existsSync(this.filePath)) this.writeSync(initialState());
  }

  read() {
    try {
      return normalizeState(JSON.parse(fs.readFileSync(this.filePath, "utf8")));
    } catch (error) {
      error.code = error.code || "STORE_READ_FAILED";
      throw error;
    }
  }

  writeSync(state) {
    const normalized = normalizeState(state);
    const temporary = `${this.filePath}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(temporary, `${JSON.stringify(normalized, null, 2)}\n`, { mode: 0o600 });
    fs.renameSync(temporary, this.filePath);
    return normalized;
  }

  update(mutator) {
    const operation = this.lock.then(async () => {
      const current = this.read();
      const next = await mutator(structuredClone(current));
      return this.writeSync(next || current);
    });
    this.lock = operation.catch(() => undefined);
    return operation;
  }
}

class JsonLogger {
  constructor(filePath) {
    this.filePath = path.resolve(filePath);
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
  }

  write(level, event, fields = {}) {
    const record = { timestamp: new Date().toISOString(), level, event, ...sanitize(fields) };
    fs.appendFileSync(this.filePath, `${JSON.stringify(record)}\n`, { mode: 0o600 });
    return record;
  }
}

class MinnesotaIntelligence {
  constructor(options = {}) {
    const dataRoot = path.resolve(options.dataRoot || process.env.CYVX_DATA_ROOT || path.join(os.homedir(), ".cyvx"));
    this.root = path.resolve(options.root || path.join(dataRoot, "intelligence", "minnesota"));
    this.store = options.store || new JsonStore(path.join(this.root, "state.json"));
    this.logger = options.logger || new JsonLogger(path.join(this.root, "intelligence.jsonl"));
    this.fetch = options.fetch || globalThis.fetch;
    this.clock = options.clock || (() => new Date());
    this.profile = validateProfile({ ...DEFAULT_PROFILE, ...(options.profile || {}) });
    this.sources = options.sources ? options.sources.map(validateSource) : mergeSources(DEFAULT_SOURCES, readExtraSources(process.env.CYVX_MN_EXTRA_SOURCES_JSON));
    this.timeoutMs = positiveInteger(options.timeoutMs || process.env.CYVX_MN_FETCH_TIMEOUT_MS || 20_000, "timeoutMs");
    this.maxResponseBytes = positiveInteger(options.maxResponseBytes || 4 * 1024 * 1024, "maxResponseBytes");
    this.refreshPromise = null;
  }

  snapshot() {
    const state = this.store.read();
    return {
      ok: true,
      version: VERSION,
      jurisdiction: "US-MN",
      profile: this.profile,
      metrics: calculateMetrics(state, this.clock()),
      source_health: state.source_health,
      opportunities: state.opportunities,
      businesses: state.businesses,
      missions: state.missions,
      last_refresh: state.last_refresh,
    };
  }

  listSources() {
    const state = this.store.read();
    return this.sources.map((source) => ({ ...source, health: state.source_health[source.id] || null }));
  }

  listOpportunities(filters = {}) {
    const state = this.store.read();
    const q = clean(filters.q).toLowerCase();
    const sourceId = clean(filters.source_id);
    const category = clean(filters.category).toLowerCase();
    const status = clean(filters.status).toLowerCase();
    const minimumScore = finiteNumber(filters.min_score, 0);
    const limit = Math.min(500, positiveInteger(filters.limit || 100, "limit"));
    return state.opportunities
      .filter((item) => item.score >= minimumScore)
      .filter((item) => !sourceId || item.source_id === sourceId)
      .filter((item) => !category || item.category.toLowerCase() === category)
      .filter((item) => !status || item.status.toLowerCase() === status)
      .filter((item) => !q || searchable(item).includes(q))
      .sort(compareOpportunities)
      .slice(0, limit);
  }

  searchBusinesses(filters = {}) {
    const state = this.store.read();
    const q = clean(filters.q).toLowerCase();
    const limit = Math.min(500, positiveInteger(filters.limit || 100, "limit"));
    return state.businesses
      .filter((item) => !q || searchable(item).includes(q))
      .sort((a, b) => String(a.name).localeCompare(String(b.name)))
      .slice(0, limit);
  }

  async refresh(options = {}) {
    if (this.refreshPromise) return this.refreshPromise;
    this.refreshPromise = this.#refresh(options).finally(() => { this.refreshPromise = null; });
    return this.refreshPromise;
  }

  async #refresh(options = {}) {
    const startedAt = this.clock();
    const only = new Set((options.sourceIds || []).map(clean).filter(Boolean));
    const sources = this.sources.filter((source) => source.collect && (!only.size || only.has(source.id)));
    const results = [];
    this.logger.write("info", "mn_intelligence.refresh.started", { sources: sources.map((item) => item.id) });

    for (const source of sources) {
      const sourceStarted = Date.now();
      try {
        const body = await fetchText(this.fetch, source.url, {
          timeoutMs: this.timeoutMs,
          maxBytes: this.maxResponseBytes,
          headers: { "user-agent": `CYVXAI-OS-MN-Intelligence/${VERSION} (+public-source-monitor)` },
        });
        const opportunities = extractOpportunities(body, source, this.profile, this.clock());
        const businesses = source.kind === "vendor_intelligence" ? extractBusinesses(body, source, this.clock()) : [];
        const contentHash = hash(body);
        const result = {
          source,
          ok: true,
          opportunities,
          businesses,
          content_hash: contentHash,
          elapsed_ms: Date.now() - sourceStarted,
          fetched_at: this.clock().toISOString(),
        };
        results.push(result);
        this.logger.write("info", "mn_intelligence.source.collected", {
          source_id: source.id,
          opportunities: opportunities.length,
          businesses: businesses.length,
          elapsed_ms: result.elapsed_ms,
          content_hash: contentHash,
        });
      } catch (error) {
        const result = {
          source,
          ok: false,
          error: error.code || error.name || "SOURCE_FETCH_FAILED",
          message: error.message,
          elapsed_ms: Date.now() - sourceStarted,
          fetched_at: this.clock().toISOString(),
        };
        results.push(result);
        this.logger.write("error", "mn_intelligence.source.failed", {
          source_id: source.id,
          code: result.error,
          message: result.message,
          elapsed_ms: result.elapsed_ms,
        });
      }
    }

    const state = await this.store.update((current) => applyRefresh(current, results, startedAt, this.clock()));
    const summary = {
      ok: results.some((item) => item.ok),
      partial: results.some((item) => !item.ok),
      sources_total: results.length,
      sources_ok: results.filter((item) => item.ok).length,
      opportunities_total: state.opportunities.length,
      businesses_total: state.businesses.length,
      metrics: calculateMetrics(state, this.clock()),
      last_refresh: state.last_refresh,
    };
    this.logger.write(summary.partial ? "warn" : "info", "mn_intelligence.refresh.completed", summary);
    return summary;
  }

  async importOpportunities(input, metadata = {}) {
    const records = Array.isArray(input) ? input : parseImportedRecords(input);
    const importedAt = this.clock().toISOString();
    const source = {
      id: clean(metadata.source_id) || "manual_import",
      name: clean(metadata.source_name) || "Authorized opportunity import",
      url: clean(metadata.source_url) || "urn:cyvx:manual-import",
      kind: clean(metadata.kind) || "import",
      reliability: clamp(finiteNumber(metadata.reliability, 0.8), 0, 1),
      jurisdiction: "US-MN",
    };
    const normalized = records.map((record, index) => normalizeImportedOpportunity(record, source, this.profile, importedAt, index));
    const state = await this.store.update((current) => {
      current.opportunities = mergeById(current.opportunities, normalized).sort(compareOpportunities);
      current.updated_at = importedAt;
      current.events.push(eventRecord("opportunities.imported", { source_id: source.id, count: normalized.length }, importedAt));
      current.events = current.events.slice(-2000);
      return current;
    });
    this.logger.write("info", "mn_intelligence.opportunities.imported", { source_id: source.id, count: normalized.length });
    return { ok: true, imported: normalized.length, opportunities_total: state.opportunities.length };
  }

  async importBusinesses(input, metadata = {}) {
    const records = Array.isArray(input) ? input : parseImportedRecords(input);
    const importedAt = this.clock().toISOString();
    const sourceId = clean(metadata.source_id) || "mn_business_import";
    const normalized = records.map((record, index) => normalizeBusiness(record, sourceId, importedAt, index));
    const state = await this.store.update((current) => {
      current.businesses = mergeById(current.businesses, normalized);
      current.updated_at = importedAt;
      current.events.push(eventRecord("businesses.imported", { source_id: sourceId, count: normalized.length }, importedAt));
      current.events = current.events.slice(-2000);
      return current;
    });
    this.logger.write("info", "mn_intelligence.businesses.imported", { source_id: sourceId, count: normalized.length });
    return { ok: true, imported: normalized.length, businesses_total: state.businesses.length };
  }

  async createMission(opportunityId, input = {}) {
    const state = this.store.read();
    const opportunity = state.opportunities.find((item) => item.id === opportunityId);
    if (!opportunity) throw typedError("OPPORTUNITY_NOT_FOUND", "Opportunity was not found", 404);
    const now = this.clock().toISOString();
    const mission = {
      id: `mission:mn-procurement:${opportunity.id}`,
      type: "revenue.bid_capture",
      title: `Qualify and pursue: ${opportunity.title}`.slice(0, 180),
      objective: "Verify the solicitation, determine fit and eligibility, produce an evidence-backed bid/no-bid decision, and prepare the approved response package before the deadline.",
      state: "draft",
      risk_tier: 2,
      organization_id: clean(input.organization_id) || "cyvx",
      opportunity_id: opportunity.id,
      inputs: {
        opportunity,
        revenue_profile: this.profile,
        operator_notes: clean(input.notes) || null,
      },
      acceptance_tests: [
        "Source and deadline are independently verified against the official posting",
        "Mandatory requirements and disqualifiers are extracted",
        "Delivery capacity, pricing assumptions, and expected margin are documented",
        "Bid/no-bid recommendation includes evidence and confidence",
        "No submission or external commitment occurs without human approval",
      ],
      required_evidence: ["official posting", "requirements matrix", "pricing model", "risk review", "approval record"],
      created_at: now,
      updated_at: now,
    };
    const saved = await this.store.update((current) => {
      current.missions = mergeById(current.missions, [mission]);
      current.events.push(eventRecord("mission.drafted", { mission_id: mission.id, opportunity_id: opportunity.id }, now));
      current.events = current.events.slice(-2000);
      current.updated_at = now;
      return current;
    });
    appendOutbox(path.join(this.root, "mission-outbox.jsonl"), {
      event_type: "intelligence.mission_drafted",
      occurred_at: now,
      jurisdiction: "US-MN",
      mission,
      evidence: opportunity.evidence,
    });
    this.logger.write("info", "mn_intelligence.mission.drafted", { mission_id: mission.id, opportunity_id: opportunity.id });
    return { ok: true, mission: saved.missions.find((item) => item.id === mission.id) };
  }

  readiness() {
    const state = this.store.read();
    const sourceHealth = Object.values(state.source_health);
    const healthy = sourceHealth.filter((item) => item.ok).length;
    return {
      ok: true,
      ready: fs.existsSync(this.store.filePath),
      version: VERSION,
      data_root: this.root,
      sources_configured: this.sources.length,
      sources_healthy: healthy,
      last_refresh: state.last_refresh,
      opportunities: state.opportunities.length,
      businesses: state.businesses.length,
    };
  }
}

function createMinnesotaIntelligence(options = {}) {
  return new MinnesotaIntelligence(options);
}

function applyRefresh(current, results, startedAt, completedAt) {
  const completed = completedAt.toISOString();
  const successfulSourceIds = new Set(results.filter((item) => item.ok).map((item) => item.source.id));
  const newOpportunities = results.flatMap((item) => item.ok ? item.opportunities : []);
  const newBusinesses = results.flatMap((item) => item.ok ? item.businesses : []);

  current.opportunities = current.opportunities.filter((item) => !successfulSourceIds.has(item.source_id));
  current.opportunities = mergeById(current.opportunities, newOpportunities).sort(compareOpportunities);
  current.businesses = mergeById(current.businesses, newBusinesses);

  for (const result of results) {
    const previous = current.source_health[result.source.id] || {};
    current.source_health[result.source.id] = result.ok ? {
      ok: true,
      status: "healthy",
      fetched_at: result.fetched_at,
      elapsed_ms: result.elapsed_ms,
      content_hash: result.content_hash,
      opportunities: result.opportunities.length,
      businesses: result.businesses.length,
      consecutive_failures: 0,
      last_error: null,
    } : {
      ...previous,
      ok: false,
      status: "degraded",
      fetched_at: result.fetched_at,
      elapsed_ms: result.elapsed_ms,
      consecutive_failures: finiteNumber(previous.consecutive_failures, 0) + 1,
      last_error: { code: result.error, message: result.message },
    };
  }

  current.last_refresh = {
    started_at: startedAt.toISOString(),
    completed_at: completed,
    sources_total: results.length,
    sources_ok: results.filter((item) => item.ok).length,
    partial: results.some((item) => !item.ok),
  };
  current.updated_at = completed;
  current.events.push(eventRecord("refresh.completed", current.last_refresh, completed));
  current.events = current.events.slice(-2000);
  return current;
}

function extractOpportunities(html, source, profile, now) {
  const links = extractLinks(html, source.url);
  const bodyText = htmlToText(html);
  const candidates = [];
  const seen = new Set();

  for (const link of links) {
    const title = clean(link.text);
    const context = clean(htmlToText(link.context));
    if (!isOpportunityCandidate(title, context, source)) continue;
    const canonicalUrl = canonicalizeUrl(link.url);
    const key = `${source.id}:${canonicalUrl}:${title.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    candidates.push(buildOpportunity({ title, context, url: canonicalUrl, source, profile, now }));
  }

  if (source.kind === "renewal_signal" && candidates.length === 0 && /contracts? expiring/i.test(bodyText)) {
    candidates.push(buildOpportunity({
      title: "State contracts expiring within seven months",
      context: bodyText.slice(0, 1500),
      url: source.url,
      source,
      profile,
      now,
      signalType: "contract_renewal_pipeline",
    }));
  }

  return candidates;
}

function extractBusinesses(html, source, now) {
  const links = extractLinks(html, source.url);
  const records = [];
  for (const link of links) {
    const text = clean(link.text);
    if (!text || !/(csv|vendor|directory|naics|targeted group|veteran-owned|woman-owned)/i.test(`${text} ${link.url}`)) continue;
    records.push({
      id: `business-dataset:${hash(`${source.id}:${link.url}`).slice(0, 24)}`,
      name: text,
      type: "vendor_dataset",
      status: "published",
      source_id: source.id,
      source_url: canonicalizeUrl(link.url),
      jurisdiction: "US-MN",
      evidence: evidenceRecord(source, link.url, text, link.context, now),
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
    });
  }
  return records;
}

function buildOpportunity({ title, context, url, source, profile, now, signalType }) {
  const combined = `${title} ${context}`;
  const dueDate = parseDueDate(combined, now);
  const value = parseValue(combined);
  const titleCategory = classifyCategory(title, source.kind);
  const category = titleCategory === "other" ? classifyCategory(context, source.kind) : titleCategory;
  const status = dueDate && dueDate.getTime() < now.getTime() ? "closed" : "open_or_unverified";
  const score = scoreOpportunity({ title, context, category, dueDate, value, source }, profile, now);
  const id = `mnopp_${hash(`${source.id}:${url}:${title.toLowerCase()}`).slice(0, 24)}`;
  return {
    id,
    signal_type: signalType || (source.kind === "renewal_signal" ? "contract_renewal" : "procurement_opportunity"),
    title: title.slice(0, 240),
    description: context.slice(0, 1600),
    category,
    buyer: inferBuyer(combined, source),
    jurisdiction: "US-MN",
    source_id: source.id,
    source_name: source.name,
    source_url: url,
    status,
    due_at: dueDate ? dueDate.toISOString() : null,
    estimated_value_usd: value,
    score,
    score_band: score >= 75 ? "priority" : score >= 50 ? "qualified" : score >= 35 ? "watch" : "low",
    recommended_action: score >= profile.minimum_score ? "qualify_for_bid" : "monitor",
    confidence: round(clamp(source.reliability * (dueDate ? 0.98 : 0.82), 0, 1), 3),
    evidence: evidenceRecord(source, url, title, context, now),
    observed_at: now.toISOString(),
    updated_at: now.toISOString(),
  };
}

function normalizeImportedOpportunity(record, source, profile, importedAt, index) {
  if (!record || typeof record !== "object") throw typedError("INVALID_IMPORT", `Opportunity record ${index + 1} must be an object`, 400);
  const title = clean(record.title || record.name || record.solicitation_title || record.description);
  if (!title) throw typedError("INVALID_IMPORT", `Opportunity record ${index + 1} is missing a title`, 400);
  const url = clean(record.source_url || record.url || record.link) || source.url;
  const context = clean(record.description || record.summary || record.scope || record.notes || title);
  const now = new Date(importedAt);
  const built = buildOpportunity({ title, context, url, source, profile, now });
  const explicitDue = dateOrNull(record.due_at || record.due_date || record.deadline || record.response_due);
  const explicitValue = finiteNumber(record.estimated_value_usd || record.value || record.amount, built.estimated_value_usd);
  return {
    ...built,
    due_at: explicitDue ? explicitDue.toISOString() : built.due_at,
    estimated_value_usd: explicitValue || null,
    buyer: clean(record.buyer || record.agency || record.department || built.buyer),
    category: clean(record.category || built.category),
    solicitation_number: clean(record.solicitation_number || record.event_id || record.bid_number) || null,
    imported_at: importedAt,
  };
}

function normalizeBusiness(record, sourceId, importedAt, index) {
  if (!record || typeof record !== "object") throw typedError("INVALID_IMPORT", `Business record ${index + 1} must be an object`, 400);
  const name = clean(record.name || record.business_name || record.vendor_name || record.legal_name);
  if (!name) throw typedError("INVALID_IMPORT", `Business record ${index + 1} is missing a name`, 400);
  const identity = clean(record.file_number || record.business_id || record.vendor_id || `${name}:${record.city || ""}:${record.address || ""}`);
  return {
    id: `mnbiz_${hash(`${sourceId}:${identity}`).slice(0, 24)}`,
    name,
    legal_name: clean(record.legal_name || name),
    type: clean(record.type || record.business_type || "business"),
    status: clean(record.status || "unknown"),
    file_number: clean(record.file_number || record.business_id) || null,
    vendor_id: clean(record.vendor_id) || null,
    naics: splitValues(record.naics || record.naics_codes),
    certifications: splitValues(record.certifications || record.certification),
    address: clean(record.address || record.street) || null,
    city: clean(record.city) || null,
    state: clean(record.state || "MN"),
    postal_code: clean(record.postal_code || record.zip) || null,
    website: clean(record.website || record.url) || null,
    source_id: sourceId,
    jurisdiction: "US-MN",
    observed_at: importedAt,
    updated_at: importedAt,
  };
}

function extractLinks(html, baseUrl) {
  const links = [];
  const expression = /<a\b[^>]*href\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))[^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = expression.exec(html)) !== null) {
    const href = match[1] || match[2] || match[3] || "";
    const text = htmlToText(match[4]);
    if (!href || href.startsWith("#") || /^(mailto|tel|javascript):/i.test(href)) continue;
    let url;
    try { url = new URL(href, baseUrl).toString(); } catch { continue; }
    const start = Math.max(0, match.index - 500);
    const end = Math.min(html.length, expression.lastIndex + 500);
    links.push({ url, text, context: html.slice(start, end) });
  }
  return links;
}

function isOpportunityCandidate(title, context, source) {
  const text = `${title} ${context}`;
  if (title.length < 6 || title.length > 300) return false;
  if (/^(home|contact|about|search|skip to content|back to top|privacy|feedback|login|register|overview|click here)$/i.test(title)) return false;
  if (/(facebook|twitter|linkedin|instagram|youtube|privacy policy|website feedback)/i.test(text)) return false;
  const positive = /(\brfp\b|\brfq\b|\bbid\b|solicitation|request for (proposal|quote|qualification|information)|invitation for bid|contract opportunit|project opportunit|consultant services|professional services|construction|expiring contract|vendor directory|scope of work)/i;
  const sourceBoost = ["procurement", "construction_procurement", "transportation_procurement", "renewal_signal"].includes(source.kind);
  return positive.test(text) || (sourceBoost && /(proposal|contract|project|services|bidder|vendor)/i.test(title));
}

function parseDueDate(text, now) {
  const patterns = [
    /(?:due|deadline|responses? due|proposal due|bid opening|closing date|close(?:s|d)?)\s*(?:date)?\s*[:\-]?\s*([A-Z][a-z]+\s+\d{1,2},?\s+20\d{2})/i,
    /(?:due|deadline|responses? due|proposal due|bid opening|closing date|close(?:s|d)?)\s*(?:date)?\s*[:\-]?\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]20\d{2})/i,
    /\b([A-Z][a-z]+\s+\d{1,2},?\s+20\d{2})\b/,
    /\b(\d{1,2}[\/\-]\d{1,2}[\/\-]20\d{2})\b/,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) continue;
    const parsed = new Date(match[1]);
    if (!Number.isNaN(parsed.getTime())) {
      parsed.setHours(23, 59, 59, 999);
      if (parsed.getFullYear() >= now.getFullYear() - 1 && parsed.getFullYear() <= now.getFullYear() + 3) return parsed;
    }
  }
  return null;
}

function parseValue(text) {
  const matches = [...text.matchAll(/\$\s*([0-9][0-9,]*(?:\.\d{1,2})?)\s*(million|m|thousand|k)?/gi)];
  if (!matches.length) return null;
  let highest = 0;
  for (const match of matches) {
    let value = Number(match[1].replaceAll(",", ""));
    const suffix = String(match[2] || "").toLowerCase();
    if (suffix === "million" || suffix === "m") value *= 1_000_000;
    if (suffix === "thousand" || suffix === "k") value *= 1_000;
    if (Number.isFinite(value)) highest = Math.max(highest, value);
  }
  return highest || null;
}

function classifyCategory(text, sourceKind = "") {
  const groups = [
    ["facilities", /(janitorial|custodial|cleaning|facility|facilities|maintenance|grounds|landscap|snow removal)/i],
    ["construction", /(construction|renovation|repair|roof|hvac|electrical|plumbing|building|asbestos|inspection)/i],
    ["technology", /(software|technology|information technology|\bit\b|web|website|data|cyber|network|automation|artificial intelligence|\bai\b|dashboard)/i],
    ["professional_services", /(consultant|consulting|professional|technical|research|audit|planning|engineering|design)/i],
    ["security", /(security|surveillance|guard|access control|emergency management)/i],
    ["transportation", /(transportation|highway|road|bridge|traffic|transit|mndot)/i],
    ["goods_services", /(goods|supplies|equipment|service)/i],
  ];
  for (const [name, pattern] of groups) if (pattern.test(text)) return name;
  if (sourceKind === "renewal_signal") return "contract_renewal";
  return "other";
}

function inferBuyer(text, source) {
  const patterns = [
    /(?:agency|department|buyer|issued by|owner)\s*[:\-]\s*([A-Z][A-Za-z0-9 &'/.\-]{3,100})/,
    /\b((?:Minnesota|MN) Department of [A-Z][A-Za-z &'/.\-]{3,80})/,
    /\b((?:City|County) of [A-Z][A-Za-z .'\-]{2,60})/,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return clean(match[1]).slice(0, 120);
  }
  if (source.id.includes("mndot")) return "Minnesota Department of Transportation";
  return "State of Minnesota";
}

function scoreOpportunity(opportunity, profile, now) {
  const text = `${opportunity.title} ${opportunity.context} ${opportunity.category}`.toLowerCase();
  let score = 10;
  const matched = profile.service_keywords.filter((keyword) => text.includes(keyword.toLowerCase()));
  score += Math.min(45, matched.length * 9);
  if (profile.preferred_regions.some((region) => text.includes(region.toLowerCase()))) score += 8;
  if (opportunity.source.kind === "renewal_signal") score += 8;
  if (opportunity.source.kind === "procurement" || opportunity.source.kind.includes("procurement")) score += 8;
  if (opportunity.value) {
    if (opportunity.value >= 10_000) score += 6;
    if (opportunity.value >= 50_000) score += 5;
    if (opportunity.value >= 250_000) score += 3;
  }
  if (opportunity.dueDate) {
    const days = Math.ceil((opportunity.dueDate.getTime() - now.getTime()) / 86_400_000);
    if (days < 0) score -= 50;
    else if (days <= 3) score -= 12;
    else if (days <= 14) score += 8;
    else if (days <= profile.maximum_days_to_due) score += 5;
  } else {
    score -= 2;
  }
  return Math.round(clamp(score, 0, 100));
}

function evidenceRecord(source, url, title, context, now) {
  const observedAt = now.toISOString();
  return {
    source_id: source.id,
    source_url: canonicalizeUrl(url || source.url),
    source_reliability: source.reliability,
    observed_at: observedAt,
    content_hash: hash(`${title}\n${context}`),
    collector: `cyvx.mn-intelligence/${VERSION}`,
    fact_type: "observed_public_source",
  };
}

async function fetchText(fetchImpl, url, options = {}) {
  if (typeof fetchImpl !== "function") throw typedError("FETCH_UNAVAILABLE", "A fetch implementation is required", 500);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs || 20_000);
  try {
    const response = await fetchImpl(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: { accept: "text/html,application/xhtml+xml,text/csv;q=0.9,*/*;q=0.8", ...(options.headers || {}) },
    });
    if (!response || !response.ok) throw typedError("SOURCE_HTTP_ERROR", `Source returned HTTP ${response ? response.status : "unknown"}`, 502);
    const text = await response.text();
    const bytes = Buffer.byteLength(text);
    if (bytes > (options.maxBytes || 4 * 1024 * 1024)) throw typedError("SOURCE_TOO_LARGE", `Source response exceeded ${options.maxBytes} bytes`, 502);
    return text;
  } catch (error) {
    if (error.name === "AbortError") throw typedError("SOURCE_TIMEOUT", `Source request timed out after ${options.timeoutMs}ms`, 504);
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function parseImportedRecords(input) {
  if (Buffer.isBuffer(input)) input = input.toString("utf8");
  if (typeof input !== "string") throw typedError("INVALID_IMPORT", "Import body must be an array, JSON string, or CSV string", 400);
  const trimmed = input.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) return parsed;
    if (Array.isArray(parsed.records)) return parsed.records;
    if (Array.isArray(parsed.opportunities)) return parsed.opportunities;
    if (Array.isArray(parsed.businesses)) return parsed.businesses;
    return [parsed];
  }
  return parseCsv(trimmed);
}

function parseCsv(input) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    if (quoted) {
      if (character === '"' && input[index + 1] === '"') { field += '"'; index += 1; }
      else if (character === '"') quoted = false;
      else field += character;
    } else if (character === '"') quoted = true;
    else if (character === ",") { row.push(field); field = ""; }
    else if (character === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (character !== "\r") field += character;
  }
  row.push(field);
  if (row.some((item) => item.length)) rows.push(row);
  if (!rows.length) return [];
  const headers = rows.shift().map((header, index) => slugify(header) || `column_${index + 1}`);
  return rows.filter((items) => items.some((item) => clean(item))).map((items) => Object.fromEntries(headers.map((header, index) => [header, clean(items[index])])));
}

function initialState() {
  const now = new Date().toISOString();
  return {
    schema_version: 1,
    jurisdiction: "US-MN",
    opportunities: [],
    businesses: [],
    missions: [],
    source_health: {},
    events: [],
    last_refresh: null,
    created_at: now,
    updated_at: now,
  };
}

function normalizeState(state) {
  const base = initialState();
  return {
    ...base,
    ...(state || {}),
    opportunities: Array.isArray(state && state.opportunities) ? state.opportunities : [],
    businesses: Array.isArray(state && state.businesses) ? state.businesses : [],
    missions: Array.isArray(state && state.missions) ? state.missions : [],
    source_health: state && state.source_health && typeof state.source_health === "object" ? state.source_health : {},
    events: Array.isArray(state && state.events) ? state.events : [],
  };
}

function calculateMetrics(state, now) {
  const active = state.opportunities.filter((item) => item.status !== "closed");
  const dueSoon = active.filter((item) => {
    if (!item.due_at) return false;
    const days = (new Date(item.due_at).getTime() - now.getTime()) / 86_400_000;
    return days >= 0 && days <= 14;
  });
  return {
    opportunities_total: state.opportunities.length,
    opportunities_active: active.length,
    priority_opportunities: active.filter((item) => item.score >= 75).length,
    qualified_opportunities: active.filter((item) => item.score >= 50).length,
    due_within_14_days: dueSoon.length,
    estimated_pipeline_usd: active.reduce((total, item) => total + finiteNumber(item.estimated_value_usd, 0), 0),
    business_records: state.businesses.length,
    mission_drafts: state.missions.length,
    sources_healthy: Object.values(state.source_health).filter((item) => item.ok).length,
    sources_degraded: Object.values(state.source_health).filter((item) => !item.ok).length,
  };
}

function mergeSources(defaults, extras) {
  const map = new Map(defaults.map((source) => [source.id, validateSource(source)]));
  for (const source of extras || []) map.set(source.id, validateSource(source));
  return [...map.values()];
}

function readExtraSources(value) {
  if (!value) return [];
  const parsed = JSON.parse(value);
  if (!Array.isArray(parsed)) throw new TypeError("CYVX_MN_EXTRA_SOURCES_JSON must contain a JSON array");
  return parsed;
}

function validateSource(source) {
  if (!source || typeof source !== "object") throw new TypeError("Source must be an object");
  const normalized = {
    id: clean(source.id),
    name: clean(source.name),
    kind: clean(source.kind || "procurement"),
    jurisdiction: clean(source.jurisdiction || "US-MN"),
    url: clean(source.url),
    reliability: clamp(finiteNumber(source.reliability, 0.8), 0, 1),
    collect: source.collect !== false,
  };
  if (!normalized.id || !/^[a-z0-9_\-]+$/.test(normalized.id)) throw new TypeError("Source id must use lowercase letters, numbers, underscores, or hyphens");
  if (!normalized.name) throw new TypeError(`Source ${normalized.id} requires a name`);
  const parsed = new URL(normalized.url);
  if (parsed.protocol !== "https:") throw new TypeError(`Source ${normalized.id} must use HTTPS`);
  return normalized;
}

function validateProfile(profile) {
  const normalized = {
    name: clean(profile.name || DEFAULT_PROFILE.name),
    service_keywords: [...new Set((profile.service_keywords || []).map(clean).filter(Boolean))],
    preferred_regions: [...new Set((profile.preferred_regions || []).map(clean).filter(Boolean))],
    minimum_score: Math.round(clamp(finiteNumber(profile.minimum_score, 35), 0, 100)),
    maximum_days_to_due: positiveInteger(profile.maximum_days_to_due || 120, "maximum_days_to_due"),
  };
  if (!normalized.service_keywords.length) throw new TypeError("Revenue profile requires at least one service keyword");
  return normalized;
}

function appendOutbox(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.appendFileSync(filePath, `${JSON.stringify(payload)}\n`, { mode: 0o600 });
}

function eventRecord(type, payload, timestamp) {
  return { id: crypto.randomUUID(), type, timestamp, payload: sanitize(payload) };
}

function mergeById(existing, incoming) {
  const map = new Map((existing || []).map((item) => [item.id, item]));
  for (const item of incoming || []) map.set(item.id, { ...(map.get(item.id) || {}), ...item });
  return [...map.values()];
}

function compareOpportunities(a, b) {
  if (b.score !== a.score) return b.score - a.score;
  const aDue = a.due_at ? new Date(a.due_at).getTime() : Number.MAX_SAFE_INTEGER;
  const bDue = b.due_at ? new Date(b.due_at).getTime() : Number.MAX_SAFE_INTEGER;
  return aDue - bDue || String(a.title).localeCompare(String(b.title));
}

function htmlToText(value) {
  return String(value || "")
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/\s+/g, " ")
    .trim();
}

function canonicalizeUrl(value) {
  try {
    const url = new URL(value);
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) if (/^(utm_|fbclid|gclid)/i.test(key)) url.searchParams.delete(key);
    return url.toString();
  } catch { return clean(value); }
}

function searchable(value) {
  return JSON.stringify(value || {}).toLowerCase();
}

function splitValues(value) {
  if (Array.isArray(value)) return value.map(clean).filter(Boolean);
  return clean(value).split(/[;,|]/).map(clean).filter(Boolean);
}

function dateOrNull(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function slugify(value) {
  return clean(value).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function hash(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

function sanitize(value) {
  if (Array.isArray(value)) return value.map(sanitize);
  if (!value || typeof value !== "object") return value;
  const output = {};
  for (const [key, item] of Object.entries(value)) {
    output[key] = /(token|secret|password|authorization|cookie|api[_-]?key)/i.test(key) ? "[REDACTED]" : sanitize(item);
  }
  return output;
}

function typedError(code, message, statusCode = 500) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  return error;
}

function clean(value) {
  return String(value == null ? "" : value).replace(/\s+/g, " ").trim();
}

function finiteNumber(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function positiveInteger(value, label) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) throw new TypeError(`${label} must be a positive integer`);
  return number;
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function round(value, places) {
  const multiplier = 10 ** places;
  return Math.round(value * multiplier) / multiplier;
}

module.exports = {
  DEFAULT_INTERVAL_MS,
  DEFAULT_PROFILE,
  DEFAULT_SOURCES,
  JsonLogger,
  JsonStore,
  MAX_BODY_BYTES,
  MinnesotaIntelligence,
  VERSION,
  calculateMetrics,
  classifyCategory,
  createMinnesotaIntelligence,
  extractLinks,
  extractOpportunities,
  fetchText,
  parseCsv,
  parseDueDate,
  parseImportedRecords,
  scoreOpportunity,
};
