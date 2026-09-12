import { Router } from 'express';
import path from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { adminRequired, authRequired } from '../auth.ts';
import type { Config } from '../config.ts';
import { listSources, openLegacyDb, queryRows } from '../legacy/db.ts';
import { runSweep } from '../legacy/sweep.ts';

export function legacyRouter(_db: DatabaseSync, config: Config): Router {
  const r = Router();
  r.use(authRequired);

  const open = () => openLegacyDb(path.join(config.dataDir, 'legacy.db'));

  r.get('/', (_req, res) => {
    try {
      const ldb = open();
      res.json(listSources(ldb));
      ldb.close();
    } catch {
      res.json([]);
    }
  });

  r.get('/:key', (req, res) => {
    const q = String(req.query.q ?? '').trim();
    const limit = Math.min(Number(req.query.limit ?? 50) || 50, 200);
    const offset = Math.max(Number(req.query.offset ?? 0) || 0, 0);
    try {
      const ldb = open();
      const known = listSources(ldb).some((s) => s.key === req.params.key);
      if (!known) {
        ldb.close();
        res.status(404).json({ error: 'Unknown legacy source' });
        return;
      }
      const result = queryRows(ldb, req.params.key, q, limit, offset);
      ldb.close();
      res.json(result);
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
    }
  });

  r.post('/sweep', adminRequired, async (_req, res) => {
    const summary = await runSweep(config);
    res.json({ ok: true, summary });
  });

  return r;
}
