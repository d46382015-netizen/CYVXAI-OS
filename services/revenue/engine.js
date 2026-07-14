"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const {
  RuntimeError, now, id, sha256, canonical, atomicWrite,
} = require("../../runtime/missions/base");
const { RevenueEmailProvider, StripeRevenueProvider } = require("./providers");

const VENTURE_STATES = new Set(["draft", "ready", "active", "paused", "completed", "stopped"]);
const DEAL_STAGES = new Set(["lead", "qualified", "discovery", "proposal", "negotiation", "won", "lost"]);
const CAMPAIGN_STATES = new Set(["draft", "approved", "running", "paused", "completed"]);
const CONTACT_BASES = new Set(["opt_in", "existing_relationship", "public_business_contact", "authorized_import"]);
const SENDABLE_CONTACT_BASES = new Set(["opt_in", "existing_relationship"]);
const PAYMENT_STATES = new Set(["pending", "paid", "failed", "refunded"]);

function ensureRevenueSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS revenue_ventures (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL,
      entity_id TEXT NOT NULL UNIQUE,
      mission_id TEXT NOT NULL,
      slug TEXT NOT NULL,
      name TEXT NOT NULL,
      market TEXT NOT NULL,
      ideal_customer TEXT NOT NULL,
      problem TEXT NOT NULL,
      offer_name TEXT NOT NULL,
      offer_summary TEXT NOT NULL,
      deliverables TEXT NOT NULL,
      price_cents INTEGER NOT NULL,
      currency TEXT NOT NULL DEFAULT 'usd',
      location TEXT,
      booking_url TEXT,
      public_base_url TEXT,
      status TEXT NOT NULL CHECK(status IN ('draft','ready','active','paused','completed','stopped')),
      workspace_path TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      launched_at TEXT,
      UNIQUE(organization_id,slug),
      FOREIGN KEY(entity_id) REFERENCES operator_entities(id)
    );
    CREATE INDEX IF NOT EXISTS idx_revenue_ventures_org_status ON revenue_ventures(organization_id,status,updated_at);

    CREATE TABLE IF NOT EXISTS revenue_assets (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL,
      venture_id TEXT NOT NULL,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      relative_path TEXT NOT NULL,
      public_path TEXT,
      sha256 TEXT NOT NULL,
      bytes INTEGER NOT NULL,
      evidence_id TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(venture_id,type,relative_path),
      FOREIGN KEY(venture_id) REFERENCES revenue_ventures(id)
    );

    CREATE TABLE IF NOT EXISTS revenue_prospects (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL,
      venture_id TEXT NOT NULL,
      source TEXT NOT NULL,
      external_id TEXT,
      company_name TEXT,
      contact_name TEXT,
      email TEXT,
      phone TEXT,
      website TEXT,
      location TEXT,
      category TEXT,
      contact_basis TEXT NOT NULL,
      consent_status TEXT NOT NULL DEFAULT 'unknown',
      unsubscribe_token TEXT NOT NULL UNIQUE,
      score INTEGER NOT NULL DEFAULT 0,
      stage TEXT NOT NULL DEFAULT 'prospect',
      verification_status TEXT NOT NULL DEFAULT 'unverified',
      metadata TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(venture_id) REFERENCES revenue_ventures(id)
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_revenue_prospect_email ON revenue_prospects(venture_id,email) WHERE email IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_revenue_prospects_stage ON revenue_prospects(venture_id,stage,score DESC,updated_at DESC);

    CREATE TABLE IF NOT EXISTS revenue_campaigns (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL,
      venture_id TEXT NOT NULL,
      name TEXT NOT NULL,
      channel TEXT NOT NULL DEFAULT 'email',
      status TEXT NOT NULL CHECK(status IN ('draft','approved','running','paused','completed')),
      audience_rule TEXT NOT NULL,
      subject_template TEXT NOT NULL,
      body_template TEXT NOT NULL,
      daily_limit INTEGER NOT NULL DEFAULT 10,
      approved_by TEXT,
      approved_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(venture_id) REFERENCES revenue_ventures(id)
    );

    CREATE TABLE IF NOT EXISTS revenue_messages (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL,
      venture_id TEXT NOT NULL,
      campaign_id TEXT NOT NULL,
      prospect_id TEXT NOT NULL,
      provider TEXT,
      status TEXT NOT NULL,
      subject TEXT NOT NULL,
      body TEXT NOT NULL,
      provider_message_id TEXT,
      error TEXT,
      created_at TEXT NOT NULL,
      sent_at TEXT,
      UNIQUE(campaign_id,prospect_id),
      FOREIGN KEY(campaign_id) REFERENCES revenue_campaigns(id),
      FOREIGN KEY(prospect_id) REFERENCES revenue_prospects(id)
    );
    CREATE INDEX IF NOT EXISTS idx_revenue_messages_campaign ON revenue_messages(campaign_id,status,created_at);

    CREATE TABLE IF NOT EXISTS revenue_deals (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL,
      venture_id TEXT NOT NULL,
      prospect_id TEXT,
      title TEXT NOT NULL,
      stage TEXT NOT NULL CHECK(stage IN ('lead','qualified','discovery','proposal','negotiation','won','lost')),
      value_cents INTEGER NOT NULL DEFAULT 0,
      probability REAL NOT NULL DEFAULT 0,
      next_action TEXT,
      notes TEXT,
      loss_reason TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      closed_at TEXT,
      FOREIGN KEY(venture_id) REFERENCES revenue_ventures(id),
      FOREIGN KEY(prospect_id) REFERENCES revenue_prospects(id)
    );
    CREATE INDEX IF NOT EXISTS idx_revenue_deals_pipeline ON revenue_deals(venture_id,stage,updated_at DESC);

    CREATE TABLE IF NOT EXISTS revenue_clients (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL,
      venture_id TEXT NOT NULL,
      deal_id TEXT NOT NULL UNIQUE,
      prospect_id TEXT,
      name TEXT NOT NULL,
      email TEXT,
      status TEXT NOT NULL DEFAULT 'onboarding',
      lifetime_value_cents INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(venture_id) REFERENCES revenue_ventures(id),
      FOREIGN KEY(deal_id) REFERENCES revenue_deals(id)
    );

    CREATE TABLE IF NOT EXISTS revenue_payments (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL,
      venture_id TEXT NOT NULL,
      deal_id TEXT,
      client_id TEXT,
      provider TEXT NOT NULL,
      provider_event_id TEXT,
      provider_session_id TEXT,
      amount_cents INTEGER NOT NULL,
      currency TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('pending','paid','failed','refunded')),
      verification TEXT NOT NULL,
      receipt_reference TEXT,
      evidence_id TEXT,
      created_at TEXT NOT NULL,
      received_at TEXT,
      updated_at TEXT NOT NULL,
      UNIQUE(provider,provider_event_id),
      FOREIGN KEY(venture_id) REFERENCES revenue_ventures(id),
      FOREIGN KEY(deal_id) REFERENCES revenue_deals(id),
      FOREIGN KEY(client_id) REFERENCES revenue_clients(id)
    );
    CREATE INDEX IF NOT EXISTS idx_revenue_payments_venture ON revenue_payments(venture_id,status,received_at DESC);

    CREATE TABLE IF NOT EXISTS revenue_fulfillments (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL,
      venture_id TEXT NOT NULL,
      client_id TEXT NOT NULL,
      deal_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'queued',
      deliverables TEXT NOT NULL,
      acceptance_criteria TEXT NOT NULL,
      due_at TEXT,
      completed_at TEXT,
      evidence_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(client_id,deal_id),
      FOREIGN KEY(venture_id) REFERENCES revenue_ventures(id),
      FOREIGN KEY(client_id) REFERENCES revenue_clients(id),
      FOREIGN KEY(deal_id) REFERENCES revenue_deals(id)
    );

    CREATE TABLE IF NOT EXISTS revenue_events (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL,
      venture_id TEXT NOT NULL,
      type TEXT NOT NULL,
      subject_id TEXT,
      actor TEXT NOT NULL,
      payload TEXT NOT NULL,
      previous_hash TEXT NOT NULL,
      event_hash TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(venture_id) REFERENCES revenue_ventures(id)
    );
    CREATE INDEX IF NOT EXISTS idx_revenue_events_chain ON revenue_events(venture_id,created_at,id);
  `);
}

class VentureRevenueEngine {
  constructor(runtime, options = {}) {
    if (!runtime || !runtime.db || !runtime.evidence) throw new Error("VentureRevenueEngine requires the CYVX mission runtime");
    if (!options.universal) throw new Error("VentureRevenueEngine requires the universal operator");
    this.runtime = runtime;
    this.db = runtime.db;
    this.universal = options.universal;
    this.logger = runtime.logger || runtime.store && runtime.store.logger || { write() {} };
    this.workspaceRoot = path.resolve(options.workspaceRoot || process.env.CYVX_REVENUE_ROOT || path.join(runtime.dataRoot, "revenue"));
    this.publicBaseUrl = String(options.publicBaseUrl || process.env.CYVX_PUBLIC_BASE_URL || "").replace(/\/$/, "");
    this.businessPostalAddress = String(options.businessPostalAddress || process.env.CYVX_BUSINESS_POSTAL_ADDRESS || "").trim();
    this.email = options.email || new RevenueEmailProvider(options);
    this.stripe = options.stripe || new StripeRevenueProvider(options);
    fs.mkdirSync(this.workspaceRoot, { recursive: true, mode: 0o700 });
    ensureRevenueSchema(this.db);
    this.migrateVentureEntities();
  }

  migrateVentureEntities() {
    const rows = this.db.prepare("SELECT * FROM operator_entities WHERE entity_type='venture'").all();
    let migrated = 0;
    for (const entity of rows) {
      if (this.db.prepare("SELECT id FROM revenue_ventures WHERE entity_id=?").get(entity.id)) continue;
      const profile = parseJson(entity.profile, {});
      const timestamp = now();
      const ventureId = id("revenue_venture");
      const workspace = safePath(this.workspaceRoot, path.join(this.workspaceRoot, entity.organization_id, ventureId));
      const offer = String(profile.offer || profile.operating_system || entity.description || "Outcome-focused operating service").slice(0, 2000);
      const customer = String(profile.target_customer || profile.subject || "Customers with a measurable operating constraint").slice(0, 1000);
      const price = integer(profile.price_cents || profile.metadata && profile.metadata.price_cents || 0, "price_cents", 0, 100_000_000);
      this.db.prepare(`INSERT INTO revenue_ventures(id,organization_id,entity_id,mission_id,slug,name,market,ideal_customer,problem,offer_name,offer_summary,deliverables,price_cents,currency,location,booking_url,public_base_url,status,workspace_path,created_at,updated_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
        ventureId, entity.organization_id, entity.id, entity.mission_id, entity.slug, entity.name,
        String(profile.location || "online"), customer, entity.description, entity.name, offer,
        JSON.stringify(defaultDeliverables(entity.name)), price, "usd", String(profile.location || ""), null,
        this.publicBaseUrl || null, "draft", workspace, timestamp, timestamp,
      );
      this.event(ventureId, entity.organization_id, "venture.registered", entity.id, "system", { migrated_from: "operator_entities", entity_id: entity.id });
      migrated += 1;
    }
    return migrated;
  }

  createVenture(input = {}, auth) {
    this.assertRole(auth, ["admin"]);
    const name = text(input.name, "name", 180, true);
    const market = text(input.market || input.location || "online", "market", 500, true);
    const idealCustomer = text(input.ideal_customer || input.target_customer, "ideal_customer", 1200, true);
    const problem = text(input.problem || input.description, "problem", 1800, true);
    const offerName = text(input.offer_name || name, "offer_name", 240, true);
    const offerSummary = text(input.offer_summary || input.offer, "offer_summary", 2400, true);
    const priceCents = integer(input.price_cents ?? 0, "price_cents", 0, 100_000_000);
    const deliverables = array(input.deliverables || defaultDeliverables(name), "deliverables", 30, 500);
    const revenueTarget = integer(input.revenue_target_cents ?? Math.max(priceCents, 1), "revenue_target_cents", 1, 1_000_000_000);
    const created = this.universal.createEntity({
      entity_type: "venture",
      name,
      description: problem,
      target_customer: idealCustomer,
      offer: offerSummary,
      price_cents: priceCents,
      location: market,
      visibility: "public",
      keywords: array(input.keywords || [], "keywords", 50, 160),
      resources: array(input.resources || [], "resources", 50, 300),
      constraints: array(input.constraints || ["Real demand must be proven", "External actions require provider readiness", "Revenue requires verified payment"], "constraints", 50, 300),
      stakeholders: array(input.stakeholders || ["prospects", "clients", "owner"], "stakeholders", 50, 300),
      channels: array(input.channels || ["owned website", "referrals", "approved email"], "channels", 50, 300),
      operating_system: `Acquire, qualify, close, fulfill, retain, and measure customers for ${offerName}.`,
      outcome_contract: {
        objective: `Collect at least ${(revenueTarget / 100).toFixed(2)} ${String(input.currency || "usd").toUpperCase()} in customer revenue supported by provider verification or owner payment evidence for ${name}.`,
        target_metric: "revenue_cents",
        comparator: ">=",
        target_value: revenueTarget,
        target_unit: "cents",
        max_budget_cents: integer(input.max_budget_cents ?? 0, "max_budget_cents", 0, 1_000_000_000),
        approval_threshold_cents: integer(input.approval_threshold_cents ?? 0, "approval_threshold_cents", 0, 1_000_000_000),
        deadline: input.deadline || null,
        risk_level: input.risk_level || "medium",
      },
    }, auth);
    this.migrateVentureEntities();
    const venture = this.requireVentureByEntity(created.entity.id, auth.organization_id);
    this.db.prepare("UPDATE revenue_ventures SET market=?,ideal_customer=?,problem=?,offer_name=?,offer_summary=?,deliverables=?,price_cents=?,currency=?,booking_url=?,updated_at=? WHERE id=?")
      .run(market, idealCustomer, problem, offerName, offerSummary, JSON.stringify(deliverables), priceCents, currency(input.currency), urlOrNull(input.booking_url), now(), venture.id);
    this.event(venture.id, auth.organization_id, "venture.created", created.entity.id, auth.user_id, { offer_name: offerName, price_cents: priceCents, revenue_target_cents: revenueTarget });
    return { entity: this.universal.getEntity(created.entity.id, auth), venture: this.getVenture(venture.id, auth) };
  }

  activate(ventureId, input = {}, auth) {
    this.assertRole(auth, ["admin", "agent"]);
    const venture = this.requireVenture(ventureId, auth.organization_id);
    const entity = this.requireEntity(venture.entity_id, auth.organization_id);
    if (entity.activation_status !== "learned") throw new RuntimeError("ENTITY_NOT_ACTIVATED", "Complete and learn the universal venture activation before launching revenue operations.", 409);
    const patch = {
      market: input.market ? text(input.market, "market", 500, true) : venture.market,
      ideal_customer: input.ideal_customer ? text(input.ideal_customer, "ideal_customer", 1200, true) : venture.ideal_customer,
      problem: input.problem ? text(input.problem, "problem", 1800, true) : venture.problem,
      offer_name: input.offer_name ? text(input.offer_name, "offer_name", 240, true) : venture.offer_name,
      offer_summary: input.offer_summary ? text(input.offer_summary, "offer_summary", 2400, true) : venture.offer_summary,
      deliverables: input.deliverables ? array(input.deliverables, "deliverables", 30, 500) : parseJson(venture.deliverables, []),
      price_cents: input.price_cents !== undefined ? integer(input.price_cents, "price_cents", 0, 100_000_000) : Number(venture.price_cents),
      currency: input.currency ? currency(input.currency) : venture.currency,
      booking_url: input.booking_url !== undefined ? urlOrNull(input.booking_url) : venture.booking_url,
      public_base_url: input.public_base_url !== undefined ? urlOrNull(input.public_base_url) : venture.public_base_url || this.publicBaseUrl || null,
    };
    this.db.prepare(`UPDATE revenue_ventures SET market=?,ideal_customer=?,problem=?,offer_name=?,offer_summary=?,deliverables=?,price_cents=?,currency=?,booking_url=?,public_base_url=?,status='ready',updated_at=? WHERE id=?`)
      .run(patch.market, patch.ideal_customer, patch.problem, patch.offer_name, patch.offer_summary, JSON.stringify(patch.deliverables), patch.price_cents, patch.currency, patch.booking_url, patch.public_base_url, now(), venture.id);
    const current = this.requireVenture(venture.id, auth.organization_id);
    const assets = this.buildAssets(current, entity, auth);
    const launchedAt = now();
    this.db.prepare("UPDATE revenue_ventures SET status='active',launched_at=COALESCE(launched_at,?),updated_at=? WHERE id=?").run(launchedAt, launchedAt, venture.id);
    this.event(venture.id, auth.organization_id, "venture.launched", venture.id, auth.user_id, { asset_count: assets.length, public_path: `/v/${venture.slug}` });
    return this.getVenture(venture.id, auth);
  }

  buildAssets(venture, entity, auth) {
    const workspace = safePath(this.workspaceRoot, venture.workspace_path);
    fs.mkdirSync(workspace, { recursive: true, mode: 0o700 });
    const baseUrl = venture.public_base_url || this.publicBaseUrl || "";
    const publicUrl = baseUrl ? `${baseUrl}/v/${venture.slug}` : `/v/${venture.slug}`;
    const deliverables = parseJson(venture.deliverables, []);
    const assets = [
      asset("venture_manifest", "Venture operating manifest", "venture.json", JSON.stringify({ schema_version: 3, venture_id: venture.id, entity_id: venture.entity_id, mission_id: venture.mission_id, name: venture.name, market: venture.market, ideal_customer: venture.ideal_customer, problem: venture.problem, offer_name: venture.offer_name, offer_summary: venture.offer_summary, deliverables, price_cents: Number(venture.price_cents), currency: venture.currency, booking_url: venture.booking_url, public_url: publicUrl, ownership: "owner-controlled", generated_at: now() }, null, 2) + "\n"),
      asset("offer", "Commercial offer", "assets/offer.md", offerMarkdown(venture, deliverables)),
      asset("proposal", "Proposal template", "assets/proposal-template.md", proposalMarkdown(venture, deliverables)),
      asset("discovery", "Discovery call script", "assets/discovery-script.md", discoveryMarkdown(venture)),
      asset("lead_magnet", "Lead magnet", "assets/lead-magnet.md", leadMagnetMarkdown(venture)),
      asset("outreach", "Approved outreach sequence", "assets/outreach-sequence.json", JSON.stringify(outreachSequence(venture), null, 2) + "\n"),
      asset("fulfillment", "Fulfillment system", "assets/fulfillment-sop.md", fulfillmentMarkdown(venture, deliverables)),
      asset("sales_page", "Public sales page", "public/revenue.html", salesPageHtml(venture, deliverables, publicUrl), `/v/${venture.slug}`),
      asset("privacy", "Privacy notice", "public/privacy.html", legalPage(venture, "Privacy", privacyText(venture)), `/v/${venture.slug}/privacy`),
      asset("terms", "Service terms", "public/terms.html", legalPage(venture, "Service Terms", termsText(venture)), `/v/${venture.slug}/terms`),
      asset("thank_you", "Thank-you page", "public/thank-you.html", legalPage(venture, "Received", "Your request was received. The next step is qualification, scope confirmation, and a clear decision on fit."), `/v/${venture.slug}/thank-you`),
    ];
    const output = [];
    for (const record of assets) {
      const target = safePath(workspace, path.join(workspace, record.relative_path));
      atomicWrite(target, record.content);
      const evidence = this.runtime.evidence.record({
        auth: internalAuth(entity, auth), missionId: venture.mission_id, content: record.content,
        type: `revenue.${record.type}`, title: record.title, source: "venture.revenue.v3",
        correlationId: auth.correlation_id || id("correlation"), causationId: venture.id,
      });
      const timestamp = now();
      this.db.prepare(`INSERT INTO revenue_assets(id,organization_id,venture_id,type,title,relative_path,public_path,sha256,bytes,evidence_id,status,created_at,updated_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)
        ON CONFLICT(venture_id,type,relative_path) DO UPDATE SET title=excluded.title,public_path=excluded.public_path,sha256=excluded.sha256,bytes=excluded.bytes,evidence_id=excluded.evidence_id,status='active',updated_at=excluded.updated_at`)
        .run(id("revenue_asset"), venture.organization_id, venture.id, record.type, record.title, record.relative_path, record.public_path || null, sha256(record.content), Buffer.byteLength(record.content), evidence.id, "active", timestamp, timestamp);
      output.push({ type: record.type, path: target, public_path: record.public_path || null, sha256: sha256(record.content), evidence_id: evidence.id });
    }
    return output;
  }

  importProspects(ventureId, input = {}, auth) {
    this.assertRole(auth, ["admin", "agent"]);
    const venture = this.requireVenture(ventureId, auth.organization_id);
    const records = Array.isArray(input.records) ? input.records : [];
    if (!records.length) throw new RuntimeError("VALIDATION_ERROR", "records must contain at least one real prospect.", 422);
    if (records.length > 1000) throw new RuntimeError("VALIDATION_ERROR", "A single import may contain at most 1000 prospects.", 422);
    const result = { imported: 0, updated: 0, rejected: [], prospect_ids: [] };
    for (let index = 0; index < records.length; index += 1) {
      try {
        const normalized = normalizeProspect(records[index], input.source || "authorized_import");
        const existing = normalized.email ? this.db.prepare("SELECT id FROM revenue_prospects WHERE venture_id=? AND email=?").get(venture.id, normalized.email) : null;
        const score = prospectScore(venture, normalized);
        const timestamp = now();
        if (existing) {
          this.db.prepare(`UPDATE revenue_prospects SET company_name=?,contact_name=?,phone=?,website=?,location=?,category=?,contact_basis=?,consent_status=?,score=?,metadata=?,updated_at=? WHERE id=?`)
            .run(normalized.company_name, normalized.contact_name, normalized.phone, normalized.website, normalized.location, normalized.category, normalized.contact_basis, normalized.consent_status, score, JSON.stringify(normalized.metadata), timestamp, existing.id);
          result.updated += 1;
          result.prospect_ids.push(existing.id);
        } else {
          const prospectId = id("prospect");
          this.db.prepare(`INSERT INTO revenue_prospects(id,organization_id,venture_id,source,external_id,company_name,contact_name,email,phone,website,location,category,contact_basis,consent_status,unsubscribe_token,score,stage,verification_status,metadata,created_at,updated_at)
            VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
            prospectId, venture.organization_id, venture.id, normalized.source, normalized.external_id,
            normalized.company_name, normalized.contact_name, normalized.email, normalized.phone, normalized.website,
            normalized.location, normalized.category, normalized.contact_basis, normalized.consent_status,
            crypto.randomBytes(24).toString("base64url"), score, "prospect", normalized.verification_status,
            JSON.stringify(normalized.metadata), timestamp, timestamp,
          );
          result.imported += 1;
          result.prospect_ids.push(prospectId);
        }
      } catch (error) {
        result.rejected.push({ index, code: error.code || "INVALID_PROSPECT", message: error.message });
      }
    }
    this.event(venture.id, venture.organization_id, "prospects.imported", venture.id, auth.user_id, { imported: result.imported, updated: result.updated, rejected: result.rejected.length });
    return result;
  }

  captureInbound(slug, input = {}) {
    const venture = this.db.prepare("SELECT * FROM revenue_ventures WHERE slug=? AND status IN ('active','completed') ORDER BY updated_at DESC LIMIT 1").get(slug);
    if (!venture) throw new RuntimeError("NOT_FOUND", "Revenue venture page not found.", 404);
    const email = emailOrNull(input.email);
    const phone = text(input.phone, "phone", 50, false) || null;
    if (!email && !phone) throw new RuntimeError("VALIDATION_ERROR", "Email or phone is required.", 422);
    const normalized = normalizeProspect({
      company_name: input.company_name,
      contact_name: input.name,
      email,
      phone,
      website: input.website,
      location: input.location,
      category: input.category,
      contact_basis: "opt_in",
      consent_status: "opted_in",
      verification_status: "self_submitted",
      metadata: { message: text(input.message, "message", 4000, false), requested_outcome: text(input.requested_outcome, "requested_outcome", 2000, false), source_page: `/v/${venture.slug}` },
    }, `inbound:${text(input.source || "sales_page", "source", 100, true)}`);
    let prospect = normalized.email ? this.db.prepare("SELECT * FROM revenue_prospects WHERE venture_id=? AND email=?").get(venture.id, normalized.email) : null;
    const timestamp = now();
    if (prospect) {
      this.db.prepare("UPDATE revenue_prospects SET company_name=COALESCE(?,company_name),contact_name=COALESCE(?,contact_name),phone=COALESCE(?,phone),contact_basis='opt_in',consent_status='opted_in',verification_status='self_submitted',stage='lead',metadata=?,updated_at=? WHERE id=?")
        .run(normalized.company_name, normalized.contact_name, normalized.phone, JSON.stringify({ ...parseJson(prospect.metadata, {}), ...normalized.metadata }), timestamp, prospect.id);
      prospect = this.db.prepare("SELECT * FROM revenue_prospects WHERE id=?").get(prospect.id);
    } else {
      const prospectId = id("prospect");
      this.db.prepare(`INSERT INTO revenue_prospects(id,organization_id,venture_id,source,external_id,company_name,contact_name,email,phone,website,location,category,contact_basis,consent_status,unsubscribe_token,score,stage,verification_status,metadata,created_at,updated_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
        prospectId, venture.organization_id, venture.id, normalized.source, null, normalized.company_name, normalized.contact_name,
        normalized.email, normalized.phone, normalized.website, normalized.location, normalized.category, "opt_in", "opted_in",
        crypto.randomBytes(24).toString("base64url"), Math.max(70, prospectScore(venture, normalized)), "lead", "self_submitted",
        JSON.stringify(normalized.metadata), timestamp, timestamp,
      );
      prospect = this.db.prepare("SELECT * FROM revenue_prospects WHERE id=?").get(prospectId);
    }
    let deal = this.db.prepare("SELECT * FROM revenue_deals WHERE venture_id=? AND prospect_id=? AND stage NOT IN ('lost','won') ORDER BY created_at DESC LIMIT 1").get(venture.id, prospect.id);
    if (!deal) deal = this.createDealInternal(venture, prospect, { title: `${prospect.company_name || prospect.contact_name || "Inbound prospect"} — ${venture.offer_name}`, value_cents: Number(venture.price_cents), stage: "lead", probability: 0.15, next_action: "Qualify need, authority, timeline, and budget." });
    this.event(venture.id, venture.organization_id, "lead.inbound", prospect.id, "public", { prospect_id: prospect.id, deal_id: deal.id, source: normalized.source });
    this.syncMetrics(venture, internalAuth(this.requireEntity(venture.entity_id, venture.organization_id)));
    return { lead_id: prospect.id, deal_id: deal.id, status: "received", next: venture.booking_url || `/v/${venture.slug}/thank-you` };
  }

  createCampaign(ventureId, input = {}, auth) {
    this.assertRole(auth, ["admin", "agent"]);
    const venture = this.requireVenture(ventureId, auth.organization_id);
    const timestamp = now();
    const campaign = {
      id: id("campaign"), name: text(input.name, "name", 180, true),
      audience_rule: text(input.audience_rule || "opt_in_or_existing_relationship", "audience_rule", 200, true),
      subject_template: text(input.subject_template, "subject_template", 300, true),
      body_template: text(input.body_template, "body_template", 20_000, true),
      daily_limit: integer(input.daily_limit ?? 10, "daily_limit", 1, 200),
    };
    this.db.prepare(`INSERT INTO revenue_campaigns(id,organization_id,venture_id,name,channel,status,audience_rule,subject_template,body_template,daily_limit,created_at,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`).run(campaign.id, venture.organization_id, venture.id, campaign.name, "email", "draft", campaign.audience_rule, campaign.subject_template, campaign.body_template, campaign.daily_limit, timestamp, timestamp);
    this.event(venture.id, venture.organization_id, "campaign.created", campaign.id, auth.user_id, { daily_limit: campaign.daily_limit, audience_rule: campaign.audience_rule });
    return this.db.prepare("SELECT * FROM revenue_campaigns WHERE id=?").get(campaign.id);
  }

  approveCampaign(campaignId, auth) {
    this.assertRole(auth, ["admin"]);
    const campaign = this.requireCampaign(campaignId, auth.organization_id);
    this.db.prepare("UPDATE revenue_campaigns SET status='approved',approved_by=?,approved_at=?,updated_at=? WHERE id=?").run(auth.user_id, now(), now(), campaign.id);
    this.event(campaign.venture_id, auth.organization_id, "campaign.approved", campaign.id, auth.user_id, { approved: true });
    return this.requireCampaign(campaign.id, auth.organization_id);
  }

  async runCampaign(campaignId, input = {}, auth) {
    this.assertRole(auth, ["admin", "agent"]);
    const campaign = this.requireCampaign(campaignId, auth.organization_id);
    const venture = this.requireVenture(campaign.venture_id, auth.organization_id);
    if (!["approved", "running"].includes(campaign.status)) throw new RuntimeError("CAMPAIGN_NOT_APPROVED", "The campaign must be approved before sending.", 409);
    if (!this.email.configured()) throw new RuntimeError("EMAIL_PROVIDER_UNCONFIGURED", "Connect Resend or Postmark before sending real outreach.", 503);
    if (!this.businessPostalAddress) throw new RuntimeError("BUSINESS_ADDRESS_REQUIRED", "CYVX_BUSINESS_POSTAL_ADDRESS is required before commercial email can be sent.", 503);
    const baseUrl = venture.public_base_url || this.publicBaseUrl;
    if (!baseUrl || !/^https:\/\//i.test(baseUrl)) throw new RuntimeError("PUBLIC_HTTPS_REQUIRED", "A public HTTPS CYVX_PUBLIC_BASE_URL is required before outreach can be sent.", 503);
    const requested = Math.min(integer(input.limit ?? campaign.daily_limit, "limit", 1, campaign.daily_limit), campaign.daily_limit);
    const sentToday = Number(this.db.prepare("SELECT count(*) AS count FROM revenue_messages WHERE campaign_id=? AND status='sent' AND sent_at>=?").get(campaign.id, new Date(Date.now() - 86400000).toISOString()).count);
    const remaining = Math.max(0, campaign.daily_limit - sentToday);
    const limit = Math.min(requested, remaining);
    if (!limit) return { sent: 0, skipped: 0, remaining_today: 0, results: [] };
    this.db.prepare("UPDATE revenue_campaigns SET status='running',updated_at=? WHERE id=?").run(now(), campaign.id);
    const prospects = this.db.prepare(`SELECT p.* FROM revenue_prospects p
      WHERE p.venture_id=? AND p.email IS NOT NULL AND p.consent_status!='unsubscribed'
      AND p.contact_basis IN ('opt_in','existing_relationship')
      AND NOT EXISTS(SELECT 1 FROM revenue_messages m WHERE m.campaign_id=? AND m.prospect_id=p.id)
      ORDER BY p.score DESC,p.created_at ASC LIMIT ?`).all(venture.id, campaign.id, limit);
    const results = [];
    for (const prospect of prospects) {
      const subject = renderTemplate(campaign.subject_template, venture, prospect);
      const body = `${renderTemplate(campaign.body_template, venture, prospect)}\n\n---\n${venture.name}\n${this.businessPostalAddress}\nUnsubscribe: ${baseUrl}/api/v3/revenue/unsubscribe/${prospect.unsubscribe_token}`;
      const messageId = id("revenue_message");
      this.db.prepare(`INSERT INTO revenue_messages(id,organization_id,venture_id,campaign_id,prospect_id,status,subject,body,created_at)
        VALUES(?,?,?,?,?,?,?,?,?)`).run(messageId, venture.organization_id, venture.id, campaign.id, prospect.id, "sending", subject, body, now());
      try {
        const result = await this.email.send({
          to: [prospect.email], subject, text: body,
          headers: { "List-Unsubscribe": `<${baseUrl}/api/v3/revenue/unsubscribe/${prospect.unsubscribe_token}>`, "X-CYVX-Venture": venture.id },
          tags: [{ name: "venture", value: venture.slug }, { name: "campaign", value: campaign.id }],
        });
        this.db.prepare("UPDATE revenue_messages SET provider=?,status='sent',provider_message_id=?,sent_at=?,error=NULL WHERE id=?")
          .run(result.provider, result.id, now(), messageId);
        results.push({ prospect_id: prospect.id, status: "sent", provider_message_id: result.id });
        this.event(venture.id, venture.organization_id, "message.sent", messageId, auth.user_id, { campaign_id: campaign.id, prospect_id: prospect.id, provider: result.provider, provider_message_id: result.id });
      } catch (error) {
        this.db.prepare("UPDATE revenue_messages SET status='failed',error=? WHERE id=?").run(String(error.message).slice(0, 2000), messageId);
        results.push({ prospect_id: prospect.id, status: "failed", error: error.message });
      }
    }
    if (prospects.length < limit) this.db.prepare("UPDATE revenue_campaigns SET status='completed',updated_at=? WHERE id=?").run(now(), campaign.id);
    return { sent: results.filter((item) => item.status === "sent").length, failed: results.filter((item) => item.status === "failed").length, remaining_today: Math.max(0, remaining - results.length), results };
  }

  unsubscribe(token) {
    const prospect = this.db.prepare("SELECT * FROM revenue_prospects WHERE unsubscribe_token=?").get(String(token || ""));
    if (!prospect) return { ok: true, status: "not_found_or_already_removed" };
    this.db.prepare("UPDATE revenue_prospects SET consent_status='unsubscribed',updated_at=? WHERE id=?").run(now(), prospect.id);
    this.event(prospect.venture_id, prospect.organization_id, "contact.unsubscribed", prospect.id, "public", {});
    return { ok: true, status: "unsubscribed" };
  }

  createDeal(ventureId, input = {}, auth) {
    this.assertRole(auth, ["admin", "agent"]);
    const venture = this.requireVenture(ventureId, auth.organization_id);
    const prospect = input.prospect_id ? this.requireProspect(input.prospect_id, venture.id) : null;
    return this.createDealInternal(venture, prospect, input);
  }

  createDealInternal(venture, prospect, input = {}) {
    const stage = String(input.stage || "lead");
    if (!DEAL_STAGES.has(stage)) throw new RuntimeError("VALIDATION_ERROR", "Invalid deal stage.", 422);
    const timestamp = now();
    const deal = {
      id: id("deal"), title: text(input.title || `${prospect && (prospect.company_name || prospect.contact_name) || "Prospect"} — ${venture.offer_name}`, "title", 300, true),
      stage, value_cents: integer(input.value_cents ?? venture.price_cents, "value_cents", 0, 100_000_000),
      probability: probability(input.probability ?? stageProbability(stage)), next_action: text(input.next_action, "next_action", 1000, false) || null,
      notes: text(input.notes, "notes", 10_000, false) || null,
    };
    this.db.prepare(`INSERT INTO revenue_deals(id,organization_id,venture_id,prospect_id,title,stage,value_cents,probability,next_action,notes,created_at,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`).run(deal.id, venture.organization_id, venture.id, prospect && prospect.id || null, deal.title, deal.stage, deal.value_cents, deal.probability, deal.next_action, deal.notes, timestamp, timestamp);
    if (prospect) this.db.prepare("UPDATE revenue_prospects SET stage=?,updated_at=? WHERE id=?").run(stage, timestamp, prospect.id);
    this.event(venture.id, venture.organization_id, "deal.created", deal.id, "system", { stage, value_cents: deal.value_cents, prospect_id: prospect && prospect.id || null });
    return this.db.prepare("SELECT * FROM revenue_deals WHERE id=?").get(deal.id);
  }

  advanceDeal(dealId, input = {}, auth) {
    this.assertRole(auth, ["admin", "agent"]);
    const deal = this.requireDeal(dealId, auth.organization_id);
    const stage = String(input.stage || "");
    if (!DEAL_STAGES.has(stage)) throw new RuntimeError("VALIDATION_ERROR", "Invalid deal stage.", 422);
    const timestamp = now();
    this.db.prepare("UPDATE revenue_deals SET stage=?,probability=?,next_action=?,notes=?,loss_reason=?,closed_at=?,updated_at=? WHERE id=?")
      .run(stage, probability(input.probability ?? stageProbability(stage)), text(input.next_action, "next_action", 1000, false) || deal.next_action, text(input.notes, "notes", 10_000, false) || deal.notes, stage === "lost" ? text(input.loss_reason || "Not specified", "loss_reason", 1000, true) : null, ["won", "lost"].includes(stage) ? timestamp : null, timestamp, deal.id);
    if (deal.prospect_id) this.db.prepare("UPDATE revenue_prospects SET stage=?,updated_at=? WHERE id=?").run(stage, timestamp, deal.prospect_id);
    if (stage === "won") this.ensureClient(this.requireDeal(deal.id, auth.organization_id));
    this.event(deal.venture_id, auth.organization_id, "deal.stage_changed", deal.id, auth.user_id, { from: deal.stage, to: stage });
    this.syncMetrics(this.requireVenture(deal.venture_id, auth.organization_id), auth);
    return this.requireDeal(deal.id, auth.organization_id);
  }

  async createCheckout(ventureId, input = {}, auth = null) {
    const venture = auth ? this.requireVenture(ventureId, auth.organization_id) : this.db.prepare("SELECT * FROM revenue_ventures WHERE id=? AND status='active'").get(ventureId);
    if (!venture) throw new RuntimeError("NOT_FOUND", "Revenue venture not found.", 404);
    let deal;
    if (input.deal_id) deal = this.requireDeal(input.deal_id, venture.organization_id);
    else {
      const captured = this.captureInbound(venture.slug, input);
      deal = this.requireDeal(captured.deal_id, venture.organization_id);
    }
    const prospect = deal.prospect_id ? this.requireProspect(deal.prospect_id, venture.id) : null;
    const base = venture.public_base_url || this.publicBaseUrl;
    if (!base) throw new RuntimeError("PUBLIC_BASE_URL_REQUIRED", "Configure a public base URL before creating checkout.", 503);
    const amount = integer(input.amount_cents ?? deal.value_cents ?? venture.price_cents, "amount_cents", 50, 100_000_000);
    const paymentId = id("payment");
    const session = await this.stripe.createCheckoutSession({
      amount_cents: amount,
      currency: venture.currency,
      product_name: venture.offer_name,
      description: venture.offer_summary,
      customer_email: prospect && prospect.email || input.email,
      success_url: `${base}/v/${venture.slug}/thank-you?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${base}/v/${venture.slug}`,
      idempotency_key: `cyvx-${paymentId}`,
      metadata: { venture_id: venture.id, entity_id: venture.entity_id, deal_id: deal.id, prospect_id: prospect && prospect.id || "", payment_id: paymentId, organization_id: venture.organization_id },
    });
    const timestamp = now();
    this.db.prepare(`INSERT INTO revenue_payments(id,organization_id,venture_id,deal_id,provider,provider_session_id,amount_cents,currency,status,verification,receipt_reference,created_at,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(paymentId, venture.organization_id, venture.id, deal.id, "stripe", session.id, amount, venture.currency, "pending", "provider_pending", session.url, timestamp, timestamp);
    this.event(venture.id, venture.organization_id, "checkout.created", paymentId, auth && auth.user_id || "public", { deal_id: deal.id, session_id: session.id, amount_cents: amount });
    return { payment_id: paymentId, deal_id: deal.id, checkout_session_id: session.id, url: session.url, expires_at: session.expires_at };
  }

  processStripeWebhook(rawBody, signatureHeader) {
    const event = this.stripe.parseWebhook(rawBody, signatureHeader);
    if (!event.event_id) throw new RuntimeError("STRIPE_EVENT_ID_REQUIRED", "Stripe event ID is required.", 400);
    const existing = this.db.prepare("SELECT * FROM revenue_payments WHERE provider='stripe' AND provider_event_id=?").get(event.event_id);
    if (existing) return { duplicate: true, payment: existing };
    const ventureId = event.metadata.venture_id;
    const dealId = event.metadata.deal_id;
    const paymentId = event.metadata.payment_id;
    if (!ventureId || !dealId) return { ignored: true, reason: "cyvx_metadata_missing", event_id: event.event_id };
    const venture = this.db.prepare("SELECT * FROM revenue_ventures WHERE id=?").get(ventureId);
    if (!venture) return { ignored: true, reason: "venture_not_found", event_id: event.event_id };
    const deal = this.requireDeal(dealId, venture.organization_id);
    const paid = ["checkout.session.completed", "checkout.session.async_payment_succeeded"].includes(event.type) && event.payment_status === "paid";
    const failed = ["checkout.session.async_payment_failed", "payment_intent.payment_failed"].includes(event.type);
    if (!paid && !failed) return { ignored: true, reason: "event_not_revenue", event_id: event.event_id, type: event.type };
    const status = paid ? "paid" : "failed";
    const timestamp = now();
    const target = paymentId && this.db.prepare("SELECT * FROM revenue_payments WHERE id=? AND venture_id=?").get(paymentId, venture.id);
    const finalPaymentId = target && target.id || id("payment");
    const amount = integer(event.amount_total || deal.value_cents || venture.price_cents, "amount_total", 0, 100_000_000);
    if (target) {
      this.db.prepare("UPDATE revenue_payments SET provider_event_id=?,provider_session_id=COALESCE(provider_session_id,?),amount_cents=?,currency=?,status=?,verification='provider_verified',received_at=?,updated_at=? WHERE id=?")
        .run(event.event_id, event.checkout_session_id, amount, event.currency, status, paid ? timestamp : null, timestamp, target.id);
    } else {
      this.db.prepare(`INSERT INTO revenue_payments(id,organization_id,venture_id,deal_id,provider,provider_event_id,provider_session_id,amount_cents,currency,status,verification,created_at,received_at,updated_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(finalPaymentId, venture.organization_id, venture.id, deal.id, "stripe", event.event_id, event.checkout_session_id, amount, event.currency, status, "provider_verified", timestamp, paid ? timestamp : null, timestamp);
    }
    let client = null;
    let evidence = null;
    if (paid) {
      this.db.prepare("UPDATE revenue_deals SET stage='won',probability=1,closed_at=?,updated_at=? WHERE id=?").run(timestamp, timestamp, deal.id);
      client = this.ensureClient(this.requireDeal(deal.id, venture.organization_id));
      this.db.prepare("UPDATE revenue_payments SET client_id=? WHERE id=?").run(client.id, finalPaymentId);
      this.db.prepare("UPDATE revenue_clients SET lifetime_value_cents=lifetime_value_cents+?,status='active',updated_at=? WHERE id=?").run(amount, timestamp, client.id);
      evidence = this.recordRevenueEvidence(venture, { provider: "stripe", provider_event_id: event.event_id, checkout_session_id: event.checkout_session_id, amount_cents: amount, currency: event.currency, deal_id: deal.id, client_id: client.id, received_at: timestamp, livemode: event.livemode }, internalAuth(this.requireEntity(venture.entity_id, venture.organization_id)));
      this.db.prepare("UPDATE revenue_payments SET evidence_id=? WHERE id=?").run(evidence.id, finalPaymentId);
      this.ensureFulfillment(venture, client, deal);
    }
    this.event(venture.id, venture.organization_id, paid ? "payment.paid" : "payment.failed", finalPaymentId, "stripe", { event_id: event.event_id, amount_cents: amount, deal_id: deal.id, evidence_id: evidence && evidence.id });
    this.syncMetrics(venture, internalAuth(this.requireEntity(venture.entity_id, venture.organization_id)));
    return { processed: true, status, payment_id: finalPaymentId, client_id: client && client.id || null, evidence_id: evidence && evidence.id || null };
  }

  recordManualPayment(ventureId, input = {}, auth) {
    this.assertRole(auth, ["admin"]);
    const venture = this.requireVenture(ventureId, auth.organization_id);
    const deal = this.requireDeal(input.deal_id, auth.organization_id);
    if (deal.venture_id !== venture.id) throw new RuntimeError("VALIDATION_ERROR", "Deal does not belong to the venture.", 422);
    const amount = integer(input.amount_cents, "amount_cents", 1, 100_000_000);
    const reference = text(input.receipt_reference, "receipt_reference", 500, true);
    const evidenceNote = text(input.evidence_note, "evidence_note", 10_000, true);
    if (evidenceNote.length < 20) throw new RuntimeError("VALIDATION_ERROR", "evidence_note must explain the real payment evidence.", 422);
    const timestamp = input.received_at ? new Date(input.received_at).toISOString() : now();
    this.db.prepare("UPDATE revenue_deals SET stage='won',probability=1,closed_at=?,updated_at=? WHERE id=?").run(timestamp, timestamp, deal.id);
    const client = this.ensureClient(this.requireDeal(deal.id, auth.organization_id));
    const evidence = this.recordRevenueEvidence(venture, { provider: "manual_receipt", amount_cents: amount, currency: currency(input.currency || venture.currency), deal_id: deal.id, client_id: client.id, receipt_reference: reference, evidence_note: evidenceNote, received_at: timestamp, attested_by: auth.user_id }, auth);
    const paymentId = id("payment");
    this.db.prepare(`INSERT INTO revenue_payments(id,organization_id,venture_id,deal_id,client_id,provider,amount_cents,currency,status,verification,receipt_reference,evidence_id,created_at,received_at,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(paymentId, venture.organization_id, venture.id, deal.id, client.id, "manual_receipt", amount, currency(input.currency || venture.currency), "paid", "owner_attested", reference, evidence.id, now(), timestamp, now());
    this.db.prepare("UPDATE revenue_clients SET lifetime_value_cents=lifetime_value_cents+?,status='active',updated_at=? WHERE id=?").run(amount, now(), client.id);
    this.ensureFulfillment(venture, client, deal);
    this.event(venture.id, venture.organization_id, "payment.attested", paymentId, auth.user_id, { amount_cents: amount, deal_id: deal.id, evidence_id: evidence.id });
    this.syncMetrics(venture, auth);
    return { payment_id: paymentId, client_id: client.id, evidence_id: evidence.id, verification: "owner_attested" };
  }

  completeFulfillment(fulfillmentId, input = {}, auth) {
    this.assertRole(auth, ["admin", "agent"]);
    const fulfillment = this.db.prepare("SELECT * FROM revenue_fulfillments WHERE id=? AND organization_id=?").get(fulfillmentId, auth.organization_id);
    if (!fulfillment) throw new RuntimeError("NOT_FOUND", "Fulfillment record not found.", 404);
    const venture = this.requireVenture(fulfillment.venture_id, auth.organization_id);
    const evidenceNote = text(input.evidence_note, "evidence_note", 20_000, true);
    const evidence = this.runtime.evidence.record({
      auth, missionId: venture.mission_id, content: { fulfillment_id: fulfillment.id, client_id: fulfillment.client_id, deal_id: fulfillment.deal_id, deliverables: parseJson(fulfillment.deliverables, []), acceptance_criteria: parseJson(fulfillment.acceptance_criteria, []), evidence_note: evidenceNote, completed_at: now(), completed_by: auth.user_id },
      type: "revenue.fulfillment_completed", title: `Fulfillment completed for ${venture.name}`, source: "venture.revenue.v3", correlationId: auth.correlation_id || id("correlation"), causationId: fulfillment.id,
    });
    this.db.prepare("UPDATE revenue_fulfillments SET status='completed',completed_at=?,evidence_id=?,updated_at=? WHERE id=?").run(now(), evidence.id, now(), fulfillment.id);
    this.db.prepare("UPDATE revenue_clients SET status='completed',updated_at=? WHERE id=?").run(now(), fulfillment.client_id);
    this.event(venture.id, venture.organization_id, "fulfillment.completed", fulfillment.id, auth.user_id, { evidence_id: evidence.id });
    return { fulfillment_id: fulfillment.id, evidence_id: evidence.id, status: "completed" };
  }

  getPublicPage(slug, page = "revenue") {
    const venture = this.db.prepare("SELECT * FROM revenue_ventures WHERE slug=? AND status IN ('active','completed') ORDER BY updated_at DESC LIMIT 1").get(slug);
    if (!venture) throw new RuntimeError("NOT_FOUND", "Revenue venture page not found.", 404);
    const filenames = { revenue: "revenue.html", privacy: "privacy.html", terms: "terms.html", thank_you: "thank-you.html" };
    const filename = filenames[page];
    if (!filename) throw new RuntimeError("NOT_FOUND", "Page not found.", 404);
    const file = safePath(venture.workspace_path, path.join(venture.workspace_path, "public", filename));
    if (!fs.existsSync(file)) throw new RuntimeError("NOT_FOUND", "Revenue page is not published.", 404);
    return { venture, file, content: fs.readFileSync(file) };
  }

  listVentures(auth) {
    this.assertRole(auth, ["admin", "approver", "agent", "viewer"]);
    this.migrateVentureEntities();
    return this.db.prepare("SELECT * FROM revenue_ventures WHERE organization_id=? ORDER BY created_at DESC").all(auth.organization_id).map((venture) => this.decorateVenture(venture));
  }

  getVenture(ventureId, auth) {
    this.assertRole(auth, ["admin", "approver", "agent", "viewer"]);
    const venture = this.requireVenture(ventureId, auth.organization_id);
    return {
      venture: this.decorateVenture(venture),
      entity: this.universal.getEntity(venture.entity_id, auth),
      metrics: this.metrics(venture.id),
      assets: this.db.prepare("SELECT * FROM revenue_assets WHERE venture_id=? ORDER BY type,title").all(venture.id),
      prospects: this.db.prepare("SELECT * FROM revenue_prospects WHERE venture_id=? ORDER BY score DESC,updated_at DESC LIMIT 500").all(venture.id).map(jsonMetadata),
      campaigns: this.db.prepare("SELECT * FROM revenue_campaigns WHERE venture_id=? ORDER BY created_at DESC").all(venture.id),
      messages: this.db.prepare("SELECT * FROM revenue_messages WHERE venture_id=? ORDER BY created_at DESC LIMIT 500").all(venture.id),
      deals: this.db.prepare("SELECT * FROM revenue_deals WHERE venture_id=? ORDER BY updated_at DESC LIMIT 500").all(venture.id),
      clients: this.db.prepare("SELECT * FROM revenue_clients WHERE venture_id=? ORDER BY updated_at DESC LIMIT 500").all(venture.id),
      payments: this.db.prepare("SELECT * FROM revenue_payments WHERE venture_id=? ORDER BY created_at DESC LIMIT 500").all(venture.id),
      fulfillments: this.db.prepare("SELECT * FROM revenue_fulfillments WHERE venture_id=? ORDER BY updated_at DESC LIMIT 500").all(venture.id).map((row) => ({ ...row, deliverables: parseJson(row.deliverables, []), acceptance_criteria: parseJson(row.acceptance_criteria, []) })),
      ledger: this.verifyLedger(venture.id, auth),
      providers: { email: this.email.snapshot(), stripe: this.stripe.snapshot() },
      next_best_action: this.nextBestAction(venture.id),
    };
  }

  metrics(ventureId) {
    const prospect = this.db.prepare(`SELECT count(*) AS prospects,
      sum(CASE WHEN stage IN ('lead','qualified','discovery','proposal','negotiation','won') THEN 1 ELSE 0 END) AS leads,
      sum(CASE WHEN stage IN ('qualified','discovery','proposal','negotiation','won') THEN 1 ELSE 0 END) AS qualified
      FROM revenue_prospects WHERE venture_id=?`).get(ventureId);
    const deals = this.db.prepare(`SELECT count(*) AS deals,
      sum(CASE WHEN stage='won' THEN 1 ELSE 0 END) AS won,
      sum(CASE WHEN stage NOT IN ('won','lost') THEN value_cents*probability ELSE 0 END) AS weighted_pipeline_cents,
      sum(CASE WHEN stage NOT IN ('won','lost') THEN value_cents ELSE 0 END) AS gross_pipeline_cents
      FROM revenue_deals WHERE venture_id=?`).get(ventureId);
    const payments = this.db.prepare(`SELECT
      sum(CASE WHEN status='paid' THEN amount_cents ELSE 0 END) AS revenue_cents,
      sum(CASE WHEN status='paid' AND verification='provider_verified' THEN amount_cents ELSE 0 END) AS provider_verified_revenue_cents,
      sum(CASE WHEN status='paid' AND verification='owner_attested' THEN amount_cents ELSE 0 END) AS owner_attested_revenue_cents,
      count(CASE WHEN status='paid' THEN 1 END) AS paid_payments
      FROM revenue_payments WHERE venture_id=?`).get(ventureId);
    const clients = Number(this.db.prepare("SELECT count(*) AS count FROM revenue_clients WHERE venture_id=?").get(ventureId).count);
    const fulfillment = this.db.prepare("SELECT count(*) AS total,sum(CASE WHEN status='completed' THEN 1 ELSE 0 END) AS completed FROM revenue_fulfillments WHERE venture_id=?").get(ventureId);
    const leads = Number(prospect.leads || 0);
    const won = Number(deals.won || 0);
    return {
      prospects: Number(prospect.prospects || 0), leads, qualified_leads: Number(prospect.qualified || 0),
      deals: Number(deals.deals || 0), won_deals: won, clients,
      gross_pipeline_cents: Math.round(Number(deals.gross_pipeline_cents || 0)), weighted_pipeline_cents: Math.round(Number(deals.weighted_pipeline_cents || 0)),
      revenue_cents: Math.round(Number(payments.revenue_cents || 0)), provider_verified_revenue_cents: Math.round(Number(payments.provider_verified_revenue_cents || 0)), owner_attested_revenue_cents: Math.round(Number(payments.owner_attested_revenue_cents || 0)), paid_payments: Number(payments.paid_payments || 0),
      fulfillment_total: Number(fulfillment.total || 0), fulfillment_completed: Number(fulfillment.completed || 0),
      lead_to_client_rate: leads ? Number((clients / leads).toFixed(4)) : 0,
      deal_win_rate: Number(deals.deals || 0) ? Number((won / Number(deals.deals)).toFixed(4)) : 0,
    };
  }

  verifyLedger(ventureId, auth) {
    if (auth) this.assertRole(auth, ["admin", "approver", "agent", "viewer"]);
    const venture = auth ? this.requireVenture(ventureId, auth.organization_id) : this.db.prepare("SELECT * FROM revenue_ventures WHERE id=?").get(ventureId);
    if (!venture) throw new RuntimeError("NOT_FOUND", "Revenue venture not found.", 404);
    const rows = this.db.prepare("SELECT rowid AS ledger_sequence,* FROM revenue_events WHERE venture_id=? ORDER BY rowid").all(ventureId);
    let previous = "GENESIS";
    const errors = [];
    for (const row of rows) {
      const core = { id: row.id, organization_id: row.organization_id, venture_id: row.venture_id, type: row.type, subject_id: row.subject_id, actor: row.actor, payload: parseJson(row.payload, {}), previous_hash: row.previous_hash, created_at: row.created_at };
      const expected = sha256(canonical(core));
      if (row.previous_hash !== previous) errors.push({ id: row.id, code: "PREVIOUS_HASH_INVALID" });
      if (row.event_hash !== expected) errors.push({ id: row.id, code: "EVENT_HASH_INVALID" });
      previous = row.event_hash;
    }
    return { valid: errors.length === 0, records_checked: rows.length, last_hash: previous, errors, verified_at: now() };
  }

  health() {
    const database = Number(this.db.prepare("SELECT 1 AS ok").get().ok) === 1;
    return {
      ok: database,
      service: "cyvx-venture-revenue-engine",
      version: "3.0.0",
      database,
      ventures: Number(this.db.prepare("SELECT count(*) AS count FROM revenue_ventures").get().count),
      active: Number(this.db.prepare("SELECT count(*) AS count FROM revenue_ventures WHERE status='active'").get().count),
      real_prospects: Number(this.db.prepare("SELECT count(*) AS count FROM revenue_prospects").get().count),
      real_clients: Number(this.db.prepare("SELECT count(*) AS count FROM revenue_clients").get().count),
      recorded_revenue_cents: Math.round(Number(this.db.prepare("SELECT coalesce(sum(amount_cents),0) AS total FROM revenue_payments WHERE status='paid'").get().total)),
      verified_revenue_cents: Math.round(Number(this.db.prepare("SELECT coalesce(sum(amount_cents),0) AS total FROM revenue_payments WHERE status='paid' AND verification='provider_verified'").get().total)),
      owner_attested_revenue_cents: Math.round(Number(this.db.prepare("SELECT coalesce(sum(amount_cents),0) AS total FROM revenue_payments WHERE status='paid' AND verification='owner_attested'").get().total)),
      providers: { email: this.email.snapshot(), stripe: this.stripe.snapshot() },
      workspace_root: this.workspaceRoot,
      public_base_url_configured: Boolean(this.publicBaseUrl),
      business_postal_address_configured: Boolean(this.businessPostalAddress),
      timestamp: now(),
    };
  }

  syncMetrics(venture, auth) {
    const metrics = this.metrics(venture.id);
    const entity = this.requireEntity(venture.entity_id, venture.organization_id);
    const counters = parseJson(entity.counters, {});
    Object.assign(counters, {
      lead_count: metrics.leads,
      qualified_leads: metrics.qualified_leads,
      clients_count: metrics.clients,
      revenue_cents: metrics.revenue_cents,
      provider_verified_revenue_cents: metrics.provider_verified_revenue_cents,
      pipeline_cents: metrics.gross_pipeline_cents,
      weighted_pipeline_cents: metrics.weighted_pipeline_cents,
    });
    this.db.prepare("UPDATE operator_entities SET counters=?,updated_at=? WHERE id=?").run(JSON.stringify(counters), now(), entity.id);
    if (entity.adapter_type === "venture" && entity.adapter_record_id) {
      const serviceAuth = { user_id: auth && auth.user_id || entity.owner_user_id, organization_id: entity.organization_id, role: "admin", correlation_id: auth && auth.correlation_id };
      this.universal.legacy.recordMetric(entity.adapter_record_id, { name: "lead_count", value: metrics.leads, unit: "count", source: "venture.revenue.v3" }, serviceAuth);
      this.universal.legacy.recordMetric(entity.adapter_record_id, { name: "revenue_cents", value: metrics.revenue_cents, unit: "cents", source: "venture.revenue.v3" }, serviceAuth);
      this.universal.syncLegacyEntity(entity.id, entity.organization_id);
    }
    this.universal.platform.updateEntity(entity.platform_entity_id, { economics: { value: metrics.revenue_cents, revenue_cents: metrics.revenue_cents, pipeline_cents: metrics.gross_pipeline_cents, roi: metrics.revenue_cents > 0 ? 1 : 0 }, opportunity: { score: Math.min(1, metrics.qualified_leads / 10), drivers: ["qualified demand", "verified payment", "fulfillment proof"] }, updated_at: now() });
    return metrics;
  }

  event(ventureId, organizationId, type, subjectId, actor, payload) {
    const previous = this.db.prepare("SELECT event_hash FROM revenue_events WHERE venture_id=? ORDER BY rowid DESC LIMIT 1").get(ventureId);
    const record = { id: id("revenue_event"), organization_id: organizationId, venture_id: ventureId, type, subject_id: subjectId || null, actor: String(actor || "system"), payload: payload || {}, previous_hash: previous && previous.event_hash || "GENESIS", created_at: now() };
    const eventHash = sha256(canonical(record));
    this.db.prepare("INSERT INTO revenue_events(id,organization_id,venture_id,type,subject_id,actor,payload,previous_hash,event_hash,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)")
      .run(record.id, organizationId, ventureId, type, record.subject_id, record.actor, JSON.stringify(record.payload), record.previous_hash, eventHash, record.created_at);
    return { ...record, event_hash: eventHash };
  }

  recordRevenueEvidence(venture, payload, auth) {
    return this.runtime.evidence.record({
      auth, missionId: venture.mission_id, content: payload, type: "revenue.payment", title: `Verified revenue for ${venture.name}`,
      source: "venture.revenue.v3", correlationId: auth.correlation_id || id("correlation"), causationId: payload.provider_event_id || payload.receipt_reference || venture.id,
    });
  }

  ensureClient(deal) {
    const existing = this.db.prepare("SELECT * FROM revenue_clients WHERE deal_id=?").get(deal.id);
    if (existing) return existing;
    const prospect = deal.prospect_id ? this.db.prepare("SELECT * FROM revenue_prospects WHERE id=?").get(deal.prospect_id) : null;
    const timestamp = now();
    const clientId = id("client");
    this.db.prepare(`INSERT INTO revenue_clients(id,organization_id,venture_id,deal_id,prospect_id,name,email,status,lifetime_value_cents,created_at,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?)`).run(clientId, deal.organization_id, deal.venture_id, deal.id, deal.prospect_id, prospect && (prospect.company_name || prospect.contact_name) || deal.title, prospect && prospect.email || null, "onboarding", 0, timestamp, timestamp);
    return this.db.prepare("SELECT * FROM revenue_clients WHERE id=?").get(clientId);
  }

  ensureFulfillment(venture, client, deal) {
    const existing = this.db.prepare("SELECT * FROM revenue_fulfillments WHERE client_id=? AND deal_id=?").get(client.id, deal.id);
    if (existing) return existing;
    const timestamp = now();
    const fulfillmentId = id("fulfillment");
    const deliverables = parseJson(venture.deliverables, []);
    this.db.prepare(`INSERT INTO revenue_fulfillments(id,organization_id,venture_id,client_id,deal_id,status,deliverables,acceptance_criteria,due_at,created_at,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?)`).run(fulfillmentId, venture.organization_id, venture.id, client.id, deal.id, "queued", JSON.stringify(deliverables), JSON.stringify(deliverables.map((item) => `${item} delivered, reviewed, and accepted with evidence`)), new Date(Date.now() + 7 * 86400000).toISOString(), timestamp, timestamp);
    return this.db.prepare("SELECT * FROM revenue_fulfillments WHERE id=?").get(fulfillmentId);
  }

  nextBestAction(ventureId) {
    const venture = this.db.prepare("SELECT * FROM revenue_ventures WHERE id=?").get(ventureId);
    const metrics = this.metrics(ventureId);
    if (venture.status === "draft") return { type: "activate", title: "Complete entity activation and build the revenue system" };
    if (!this.db.prepare("SELECT 1 FROM revenue_assets WHERE venture_id=? AND type='sales_page'").get(ventureId)) return { type: "assets", title: "Build and publish the real sales assets" };
    if (!metrics.prospects) return { type: "prospects", title: "Import or capture the first real prospect" };
    if (!metrics.leads) return { type: "demand", title: "Drive permissioned prospects to the offer and capture demand" };
    const deal = this.db.prepare("SELECT * FROM revenue_deals WHERE venture_id=? AND stage NOT IN ('won','lost') ORDER BY probability DESC,updated_at LIMIT 1").get(ventureId);
    if (deal) return { type: "deal", deal_id: deal.id, title: deal.next_action || `Advance ${deal.title} from ${deal.stage}` };
    if (!metrics.clients) return { type: "close", title: "Create a checkout or proposal for the highest-fit qualified lead" };
    const fulfillment = this.db.prepare("SELECT * FROM revenue_fulfillments WHERE venture_id=? AND status!='completed' ORDER BY created_at LIMIT 1").get(ventureId);
    if (fulfillment) return { type: "fulfill", fulfillment_id: fulfillment.id, title: "Deliver and prove the paid customer outcome" };
    return { type: "retain", title: "Request proof, referral, renewal, or expansion from completed clients" };
  }

  decorateVenture(venture) {
    return { ...venture, deliverables: parseJson(venture.deliverables, []), public_path: `/v/${venture.slug}`, provider_ready: { email: this.email.configured(), stripe: this.stripe.configured(), stripe_webhook: this.stripe.webhookConfigured() } };
  }

  assertRole(auth, roles) {
    if (!auth || !roles.includes(auth.role)) throw new RuntimeError("PERMISSION_DENIED", `Role ${auth && auth.role || "anonymous"} is not permitted.`, 403);
  }

  requireVenture(ventureId, organizationId) {
    const row = this.db.prepare("SELECT * FROM revenue_ventures WHERE id=? AND organization_id=?").get(ventureId, organizationId);
    if (!row) throw new RuntimeError("NOT_FOUND", "Revenue venture not found.", 404);
    return row;
  }

  requireVentureByEntity(entityId, organizationId) {
    const row = this.db.prepare("SELECT * FROM revenue_ventures WHERE entity_id=? AND organization_id=?").get(entityId, organizationId);
    if (!row) throw new RuntimeError("NOT_FOUND", "Revenue venture is not registered for the entity.", 404);
    return row;
  }

  requireEntity(entityId, organizationId) {
    const row = this.db.prepare("SELECT * FROM operator_entities WHERE id=? AND organization_id=?").get(entityId, organizationId);
    if (!row) throw new RuntimeError("NOT_FOUND", "Universal entity not found.", 404);
    return row;
  }

  requireCampaign(campaignId, organizationId) {
    const row = this.db.prepare("SELECT * FROM revenue_campaigns WHERE id=? AND organization_id=?").get(campaignId, organizationId);
    if (!row) throw new RuntimeError("NOT_FOUND", "Campaign not found.", 404);
    return row;
  }

  requireProspect(prospectId, ventureId) {
    const row = this.db.prepare("SELECT * FROM revenue_prospects WHERE id=? AND venture_id=?").get(prospectId, ventureId);
    if (!row) throw new RuntimeError("NOT_FOUND", "Prospect not found.", 404);
    return row;
  }

  requireDeal(dealId, organizationId) {
    const row = this.db.prepare("SELECT * FROM revenue_deals WHERE id=? AND organization_id=?").get(dealId, organizationId);
    if (!row) throw new RuntimeError("NOT_FOUND", "Deal not found.", 404);
    return row;
  }
}

function asset(type, title, relativePath, content, publicPath = null) { return { type, title, relative_path: relativePath, content, public_path: publicPath }; }
function safePath(root, candidate) { const base = path.resolve(root); const resolved = path.resolve(candidate); if (resolved !== base && !resolved.startsWith(`${base}${path.sep}`)) throw new RuntimeError("WORKSPACE_PATH_INVALID", "Revenue workspace escaped its configured root.", 500); return resolved; }
function parseJson(value, fallback) { if (value && typeof value === "object") return value; try { return value ? JSON.parse(value) : fallback; } catch { return fallback; } }
function text(value, name, maximum, required) { const output = String(value || "").trim(); if (required && !output) throw new RuntimeError("VALIDATION_ERROR", `${name} is required.`, 422); if (output.length > maximum) throw new RuntimeError("VALIDATION_ERROR", `${name} exceeds ${maximum} characters.`, 422); return output; }
function integer(value, name, minimum, maximum) { const output = Number(value); if (!Number.isInteger(output) || output < minimum || output > maximum) throw new RuntimeError("VALIDATION_ERROR", `${name} must be an integer from ${minimum} to ${maximum}.`, 422); return output; }
function array(value, name, maximum, itemMaximum) { const source = Array.isArray(value) ? value : String(value || "").split(","); if (source.length > maximum) throw new RuntimeError("VALIDATION_ERROR", `${name} exceeds ${maximum} items.`, 422); return [...new Set(source.map((item) => text(item, `${name} item`, itemMaximum, true)))]; }
function currency(value) { const output = String(value || "usd").trim().toLowerCase(); if (!/^[a-z]{3}$/.test(output)) throw new RuntimeError("VALIDATION_ERROR", "currency must be a three-letter ISO code.", 422); return output; }
function urlOrNull(value) { if (!value) return null; let parsed; try { parsed = new URL(String(value)); } catch { throw new RuntimeError("VALIDATION_ERROR", "URL is invalid.", 422); } if (!/^https?:$/.test(parsed.protocol)) throw new RuntimeError("VALIDATION_ERROR", "URL must use HTTP or HTTPS.", 422); return parsed.toString(); }
function emailOrNull(value) { if (!value) return null; const output = String(value).trim().toLowerCase().slice(0, 320); if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(output)) throw new RuntimeError("VALIDATION_ERROR", "A valid email address is required.", 422); return output; }
function probability(value) { const output = Number(value); if (!Number.isFinite(output) || output < 0 || output > 1) throw new RuntimeError("VALIDATION_ERROR", "probability must be from 0 to 1.", 422); return output; }
function stageProbability(stage) { return ({ lead: 0.15, qualified: 0.3, discovery: 0.45, proposal: 0.6, negotiation: 0.8, won: 1, lost: 0 })[stage] || 0; }
function internalAuth(entity, supplied = {}) { return { user_id: supplied.user_id || entity.owner_user_id, organization_id: entity.organization_id, role: supplied.role || "admin", correlation_id: supplied.correlation_id }; }
function jsonMetadata(row) { return { ...row, metadata: parseJson(row.metadata, {}) }; }

function normalizeProspect(input = {}, source = "authorized_import") {
  const contactBasis = String(input.contact_basis || (source.startsWith("inbound:") ? "opt_in" : "authorized_import"));
  if (!CONTACT_BASES.has(contactBasis)) throw new RuntimeError("VALIDATION_ERROR", "contact_basis must be opt_in, existing_relationship, public_business_contact, or authorized_import.", 422);
  const email = emailOrNull(input.email);
  const phone = text(input.phone, "phone", 50, false) || null;
  const website = urlOrNull(input.website);
  if (!email && !phone && !website) throw new RuntimeError("VALIDATION_ERROR", "A real prospect needs an email, phone, or website.", 422);
  return {
    source: text(source, "source", 120, true), external_id: text(input.external_id, "external_id", 300, false) || null,
    company_name: text(input.company_name, "company_name", 300, false) || null, contact_name: text(input.contact_name || input.name, "contact_name", 300, false) || null,
    email, phone, website, location: text(input.location, "location", 500, false) || null, category: text(input.category, "category", 300, false) || null,
    contact_basis: contactBasis, consent_status: String(input.consent_status || (contactBasis === "opt_in" ? "opted_in" : "unknown")).slice(0, 50),
    verification_status: String(input.verification_status || "unverified").slice(0, 50), metadata: input.metadata && typeof input.metadata === "object" ? input.metadata : {},
  };
}

function prospectScore(venture, prospect) {
  const tokens = `${venture.market} ${venture.ideal_customer} ${venture.problem}`.toLowerCase().split(/[^a-z0-9]+/).filter((token) => token.length > 3);
  const textValue = `${prospect.company_name || ""} ${prospect.category || ""} ${prospect.location || ""} ${prospect.website || ""}`.toLowerCase();
  const matches = [...new Set(tokens.filter((token) => textValue.includes(token)))].length;
  let score = Math.min(60, matches * 8);
  if (prospect.email) score += 15;
  if (prospect.phone) score += 5;
  if (prospect.website) score += 10;
  if (prospect.contact_basis === "opt_in") score += 20;
  if (prospect.contact_basis === "existing_relationship") score += 15;
  return Math.min(100, score);
}

function renderTemplate(template, venture, prospect) {
  const values = {
    first_name: String(prospect.contact_name || "there").split(/\s+/)[0], contact_name: prospect.contact_name || "there",
    company_name: prospect.company_name || "your organization", venture_name: venture.name,
    offer_name: venture.offer_name, offer_summary: venture.offer_summary, market: venture.market,
    price: Number(venture.price_cents) > 0 ? `${venture.currency.toUpperCase()} ${(Number(venture.price_cents) / 100).toFixed(2)}` : "custom quote",
  };
  return String(template || "").replace(/\{\{([a-z_]+)\}\}/g, (_, key) => values[key] || "");
}

function defaultDeliverables(name) { return ["Reality and opportunity assessment", "Prioritized implementation plan", "Production-ready operating assets", "Measured outcome report", `${name} evidence package`]; }
function offerMarkdown(v, deliverables) { return `# ${v.offer_name}\n\n## Customer\n${v.ideal_customer}\n\n## Problem\n${v.problem}\n\n## Outcome\n${v.offer_summary}\n\n## Deliverables\n${deliverables.map((item) => `- ${item}`).join("\n")}\n\n## Investment\n${v.price_cents ? `${v.currency.toUpperCase()} ${(v.price_cents / 100).toFixed(2)}` : "Scoped quote after qualification"}\n\n## Proof standard\nWork is complete only when the agreed acceptance criteria and evidence are delivered.\n`; }
function proposalMarkdown(v, deliverables) { return `# Proposal — ${v.offer_name}\n\nPrepared for: {{client_name}}\nDate: {{date}}\n\n## Current reality\n{{current_reality}}\n\n## Desired outcome\n{{desired_outcome}}\n\n## Scope\n${deliverables.map((item) => `- ${item}`).join("\n")}\n\n## Timeline\n{{timeline}}\n\n## Investment\n${v.price_cents ? `${v.currency.toUpperCase()} ${(v.price_cents / 100).toFixed(2)}` : "{{price}}"}\n\n## Acceptance\nEach deliverable is reviewed against written acceptance criteria. External commitments require explicit approval.\n`; }
function discoveryMarkdown(v) { return `# Discovery — ${v.offer_name}\n\n1. What result must change, by how much, and by when?\n2. What is the cost of the current problem?\n3. What has already been tried?\n4. Who decides and who uses the result?\n5. What data, systems, people, and permissions are available?\n6. What would make the engagement fail?\n7. What evidence would prove success?\n8. Is the current budget and timeline compatible with ${v.price_cents ? `${v.currency.toUpperCase()} ${(v.price_cents / 100).toFixed(2)}` : "the required scope"}?\n`; }
function leadMagnetMarkdown(v) { return `# ${v.market} Opportunity Diagnostic\n\nA practical diagnostic for ${v.ideal_customer}.\n\n## Score 0–5\n- The target outcome is measurable.\n- The current constraint is known.\n- Required data and permissions are available.\n- The decision owner is identified.\n- The economic value exceeds the cost of action.\n\n## Interpretation\n0–8: clarify reality before buying.\n9–17: a focused sprint may create value.\n18–25: the opportunity is ready for execution.\n\nBuilt by ${v.name}.\n`; }
function outreachSequence(v) { return { schema_version: 1, safety: { sendable_contact_basis: [...SENDABLE_CONTACT_BASES], requires_owner_approval: true, requires_provider: true, requires_public_https: true, requires_postal_address: true, unsubscribe_required: true }, messages: [{ day: 0, subject: `A measurable outcome for {{company_name}}`, body: `Hi {{first_name}},\n\nYou asked to hear from ${v.name}. ${v.offer_summary}\n\nWould a short qualification call be useful?` }, { day: 3, subject: `The proof standard behind ${v.offer_name}`, body: `Hi {{first_name}},\n\nThe engagement is measured against written acceptance criteria, evidence, and the customer outcome—not activity alone.\n\nReply with the result you need changed and the deadline.` }, { day: 7, subject: `Close the loop?`, body: `Hi {{first_name}},\n\nShould we close this request, or is ${v.offer_name} still relevant?` }] }; }
function fulfillmentMarkdown(v, deliverables) { return `# Fulfillment SOP — ${v.offer_name}\n\n## Intake\nConfirm decision owner, target, baseline, constraints, permissions, timeline, and acceptance criteria.\n\n## Delivery\n${deliverables.map((item, index) => `${index + 1}. ${item}`).join("\n")}\n\n## Controls\n- No unapproved spend or external commitment.\n- Record evidence for every material deliverable.\n- Escalate blockers immediately.\n- Do not mark complete until acceptance evidence exists.\n\n## Retention\nAfter acceptance: collect feedback, proof, referral permission, renewal need, and next measurable outcome.\n`; }

function salesPageHtml(v, deliverables, publicUrl) {
  const price = v.price_cents ? `${v.currency.toUpperCase()} ${(v.price_cents / 100).toFixed(2)}` : "Request scope";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${html(v.offer_name)} | ${html(v.name)}</title><meta name="description" content="${html(v.offer_summary)}"><meta property="og:title" content="${html(v.offer_name)}"><meta property="og:description" content="${html(v.offer_summary)}"><meta property="og:url" content="${html(publicUrl)}"><style>:root{color-scheme:dark;--bg:#07111f;--panel:#10263c;--line:#31516e;--text:#eef7ff;--muted:#a9bdce;--gold:#ebbd4e;--good:#62dca6}*{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at top right,#173c5b,#07111f 45%);color:var(--text);font-family:system-ui,-apple-system,sans-serif}main{max-width:1040px;margin:auto;padding:28px 18px 80px}.eyebrow{color:var(--gold);font-weight:900;letter-spacing:.1em;text-transform:uppercase}h1{font-size:clamp(2.8rem,10vw,6rem);line-height:.9;margin:.35em 0}.lead{font-size:clamp(1.15rem,3vw,1.6rem);line-height:1.45;color:var(--muted)}.grid{display:grid;grid-template-columns:1.15fr .85fr;gap:18px}.card{background:rgba(16,38,60,.95);border:1px solid var(--line);border-radius:20px;padding:22px;margin:18px 0}.proof{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.proof div{border:1px solid var(--line);border-radius:14px;padding:14px}.proof strong{display:block;color:var(--good)}li{margin:.7em 0}input,textarea,button{width:100%;padding:14px;margin:7px 0;border-radius:10px;border:1px solid var(--line);background:#081827;color:#fff;font:inherit}button,.cta{display:inline-flex;justify-content:center;text-decoration:none;background:var(--gold);color:#07111f;font-weight:900;border:0;padding:14px;border-radius:10px}.secondary{background:#183a57;color:#fff}.muted{color:var(--muted);font-size:.9rem}.actions{display:grid;grid-template-columns:1fr 1fr;gap:8px}footer{color:var(--muted);font-size:.85rem;margin-top:28px}footer a{color:var(--muted)}@media(max-width:760px){.grid{grid-template-columns:1fr}.proof{grid-template-columns:1fr}.actions{grid-template-columns:1fr}}</style></head><body><main><div class="eyebrow">Owner-controlled • evidence-backed • outcome-measured</div><h1>${html(v.offer_name)}</h1><p class="lead">${html(v.offer_summary)}</p><div class="proof"><div><strong>Built for</strong>${html(v.ideal_customer)}</div><div><strong>Market</strong>${html(v.market)}</div><div><strong>Investment</strong>${html(price)}</div></div><div class="grid"><section><div class="card"><h2>The problem</h2><p>${html(v.problem)}</p></div><div class="card"><h2>What is delivered</h2><ul>${deliverables.map((item) => `<li>${html(item)}</li>`).join("")}</ul></div><div class="card"><h2>How success is proven</h2><p>Scope, baseline, target, acceptance criteria, evidence, and customer outcome are recorded before the work is marked complete.</p></div></section><aside><div class="card"><h2>Start with the outcome</h2><form id="lead"><input name="name" required placeholder="Your name"><input name="company_name" placeholder="Organization"><input type="email" name="email" required placeholder="Email"><input name="phone" placeholder="Phone"><textarea name="requested_outcome" required placeholder="What result needs to change, by how much, and by when?"></textarea><button>Request qualification</button><p id="result" class="muted"></p></form>${v.booking_url ? `<div class="actions"><a class="cta secondary" href="${html(v.booking_url)}" rel="noopener">Book a call</a><button id="buy" type="button">Buy now</button></div>` : `<button id="buy" type="button">Buy now</button>`}<p class="muted">Payment opens through Stripe only when real billing is configured. A request never creates a fake customer or fake revenue.</p></div></aside></div><footer><p>${html(v.name)} • <a href="/v/${html(v.slug)}/privacy">Privacy</a> • <a href="/v/${html(v.slug)}/terms">Terms</a></p></footer></main><script>const form=document.getElementById('lead'),result=document.getElementById('result'),buy=document.getElementById('buy');async function submit(checkout){const body=Object.fromEntries(new FormData(form));body.source=checkout?'checkout':'sales_page';const endpoint=checkout?'/api/v3/revenue/ventures/${v.slug}/checkout':'/api/v3/revenue/ventures/${v.slug}/leads';result.textContent='Working…';const response=await fetch(endpoint,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});const data=await response.json();if(!response.ok||!data.ok){result.textContent=data.message||'Unable to continue.';return}if(checkout&&data.checkout&&data.checkout.url){location.href=data.checkout.url;return}result.textContent='Received. The request is now in the real qualification pipeline.';form.reset()}form.addEventListener('submit',e=>{e.preventDefault();submit(false)});buy.addEventListener('click',()=>submit(true));</script></body></html>`;
}
function legalPage(v, title, body) { return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${html(title)} | ${html(v.name)}</title><style>body{font-family:system-ui;background:#07111f;color:#eef7ff;margin:0}main{max-width:760px;margin:auto;padding:42px 20px;line-height:1.65}a{color:#ebbd4e}</style></head><body><main><a href="/v/${html(v.slug)}">← ${html(v.name)}</a><h1>${html(title)}</h1><p>${html(body)}</p><p>Last updated ${html(new Date().toISOString().slice(0,10))}.</p></main></body></html>`; }
function privacyText(v) { return `${v.name} collects information submitted through its forms to qualify requests, communicate about the requested service, process payment, deliver work, prevent abuse, and preserve operating evidence. Information is not sold. Provider processing may include hosting, email, analytics, scheduling, and payment services configured by the operator. Contact the operator to request access, correction, or deletion where applicable.`; }
function termsText(v) { return `Submitting a request does not guarantee acceptance. A client relationship begins only after scope, price, responsibilities, acceptance criteria, and payment terms are confirmed. Results depend on customer inputs, access, decisions, and external conditions. No unapproved purchase, bid, contract, legal filing, medical decision, or funds transfer is performed. Refund, cancellation, intellectual-property, confidentiality, and liability terms must be confirmed in the final engagement agreement.`; }
function html(value) { return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;"); }

module.exports = {
  VentureRevenueEngine,
  ensureRevenueSchema,
  VENTURE_STATES,
  DEAL_STAGES,
  CAMPAIGN_STATES,
  CONTACT_BASES,
  SENDABLE_CONTACT_BASES,
  PAYMENT_STATES,
  normalizeProspect,
  prospectScore,
  renderTemplate,
};