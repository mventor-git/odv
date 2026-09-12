import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import type { DatabaseSync } from 'node:sqlite';
import type { Config } from '../config.ts';
import { adminRequired, authRequired } from '../auth.ts';
import type { RecordRow } from './records.ts';
import { resolveFile } from '../file-resolver.ts';

/**
 * Authenticated file endpoints.
 * - GET /:id          → stream the file inline (PDFs render in the browser).
 *   V5-002: accepts artifact IDs (numeric) in addition to record IDs.
 * - GET /:id/open     → admin: open the file in the PC's default app (server machine).
 */
export function filesRouter(db: DatabaseSync, config: Config): Router {
  const r = Router();
  r.use(authRequired);

  r.get('/:id', (req, res) => {
    const idParam = req.params.id;

    // V5-002: try artifact lookup first (numeric ID)
    const numericId = Number(idParam);
    if (!isNaN(numericId) && numericId > 0 && String(numericId) === idParam) {
      const artifact = db.prepare(
        'SELECT file_path FROM artifacts WHERE id = ?',
      ).get(numericId) as { file_path: string } | undefined;

      if (artifact) {
        const resolved = resolveFile(db, config, idParam);
        if (!resolved.ok) {
          res.status(resolved.status).json({ error: resolved.error });
          return;
        }
        if (resolved.type === 'url') {
          res.redirect(302, resolved.target);
          return;
        }
        res.setHeader('Content-Disposition', `inline; filename="${path.basename(resolved.target)}"`);
        res.sendFile(resolved.target);
        return;
      }
    }

    // Legacy: resolve from record's hyperlink field
    const row = db.prepare('SELECT * FROM records WHERE id = ?').get(Number(idParam)) as
      | RecordRow
      | undefined;
    if (!row) {
      res.status(404).json({ error: 'Record not found' });
      return;
    }
    const link = (row.hyperlink || '').trim();
    if (!link) {
      res.status(404).json({ error: 'No hyperlink on this record' });
      return;
    }
    const resolved = resolveFile(db, config, link);
    if (!resolved.ok) {
      res.status(resolved.status).json({ error: resolved.error });
      return;
    }
    if (resolved.type === 'url') {
      res.redirect(302, resolved.target);
      return;
    }
    res.setHeader('Content-Disposition', `inline; filename="${path.basename(resolved.target)}"`);
    res.sendFile(resolved.target);
  });

  /** Open the file in the PC's default application (Windows `start`). Admin only. */
  r.get('/:id/open', adminRequired, (req, res) => {
    const idParam = req.params.id;

    // V5-002: artifact lookup
    const numericId = Number(idParam);
    if (!isNaN(numericId) && numericId > 0 && String(numericId) === idParam) {
      const artifact = db.prepare(
        'SELECT file_path FROM artifacts WHERE id = ?',
      ).get(numericId) as { file_path: string } | undefined;

      if (artifact) {
        const resolved = resolveFile(db, config, idParam);
        if (!resolved.ok) {
          res.status(resolved.status).json({ error: resolved.error });
          return;
        }
        if (resolved.type !== 'url') {
          spawn('cmd', ['/c', 'start', '', resolved.target], { windowsHide: true });
        }
        res.json({ ok: true });
        return;
      }
    }

    // Legacy: resolve from record
    const row = db.prepare('SELECT * FROM records WHERE id = ?').get(Number(idParam)) as
      | RecordRow
      | undefined;
    if (!row) {
      res.status(404).json({ error: 'Record not found' });
      return;
    }
    const link = (row.hyperlink || '').trim();
    if (!link) {
      res.status(404).json({ error: 'No hyperlink on this record' });
      return;
    }
    const resolved = resolveFile(db, config, link);
    if (!resolved.ok) {
      res.status(resolved.status).json({ error: resolved.error });
      return;
    }
    if (resolved.type !== 'url') {
      spawn('cmd', ['/c', 'start', '', resolved.target], { windowsHide: true });
    }
    res.json({ ok: true });
  });

  return r;
}