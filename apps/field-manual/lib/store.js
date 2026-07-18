"use strict";

const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const crypto = require("node:crypto");

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
}

function writeJsonAtomic(file, value) {
  ensureDir(path.dirname(file));
  const temp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(temp, file);
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return fallback;
    throw error;
  }
}

function appendJsonl(file, value) {
  ensureDir(path.dirname(file));
  fs.appendFileSync(file, `${JSON.stringify(value)}\n`, { mode: 0o600 });
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value) && value.length <= 254;
}

function cleanText(value, max = 120) {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, max);
}

function createStore(options = {}) {
  const baseDir = options.baseDir || process.env.CYVX_FIELD_MANUAL_DATA_DIR || path.join(os.homedir(), ".cyvx", "field-manual");
  ensureDir(baseDir);
  const leadsFile = path.join(baseDir, "leads.json");
  const eventsFile = path.join(baseDir, "events.jsonl");
  const logsFile = path.join(baseDir, "runtime.jsonl");

  function captureLead(input = {}, context = {}) {
    const email = normalizeEmail(input.email);
    if (!validEmail(email)) {
      const error = new Error("A valid email address is required.");
      error.code = "INVALID_EMAIL";
      throw error;
    }
    if (input.consent !== true) {
      const error = new Error("Consent is required to join the Field Manual list.");
      error.code = "CONSENT_REQUIRED";
      throw error;
    }

    const leads = readJson(leadsFile, {});
    const now = new Date().toISOString();
    const existing = leads[email];
    const record = {
      id: existing?.id || crypto.randomUUID(),
      email,
      name: cleanText(input.name, 80),
      interest: cleanText(input.interest || "operator-starter-manual", 80),
      source: cleanText(input.source || "landing-page", 80),
      campaign: cleanText(input.campaign || "", 80),
      consent: true,
      consent_at: existing?.consent_at || now,
      created_at: existing?.created_at || now,
      updated_at: now,
      submissions: (existing?.submissions || 0) + 1,
      last_ip_hash: context.ip ? crypto.createHash("sha256").update(String(context.ip)).digest("hex") : null,
      last_user_agent: cleanText(context.userAgent || "", 220)
    };
    leads[email] = record;
    writeJsonAtomic(leadsFile, leads);
    appendJsonl(eventsFile, {
      id: crypto.randomUUID(),
      type: existing ? "lead.reconfirmed" : "lead.created",
      lead_id: record.id,
      source: record.source,
      interest: record.interest,
      occurred_at: now
    });
    return { ...record, email: redactEmail(email), existing: Boolean(existing) };
  }

  function captureEvent(input = {}) {
    const allowed = new Set([
      "page.view", "post.view", "post.filter", "leadmagnet.view",
      "leadmagnet.download", "cta.click", "studio.export", "pipeline.build"
    ]);
    const type = cleanText(input.type, 60);
    if (!allowed.has(type)) {
      const error = new Error("Unsupported event type.");
      error.code = "INVALID_EVENT";
      throw error;
    }
    const event = {
      id: crypto.randomUUID(),
      type,
      post_slug: cleanText(input.post_slug || "", 100),
      pillar: cleanText(input.pillar || "", 40),
      source: cleanText(input.source || "web", 80),
      metadata: sanitizeMetadata(input.metadata),
      occurred_at: new Date().toISOString()
    };
    appendJsonl(eventsFile, event);
    return event;
  }

  function summary() {
    const leads = Object.values(readJson(leadsFile, {}));
    const counts = {};
    let events = 0;
    try {
      for (const line of fs.readFileSync(eventsFile, "utf8").split("\n")) {
        if (!line.trim()) continue;
        events += 1;
        const event = JSON.parse(line);
        counts[event.type] = (counts[event.type] || 0) + 1;
      }
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    return {
      leads: leads.length,
      events,
      event_counts: counts,
      updated_at: new Date().toISOString()
    };
  }

  function log(level, event, data = {}) {
    appendJsonl(logsFile, {
      timestamp: new Date().toISOString(),
      level,
      event,
      ...data
    });
  }

  return { baseDir, captureLead, captureEvent, summary, log };
}

function redactEmail(email) {
  const [name, domain] = email.split("@");
  return `${name.slice(0, 2)}***@${domain}`;
}

function sanitizeMetadata(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const output = {};
  for (const [key, item] of Object.entries(value).slice(0, 20)) {
    const safeKey = cleanText(key, 40).replace(/[^a-zA-Z0-9_.-]/g, "");
    if (!safeKey) continue;
    output[safeKey] = typeof item === "number" || typeof item === "boolean" ? item : cleanText(item, 160);
  }
  return output;
}

module.exports = { createStore, validEmail, normalizeEmail, writeJsonAtomic };
