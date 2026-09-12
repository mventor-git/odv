import { Router } from 'express';
import type { DatabaseSync } from 'node:sqlite';
import { authRequired, adminRequired } from '../auth.ts';
import path from 'node:path';
import fs from 'node:fs';

export function laborRouter(db: DatabaseSync): Router {
  const r = Router();
  r.use(authRequired);

  r.get('/workers', (req, res) => {
    const active = req.query.active;
    const rows = active !== undefined
      ? db.prepare('SELECT * FROM labor_workers WHERE active = ? ORDER BY name').all(active === '1' ? 1 : 0)
      : db.prepare('SELECT * FROM labor_workers ORDER BY name').all();
    res.json(rows);
  });

  r.get('/entries', (req, res) => {
    const q = req.query as Record<string, string | undefined>;
    let where = '1=1'; const params: unknown[] = [];
    if (q.date) { where += ' AND work_date = ?'; params.push(q.date); }
    if (q.zone) { where += ' AND zone = ?'; params.push(q.zone); }
    if (q.worker) { where += ' AND worker_id = ?'; params.push(Number(q.worker)); }
    const rows = db.prepare(`SELECT * FROM labor_entries WHERE ${where} ORDER BY work_date DESC LIMIT 100`).all(...(params as any));
    res.json(rows);
  });

  r.get('/dashboard', (_req, res) => {
    const total = (db.prepare('SELECT COUNT(*) AS n FROM labor_entries').get() as { n: number }).n;
    const byDate = db.prepare("SELECT work_date AS date, COUNT(*) AS n, COALESCE(SUM(hours),0) AS hours FROM labor_entries GROUP BY work_date ORDER BY work_date DESC LIMIT 7").all();
    res.json({ total, byDate });
  });

  r.get('/import/status', (_req, res) => {
    const row = db.prepare('SELECT * FROM labor_imports ORDER BY id DESC LIMIT 1').get() as any;
    res.json(row ?? { imported_at: null, row_count: 0 });
  });

  r.post('/import', adminRequired, (req, res) => {
    const source = String((req.body as any)?.sourcePath ?? '');
    // Scaffold: record import attempt, don't actually read external DB yet
    const info = db.prepare('INSERT INTO labor_imports (source_path, row_count) VALUES (?, ?)').run(source || 'manual', 0);
    res.json({ ok: true, id: Number(info.lastInsertRowid) });
  });

  return r;
}
