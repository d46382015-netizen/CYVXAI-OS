"use strict";

const fs = require("node:fs");
const path = require("node:path");
const {
  RuntimeError, now, id, sha256, canonical, parseJson, safeArtifactPath, atomicWrite,
} = require("./base");
const { rowPayload, requireMission } = require("./store");

class EvidenceService {
  constructor({ db, store, artifactRoot, logger }) {
    this.db = db;
    this.store = store;
    this.artifactRoot = path.resolve(artifactRoot);
    this.logger = logger;
    fs.mkdirSync(this.artifactRoot, { recursive: true, mode: 0o700 });
  }

  record({ auth, missionId, content, type = "artifact", title = "Evidence", source = "runtime", jobId = null, correlationId, causationId }) {
    requireMission(this.db, auth, missionId);
    const bytes = Buffer.isBuffer(content) ? content : Buffer.from(typeof content === "string" ? content : `${canonical(content)}\n`);
    const artifactSha = sha256(bytes);
    const evidenceId = jobId ? `evidence_${sha256(jobId).slice(0, 32)}` : id("evidence");
    const relativePath = path.join(auth.organization_id, missionId, `${evidenceId}.json`).replace(/\\/g, "/");
    const artifactPath = safeArtifactPath(this.artifactRoot, relativePath);
    if (fs.existsSync(artifactPath)) {
      if (sha256(fs.readFileSync(artifactPath)) !== artifactSha) {
        throw new RuntimeError("IDEMPOTENCY_CONFLICT", "Existing evidence artifact differs from deterministic result", 409);
      }
    } else {
      atomicWrite(artifactPath, bytes);
    }

    const existing = this.db.prepare("SELECT * FROM evidence WHERE organization_id=? AND id=?")
      .get(auth.organization_id, evidenceId);
    if (existing) return rowPayload(existing);

    return this.store.withContext({
      organization_id: auth.organization_id,
      actor: auth.user_id,
      correlation_id: correlationId,
      causation_id: causationId,
    }, () => this.store.transaction((state) => {
      const mission = state.missions.find((item) => item.id === missionId);
      if (!mission) throw new RuntimeError("NOT_FOUND", "Mission not found", 404);
      const previous = state.evidence
        .filter((item) => item.mission_id === missionId)
        .sort((a, b) => Number(a.sequence || 0) - Number(b.sequence || 0))
        .at(-1);
      const sequence = Number(previous && previous.sequence || 0) + 1;
      const core = {
        id: evidenceId,
        organization_id: auth.organization_id,
        mission_id: missionId,
        job_id: jobId,
        sequence,
        type: String(type).slice(0, 100),
        title: String(title).slice(0, 200),
        source: String(source).slice(0, 500),
        artifact_path: relativePath,
        artifact_sha256: artifactSha,
        bytes: bytes.length,
        created_at: now(),
        created_by: auth.user_id,
      };
      const recordSha = sha256(canonical(core));
      const previousChain = previous ? previous.chain_hash : "GENESIS";
      const chainHash = sha256(`${previousChain}:${recordSha}`);
      const evidence = {
        ...core,
        sha256: artifactSha,
        record_sha256: recordSha,
        previous_chain_hash: previousChain,
        chain_hash: chainHash,
        verified: true,
        verification_timestamp: now(),
        record_json: canonical(core),
      };
      state.evidence.push(evidence);
      mission.evidence_ids ||= [];
      if (!mission.evidence_ids.includes(evidenceId)) mission.evidence_ids.push(evidenceId);
      state.events.push({
        id: id("event"),
        type: "evidence.recorded",
        timestamp: now(),
        data: { mission_id: missionId, evidence_id: evidenceId, job_id: jobId, sequence },
      });
      return evidence;
    }));
  }

  get(auth, evidenceId) {
    const row = this.db.prepare("SELECT * FROM evidence WHERE organization_id=? AND id=?")
      .get(auth.organization_id, evidenceId);
    if (!row) throw new RuntimeError("NOT_FOUND", "Evidence not found", 404);
    requireMission(this.db, auth, row.mission_id);
    return rowPayload(row);
  }

  list(auth, missionId) {
    requireMission(this.db, auth, missionId);
    return this.db.prepare("SELECT * FROM evidence WHERE organization_id=? AND mission_id=? ORDER BY sequence,created_at")
      .all(auth.organization_id, missionId).map(rowPayload);
  }

  verify(auth, input = {}) {
    let missionId = input.mission_id || null;
    const evidenceId = input.evidence_id || input.id || null;
    let maximumSequence = null;
    if (!missionId && evidenceId) {
      const target = this.db.prepare("SELECT mission_id,sequence FROM evidence WHERE organization_id=? AND id=?")
        .get(auth.organization_id, evidenceId);
      if (!target) throw new RuntimeError("NOT_FOUND", "Evidence not found", 404);
      missionId = target.mission_id;
      maximumSequence = Number(target.sequence);
    }
    if (!missionId) throw new RuntimeError("VALIDATION_ERROR", "mission_id or evidence_id is required", 422);
    requireMission(this.db, auth, missionId);
    const rows = maximumSequence === null
      ? this.db.prepare("SELECT * FROM evidence WHERE organization_id=? AND mission_id=? ORDER BY sequence,created_at").all(auth.organization_id, missionId)
      : this.db.prepare("SELECT * FROM evidence WHERE organization_id=? AND mission_id=? AND sequence<=? ORDER BY sequence,created_at").all(auth.organization_id, missionId, maximumSequence);

    const errors = [];
    let firstInvalidRecord = null;
    let artifactsChecked = 0;
    let previousChain = "GENESIS";
    let expectedSequence = 1;
    const sequencePositions = new Set();
    for (const row of rows) {
      const evidence = rowPayload(row);
      const fail = (code, message) => {
        const error = { code, evidence_id: evidence.id, sequence: evidence.sequence, message };
        errors.push(error);
        firstInvalidRecord ||= error;
      };
      const ownedMission = this.db.prepare("SELECT id FROM missions WHERE id=? AND organization_id=?")
        .get(evidence.mission_id, auth.organization_id);
      if (!ownedMission || evidence.organization_id !== auth.organization_id) fail("MISSION_OWNERSHIP_INVALID", "Evidence does not belong to the authenticated organization");
      const sequence = Number(evidence.sequence);
      if (!Number.isInteger(sequence) || sequence !== expectedSequence) fail("EVIDENCE_ORDER_INVALID", `Expected sequence ${expectedSequence}`);
      if (sequencePositions.has(sequence)) fail("EVIDENCE_SEQUENCE_DUPLICATE", "Duplicate evidence sequence detected");
      sequencePositions.add(sequence);
      if (evidence.previous_chain_hash !== previousChain) fail("PREVIOUS_CHAIN_INVALID", "Previous-chain reference does not match");
      const recordCore = parseJson(evidence.record_json, null);
      if (!recordCore) {
        fail("RECORD_JSON_INVALID", "Evidence record JSON is missing or invalid");
      } else {
        const recordHash = sha256(canonical(recordCore));
        if (recordHash !== evidence.record_sha256) fail("RECORD_HASH_INVALID", "Evidence record was modified");
        if (sha256(`${previousChain}:${recordHash}`) !== evidence.chain_hash) fail("CHAIN_HASH_INVALID", "Evidence chain hash is invalid");
      }
      try {
        const artifactPath = safeArtifactPath(this.artifactRoot, evidence.artifact_path);
        const artifactHash = sha256(fs.readFileSync(artifactPath));
        artifactsChecked += 1;
        if (artifactHash !== evidence.artifact_sha256 || evidence.artifact_sha256 !== evidence.sha256) {
          fail("ARTIFACT_HASH_INVALID", "Artifact content hash does not match the evidence record");
        }
      } catch (error) {
        fail("ARTIFACT_MISSING", error.code === "ENOENT" ? "Evidence artifact is missing" : error.message);
      }
      previousChain = evidence.chain_hash;
      expectedSequence += 1;
    }
    if (!rows.length) errors.push({ code: "EVIDENCE_EMPTY", message: "No evidence records were found" });
    const report = {
      valid: errors.length === 0,
      records_checked: rows.length,
      artifacts_checked: artifactsChecked,
      first_invalid_record: firstInvalidRecord,
      errors,
      verified_at: now(),
    };
    this.logger.write(report.valid ? "info" : "warn", "evidence.verify", {
      organization_id: auth.organization_id, mission_id: missionId, evidence_id: evidenceId, report,
    });
    return report;
  }

  proof(auth, missionId) {
    const mission = requireMission(this.db, auth, missionId);
    const records = this.list(auth, missionId);
    const verification = this.verify(auth, { mission_id: missionId });
    const outcomeRow = this.db.prepare("SELECT * FROM outcomes WHERE organization_id=? AND mission_id=? ORDER BY completed_at DESC LIMIT 1")
      .get(auth.organization_id, missionId);
    return {
      mission: { id: mission.id, title: mission.title, status: mission.status, organization_id: mission.organization_id },
      evidence: records,
      outcome: rowPayload(outcomeRow),
      verification,
      generated_at: now(),
    };
  }
}

module.exports = { EvidenceService };
