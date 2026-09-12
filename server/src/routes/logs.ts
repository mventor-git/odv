import { Router } from 'express';
import type { DatabaseSync } from 'node:sqlite';
import { authRequired } from '../auth.ts';

export interface AppLogRow {
  id: number;
  actor: string;
  action: string;
  target: string;
  summary: string;
  created_at: string;
}

/** Record a write event on the activity log (The Wall feed). */
export function logEvent(
  db: DatabaseSync,
  actor: string,
  action: string,
  target: string,
  summary: string,
): void {
  db.prepare('INSERT INTO app_logs (actor, action, target, summary) VALUES (?, ?, ?, ?)').run(
    actor,
    action,
    target,
    summary,
  );
}

export function logsRouter(db: DatabaseSync): Router {
  const r = Router();
  r.use(authRequired);

  r.get('/', (req, res) => {
    const limit = Math.min(Number(req.query.limit ?? 50) || 50, 200);
    const rows = db
      .prepare('SELECT * FROM app_logs ORDER BY id DESC LIMIT ?')
      .all(limit) as unknown as AppLogRow[];
    const total = (db.prepare('SELECT COUNT(*) AS n FROM app_logs').get() as { n: number }).n;
    res.json({
      total,
      items: rows.map((row) => ({
        id: row.id,
        actor: row.actor,
        action: row.action,
        target: row.target,
        summary: row.summary,
        createdAt: row.created_at,
      })),
    });
  });

  return r;
}
