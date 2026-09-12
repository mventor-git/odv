import { Router } from 'express';
import type { DatabaseSync } from 'node:sqlite';
import { authRequired } from '../auth.ts';
import { toApi } from './records.ts';

/**
 * Global Arabic smart search (ticket 084, ticket 007 slice 1) — rank-ordered
 * FTS5 trigram matches over request records. One search box across all logs
 * (requests first; concrete/cement/labor join as those modules land).
 */

interface RecordSearchRow {
  id: number;
  rank: number;
}

export function searchRouter(db: DatabaseSync): Router {
  const r = Router();
  r.use(authRequired);

  /** GET /api/search?q= — top 50 record matches by FTS rank. */
  r.get('/', (req, res) => {
    const q = String(req.query.q ?? '').trim();
    if (!q) {
      res.json({ items: [], total: 0 });
      return;
    }
    if (q.length < 3) {
      // Short queries: LIKE fallback (see /api/records q filter).
      const like = `%${q}%`;
      const rows = db
        .prepare(
          `SELECT r.* FROM records r
           WHERE r.deleted_at = '' AND
             (r.request_no LIKE ? OR r.revision_no LIKE ? OR r.description LIKE ? OR r.hyperlink LIKE ? OR r.engineer LIKE ?)
           ORDER BY r.category, r.id DESC
           LIMIT 50`,
        )
        .all(like, like, like, like, like) as unknown as Array<Record<string, unknown>>;
      res.json({ items: rows.map((row) => toApi(row as never)), total: rows.length });
      return;
    }
    const phrase = q.replace(/"/g, '""');
    const rows = db
      .prepare(
        `SELECT r.*, f.rank AS _rank
         FROM records r
         JOIN records_fts f ON f.rowid = r.id
         WHERE r.deleted_at = '' AND records_fts MATCH ?
         ORDER BY f.rank
         LIMIT 50`,
      )
      .all(`"${phrase}"`) as unknown as Array<Record<string, unknown>>;
    res.json({ items: rows.map((row) => toApi(row as never)), total: rows.length });
  });

  return r;
}