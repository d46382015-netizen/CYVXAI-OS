"use strict";

const crypto = require("node:crypto");
const { MissionEngine } = require("../../core/missions");
const { RuntimeError, now, id, sha256, canonical, parseJson } = require("./base");
const { rowPayload, requireMission } = require("./store");

function addMilliseconds(milliseconds) { return new Date(Date.now() + Number(milliseconds)).toISOString(); }
function backoff(attempts, base = 500) { return Math.min(60_000, base * (2 ** Math.max(0, Number(attempts) - 1))); }

class JobQueue {
  constructor({ db, store, logger, leaseMs = 1500 }) {
    this.db = db;
    this.store = store;
    this.logger = logger;
    this.leaseMs = Number(leaseMs);
  }

  event(job, type, actor, details = {}) {
    const eventId = id("event");
    const timestamp = now();
    this.db.prepare(`INSERT INTO events(id,organization_id,type,correlation_id,causation_id,timestamp,actor,data,payload)
      VALUES(?,?,?,?,?,?,?,?,?)`).run(
      eventId, job.organization_id, type, job.correlation_id, details.causation_id || job.causation_id || null,
      timestamp, actor, JSON.stringify({ mission_id: job.mission_id, job_id: job.id, ...details }),
      JSON.stringify({ id: eventId, organization_id: job.organization_id, type, correlation_id: job.correlation_id,
        causation_id: details.causation_id || job.causation_id || null, timestamp, actor,
        data: { mission_id: job.mission_id, job_id: job.id, ...details } }),
    );
    this.db.prepare(`INSERT INTO audit_log(id,organization_id,resource_type,resource_id,action,actor,reason,changes,timestamp)
      VALUES(?,?,?,?,?,?,?,?,?)`).run(
      id("audit"), job.organization_id, "job", job.id, type.split(".").at(-1), actor,
      type, JSON.stringify(details), timestamp,
    );
    return eventId;
  }

  enqueue({ organizationId, missionId, jobType = "mission.execute", payload = {}, idempotencyKey, correlationId, causationId, maxAttempts = 3, actor = "system" }) {
    const key = String(idempotencyKey || `${jobType}:${missionId}`);
    const existing = this.db.prepare("SELECT * FROM jobs WHERE organization_id=? AND idempotency_key=?")
      .get(organizationId, key);
    if (existing) return rowPayload(existing);
    const timestamp = now();
    const job = {
      id: id("job"), organization_id: organizationId, mission_id: missionId, job_type: jobType,
      payload: JSON.stringify(payload), status: "queued", idempotency_key: key, attempts: 0,
      max_attempts: Number(maxAttempts) || 3, available_at: timestamp, lease_owner: null,
      lease_expires_at: null, correlation_id: correlationId || crypto.randomUUID(),
      causation_id: causationId || null, last_error: null, created_at: timestamp, started_at: null,
      completed_at: null, updated_at: timestamp, result_hash: null,
    };
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db.prepare(`INSERT INTO jobs(id,organization_id,mission_id,job_type,payload,status,idempotency_key,attempts,
        max_attempts,available_at,lease_owner,lease_expires_at,correlation_id,causation_id,last_error,created_at,
        started_at,completed_at,updated_at,result_hash) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
        job.id, job.organization_id, job.mission_id, job.job_type, job.payload, job.status,
        job.idempotency_key, job.attempts, job.max_attempts, job.available_at, job.lease_owner,
        job.lease_expires_at, job.correlation_id, job.causation_id, job.last_error, job.created_at,
        job.started_at, job.completed_at, job.updated_at, job.result_hash,
      );
      this.event(job, "job.queued", actor);
      this.db.exec("COMMIT");
      this.logger.write("info", "job.queued", { job_id: job.id, mission_id: missionId, organization_id: organizationId });
      return job;
    } catch (error) {
      this.db.exec("ROLLBACK");
      if (/UNIQUE/.test(error.message)) {
        return rowPayload(this.db.prepare("SELECT * FROM jobs WHERE organization_id=? AND idempotency_key=?").get(organizationId, key));
      }
      throw error;
    }
  }

  recoverExpired(actor = "worker-recovery") {
    const expired = this.db.prepare(`SELECT * FROM jobs WHERE status IN ('leased','running')
      AND lease_expires_at IS NOT NULL AND lease_expires_at<=?`).all(now());
    for (const job of expired) {
      const terminal = Number(job.attempts) >= Number(job.max_attempts);
      const status = terminal ? "failed" : "retryable";
      const availableAt = terminal ? job.available_at : addMilliseconds(backoff(job.attempts));
      this.db.prepare(`UPDATE jobs SET status=?,available_at=?,lease_owner=NULL,lease_expires_at=NULL,
        last_error=?,completed_at=CASE WHEN ?='failed' THEN ? ELSE completed_at END,updated_at=? WHERE id=?`)
        .run(status, availableAt, "LEASE_EXPIRED", status, now(), now(), job.id);
      this.event({ ...job, status }, terminal ? "job.failed" : "job.lease_expired", actor, { previous_status: job.status });
    }
    return expired.length;
  }

  claim(workerId) {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.recoverExpired(workerId);
      const job = this.db.prepare(`SELECT * FROM jobs WHERE status IN ('queued','retryable') AND available_at<=?
        ORDER BY available_at,created_at LIMIT 1`).get(now());
      if (!job) { this.db.exec("COMMIT"); return null; }
      const leaseExpiresAt = addMilliseconds(this.leaseMs);
      const updated = this.db.prepare(`UPDATE jobs SET status='leased',attempts=attempts+1,lease_owner=?,
        lease_expires_at=?,updated_at=? WHERE id=? AND status IN ('queued','retryable')`).run(
        workerId, leaseExpiresAt, now(), job.id,
      );
      if (Number(updated.changes) !== 1) { this.db.exec("COMMIT"); return null; }
      const claimed = this.db.prepare("SELECT * FROM jobs WHERE id=?").get(job.id);
      this.event(claimed, "job.leased", workerId, { lease_expires_at: leaseExpiresAt });
      this.db.exec("COMMIT");
      return rowPayload(claimed);
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  start(jobId, workerId) {
    const timestamp = now();
    const updated = this.db.prepare(`UPDATE jobs SET status='running',started_at=COALESCE(started_at,?),
      lease_expires_at=?,updated_at=? WHERE id=? AND status='leased' AND lease_owner=?`).run(
      timestamp, addMilliseconds(this.leaseMs), timestamp, jobId, workerId,
    );
    if (Number(updated.changes) !== 1) throw new RuntimeError("JOB_LEASE_LOST", "Worker no longer owns this job lease", 409);
    const job = this.db.prepare("SELECT * FROM jobs WHERE id=?").get(jobId);
    this.event(job, "job.running", workerId);
    return rowPayload(job);
  }

  heartbeat(jobId, workerId) {
    const timestamp = now();
    const updated = this.db.prepare(`UPDATE jobs SET lease_expires_at=?,updated_at=?
      WHERE id=? AND status IN ('leased','running') AND lease_owner=?`).run(
      addMilliseconds(this.leaseMs), timestamp, jobId, workerId,
    );
    this.db.prepare(`INSERT INTO worker_heartbeats(worker_id,started_at,heartbeat_at,current_job_id,metadata)
      VALUES(?,?,?,?,?) ON CONFLICT(worker_id) DO UPDATE SET heartbeat_at=excluded.heartbeat_at,
      current_job_id=excluded.current_job_id,metadata=excluded.metadata`).run(
      workerId, timestamp, timestamp, jobId, JSON.stringify({ pid: process.pid }),
    );
    return Number(updated.changes) === 1;
  }

  complete(jobId, workerId, result) {
    const resultHash = sha256(canonical(result));
    const timestamp = now();
    const updated = this.db.prepare(`UPDATE jobs SET status='completed',completed_at=?,updated_at=?,
      result_hash=?,lease_owner=NULL,lease_expires_at=NULL,last_error=NULL
      WHERE id=? AND status='running' AND lease_owner=?`).run(timestamp, timestamp, resultHash, jobId, workerId);
    if (Number(updated.changes) !== 1) {
      const existing = this.db.prepare("SELECT * FROM jobs WHERE id=?").get(jobId);
      if (existing && existing.status === "completed" && existing.result_hash === resultHash) return rowPayload(existing);
      throw new RuntimeError("JOB_COMPLETION_CONFLICT", "Job cannot be completed twice", 409);
    }
    const job = this.db.prepare("SELECT * FROM jobs WHERE id=?").get(jobId);
    this.event(job, "job.completed", workerId, { result_hash: resultHash });
    return rowPayload(job);
  }

  fail(jobId, workerId, error) {
    const job = this.db.prepare("SELECT * FROM jobs WHERE id=? AND lease_owner=?").get(jobId, workerId);
    if (!job) throw new RuntimeError("JOB_LEASE_LOST", "Worker no longer owns this job lease", 409);
    const terminal = Number(job.attempts) >= Number(job.max_attempts);
    const status = terminal ? "failed" : "retryable";
    const timestamp = now();
    this.db.prepare(`UPDATE jobs SET status=?,available_at=?,last_error=?,updated_at=?,
      completed_at=CASE WHEN ?='failed' THEN ? ELSE completed_at END,lease_owner=NULL,lease_expires_at=NULL WHERE id=?`)
      .run(status, terminal ? job.available_at : addMilliseconds(backoff(job.attempts)), String(error.message || error).slice(0, 2000), timestamp, status, timestamp, jobId);
    const failed = this.db.prepare("SELECT * FROM jobs WHERE id=?").get(jobId);
    this.event(failed, terminal ? "job.failed" : "job.retryable", workerId, { error: String(error.message || error).slice(0, 500) });
    return rowPayload(failed);
  }

  get(auth, jobId) {
    const row = this.db.prepare("SELECT * FROM jobs WHERE id=? AND organization_id=?").get(jobId, auth.organization_id);
    if (!row) throw new RuntimeError("NOT_FOUND", "Job not found", 404);
    return rowPayload(row);
  }

  listFailed(auth) {
    return this.db.prepare("SELECT * FROM jobs WHERE organization_id=? AND status='failed' ORDER BY updated_at DESC")
      .all(auth.organization_id).map(rowPayload);
  }

  requeue(auth, jobId) {
    const timestamp = now();
    const updated = this.db.prepare(`UPDATE jobs SET status='queued',available_at=?,lease_owner=NULL,
      lease_expires_at=NULL,last_error=NULL,completed_at=NULL,updated_at=?
      WHERE id=? AND organization_id=? AND status IN ('failed','retryable')`).run(timestamp, timestamp, jobId, auth.organization_id);
    if (Number(updated.changes) !== 1) throw new RuntimeError("JOB_REQUEUE_REJECTED", "Only failed or retryable jobs may be requeued", 409);
    const job = this.db.prepare("SELECT * FROM jobs WHERE id=?").get(jobId);
    this.event(job, "job.requeued", auth.user_id);
    return rowPayload(job);
  }
}

class MissionWorker {
  constructor({ db, store, evidence, queue, logger, workerId, pollMs = 100, crashAfterClaim = false }) {
    this.db = db;
    this.store = store;
    this.evidence = evidence;
    this.queue = queue;
    this.logger = logger;
    this.workerId = workerId || `worker-${process.pid}-${crypto.randomUUID().slice(0, 8)}`;
    this.pollMs = Number(pollMs);
    this.crashAfterClaim = crashAfterClaim;
    this.stopping = false;
    this.timer = null;
    this.engine = new MissionEngine(store);
  }

  async runOnce() {
    const job = this.queue.claim(this.workerId);
    this.heartbeat(job && job.id);
    if (!job) return null;
    this.logger.write("info", "worker.claimed", { worker_id: this.workerId, job_id: job.id, mission_id: job.mission_id });
    if (this.crashAfterClaim) return { claimed: job, interrupted: true };
    try {
      this.queue.start(job.id, this.workerId);
      this.queue.heartbeat(job.id, this.workerId);
      const auth = { user_id: `worker:${this.workerId}`, organization_id: job.organization_id, role: "agent" };
      let mission = requireMission(this.db, auth, job.mission_id);
      if (mission.status === "queued") {
        this.store.withContext({ organization_id: job.organization_id, actor: auth.user_id, correlation_id: job.correlation_id, causation_id: job.causation_id }, () => {
          this.engine.execute(job.mission_id, { started_by: auth.user_id, steps: parseJson(job.payload, {}).steps || [] });
        });
      } else if (mission.status !== "running") {
        throw new RuntimeError("MISSION_NOT_EXECUTABLE", `Mission is ${mission.status}`, 409);
      }

      const result = {
        capability: "deterministic.local.v1",
        mission_id: job.mission_id,
        job_id: job.id,
        input_hash: sha256(job.payload),
        completed: true,
      };
      const artifact = `${canonical(result)}\n`;
      let effect = this.db.prepare("SELECT * FROM execution_effects WHERE job_id=?").get(job.id);
      let evidenceRecord;
      if (effect) {
        evidenceRecord = this.evidence.get(auth, effect.evidence_id);
      } else {
        evidenceRecord = this.evidence.record({
          auth, missionId: job.mission_id, content: artifact, type: "execution_result",
          title: "Deterministic mission execution", source: "deterministic.local.v1", jobId: job.id,
          correlationId: job.correlation_id, causationId: job.causation_id,
        });
        this.db.prepare(`INSERT OR IGNORE INTO execution_effects(job_id,organization_id,mission_id,idempotency_key,
          effect_hash,evidence_id,artifact_path,created_at) VALUES(?,?,?,?,?,?,?,?)`).run(
          job.id, job.organization_id, job.mission_id, job.idempotency_key, sha256(artifact),
          evidenceRecord.id, evidenceRecord.artifact_path, now(),
        );
      }

      mission = requireMission(this.db, auth, job.mission_id);
      let outcome;
      if (mission.status === "running") {
        const completed = this.store.withContext({ organization_id: job.organization_id, actor: auth.user_id, correlation_id: job.correlation_id, causation_id: evidenceRecord.id }, () => this.engine.complete(job.mission_id, {
          result_summary: "Deterministic local capability completed successfully",
          metrics: { actions_executed: 1, duplicate_actions: 0 }, evidence_ids: [evidenceRecord.id],
          verified: true, completed_by: auth.user_id,
        }));
        outcome = completed.outcome;
        this.db.prepare("UPDATE outcomes SET job_id=?,payload=json_set(payload,'$.job_id',?) WHERE id=?")
          .run(job.id, job.id, outcome.id);
      } else {
        outcome = rowPayload(this.db.prepare("SELECT * FROM outcomes WHERE organization_id=? AND mission_id=? ORDER BY completed_at DESC LIMIT 1")
          .get(job.organization_id, job.mission_id));
      }

      mission = requireMission(this.db, auth, job.mission_id);
      if (mission.status === "completed") {
        this.store.withContext({ organization_id: job.organization_id, actor: auth.user_id, correlation_id: job.correlation_id, causation_id: outcome.id }, () => this.engine.evaluate(job.mission_id, {
          success: true, lessons_learned: ["Durable execution completed with verified evidence"],
          improvements: [], capability_delta: { created: 1, protected: 1, improved: 0 }, evaluated_by: auth.user_id,
        }));
      }
      mission = requireMission(this.db, auth, job.mission_id);
      let capability = null;
      if (mission.status === "evaluated") {
        const learned = this.store.withContext({ organization_id: job.organization_id, actor: auth.user_id, correlation_id: job.correlation_id, causation_id: outcome.id }, () => this.engine.learnCapability(job.mission_id, {
          title: `Learned: ${mission.title}`, description: "Verified deterministic local mission capability",
          inputs: ["mission_payload"], outputs: ["evidence", "outcome"], permissions_required: ["mission:execute"],
          tests: ["runtime-recovery"], cost_basis: { local: true }, risk_level: mission.risk_level,
          owned_by: job.organization_id, learned_by: auth.user_id, is_reusable: true,
        }));
        capability = learned.capability;
        this.db.prepare(`INSERT OR IGNORE INTO learning_records(id,organization_id,mission_id,success,lessons_learned,
          improvements,capability_delta,created_at) VALUES(?,?,?,?,?,?,?,?)`).run(
          `learning_${sha256(job.id).slice(0, 24)}`, job.organization_id, job.mission_id, 1,
          JSON.stringify(["Durable execution completed with verified evidence"]), JSON.stringify([]),
          JSON.stringify({ created: 1, protected: 1, improved: 0 }), now(),
        );
      }

      const completedJob = this.queue.complete(job.id, this.workerId, {
        evidence_id: evidenceRecord.id, outcome_id: outcome && outcome.id,
        capability_id: capability && capability.id, final_state: requireMission(this.db, auth, job.mission_id).status,
      });
      this.heartbeat(null);
      return completedJob;
    } catch (error) {
      this.logger.write("error", "worker.execution_failed", { worker_id: this.workerId, job_id: job.id, error: error.message });
      const failedJob = this.queue.fail(job.id, this.workerId, error);
      if (failedJob.status === "failed") {
        const auth = { user_id: `worker:${this.workerId}`, organization_id: job.organization_id, role: "agent" };
        const mission = requireMission(this.db, auth, job.mission_id);
        if (["queued", "running"].includes(mission.status)) {
          this.store.withContext({ organization_id: job.organization_id, actor: auth.user_id, correlation_id: job.correlation_id, causation_id: job.id }, () => {
            this.engine.fail(job.mission_id, { failed_by: auth.user_id, error_code: "JOB_FAILED", error_message: error.message, recovery_action: "Inspect and safely requeue the failed job" });
          });
        }
      }
      return failedJob;
    }
  }

  heartbeat(jobId) {
    const timestamp = now();
    this.db.prepare(`INSERT INTO worker_heartbeats(worker_id,started_at,heartbeat_at,current_job_id,metadata)
      VALUES(?,?,?,?,?) ON CONFLICT(worker_id) DO UPDATE SET heartbeat_at=excluded.heartbeat_at,
      current_job_id=excluded.current_job_id,metadata=excluded.metadata`).run(
      this.workerId, timestamp, timestamp, jobId || null, JSON.stringify({ pid: process.pid, stopping: this.stopping }),
    );
  }

  async start() {
    this.stopping = false;
    this.heartbeat(null);
    while (!this.stopping) {
      await this.runOnce();
      if (!this.stopping) await new Promise((resolve) => { this.timer = setTimeout(resolve, this.pollMs); });
    }
  }

  stop() {
    this.stopping = true;
    if (this.timer) clearTimeout(this.timer);
    this.heartbeat(null);
  }
}

module.exports = { JobQueue, MissionWorker, backoff };
