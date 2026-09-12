import { Router } from 'express';
import type { DatabaseSync } from 'node:sqlite';
import { adminRequired, authRequired } from '../auth.ts';

/** Clusters = projects (ticket 131). A cluster owns its project metadata and a
 *  tree of zones + floors. Writes are admin-only; reads require auth. */

interface ClusterRow {
  code: string;
  name: string;
  project_name: string;
  project_name_ar: string;
  working_area: string;
  consultant: string;
  owner: string;
  owner_delegate: string;
  logo_ext: string;
  custom_metadata: string;
  is_default: number;
}

function parseMeta(raw: string): unknown {
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export function clustersRouter(db: DatabaseSync): Router {
  const r = Router();
  r.use(authRequired);

  const clusterTree = (code: string) => {
    const zones = db
      .prepare('SELECT code, name, name_ar AS nameAr, cluster FROM zones WHERE cluster = ? ORDER BY code')
      .all(code);
    const floors = db
      .prepare('SELECT name, name_ar AS nameAr, cluster FROM floors WHERE cluster = ? ORDER BY name')
      .all(code);
    const recordCount = (
      db
        .prepare("SELECT COUNT(*) AS n FROM records WHERE deleted_at = '' AND zone IN (SELECT code FROM zones WHERE cluster = ?)")
        .get(code) as { n: number }
    ).n;
    return { zones, floors, recordCount };
  };

  const payload = (row: ClusterRow) => ({
    ...row,
    custom_metadata: parseMeta(row.custom_metadata),
    ...clusterTree(row.code),
  });

  // GET /api/clusters — list with zones + floors tree.
  r.get('/', (_req, res) => {
    const rows = db
      .prepare('SELECT * FROM clusters ORDER BY is_default DESC, name')
      .all() as unknown as ClusterRow[];
    res.json({ clusters: rows.map(payload) });
  });

  // GET /api/clusters/:code — one cluster with its tree.
  r.get('/:code', (req, res) => {
    const row = db.prepare('SELECT * FROM clusters WHERE code = ?').get(String(req.params.code)) as ClusterRow | undefined;
    if (!row) {
      res.status(404).json({ error: 'Cluster not found' });
      return;
    }
    res.json({ cluster: payload(row) });
  });

  // POST /api/clusters — create (admin).
  r.post('/', adminRequired, (req, res) => {
    const code = String(req.body?.code ?? '').trim();
    if (!code) {
      res.status(400).json({ error: 'code is required' });
      return;
    }
    if (!/^[A-Za-z0-9_-]+$/.test(code)) {
      res.status(400).json({ error: 'code may contain only letters, digits, dash, underscore' });
      return;
    }
    if (db.prepare('SELECT 1 AS x FROM clusters WHERE code = ?').get(code)) {
      res.status(409).json({ error: 'A cluster with this code already exists' });
      return;
    }
    const b = req.body ?? {};
    db.prepare(
      `INSERT INTO clusters (code, name, project_name, project_name_ar, working_area, consultant, owner, owner_delegate, logo_ext, custom_metadata, is_default)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
    ).run(
      code,
      String(b.name ?? ''),
      String(b.projectName ?? ''),
      String(b.projectNameAr ?? ''),
      String(b.workingArea ?? ''),
      String(b.consultant ?? ''),
      String(b.owner ?? ''),
      String(b.ownerDelegate ?? ''),
      String(b.logoExt ?? ''),
      JSON.stringify(Array.isArray(b.customMetadata) ? b.customMetadata : []),
    );
    res.status(201).json({ ok: true });
  });

  // PATCH /api/clusters/:code — update metadata (admin).
  r.patch('/:code', adminRequired, (req, res) => {
    const row = db.prepare('SELECT * FROM clusters WHERE code = ?').get(String(req.params.code)) as ClusterRow | undefined;
    if (!row) {
      res.status(404).json({ error: 'Cluster not found' });
      return;
    }
    const b = req.body ?? {};
    const next = { ...row };
    const map: Record<string, keyof ClusterRow> = {
      name: 'name',
      projectName: 'project_name',
      projectNameAr: 'project_name_ar',
      workingArea: 'working_area',
      consultant: 'consultant',
      owner: 'owner',
      ownerDelegate: 'owner_delegate',
      logoExt: 'logo_ext',
    };
    for (const [field, col] of Object.entries(map)) {
      if (field in b) (next as Record<string, unknown>)[col] = String(b[field] ?? '');
    }
    if ('customMetadata' in b) next.custom_metadata = JSON.stringify(Array.isArray(b.customMetadata) ? b.customMetadata : []);
    db.prepare(
      `UPDATE clusters SET name=?, project_name=?, project_name_ar=?, working_area=?, consultant=?, owner=?, owner_delegate=?, logo_ext=?, custom_metadata=? WHERE code=?`,
    ).run(
      next.name,
      next.project_name,
      next.project_name_ar,
      next.working_area,
      next.consultant,
      next.owner,
      next.owner_delegate,
      next.logo_ext,
      next.custom_metadata,
      String(req.params.code),
    );
    res.json({ ok: true });
  });

  // DELETE /api/clusters/:code — delete (admin, guarded).
  r.delete('/:code', adminRequired, (req, res) => {
    const code = String(req.params.code);
    const row = db.prepare('SELECT is_default FROM clusters WHERE code = ?').get(code) as { is_default: number } | undefined;
    if (!row) {
      res.status(404).json({ error: 'Cluster not found' });
      return;
    }
    const total = (db.prepare('SELECT COUNT(*) AS n FROM clusters').get() as { n: number }).n;
    if (total <= 1) {
      res.status(400).json({ error: 'Cannot delete the last cluster' });
      return;
    }
    if (row.is_default) {
      res.status(400).json({ error: 'Cannot delete the default cluster' });
      return;
    }
    const records = (
      db
        .prepare("SELECT COUNT(*) AS n FROM records WHERE deleted_at = '' AND zone IN (SELECT code FROM zones WHERE cluster = ?)")
        .get(code) as { n: number }
    ).n;
    db.prepare("UPDATE zones SET cluster = '' WHERE cluster = ?").run(code);
    db.prepare("UPDATE floors SET cluster = '' WHERE cluster = ?").run(code);
    db.prepare('DELETE FROM clusters WHERE code = ?').run(code);
    res.json({ ok: true, recordsAffected: records });
  });

  // POST /api/clusters/:code/zones — add a zone to the cluster (admin).
  r.post('/:code/zones', adminRequired, (req, res) => {
    const code = String(req.params.code);
    if (!db.prepare('SELECT 1 AS x FROM clusters WHERE code = ?').get(code)) {
      res.status(404).json({ error: 'Cluster not found' });
      return;
    }
    const zcode = String(req.body?.code ?? '').trim();
    if (!zcode) {
      res.status(400).json({ error: 'zone code is required' });
      return;
    }
    if (db.prepare('SELECT 1 AS x FROM zones WHERE code = ?').get(zcode)) {
      db.prepare('UPDATE zones SET cluster = ? WHERE code = ?').run(code, zcode);
      res.json({ ok: true, reassigned: true });
      return;
    }
    db.prepare('INSERT INTO zones (code, name, name_ar, cluster) VALUES (?, ?, ?, ?)').run(
      zcode,
      String(req.body?.name ?? zcode),
      String(req.body?.nameAr ?? ''),
      code,
    );
    res.status(201).json({ ok: true });
  });

  // DELETE /api/clusters/:code/zones/:zcode — detach a zone (admin).
  r.delete('/:code/zones/:zcode', adminRequired, (req, res) => {
    db.prepare("UPDATE zones SET cluster = '' WHERE code = ? AND cluster = ?").run(String(req.params.zcode), String(req.params.code));
    res.json({ ok: true });
  });

  // POST /api/clusters/:code/floors — add a floor to the cluster (admin).
  r.post('/:code/floors', adminRequired, (req, res) => {
    const code = String(req.params.code);
    if (!db.prepare('SELECT 1 AS x FROM clusters WHERE code = ?').get(code)) {
      res.status(404).json({ error: 'Cluster not found' });
      return;
    }
    const name = String(req.body?.name ?? '').trim();
    if (!name) {
      res.status(400).json({ error: 'floor name is required' });
      return;
    }
    if (db.prepare('SELECT 1 AS x FROM floors WHERE name = ?').get(name)) {
      db.prepare('UPDATE floors SET cluster = ? WHERE name = ?').run(code, name);
      res.json({ ok: true, reassigned: true });
      return;
    }
    db.prepare('INSERT INTO floors (name, name_ar, cluster) VALUES (?, ?, ?)').run(
      name,
      String(req.body?.nameAr ?? ''),
      code,
    );
    res.status(201).json({ ok: true });
  });

  // DELETE /api/clusters/:code/floors/:name — detach a floor (admin).
  r.delete('/:code/floors/:name', adminRequired, (req, res) => {
    db.prepare("UPDATE floors SET cluster = '' WHERE name = ? AND cluster = ?").run(String(req.params.name), String(req.params.code));
    res.json({ ok: true });
  });

  return r;
}
