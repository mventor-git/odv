import 'dotenv/config';
import { fork } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig, validateConfig } from './config.ts';
import { openDb } from './db.ts';
import { createApp } from './app.ts';
import { runBackup } from './backup.ts';
import { ensureVaultDirs } from './file-resolver.ts';

const config = loadConfig();
validateConfig(config); // V5-001: fail fast if JWT_SECRET is insecure
ensureVaultDirs(config); // V5-002: create vault directory structure
const db = openDb(config);
const app = createApp(db, config);

// V5-013: artifact worker — spawn as forked child (stub, minimal)
function spawnWorker(): void {
  try {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const workerPath = path.join(here, 'worker.ts');
    // Only spawn if worker file exists and not in test (smoke uses temp DB)
    if (process.env.NODE_ENV === 'test') return;
    const child = fork(workerPath, [], { stdio: 'inherit' });
    child.on('exit', (code) => {
      if (code !== 0) {
        console.warn(`[odv] worker exited ${code} — restarting in 3s`);
        setTimeout(spawnWorker, 3000);
      }
    });
    // Recover stale jobs
    try { db.prepare("UPDATE artifact_jobs SET status = 'queued' WHERE status = 'running'").run(); } catch {}
    console.log('[odv] artifact worker spawned');
  } catch (err) {
    console.warn('[odv] worker spawn skipped:', err instanceof Error ? err.message : String(err));
  }
}
spawnWorker();

// Daily backups (ticket 085): run once at boot, then every 24h. Async
// (ticket 124) so the boot backup never blocks the server from starting.
void runBackup(db, config).then((boot) => {
  console.log(`[odv] Backup at boot -> ${boot.dir}`);
}).catch((err) => {
  console.error('[odv] Boot backup failed:', err);
});
setInterval(() => {
  void runBackup(db, config).then((b) => {
    console.log(`[odv] Daily backup -> ${b.dir}`);
  }).catch((err) => {
    console.error('[odv] Daily backup failed:', err);
  });
}, 24 * 60 * 60 * 1000);

app.listen(config.port, () => {
  console.log(`[odv] odv server running on http://localhost:${config.port}`);
  console.log(`[odv] Data dir: ${config.dataDir}`);
  console.log(`[odv] Files dir: ${config.filesDir}`);
});