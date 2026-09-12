import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { openDb } from './db.ts';
import { loadConfig } from './config.ts';

// Artifact worker — polls artifact_jobs (queued), runs PowerShell Excel COM, updates status.
// Simple single-machine polling (2s). IPC heartbeat to parent.
const config = loadConfig(process.env);
const db = openDb(config);

function heartbeat() {
  if (process.send) process.send({ type: 'heartbeat' });
}
setInterval(heartbeat, 30000);

async function runJob(job: any): Promise<void> {
  db.prepare("UPDATE artifact_jobs SET status = 'running', started_at = datetime('now'), worker_heartbeat = datetime('now') WHERE id = ?").run(job.id);
  if (process.send) process.send({ type: 'jobStart', jobId: job.id });
  try {
    // Scaffold: create placeholder _plan.json and fake PDF
    const plan = { category: job.category, record_id: job.record_id, template: job.template_version_id, mapping: job.mapping_version_id };
    const vaultDir = path.join(config.vaultDir, 'artifacts', job.category ?? 'IR');
    fs.mkdirSync(vaultDir, { recursive: true });
    const planPath = path.join(vaultDir, `job-${job.id}-plan.json`);
    fs.writeFileSync(planPath, JSON.stringify(plan, null, 2), 'utf8');
    // In real V5-013, spawn powershell.exe _fill.ps1 here with 300s timeout
    // Scaffold: mark succeeded immediately
    const outPath = path.join(vaultDir, `job-${job.id}.pdf`);
    fs.writeFileSync(outPath, `%PDF-1.4 scaffold for job ${job.id}\n`, 'utf8');
    const stat = fs.statSync(outPath);
    db.prepare("UPDATE artifact_jobs SET status = 'succeeded', file_path = ?, finished_at = datetime('now') WHERE id = ?").run(outPath, job.id);
    db.prepare('INSERT INTO artifacts (artifact_type, record_id, category, file_path, mime_type, size_bytes) VALUES (?, ?, ?, ?, ?, ?)').run('fyler', job.record_id, job.category, outPath, 'application/pdf', stat.size);
    if (process.send) process.send({ type: 'jobComplete', jobId: job.id, status: 'succeeded' });
  } catch (err: any) {
    db.prepare("UPDATE artifact_jobs SET status = 'failed', error_message = ?, finished_at = datetime('now') WHERE id = ?").run(String(err?.message ?? err), job.id);
    if (process.send) process.send({ type: 'jobComplete', jobId: job.id, status: 'failed' });
  }
}

async function poll(): Promise<void> {
  // Recover stale running jobs (>5min without heartbeat) — requeue
  try {
    db.prepare("UPDATE artifact_jobs SET status = 'queued' WHERE status = 'running' AND started_at < datetime('now', '-5 minutes')").run();
  } catch {}
  const job = db.prepare("SELECT * FROM artifact_jobs WHERE status = 'queued' ORDER BY id LIMIT 1").get() as any;
  if (job) await runJob(job);
}

setInterval(() => { poll().catch(console.error); }, 2000);
console.log('[worker] artifact worker started — polling every 2s');

process.on('message', (msg: any) => {
  if (msg?.type === 'ping' && process.send) process.send({ type: 'heartbeat' });
  if (msg?.type === 'cancel') {
    db.prepare("UPDATE artifact_jobs SET status = 'cancelled' WHERE id = ? AND status = 'queued'").run(Number(msg.jobId));
  }
});
