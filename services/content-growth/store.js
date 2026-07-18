"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

function ensureDirectory(directory) {
  fs.mkdirSync(directory, { recursive: true });
  return directory;
}

function defaultDataDirectory() {
  return process.env.CYVX_FIELD_DATA_DIR || path.join(os.homedir(), ".cyvx", "field-manual");
}

function stableId(prefix, value) {
  return `${prefix}_${crypto.createHash("sha256").update(String(value)).digest("hex").slice(0, 20)}`;
}

function appendJsonLine(file, value) {
  ensureDirectory(path.dirname(file));
  fs.appendFileSync(file, `${JSON.stringify(value)}\n`, { encoding: "utf8", mode: 0o600 });
}

function readJsonLines(file) {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, "utf8").split(/\r?\n/).filter(Boolean).map((line) => {
    try { return JSON.parse(line); } catch { return null; }
  }).filter(Boolean);
}

function createStore(options = {}) {
  const directory = ensureDirectory(options.directory || defaultDataDirectory());
  const files = {
    leads: path.join(directory, "leads.jsonl"),
    events: path.join(directory, "events.jsonl"),
    purchases: path.join(directory, "purchases.jsonl"),
    telemetry: path.join(directory, "telemetry.jsonl"),
  };

  function hasEvent(id) {
    return readJsonLines(files.events).some((event) => event.id === id);
  }

  function recordEvent(event) {
    if (!event || !event.id) throw new Error("event.id is required");
    if (hasEvent(event.id)) return { duplicate: true, event };
    appendJsonLine(files.events, { ...event, recorded_at: new Date().toISOString() });
    return { duplicate: false, event };
  }

  function recordLead(lead) {
    const id = lead.id || stableId("lead", `${lead.email}|${lead.source}|${lead.keyword}`);
    const event = recordEvent({ id: `event_${id}`, type: "lead.captured" });
    if (event.duplicate) return { duplicate: true, lead: readJsonLines(files.leads).find((item) => item.id === id) };
    const value = { ...lead, id, captured_at: lead.captured_at || new Date().toISOString() };
    appendJsonLine(files.leads, value);
    return { duplicate: false, lead: value };
  }

  function recordPurchase(purchase) {
    const id = purchase.id || stableId("purchase", purchase.external_id || JSON.stringify(purchase));
    const event = recordEvent({ id: `event_${id}`, type: "purchase.recorded" });
    if (event.duplicate) return { duplicate: true, purchase: readJsonLines(files.purchases).find((item) => item.id === id) };
    const value = { ...purchase, id, recorded_at: purchase.recorded_at || new Date().toISOString() };
    appendJsonLine(files.purchases, value);
    return { duplicate: false, purchase: value };
  }

  function recordTelemetry(telemetry) {
    const value = { ...telemetry, recorded_at: telemetry.recorded_at || new Date().toISOString() };
    appendJsonLine(files.telemetry, value);
    return value;
  }

  function metrics() {
    const leads = readJsonLines(files.leads);
    const purchases = readJsonLines(files.purchases);
    const telemetry = readJsonLines(files.telemetry);
    const reach = telemetry.reduce((sum, row) => sum + Number(row.reach || 0), 0);
    const revenueCents = purchases.filter((row) => !row.refunded).reduce((sum, row) => sum + Number(row.amount_cents || 0), 0);
    const customers = new Set(purchases.filter((row) => !row.refunded).map((row) => row.email || row.customer_id || row.id)).size;
    return {
      reach,
      leads: leads.length,
      customers,
      revenue_cents: revenueCents,
      lead_capture_efficiency_pct: Number((reach > 0 ? (leads.length / reach) * 100 : 0).toFixed(4)),
      system_monetization_velocity_usd_per_1000_reach: Number((reach > 0 ? (revenueCents / 100 / reach) * 1000 : 0).toFixed(2)),
      operational_conversion_ratio_pct: Number((leads.length > 0 ? (customers / leads.length) * 100 : 0).toFixed(4)),
      targets: { lce_pct: 1.5, smv_usd_per_1000_reach: 10, ocr_pct: 10 },
    };
  }

  return { directory, files, recordLead, recordPurchase, recordTelemetry, recordEvent, metrics, readJsonLines };
}

module.exports = { createStore, ensureDirectory, readJsonLines, stableId };
