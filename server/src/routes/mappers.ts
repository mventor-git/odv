import { Router } from 'express';
import type { DatabaseSync } from 'node:sqlite';
import { authRequired, adminRequired } from '../auth.ts';
import type { DomainRegistry } from '../domain-registry.ts';

export function mappersRouter(db: DatabaseSync, registry: DomainRegistry): Router {
  const r = Router();
  r.use(authRequired);

  // List mappers for a category
  r.get('/', (_req, res) => {
    const rows = db.prepare('SELECT id, category, fork, mapping_json AS mappingJson, version_no AS versionNo, is_active AS isActive FROM template_mappings ORDER BY category, fork, version_no').all();
    res.json(rows);
  });

  // Resolve the applicable active mapper for a category + fork (with category-only fallback)
  r.get('/resolve', (req, res) => {
    const category = String(req.query.category ?? '').trim();
    const fork = String(req.query.fork ?? '').trim();
    if (!registry.getCategory(category)) { res.status(400).json({ error: 'Unknown category' }); return; }
    let row = db.prepare('SELECT * FROM template_mappings WHERE category = ? AND fork = ? AND is_active = 1 ORDER BY version_no DESC LIMIT 1').get(category, fork);
    if (!row) {
      row = db.prepare("SELECT * FROM template_mappings WHERE category = ? AND (fork = '' OR fork IS NULL) AND is_active = 1 ORDER BY version_no DESC LIMIT 1").get(category);
    }
    res.json({ ok: true, mapping: row ?? null });
  });

  // Validate mapper JSON (scaffold — schema check via JSON parse + required fields)
  r.post('/validate', (req, res) => {
    const body = req.body ?? {};
    const json = body.mapping ?? body.json ?? body;
    if (!json || typeof json !== 'object') { res.status(400).json({ error: 'mapping JSON required' }); return; }
    if (!json.cells && !json.tables) { res.status(400).json({ error: 'cells or tables required' }); return; }
    // Category check via registry
    if (json.category && !registry.getCategory(String(json.category))) { res.status(400).json({ error: 'Unknown category' }); return; }
    res.json({ ok: true, warnings: [] });
  });

  // Preview: build plan from mapper + sample record
  r.post('/preview', (req, res) => {
    const body = req.body ?? {};
    const category = String(body.category ?? 'IR');
    const cat = registry.getCategory(category);
    if (!cat) { res.status(400).json({ error: 'Unknown category' }); return; }
    // Echo back resolved cells for scaffold
    res.json({ ok: true, category, cells: body.cells ?? {}, tables: body.tables ?? [] });
  });

  // Publish mapper version (or activate an existing version via { activateId })
  r.post('/publish', adminRequired, (req, res) => {
    const body = req.body ?? {};
    const category = String(body.category ?? '').trim();
    const fork = String(body.fork ?? '').trim();
    if (!registry.getCategory(category)) { res.status(400).json({ error: 'Unknown category' }); return; }
    // Reactivate an existing mapping version (ticket 110 — keep old versions).
    // Accept activateId at the top level OR nested in mapping (the client sends
    // { category, mapping: { activateId } }).
    const activateIdRaw = body.activateId ?? (body.mapping && typeof body.mapping === 'object' ? body.mapping.activateId : undefined);
    if (activateIdRaw != null) {
      const id = Number(activateIdRaw);
      const exists = db.prepare('SELECT id, fork FROM template_mappings WHERE id = ? AND category = ?').get(id, category) as { id: number; fork: string } | undefined;
      if (!exists) { res.status(404).json({ error: 'Mapping version not found' }); return; }
      // Preserve the row's own fork unless the caller explicitly overrides it —
      // otherwise reactivating a fork-specific mapping would reset fork to ''.
      const forkForActivate = fork !== '' ? fork : String(exists.fork ?? '');
      // Deactivate all and activate this one — bump to latest version number to keep invariants clean
      db.prepare('UPDATE template_mappings SET is_active = 0 WHERE category = ?').run(category);
      db.prepare(
        "UPDATE template_mappings SET is_active = 1, fork = ?, version_no = (SELECT COALESCE(MAX(version_no), 0) + 1 FROM template_mappings WHERE category = ?) WHERE id = ?",
      ).run(forkForActivate, category, id);
      res.json({ ok: true, id });
      return;
    }
    // New mapping: deactivate prior active, insert as new version
    db.prepare('UPDATE template_mappings SET is_active = 0 WHERE category = ?').run(category);
    const mappingJson = JSON.stringify(body.mapping ?? body.json ?? {});
    const info = db.prepare(
      'INSERT INTO template_mappings (category, fork, mapping_json, version_no, is_active) VALUES (?, ?, ?, COALESCE((SELECT MAX(version_no) FROM template_mappings WHERE category = ?), 0) + 1, 1)',
    ).run(category, fork, mappingJson, category);
    res.status(201).json({ ok: true, id: Number(info.lastInsertRowid) });
  });

  return r;
}
