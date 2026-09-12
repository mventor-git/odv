import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import type { DatabaseSync } from 'node:sqlite';
import type { Config } from './config.ts';

const readdir = promisify(fs.readdir);
const mkdir = promisify(fs.mkdir);
const copyFile = promisify(fs.copyFile);
const rm = promisify(fs.rm);
const stat = promisify(fs.stat);
const writeFile = promisify(fs.writeFile);

/**
 * Daily backups (ticket 085, ticket 007 slice 2) — copy the live DBs + a
 * config snapshot into data/backups/<YYYY-MM-DD>/, keep the newest 14.
 * Async (fs.promises) so it never blocks the event loop (ticket 124).
 */

const RETENTION_DAYS = 14;

function today(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

/** Copy odv.db after a WAL checkpoint, plus legacy.db (if present). */
export async function runBackup(db: DatabaseSync, config: Config): Promise<{ dir: string; files: string[]; sizeBytes: number }> {
  const backupsRoot = path.join(config.dataDir, 'backups');
  const dir = path.join(backupsRoot, today());
  await mkdir(dir, { recursive: true });

  // Checkpoint the live DB so the copy contains the latest WAL data.
  try {
    db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
  } catch {
    // WAL may be off (tests) — ignore.
  }

  const files: string[] = [];
  let sizeBytes = 0;

  const copyIfExists = async (name: string): Promise<void> => {
    const src = path.join(config.dataDir, name);
    if (!fs.existsSync(src)) return;
    const dest = path.join(dir, name);
    await copyFile(src, dest);
    const st = await stat(dest);
    sizeBytes += st.size;
    files.push(name);
  };

  await copyIfExists('odv.db');
  await copyIfExists('legacy.db');
  // Config snapshot — what the server actually booted with (no secrets that
  // are not already on this machine; the JWT secret IS included because the
  // backup is local).
  const manifest = {
    date: today(),
    createdAt: new Date().toISOString(),
    files: [...files],
    sizeBytes,
    port: config.port,
    dataDir: config.dataDir,
    filesDir: config.filesDir,
    retentionDays: RETENTION_DAYS,
  };
  const manifestPath = path.join(dir, 'manifest.json');
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
  files.push('manifest.json');
  sizeBytes += (await stat(manifestPath)).size;

  await pruneBackups(config, RETENTION_DAYS);
  return { dir, files, sizeBytes };
}

/** Keep only the newest N backup directories (sorted by name = date). */
export async function pruneBackups(config: Config, keep = RETENTION_DAYS): Promise<string[]> {
  const backupsRoot = path.join(config.dataDir, 'backups');
  if (!fs.existsSync(backupsRoot)) return [];
  const entries = await readdir(backupsRoot, { withFileTypes: true });
  const dirs = entries
    .filter((e) => e.isDirectory() && /^\d{4}-\d{2}-\d{2}$/.test(e.name))
    .map((e) => e.name)
    .sort()
    .reverse();
  const removed: string[] = [];
  for (const d of dirs.slice(keep)) {
    await rm(path.join(backupsRoot, d), { recursive: true, force: true });
    removed.push(d);
  }
  return removed;
}

/** Last backup info for the Settings card/API. */
export function lastBackupInfo(config: Config): { date: string | null; hasManifest: boolean; count: number } {
  const backupsRoot = path.join(config.dataDir, 'backups');
  if (!fs.existsSync(backupsRoot)) return { date: null, hasManifest: false, count: 0 };
  const dirs = fs
    .readdirSync(backupsRoot, { withFileTypes: true })
    .filter((e) => e.isDirectory() && /^\d{4}-\d{2}-\d{2}$/.test(e.name))
    .map((e) => e.name)
    .sort()
    .reverse();
  if (dirs.length === 0) return { date: null, hasManifest: false, count: 0 };
  const latest = dirs[0];
  return {
    date: latest,
    hasManifest: fs.existsSync(path.join(backupsRoot, latest, 'manifest.json')),
    count: dirs.length,
  };
}