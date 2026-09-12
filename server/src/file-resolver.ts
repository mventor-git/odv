import fs from 'node:fs';
import path from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import type { Config } from './config.ts';

export type ResolveResult =
  | { ok: true; target: string; type: 'artifact' | 'legacy' | 'url' }
  | { ok: false; error: string; status: number };

/**
 * Build the list of directories where absolute-path file lookups are allowed.
 * V5-001 restricted this to prevent arbitrary file reads.
 */
export function buildAllowList(config: Config): string[] {
  return [
    path.resolve(config.filesDir),
    path.resolve(config.dataDir),
  ];
}

/**
 * V5-002: Unified file resolver. Attempts resolution in this order:
 *
 * 1. HTTP URL — pass through (existing behavior).
 * 2. Numeric ID — check the artifacts table first (v5 artifact lookup).
 * 3. Legacy hyperlink — resolve against allowlisted directories (existing behavior).
 *
 * The artifacts table lookup enables the v5 template engine to register
 * generated files (fyler PDFs, reports, checklists) with stable IDs that
 * the client can reference without knowing filesystem paths.
 */
export function resolveFile(
  db: DatabaseSync,
  config: Config,
  identifier: string | number,
): ResolveResult {
  const id = typeof identifier === 'string' ? identifier.trim() : String(identifier);

  // 1. HTTP URL passthrough
  if (/^https?:\/\//i.test(id)) {
    return { ok: true, target: id, type: 'url' };
  }

  // 2. Numeric artifact ID lookup (v5)
  const numericId = Number(id);
  if (!isNaN(numericId) && numericId > 0 && String(numericId) === id) {
    const artifact = db.prepare(
      'SELECT file_path FROM artifacts WHERE id = ?',
    ).get(numericId) as { file_path: string } | undefined;

    if (artifact && artifact.file_path) {
      const resolved = path.resolve(artifact.file_path);
      if (fs.existsSync(resolved) && fs.statSync(resolved).isFile()) {
        return { ok: true, target: resolved, type: 'artifact' };
      }
      return { ok: false, error: 'Artifact file missing from disk', status: 404 };
    }
    // Not an artifact — fall through to legacy resolution
  }

  // 3. Legacy hyperlink resolution (existing behavior)
  let filePath: string;
  if (path.isAbsolute(id)) {
    filePath = path.resolve(id);
    // V5-001: restrict absolute paths to allowlisted directories
    const allowed = buildAllowList(config);
    const isAllowed = allowed.some((base) =>
      filePath.startsWith(base + path.sep) || filePath === base,
    );
    if (!isAllowed) {
      return { ok: false, error: 'Access denied: file path not in allowed directory', status: 403 };
    }
  } else {
    const base = path.resolve(config.filesDir);
    filePath = path.resolve(base, id);
    // Prevent traversal outside the files dir for bare filenames
    if (!filePath.startsWith(base + path.sep)) {
      return { ok: false, error: 'Invalid file path', status: 400 };
    }
  }

  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    return { ok: false, error: 'File not found', status: 404 };
  }

  return { ok: true, target: filePath, type: 'legacy' };
}

/**
 * V5-002: Register an artifact in the database.
 * Returns the artifact ID for future lookups.
 */
export function registerArtifact(
  db: DatabaseSync,
  opts: {
    artifactType: string;
    recordId?: number;
    category?: string;
    filePath: string;
    sha256?: string;
    mimeType?: string;
    sizeBytes?: number;
    createdBy?: number;
    metadata?: Record<string, unknown>;
  },
): number {
  const result = db.prepare(`
    INSERT INTO artifacts (artifact_type, record_id, category, file_path, file_sha256, mime_type, size_bytes, created_by, metadata_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    opts.artifactType,
    opts.recordId ?? null,
    opts.category ?? '',
    opts.filePath,
    opts.sha256 ?? '',
    opts.mimeType ?? 'application/pdf',
    opts.sizeBytes ?? 0,
    opts.createdBy ?? null,
    JSON.stringify(opts.metadata ?? {}),
  );
  return Number(result.lastInsertRowid);
}

/**
 * V5-002: Ensure the vault directory structure exists.
 */
export function ensureVaultDirs(config: Config): void {
  const dirs = [
    config.vaultDir,
    path.join(config.vaultDir, 'templates'),
    path.join(config.vaultDir, 'artifacts'),
    path.join(config.vaultDir, 'attachments'),
    path.join(config.vaultDir, 'reports'),
    path.join(config.vaultDir, 'imports'),
  ];
  for (const dir of dirs) {
    fs.mkdirSync(dir, { recursive: true });
  }
}
