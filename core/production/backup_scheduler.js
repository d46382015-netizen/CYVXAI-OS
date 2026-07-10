"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createBackup, pruneRemoteBackups } = require("./backup_manager");

class BackupScheduler {
  constructor(options = {}) {
    this.env = options.env || process.env;
    this.telemetry = options.telemetry || null;
    this.dataRoot = path.resolve(options.dataRoot || this.env.CYVX_DATA_ROOT || path.join(os.homedir(), ".cyvx"));
    this.enabled = options.enabled ?? truthy(this.env.CYVX_BACKUP_ENABLED);
    this.upload = options.upload ?? truthy(this.env.CYVX_BACKUP_UPLOAD || this.env.CYVX_BACKUP_ENABLED);
    this.intervalMs = positive(options.intervalMs || this.env.CYVX_BACKUP_INTERVAL_MS, 6 * 60 * 60 * 1000);
    this.initialDelayMs = positive(options.initialDelayMs || this.env.CYVX_BACKUP_INITIAL_DELAY_MS, 30_000);
    this.localRetention = positive(options.localRetention || this.env.CYVX_BACKUP_LOCAL_RETENTION, 8);
    this.statusFile = path.resolve(options.statusFile || this.env.CYVX_BACKUP_STATUS_FILE || path.join(this.dataRoot, "backup-status.json"));
    this.timer = null;
    this.running = false;
    this.state = this.#readState();
  }

  start() {
    if (!this.enabled || this.timer) return this;
    this.timer = setTimeout(() => this.#tick(), this.initialDelayMs);
    if (typeof this.timer.unref === "function") this.timer.unref();
    this.#log("info", "cyvx.backup.scheduler.started", { interval_ms: this.intervalMs, upload: this.upload });
    return this;
  }

  stop() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.#log("info", "cyvx.backup.scheduler.stopped");
  }

  async runNow(options = {}) {
    if (this.running) return { ok: false, skipped: true, reason: "backup_already_running" };
    this.running = true;
    const startedAt = Date.now();
    this.state.last_attempt_at = new Date().toISOString();
    this.state.running = true;
    this.#persistState();
    const span = this.telemetry && this.telemetry.startSpan("backup.create", { upload: options.upload ?? this.upload });
    try {
      const result = await createBackup({
        env: this.env,
        dataRoot: this.dataRoot,
        upload: options.upload ?? this.upload,
      });
      this.#pruneLocal();
      let remotePrune = null;
      if (result.uploaded && truthy(this.env.CYVX_BACKUP_PRUNE_REMOTE ?? "1")) {
        remotePrune = await pruneRemoteBackups({ env: this.env });
      }
      this.state = {
        ...this.state,
        running: false,
        consecutive_failures: 0,
        last_success_at: new Date().toISOString(),
        last_duration_ms: Date.now() - startedAt,
        last_backup: result,
        last_error: null,
        remote_prune: remotePrune,
      };
      this.#persistState();
      if (this.telemetry) {
        this.telemetry.increment("backup_success_total", 1);
        this.telemetry.gauge("backup_last_success_timestamp_seconds", Math.floor(Date.now() / 1000));
        this.telemetry.gauge("backup_last_size_bytes", result.backup_bytes);
      }
      this.#log("info", "cyvx.backup.completed", { ...result, duration_ms: this.state.last_duration_ms, remote_prune: remotePrune });
      if (span) span.end("ok", { files: result.files, bytes: result.backup_bytes, uploaded: result.uploaded });
      return { ...result, remote_prune: remotePrune };
    } catch (error) {
      this.state = {
        ...this.state,
        running: false,
        consecutive_failures: Number(this.state.consecutive_failures || 0) + 1,
        last_failure_at: new Date().toISOString(),
        last_duration_ms: Date.now() - startedAt,
        last_error: { code: error.code || "BACKUP_FAILED", message: error.message },
      };
      this.#persistState();
      if (this.telemetry) {
        this.telemetry.increment("backup_failures_total", 1);
        this.telemetry.captureError(error, { operation: "backup", data_root: this.dataRoot });
      }
      this.#log("error", "cyvx.backup.failed", { error: this.state.last_error, duration_ms: this.state.last_duration_ms });
      if (span) span.end("error", { error: error.code || error.message });
      throw error;
    } finally {
      this.running = false;
    }
  }

  snapshot() {
    const lastSuccess = Date.parse(this.state.last_success_at || 0);
    return {
      enabled: this.enabled,
      upload: this.upload,
      running: this.running,
      interval_ms: this.intervalMs,
      data_root: this.dataRoot,
      status_file: this.statusFile,
      last_success_at: this.state.last_success_at || null,
      last_failure_at: this.state.last_failure_at || null,
      last_attempt_at: this.state.last_attempt_at || null,
      last_duration_ms: this.state.last_duration_ms || null,
      last_backup: this.state.last_backup || null,
      last_error: this.state.last_error || null,
      consecutive_failures: Number(this.state.consecutive_failures || 0),
      age_seconds: lastSuccess ? Math.floor((Date.now() - lastSuccess) / 1000) : null,
    };
  }

  async #tick() {
    try { await this.runNow(); }
    catch {}
    finally {
      if (this.enabled) {
        this.timer = setTimeout(() => this.#tick(), this.intervalMs);
        if (typeof this.timer.unref === "function") this.timer.unref();
      }
    }
  }

  #pruneLocal() {
    const directory = path.join(this.dataRoot, "backups");
    if (!fs.existsSync(directory)) return;
    const backups = fs.readdirSync(directory)
      .filter((name) => name.endsWith(".cyvxbak"))
      .map((name) => ({ name, path: path.join(directory, name), mtime: fs.statSync(path.join(directory, name)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime);
    for (const backup of backups.slice(this.localRetention)) fs.rmSync(backup.path, { force: true });
  }

  #readState() {
    try { return JSON.parse(fs.readFileSync(this.statusFile, "utf8")); }
    catch { return { running: false, consecutive_failures: 0 }; }
  }

  #persistState() {
    fs.mkdirSync(path.dirname(this.statusFile), { recursive: true, mode: 0o700 });
    const temporary = `${this.statusFile}.${process.pid}.tmp`;
    fs.writeFileSync(temporary, `${JSON.stringify({ ...this.state, updated_at: new Date().toISOString() }, null, 2)}\n`, { mode: 0o600 });
    fs.renameSync(temporary, this.statusFile);
  }

  #log(level, event, fields = {}) {
    if (this.telemetry) return this.telemetry.log(level, event, fields);
    const line = JSON.stringify({ timestamp: new Date().toISOString(), level, event, ...fields });
    (level === "error" ? process.stderr : process.stdout).write(`${line}\n`);
  }
}

function positive(value, fallback) { const parsed = Number(value); return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback; }
function truthy(value) { return ["1", "true", "yes", "on"].includes(String(value || "").trim().toLowerCase()); }

module.exports = { BackupScheduler };
