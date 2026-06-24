"use strict";

const STORAGE = {
  owner: "spark.owner_id",
  activeSpark: "spark.active_id",
};

export class SparkClient {
  constructor() {
    this.ownerId = localStorage.getItem(STORAGE.owner) || `founder_${crypto.randomUUID().replaceAll("-", "").slice(0, 16)}`;
    localStorage.setItem(STORAGE.owner, this.ownerId);
  }

  async request(path, options = {}) {
    const headers = { accept: "application/json", ...(options.headers || {}) };
    if (options.body !== undefined) headers["content-type"] = "application/json";
    const response = await fetch(path, { ...options, headers });
    const text = await response.text();
    let payload;
    try {
      payload = text ? JSON.parse(text) : {};
    } catch {
      throw new Error(`Invalid response from ${path}`);
    }
    if (!response.ok || payload.ok === false) {
      const detail = payload.error?.message || payload.message || payload.error || `Request failed (${response.status})`;
      throw new Error(String(detail));
    }
    return payload.data ?? payload;
  }

  setOwner(ownerId) {
    this.ownerId = String(ownerId || "").trim();
    localStorage.setItem(STORAGE.owner, this.ownerId);
  }

  activeSparkId() {
    return localStorage.getItem(STORAGE.activeSpark);
  }

  clearActiveSpark() {
    localStorage.removeItem(STORAGE.activeSpark);
  }

  async status() {
    return this.request("/api/public/status");
  }

  async worlds() {
    const response = await this.request("/api/public/worlds");
    return Array.isArray(response.worlds) ? response.worlds : [];
  }

  async activeGraph() {
    const sparkId = this.activeSparkId();
    if (!sparkId) return null;
    return this.request(`/api/public/sparks/${encodeURIComponent(sparkId)}`, {
      headers: { "x-spark-owner": this.ownerId },
    });
  }

  async ignite(input) {
    const graph = await this.request("/api/v1/sparks", {
      method: "POST",
      headers: { "idempotency-key": crypto.randomUUID() },
      body: JSON.stringify(input),
    });
    localStorage.setItem(STORAGE.activeSpark, graph.spark.id);
    return graph;
  }

  async approve(sparkId) {
    return this.request(`/api/v1/sparks/${encodeURIComponent(sparkId)}/approval`, {
      method: "POST",
      body: JSON.stringify({
        owner_id: this.ownerId,
        decision: "approved",
        reason: "Owner approved the displayed bounded mission and capability scope.",
      }),
    });
  }

  async execute(sparkId) {
    return this.request(`/api/v1/sparks/${encodeURIComponent(sparkId)}/execute`, {
      method: "POST",
      body: JSON.stringify({ owner_id: this.ownerId, max_steps: 20 }),
    });
  }
}

export function ignitePayload(elements, ownerId) {
  const dollars = Number(elements.price.value || 0);
  return {
    owner_id: ownerId,
    intention: elements.intention.value.trim(),
    world: compact({
      name: elements.worldName.value.trim(),
      offer_name: elements.offerName.value.trim(),
      offer_description: elements.offerDescription.value.trim(),
      price_cents: Number.isFinite(dollars) ? Math.round(dollars * 100) : 0,
      location: elements.location.value.trim(),
      email: elements.contactEmail.value.trim(),
      payment_url: elements.paymentUrl.value.trim(),
    }),
    success_metrics: [
      { key: "world_operational", target: 1, unit: "boolean" },
      { key: "qualified_leads", target: 1, unit: "count" },
      { key: "verified_revenue", target: 1, unit: "transaction" },
    ],
  };
}

function compact(value) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== "" && item !== null && item !== undefined));
}
