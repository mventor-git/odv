import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import type { DatabaseSync, SQLInputValue } from 'node:sqlite';
import { adminRequired, authRequired } from '../auth.ts';
import { logEvent } from './logs.ts';
import { padRev, toApi, type RecordRow } from './records.ts';
import type { Config } from '../config.ts';

/** Trash (soft-deleted records) — list, restore, permanent delete (ticket 031). */
export function trashRouter(db: DatabaseSync, config: Config): Router {
  const r = Router();
  r.use(authRequired);

  /** Write a precise purge metadata file into data/purged-logs/ (v3 item 25). */
  const writePurgeMetadata = (row: RecordRow, purgedBy: string): string => {
    const dir = path.join(config.dataDir, 'purged-logs');
    fs.mkdirSync(dir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const file = path.join(
      dir,
      `purged-${row.category}-${row.request_no}-${row.revision_no || '00'}-${stamp}.md`,
    );
    const lines = [
      '# Purged Record Metadata',
      '',
      `- Purged by: ${purgedBy}`,
      `- Purged at: ${new Date().toISOString()}`,
      `- Deleted at: ${row.deleted_at || 'unknown'}`,
      `- Record id: ${row.id}`,
      '',
      '## Record',
      '',
      `- Category: ${row.category}`,
      `- Request No.: ${row.request_no}`,
      `- Revision No.: ${row.revision_no || '00'}`,
      `- Status: ${row.status}`,
      `- Zone: ${row.zone || '—'}`,
      `- Floor: ${row.floor || '—'}`,
      `- Fork: ${row.fork || '—'}`,
      `- Engineer: ${row.engineer || '—'}`,
      `- Sent Date: ${row.sent_date || '—'}`,
      `- Sent by Consultant Date: ${row.sent_by_consultant_date || '—'}`,
      `- Reply Date: ${row.reply_date || '—'}`,
      `- Reply by Contractor Date: ${row.reply_by_contractor_date || '—'}`,
      `- Hyperlink: ${row.hyperlink || '—'}`,
      `- Data Hyperlink: ${row.data_hyperlink || '—'}`,
      `- Description: ${row.description || '—'}`,
      '',
    ];
    fs.writeFileSync(file, lines.join('\n'), 'utf8');
    return file;
  };

  r.get('/', (req, res) => {
    const q = String(req.query.q ?? '');
    const limit = Math.min(Number(req.query.limit ?? 100) || 100, 500);
    const offset = Math.max(Number(req.query.offset ?? 0) || 0, 0);
    const where: string[] = ["deleted_at != ''"];
    const params: SQLInputValue[] = [];
    if (q) {
      where.push('(request_no LIKE ? OR revision_no LIKE ? OR description LIKE ? OR category LIKE ?)');
      const like = `%${q}%`;
      params.push(like, like, like, like);
    }
    const whereSql = `WHERE ${where.join(' AND ')}`;
    const total = (
      db.prepare(`SELECT COUNT(*) AS n FROM records ${whereSql}`).get(...params) as { n: number }
    ).n;
    const rows = db
      .prepare(
        `SELECT * FROM records ${whereSql} ORDER BY deleted_at DESC, id DESC LIMIT ? OFFSET ?`,
      )
      .all(...params, limit, offset) as unknown as RecordRow[];
    res.json({ total, items: rows.map(toApi) });
  });

  r.post('/:id/restore', adminRequired, (req, res) => {
    const id = Number(req.params.id);
    const row = db
      .prepare("SELECT * FROM records WHERE id = ? AND deleted_at != ''")
      .get(id) as unknown as RecordRow | undefined;
    if (!row) {
      res.status(404).json({ error: 'Trashed record not found' });
      return;
    }
    // Ticket 101: uniqueness now applies to active rows only — restoring is
    // blocked while another ACTIVE record holds the same category+no.+revision.
    const dup = db
      .prepare(
        "SELECT 1 FROM records WHERE category = ? AND request_no = ? AND revision_no = ? AND deleted_at = '' AND id != ?",
      )
      .get(row.category, row.request_no, row.revision_no, id);
    if (dup) {
      res.status(409).json({
        error: 'Cannot restore — an active record with this category + request no. + revision no. already exists',
      });
      return;
    }
    db.prepare("UPDATE records SET deleted_at = '' WHERE id = ? AND deleted_at != ''").run(id);
    logEvent(
      db,
      req.user!.username,
      'restore',
      `${row.category} ${row.request_no}`,
      `Restored ${row.category} ${row.request_no}${row.revision_no ? ' rev ' + padRev(row.revision_no) : ''}`,
    );
    res.json({ ok: true });
  });

  r.delete('/:id', adminRequired, (req, res) => {
    const id = Number(req.params.id);
    const row = db
      .prepare("SELECT * FROM records WHERE id = ? AND deleted_at != ''")
      .get(id) as unknown as RecordRow | undefined;
    if (!row) {
      res.status(404).json({ error: 'Trashed record not found' });
      return;
    }
    db.prepare('DELETE FROM records WHERE id = ?').run(id);
    const file = writePurgeMetadata(row, req.user!.username);
    logEvent(
      db,
      req.user!.username,
      'purge',
      `${row.category} ${row.request_no}`,
      `Purged ${row.category} ${row.request_no}${row.revision_no ? ' rev ' + padRev(row.revision_no) : ''}`,
    );
    res.json({ ok: true, metadataFile: file });
  });

  return r;
}