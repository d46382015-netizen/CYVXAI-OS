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

  transaction(operation) {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = operation();
      this.db.exec("COMMIT");
      return result;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  event(job, type, actor, details = {}) {
    const eventId = id("event");
    const timestamp = now();
    const data = { mission_id: job.mission_id, job_id: job.id, ...details };
    const event = {
      id: eventId,
      organization_id: job.organization_id,
      type,
      correlation_id: job.correlation_id,
      causation_id: details.causation_id || job.causation_id || null,
      timestamp,
      actor,
      data,
    };
    this.db.prepare(`INSERT INTO events(id,organization_id,type,correlation_id,causation_id,timestamp,actor,data,payload)
      VALUES(?,?,?,?,?,?,?,?,?)`).run(
      event.id, event.organization_id, event.type, event.correlation_id, event.causation_id,
      event.timestamp, event.actor, JSON.stringify(event.data), JSON.stringify(event),
    );
    this.db.prepare(`INSERT INTO audit_log(id,organization_id,resource_type,resource_id,action,actor,reason,changes,timestamp)
      VALUES(?,?,?,?,?,?,?,?,?)`).run(
      id("audit"), job.organization_id, "job", job.id, type.split(".").at(-1), actor,
      type, JSON.stringify(details), timestamp,
    );
    return eventId;
  }

  missionFailure(job, actor, errorMessage) {
    const row = this.db.prepare("SELECT * FROM missions WHERE organization_id=? AND id=?").get(job.organization_id, job.mission_id);
    if (!row) return;
    const mission = rowPayload(row);
    if (!["queued", "running", "blocked", "paused"].includes(mission.status)) return;
    const before = mission.status;
    mission.status = "failed";
    mission.updated_at = now();
    mission.audit_trail ||= [];
    mission.audit_trail.push({
      timestamp: mission.updated_at,
      state: "failed",
      actor,
      reason: `Durable job exhausted retries: ${String(errorMessage || "unknown error").slice(0, 500)}`,
    });
    this.db.prepare("UPDATE missions SET status='failed',updated_at=?,audit_trail=?,payload=? WHERE organization_id=? AND id=?")
      .run(mission.updated_at, JSON.stringify(mission.audit_trail), JSON.stringify(mission), job.organization_id, job.mission_id);
    const event = {
      id: id("event"), organization_id: job.organization_id, type: "mission.failed",
      correlation_id: job.correlation_id, causation_id: job.id, timestamp: now(), actor,
      data: { mission_id: job.mission_id, job_id: job.id, error_code: "JOB_FAILED", error_message: String(errorMessage || "unknown error").slice(0, 500) },
    };
    this.db.prepare(`INSERT INTO events(id,organization_id,type,correlation_id,causation_id,timestamp,actor,data,payload)
      VALUES(?,?,?,?,?,?,?,?,?)`).run(
      event.id, event.organization_id, event.type, event.correlation_id, event.causation_id,
      event.timestamp, event.actor, JSON.stringify(event.data), JSON.stringify(event),
    );
    this.db.prepare(`INSERT INTO audit_log(id,organization_id,resource_type,resource_id,action,actor,reason,changes,timestamp)
      VALUES(?,?,?,?,?,?,?,?,?)`).run(
      id("audit"), job.organization_id, "mission", job.mission_id, "transitioned", actor,
      `${before} -> failed`, JSON.stringify({ before, after: "failed", job_id: job.id }), event.timestamp,
    );
  }

  enqueue({ organizationId, missionId, jobType = "mission.execute", payload = {}, idempotencyKey, correlationId, causationId, maxAttempts = 3, actor = "system" }) {
    const key = String(idempotencyKey || `${jobType}:${missionId}`);
    const existing = this.db.prepare("SELECT * FROM jobs WHERE organization_id=? AND idempotency_key=?").get(organizationId, key);
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
    try {
      return this.transaction(() => {
        this.db.prepare(`INSERT INTO jobs(id,organization_id,mission_id,job_type,payload,status,idempotency_key,attempts,
          max_attempts,available_at,lease_owner,lease_expires_at,correlation_id,causation_id,last_error,created_at,
          started_at,completed_at,updated_at,result_hash) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
          job.id, job.organization_id, job.mission_id, job.job_type, job.payload, job.status,
          job.idempotency_key, job.attempts, job.max_attempts, job.available_at, job.lease_owner,
          job.lease_expires_at, job.correlation_id, job.causation_id, job.last_error, job.created_at,
          job.started_at, job.completed_at, job.updated_at, job.result_hash,
        );
        this.event(job, "job.queued", actor);
        return rowPayload(this.db.prepare("SELECT * FROM jobs WHERE id=?").get(job.id));
      });
    } catch (error) {
      if (/UNIQUE/.test(error.message)) {
        return rowPayload(this.db.prepare("SELECT * FROM jobs WHERE organization_id=? AND idempotency_key=?").get(organizationId, key));
      }
      throw error;
    } finally {
      this.logger.write("info", "job.enqueue", { mission_id: missionId, organization_id: organizationId, idempotency_key: key });
    }
  }

  recoverExpired(actor = "worker-recovery") {
    return this.transaction(() => this.recoverExpiredWithinTransaction(actor));
  }

  recoverExpiredWithinTransaction(actor) {
    const expired = this.db.prepare(`SELECT * FROM jobs WHERE status IN ('leased','running')
      AND lease_expires_at IS NOT NULL AND lease_expires_at<=?`).all(now());
    for (const raw of expired) {
      const job = rowPayload(raw);
      const terminal = Number(job.attempts) >= Number(job.max_attempts);
      const status = terminal ? "failed" : "retryable";
      const timestamp = now();
      const availableAt = terminal ? job.available_at : addMilliseconds(backoff(job.attempts));
      this.db.prepare(`UPDATE jobs SET status=?,available_at=?,lease_owner=NULL,lease_expires_at=NULL,
        last_error=?,completed_at=CASE WHEN ?='failed' THEN ? ELSE completed_at END,updated_at=? WHERE id=?`)
        .run(status, availableAt, "LEASE_EXPIRED", status, timestamp, timestamp, job.id);
      const updated = rowPayload(this.db.prepare("SELECT * FROM jobs WHERE id=?").get(job.id));
      this.event(updated, terminal ? "job.failed" : "job.lease_expired", actor, { previous_status: job.status });
      if (terminal) this.missionFailure(updated, actor, "LEASE_EXPIRED");
    }
    return expired.length;
  }

  claim(workerId) {
    return this.transaction(() => {
      this.recoverExpiredWithinTransaction(workerId);
      const raw = this.db.prepare(`SELECT * FROM jobs WHERE status IN ('queued','retryable') AND available_at<=?
        ORDER BY available_at,created_at LIMIT 1`).get(now());
      if (!raw) return null;
      const job = rowPayload(raw);
      const leaseExpiresAt = addMilliseconds(this.leaseMs);
      const updated = this.db.prepare(`UPDATE jobs SET status='leased',attempts=attempts+1,lease_owner=?,
        lease_expires_at=?,updated_at=? WHERE id=? AND status IN ('queued','retryable')`).run(
        workerId, leaseExpiresAt, now(), job.id,
      );
      if (Number(updated.changes) !== 1) return null;
      const claimed = rowPayload(this.db.prepare("SELECT * FROM jobs WHERE id=?").get(job.id));
      this.event(claimed, "job.leased", workerId, { lease_expires_at: leaseExpiresAt });
      return claimed;
    });
  }

  start(jobId, workerId) {
    return this.transaction(() => {
      const timestamp = now();
      const updated = this.db.prepare(`UPDATE jobs SET status='running',started_at=COALESCE(started_at,?),
        lease_expires_at=?,updated_at=? WHERE id=? AND status='leased' AND lease_owner=?`).run(
        timestamp, addMilliseconds(this.leaseMs), timestamp, jobId, workerId,
      );
      if (Number(updated.changes) !== 1) throw new RuntimeError("JOB_LEASE_LOST", "Worker no longer owns this job lease", 409);
      const job = rowPayload(this.db.prepare("SELECT * FROM jobs WHERE id=?").get(jobId));
      this.event(job, "job.running", workerId);
      return job;
    });
  }

  heartbeat(jobId, workerId) {
    const timestamp = now();
    let owned = true;
    if (jobId) {
      const updated = this.db.prepare(`UPDATE jobs SET lease_expires_at=?,updated_at=?
        WHERE id=? AND status IN ('leased','running') AND lease_owner=?`).run(
        addMilliseconds(this.leaseMs), timestamp, jobId, workerId,
      );
      owned = Number(updated.changes) === 1;
    }
    this.db.prepare(`INSERT INTO worker_heartbeats(worker_id,started_at,heartbeat_at,current_job_id,metadata)
      VALUES(?,?,?,?,?) ON CONFLICT(worker_id) DO UPDATE SET heartbeat_at=excluded.heartbeat_at,
      current_job_id=excluded.current_job_id,metadata=excluded.metadata`).run(
      workerId, timestamp, timestamp, jobId || null, JSON.stringify({ pid: process.pid }),
    );
    return owned;
  }

  complete(jobId, workerId, result) {
    const resultHash = sha256(canonical(result));
    return this.transaction(() => {
      const timestamp = now();
      const updated = this.db.prepare(`UPDATE jobs SET status='completed',completed_at=?,updated_at=?,
        result_hash=?,lease_owner=NULL,lease_expires_at=NULL,last_error=NULL
        WHERE id=? AND status='running' AND lease_owner=?`).run(timestamp, timestamp, resultHash, jobId, workerId);
      if (Number(updated.changes) !== 1) {
        const existing = rowPayload(this.db.prepare("SELECT * FROM jobs WHERE id=?").get(jobId));
        if (existing && existing.status === "completed" && existing.result_hash === resultHash) return existing;
        throw new RuntimeError("JOB_COMPLETION_CONFLICT", "Job cannot be completed twice", 409);
      }
      const job = rowPayload(this.db.prepare("SELECT * FROM jobs WHERE id=?").get(jobId));
      this.event(job, "job.completed", workerId, { result_hash: resultHash });
      return job;
    });
  }

  fail(jobId, workerId, error) {
    return this.transaction(() => {
      const job = rowPayload(this.db.prepare("SELECT * FROM jobs WHERE id=? AND lease_owner=?").get(jobId, workerId));
      if (!job) throw new RuntimeError("JOB_LEASE_LOST", "Worker no longer owns this job lease", 409);
      const terminal = Number(job.attempts) >= Number(job.max_attempts);
      const status = terminal ? "failed" : "retryable";
      const timestamp = now();
      const errorMessage = String(error.message || error).slice(0, 2000);
      this.db.prepare(`UPDATE jobs SET status=?,available_at=?,last_error=?,updated_at=?,
        completed_at=CASE WHEN ?='failed' THEN ? ELSE completed_at END,lease_owner=NULL,lease_expires_at=NULL WHERE id=?`)
        .run(status, terminal ? job.available_at : addMilliseconds(backoff(job.attempts)), errorMessage, timestamp, status, timestamp, jobId);
      const failed = rowPayload(this.db.prepare("SELECT * FROM jobs WHERE id=?").get(jobId));
      this.event(failed, terminal ? "job.failed" : "job.retryable", workerId, { error: errorMessage.slice(0, 500) });
      if (terminal) this.missionFailure(failed, workerId, errorMessage);
      return failed;
    });
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
    return this.transaction(() => {
      const timestamp = now();
      const updated = this.db.prepare(`UPDATE jobs SET status='queued',available_at=?,lease_owner=NULL,
        lease_expires_at=NULL,last_error=NULL,completed_at=NULL,updated_at=?
        WHERE id=? AND organization_id=? AND status IN ('failed','retryable')`).run(timestamp, timestamp, jobId, auth.organization_id);
      if (Number(updated.changes) !== 1) throw new RuntimeError("JOB_REQUEUE_REJECTED", "Only failed or retryable jobs may be requeued", 409);
      const job = rowPayload(this.db.prepare("SELECT * FROM jobs WHERE id=?").get(jobId));
      this.event(job, "job.requeued", auth.user_id);
      return job;
    });
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
    this.wake = null;
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
        mission = requireMission(this.db, auth, job.mission_id);
      }
      if (!["running", "completed", "evaluated", "learned"].includes(mission.status)) {
        throw new RuntimeError("MISSION_NOT_EXECUTABLE", `Mission is ${mission.status}`, 409);
      }

      const result = {
        capability: "deterministic.local.v1",
        mission_id: job.mission_id,
        job_id: job.id,
        input_hash: sha256(canonical(job.payload)),
        completed: true,
      };
      const artifact = `${canonical(result)}\n`;
      let effect = this.db.prepare("SELECT * FROM execution_effects WHERE job_id=?").get(job.id);
      let evidenceRecord = effect ? this.evidence.get(auth, effect.evidence_id) : null;
      if (!evidenceRecord) {
        const evidenceRow = this.db.prepare("SELECT id FROM evidence WHERE organization_id=? AND job_id=?").get(job.organization_id, job.id);
        if (evidenceRow) evidenceRecord = this.evidence.get(auth, evidenceRow.id);
      }
      if (!evidenceRecord && mission.status === "running") {
        evidenceRecord = this.evidence.record({
          auth, missionId: job.mission_id, content: artifact, type: "execution_result",
          title: "Deterministic mission execution", source: "deterministic.local.v1", jobId: job.id,
          correlationId: job.correlation_id, causationId: job.causation_id,
        });
      }
      if (!evidenceRecord) throw new RuntimeError("EXECUTION_CHECKPOINT_MISSING", "Completed mission checkpoint is missing deterministic evidence", 500);
      if (!effect) {
        this.db.prepare(`INSERT OR IGNORE INTO execution_effects(job_id,organization_id,mission_id,idempotency_key,
          effect_hash,evidence_id,artifact_path,created_at) VALUES(?,?,?,?,?,?,?,?)`).run(
          job.id, job.organization_id, job.mission_id, job.idempotency_key, sha256(artifact),
          evidenceRecord.id, evidenceRecord.artifact_path, now(),
        );
        effect = this.db.prepare("SELECT * FROM execution_effects WHERE job_id=?").get(job.id);
      }

      let outcome = rowPayload(this.db.prepare("SELECT * FROM outcomes WHERE organization_id=? AND mission_id=? ORDER BY completed_at DESC LIMIT 1")
        .get(job.organization_id, job.mission_id));
      mission = requireMission(this.db, auth, job.mission_id);
      if (mission.status === "running") {
        const completed = this.store.withContext({ organization_id: job.organization_id, actor: auth.user_id, correlation_id: job.correlation_id, causation_id: evidenceRecord.id }, () => this.engine.complete(job.mission_id, {
          result_summary: "Deterministic local capability completed successfully",
          metrics: { actions_executed: 1, duplicate_actions: 0 }, evidence_ids: [evidenceRecord.id],
          verified: true, completed_by: auth.user_id,
        }));
        outcome = completed.outcome;
        this.db.prepare("UPDATE outcomes SET job_id=?,payload=json_set(payload,'$.job_id',?) WHERE id=?")
          .run(job.id, job.id, outcome.id);
      }

      mission = requireMission(this.db, auth, job.mission_id);
      if (mission.status === "completed") {
        this.store.withContext({ organization_id: job.organization_id, actor: auth.user_id, correlation_id: job.correlation_id, causation_id: outcome && outcome.id || evidenceRecord.id }, () => this.engine.evaluate(job.mission_id, {
          success: true, lessons_learned: ["Durable execution completed with verified evidence"],
          improvements: [], capability_delta: { created: 1, protected: 1, improved: 0 }, evaluated_by: auth.user_id,
        }));
      }

      mission = requireMission(this.db, auth, job.mission_id);
      let capability = mission.learned_capability_id
        ? rowPayload(this.db.prepare("SELECT * FROM capabilities WHERE organization_id=? AND id=?").get(job.organization_id, mission.learned_capability_id))
        : null;
      if (mission.status === "evaluated") {
        const learned = this.store.withContext({ organization_id: job.organization_id, actor: auth.user_id, correlation_id: job.correlation_id, causation_id: outcome && outcome.id || evidenceRecord.id }, () => this.engine.learnCapability(job.mission_id, {
          title: `Learned: ${mission.title}`, description: "Verified deterministic local mission capability",
          inputs: ["mission_payload"], outputs: ["evidence", "outcome"], permissions_required: ["mission:execute"],
          tests: ["runtime-recovery"], cost_basis: { local: true }, risk_level: mission.risk_level,
          owned_by: job.organization_id, learned_by: auth.user_id, is_reusable: true,
        }));
        capability = learned.capability;
      }
      this.db.prepare(`INSERT OR IGNORE INTO learning_records(id,organization_id,mission_id,success,lessons_learned,
        improvements,capability_delta,created_at) VALUES(?,?,?,?,?,?,?,?)`).run(
        `learning_${sha256(job.id).slice(0, 24)}`, job.organization_id, job.mission_id, 1,
        JSON.stringify(["Durable execution completed with verified evidence"]), JSON.stringify([]),
        JSON.stringify({ created: 1, protected: 1, improved: 0 }), now(),
      );

      mission = requireMission(this.db, auth, job.mission_id);
      if (mission.status !== "learned") throw new RuntimeError("MISSION_CHECKPOINT_INCOMPLETE", `Mission stopped at ${mission.status}`, 500);
      outcome ||= rowPayload(this.db.prepare("SELECT * FROM outcomes WHERE organization_id=? AND mission_id=? ORDER BY completed_at DESC LIMIT 1")
        .get(job.organization_id, job.mission_id));
      const completedJob = this.queue.complete(job.id, this.workerId, {
        evidence_id: evidenceRecord.id,
        outcome_id: outcome && outcome.id,
        capability_id: capability && capability.id || mission.learned_capability_id,
        final_state: mission.status,
      });
      this.heartbeat(null);
      return completedJob;
    } catch (error) {
      this.logger.write("error", "worker.execution_failed", { worker_id: this.workerId, job_id: job.id, error: error.message });
      try { return this.queue.fail(job.id, this.workerId, error); }
      catch (leaseError) {
        this.logger.write("error", "worker.failure_persist_failed", { worker_id: this.workerId, job_id: job.id, error: leaseError.message });
        throw leaseError;
      }
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
      if (!this.stopping) {
        await new Promise((resolve) => {
          this.wake = resolve;
          this.timer = setTimeout(() => {
            this.timer = null;
            this.wake = null;
            resolve();
          }, this.pollMs);
        });
      }
    }
  }

  stop() {
    this.stopping = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (this.wake) {
      const wake = this.wake;
      this.wake = null;
      wake();
    }
    this.heartbeat(null);
  }
}

module.exports = { JobQueue, MissionWorker, backoff };
