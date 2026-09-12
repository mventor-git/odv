import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

/** Project root = odv repo root */
export const PROJECT_ROOT = path.resolve(here, '..', '..');

const DEV_SECRET = 'odv-dev-secret-change-me';

export interface Config {
  port: number;
  jwtSecret: string;
  tokenTtl: string;
  dataDir: string;
  filesDir: string;
  adminPassword: string;
  monolithRoot: string;
  laborRoot: string;
  /** Scan watch folder — scans land here (ticket 067). */
  scansDir: string;
  /** Application-controlled vault storage root (v5). */
  vaultDir: string;
  /** Dedicated temp/work directory for fyler temp + test outputs (ticket 133).
   *  Kept separate from the app data so transient files stay out of the way. */
  workDir: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  let jwtSecret = env.JWT_SECRET ?? '';
  if (!jwtSecret || jwtSecret === DEV_SECRET) {
    // Auto-generate a strong secret and persist it to server/.env so it survives
    // restarts. Ticket 128: stop relying on the dev fallback.
    jwtSecret = randomBytes(48).toString('hex');
    try {
      const envPath = path.resolve(here, '..', '.env');
      const existing = fs.readFileSync(envPath, 'utf8');
      // Only a NON-commented JWT_SECRET assignment counts as "already set".
      const activeLines = existing.split('\n').filter((l) => !l.trim().startsWith('#')).join('\n');
      if (!activeLines.includes('JWT_SECRET=')) {
        fs.appendFileSync(envPath, `\nJWT_SECRET=${jwtSecret}\n`);
        console.warn('[odv] JWT_SECRET auto-generated and saved to server/.env');
        console.warn('[odv] Change it to a permanent value in production.');
      }
    } catch {
      // .env not writable — keep the in-memory secret for this session only.
      console.warn('[odv] Could not write JWT_SECRET to .env — using ephemeral secret.');
    }
  }
  return {
    port: Number(env.PORT ?? 8050),
    jwtSecret,
    tokenTtl: env.JWT_TTL ?? '12h',
    dataDir: env.DATA_DIR ?? path.join(PROJECT_ROOT, 'data'),
    // Phase 4 (ticket 133): PDFs live inside the project's OWN data dir, not the
    // external monolith. import:pdfs copies them here (data/pdfs).
    filesDir: env.FILES_DIR ?? path.join(env.DATA_DIR ?? path.join(PROJECT_ROOT, 'data'), 'pdfs'),
    adminPassword: env.ADMIN_PASSWORD ?? '',
    // Read-only dependencies: configurable roots (neutral defaults, no hardcoded site paths).
    monolithRoot: env.MONOLITH_ROOT ?? path.join(PROJECT_ROOT, 'data', 'legacy'),
    laborRoot: env.LABOR_ROOT ?? path.join(PROJECT_ROOT, 'data', 'legacy-labor'),
    scansDir: env.SCANS_DIR ?? path.join(PROJECT_ROOT, 'data', 'scans-watch'),
    vaultDir: env.VAULT_DIR ?? path.join(env.DATA_DIR ?? path.join(PROJECT_ROOT, 'data'), 'vault'),
    workDir: env.WORK_DIR ?? path.join(env.DATA_DIR ?? path.join(PROJECT_ROOT, 'data'), 'work'),
  };
}

/**
 * Validate that JWT_SECRET is set to a real secret (never the insecure dev
 * fallback). Ticket 128: loadConfig() now auto-generates a strong secret and
 * persists it to server/.env, so a missing secret can no longer slip through.
 * This guard is retained as a safety net for explicitly-forged configs.
 */
export function validateConfig(config: Config): void {
  if (!config.jwtSecret || config.jwtSecret === DEV_SECRET || config.jwtSecret.length < 32) {
    console.error('[odv] FATAL: JWT_SECRET is missing or too short.');
    console.error('[odv] Set JWT_SECRET in server/.env to a long random string (>=32 chars).');
    process.exit(1);
  }
}
