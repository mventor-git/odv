import { Router } from 'express';
import type { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import type { Config } from '../config.ts';
import { adminRequired, authRequired } from '../auth.ts';
import { openLegacyDb } from '../legacy/db.ts';
import type { DomainRegistry } from '../domain-registry.ts';

type Kind = 'zones' | 'floors' | 'members' | 'roles';

const KINDS: Kind[] = ['zones', 'floors', 'members', 'roles'];

/** Apply a rename to records — &-combination aware (A&A1 → A2&A1). */
function applyRename(db: DatabaseSync, column: string, from: string, to: string): number {
  const rows = db
    .prepare(`SELECT id, ${column} AS v FROM records WHERE ${column} != ''`)
    .all() as unknown as Array<{ id: number; v: string }>;
  let n = 0;
  for (const row of rows) {
    const parts = String(row.v).split('&');
    const next = parts.map((p) => (p === from ? to : p)).join('&');
    if (next !== row.v) {
      db.prepare(`UPDATE records SET ${column} = ? WHERE id = ?`).run(next, row.id);
      n++;
    }
  }
  return n;
}

/** Reference data manager (ticket 040) — zones/floors/members live in the DB. */
export function refRouter(db: DatabaseSync, config: Config, registry: DomainRegistry): Router {
  const r = Router();
  r.use(authRequired);

  const isKind = (k: string): k is Kind => (KINDS as string[]).includes(k);

  const list = (kind: Kind): unknown[] => {
    if (kind === 'zones') {
      return db
        .prepare('SELECT code, name, name_ar AS nameAr, cluster FROM zones ORDER BY code')
        .all() as unknown[];
    }
    if (kind === 'members') {
      const rows = db
        .prepare(
          `SELECT e.name, e.title, e.role, e.specialty, e.specialty2, e.period_from AS periodFrom,
                  e.period_to AS periodTo, e.active, e.executive, COALESCE(r.star, '') AS star
           FROM engineers e LEFT JOIN roles r ON r.name = e.role ORDER BY e.name`,
        )
        .all() as unknown as Array<{
        name: string;
        title: string;
        role: string;
        specialty: string;
        specialty2: string;
        periodFrom: string;
        periodTo: string;
        active: number;
        executive: number;
        star: string;
      }>;
      return rows.map((r) => ({ ...r, active: r.active === 1, executive: r.executive === 1 }));
    }
    if (kind === 'roles') {
      // Default roles are locked labels (ticket 054) — only custom roles are editable.
      const DEFAULT_ROLES_FALLBACK = ['Project Manager','Executive Manager','Site Engineer','Technical Office Engineer','Electrician','Site Manager','Quality Engineer','Document Controller','Dev','Warehouse Keeper','Accountant'];
      const rows = db
        .prepare('SELECT name, name_ar AS nameAr, star FROM roles ORDER BY name')
        .all() as unknown as Array<{ name: string; nameAr: string; star: string }>;
      return rows.map((r) => ({ name: r.name, nameAr: r.nameAr, star: r.star, locked: DEFAULT_ROLES_FALLBACK.includes(r.name) }));
    }
    if (kind === 'floors') {
      return db
        .prepare('SELECT name, name_ar AS nameAr FROM floors ORDER BY name')
        .all() as unknown[];
    }
    return db
      .prepare(`SELECT name FROM ${kind} ORDER BY name`)
      .all() as unknown as Array<{ name: string }>;
  };

  r.get('/:kind', (req, res) => {
    const kind = String(req.params.kind);
    if (!isKind(kind)) {
      res.status(400).json({ error: 'Unknown reference kind' });
      return;
    }
    // Request-metadata scope (ticket 044/074, restored in 096): every ACTIVE
    // member plus every executive-enabled member — executives stay visible in
    // the request-view Engineers list even when inactive. Role star included
    // so the client can badge options.
    if (kind === 'members' && req.query.scope === 'request') {
      const rows = db
        .prepare(
          `SELECT e.name, e.title, e.role, e.specialty, e.specialty2,
                  e.period_from AS periodFrom, e.period_to AS periodTo,
                  e.active, e.executive, COALESCE(r.star, '') AS star
           FROM engineers e LEFT JOIN roles r ON r.name = e.role
           WHERE e.active = 1 OR e.executive = 1
           ORDER BY e.name`,
        )
        .all() as unknown as Array<{
        name: string;
        title: string;
        role: string;
        specialty: string;
        specialty2: string;
        periodFrom: string;
        periodTo: string;
        active: number;
        executive: number;
        star: string;
      }>;
      res.json(rows.map((r) => ({ ...r, active: r.active === 1, executive: r.executive === 1 })));
      return;
    }
    res.json(list(kind));
  });

  /** Fetch tool — distinct values from the legacy DB (the original source). */
  r.get('/:kind/fetch', (req, res) => {
    const kind = String(req.params.kind);
    if (!isKind(kind)) {
      res.status(400).json({ error: 'Unknown reference kind' });
      return;
    }
    const legacy = openLegacyDb(path.join(config.dataDir, 'legacy.db'));
    const rows = legacy
      .prepare("SELECT data_json FROM legacy_rows WHERE source_key = 'requests'")
      .all() as unknown as Array<{ data_json: string }>;
    const values = new Set<string>();
    for (const row of rows) {
      try {
        const d = JSON.parse(row.data_json) as Record<string, string>;
        const v = String(d[kind === 'zones' ? 'Zone' : kind === 'floors' ? 'Floor' : 'Engineer'] ?? '');
        if (v.trim()) values.add(v.trim());
      } catch {
        // skip unparseable rows
      }
    }
    res.json({ items: [...values].sort() });
  });

  /** Sync — replace the table with the given list and apply renames to records. (V5-032: transactional) */
  r.post('/:kind/sync', adminRequired, (req, res) => {
    const kind = String(req.params.kind);
    if (!isKind(kind)) {
      res.status(400).json({ error: 'Unknown reference kind' });
      return;
    }
    const body = req.body ?? {};
    db.exec('BEGIN');
    try {
    if (kind === 'zones') {
      const items = Array.isArray(body.items) ? body.items : [];
      const oldRows = db.prepare('SELECT code FROM zones').all() as unknown as Array<{ code: string }>;
      const oldCodes = oldRows.map((x) => x.code);
      const newCodes = items
        .map((x: { code?: string }) => String(x.code ?? '').trim())
        .filter((c: string) => c.length > 0);
      // Rename detection: removed code + added code → rename (apply to records).
      const removed = oldCodes.filter((c: string) => !newCodes.includes(c));
      const added = newCodes.filter((c: string) => !oldCodes.includes(c));
      for (let i = 0; i < Math.min(removed.length, added.length); i++) {
        const n = applyRename(db, 'zone', removed[i], added[i]);
        if (n > 0) console.log(`[ref] zone rename ${removed[i]} -> ${added[i]}: ${n} records`);
      }
      db.exec('DELETE FROM zones');
      const ins = db.prepare('INSERT INTO zones (code, name, name_ar, cluster) VALUES (?, ?, ?, ?)');
      for (const x of items) {
        const code = String(x.code ?? '').trim();
        if (!code) continue;
        ins.run(
          code,
          String(x.name ?? code).trim(),
          String(x.nameAr ?? '').trim(),
          String(x.cluster ?? 'CL12').trim(),
        );
      }
    } else if (kind === 'floors') {
      // Floors sync accepts objects {name, nameAr} or plain strings (backward compatible).
      const items = Array.isArray(body.items) ? body.items : [];
      const oldRows = db.prepare('SELECT name FROM floors').all() as unknown as Array<{ name: string }>;
      const oldNames = oldRows.map((x) => x.name);
      const newNames = items
        .map((x: unknown) => String(typeof x === 'string' ? x : (x as { name?: string }).name ?? '').trim())
        .filter((s: string) => s.length > 0);
      const removed = oldNames.filter((n: string) => !newNames.includes(n));
      const added = newNames.filter((n: string) => !oldNames.includes(n));
      for (let i = 0; i < Math.min(removed.length, added.length); i++) {
        const n = applyRename(db, 'floor', removed[i], added[i]);
        if (n > 0) console.log(`[ref] floor rename ${removed[i]} -> ${added[i]}: ${n} records`);
      }
      db.exec('DELETE FROM floors');
      const ins = db.prepare('INSERT INTO floors (name, name_ar, cluster) VALUES (?, ?, ?)');
      for (const x of items) {
        const name = String(typeof x === 'string' ? x : (x as { name?: string }).name ?? '').trim();
        if (!name) continue;
        const nameAr = typeof x === 'string' ? '' : String((x as { nameAr?: string }).nameAr ?? '').trim();
        const cluster = typeof x === 'string' ? '' : String((x as { cluster?: string }).cluster ?? 'CL12').trim() || 'CL12';
        ins.run(name, nameAr, cluster);
      }
    } else if (kind === 'members') {
      const items = Array.isArray(body.items) ? body.items : [];
      const oldRows = db.prepare('SELECT name FROM engineers').all() as unknown as Array<{ name: string }>;
      const oldNames = oldRows.map((x) => x.name);
      const newNames = items
        .map((x: { name?: string }) => String(x.name ?? '').trim())
        .filter((s: string) => s.length > 0);
      const removed = oldNames.filter((n: string) => !newNames.includes(n));
      const added = newNames.filter((n: string) => !oldNames.includes(n));
      for (let i = 0; i < Math.min(removed.length, added.length); i++) {
        const n = applyRename(db, 'engineer', removed[i], added[i]);
        if (n > 0) console.log(`[ref] engineer rename ${removed[i]} -> ${added[i]}: ${n} records`);
      }
      db.exec('DELETE FROM engineers');
      const ins = db.prepare(
        'INSERT INTO engineers (name, title, role, specialty, specialty2, period_from, period_to, active, executive) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      );
      for (const x of items) {
        const rawName = String(x.name ?? '').trim();
        if (!rawName) continue;
        const baseName = rawName.replace(/^(Mr|Ms|Mrs|Eng|Engineer)\s+/i, '').trim();
        ins.run(
          baseName,
          '',
          String(x.role ?? '').trim(),
          String(x.specialty ?? '').trim(),
          String(x.specialty2 ?? '').trim(),
          String(x.periodFrom ?? '').trim(),
          String(x.periodTo ?? '').trim(),
          x.active === false ? 0 : 1,
          x.executive === true ? 1 : 0,
        );
      }
    } else {
      // Roles — plain name list (no record renames apply).
      const items = Array.isArray(body.items)
        ? body.items.map((x: unknown) => String(x).trim()).filter((s: string) => s.length > 0)
        : [];
      const oldRows = db.prepare(`SELECT name FROM ${kind}`).all() as unknown as Array<{ name: string }>;
      const oldNames = oldRows.map((x) => x.name);
      const removed = oldNames.filter((n: string) => !items.includes(n));
      const added = items.filter((n: string) => !oldNames.includes(n));
      for (let i = 0; i < Math.min(removed.length, added.length); i++) {
        const n = applyRename(db, 'engineer', removed[i], added[i]);
        if (n > 0) console.log(`[ref] ${kind} rename ${removed[i]} -> ${added[i]}: ${n} records`);
      }
      db.exec(`DELETE FROM ${kind}`);
      const ins = db.prepare(`INSERT INTO ${kind} (name) VALUES (?)`);
      for (const name of items) ins.run(name);
    }
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
    res.json({ ok: true, items: list(kind) });
  });

  /** Edit a single engineer (member card, ticket 055) — renames apply to records. */
  r.patch('/members/:name', adminRequired, (req, res) => {
    const oldName = String(req.params.name);
    const row = db.prepare('SELECT * FROM engineers WHERE name = ?').get(oldName) as
      | { name: string }
      | undefined;
    if (!row) {
      res.status(404).json({ error: 'Member not found' });
      return;
    }
    const body = req.body ?? {};
    // Names are stored bare (ticket 058) — no Mr/Ms/Mrs/Eng prefix composition.
    const baseName = String(body.name ?? oldName).replace(/^(Mr|Ms|Mrs|Eng|Engineer)\s+/i, '').trim();
    const newName = baseName;
    if (!newName) {
      res.status(400).json({ error: 'Name is required' });
      return;
    }
    if (newName !== oldName) {
      const dup = db.prepare('SELECT 1 FROM engineers WHERE name = ?').get(newName);
      if (dup) {
        res.status(409).json({ error: 'Member already exists' });
        return;
      }
      const n = applyRename(db, 'engineer', oldName, newName);
      if (n > 0) console.log(`[ref] engineer rename ${oldName} -> ${newName}: ${n} records`);
    }
    db.prepare(
      `UPDATE engineers SET name = ?, title = '', role = ?, specialty = ?, specialty2 = ?,
        period_from = ?, period_to = ?, active = ?, executive = ? WHERE name = ?`,
    ).run(
      newName,
      String(body.role ?? '').trim(),
      String(body.specialty ?? '').trim(),
      String(body.specialty2 ?? '').trim(),
      String(body.periodFrom ?? '').trim(),
      String(body.periodTo ?? '').trim(),
      body.active === false ? 0 : 1,
      body.executive === true ? 1 : 0,
      oldName,
    );
    const updated = db
      .prepare(
        'SELECT name, title, role, specialty, specialty2, period_from AS periodFrom, period_to AS periodTo, active, executive FROM engineers WHERE name = ?',
      )
      .get(newName) as unknown as {
      name: string;
      title: string;
      role: string;
      specialty: string;
      specialty2: string;
      periodFrom: string;
      periodTo: string;
      active: number;
      executive: number;
    };
    res.json({ ...updated, active: updated.active === 1, executive: updated.executive === 1 });
  });

  r.delete('/:kind/:id', adminRequired, (req, res) => {
    const kind = String(req.params.kind);
    if (!isKind(kind)) {
      res.status(400).json({ error: 'Unknown reference kind' });
      return;
    }
    const id = String(req.params.id);
    if (kind === 'zones') {
      db.prepare('DELETE FROM zones WHERE code = ?').run(id);
    } else {
      db.prepare(`DELETE FROM ${kind} WHERE name = ?`).run(id);
    }
    res.json({ ok: true });
  });

  return r;
}