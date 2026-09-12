import { Router } from 'express';
import type { DatabaseSync, SQLInputValue } from 'node:sqlite';
import { adminRequired, authRequired } from '../auth.ts';
import type { DomainRegistry } from '../domain-registry.ts';
import { logEvent } from './logs.ts';

export function domainAdminRouter(db: DatabaseSync, registry: DomainRegistry): Router {
  const r = Router();
  r.use(authRequired);

  // ---- Categories ----
  r.get('/categories', (_req, res) => {
    const rows = db.prepare('SELECT code, name_en AS nameEn, name_ar AS nameAr, description_en AS descEn, description_ar AS descAr, forks_json AS forksJson, columns_json AS colsJson, kind, has_checklist AS hasChecklist, has_cycle AS hasCycle, has_template AS hasTemplate, has_table AS hasTable, sort_order AS sortOrder, active FROM domain_categories ORDER BY sort_order').all();
    res.json(rows);
  });

  /** Create a category (wizard step 3, ticket 107) — DB-owned, no hardcoding. */
  r.post('/categories', adminRequired, (req, res) => {
    const body = req.body ?? {};
    const code = String(body.code ?? '').trim().toUpperCase();
    if (!code) { res.status(400).json({ error: 'code required' }); return; }
    const exists = db.prepare('SELECT code FROM domain_categories WHERE code = ?').get(code);
    if (exists) { res.status(409).json({ error: `Category ${code} already exists` }); return; }
    const kind = String(body.kind ?? 'request');
    if (!['request', 'ncr', 'order_log'].includes(kind)) { res.status(400).json({ error: 'kind must be request|ncr|order_log' }); return; }
    const forks = Array.isArray(body.forks) ? body.forks : [];
    const forksJson = JSON.stringify(
      forks.map((f: unknown) => String((f as { code?: string }).code ?? '').trim().toUpperCase()).filter((c: string) => c.length > 0),
    );
    const columns = Array.isArray(body.columns) ? body.columns : [];
    const maxOrder = (db.prepare('SELECT COALESCE(MAX(sort_order), -1) AS m FROM domain_categories').get() as { m: number }).m + 1;
    db.prepare(
      `INSERT INTO domain_categories (code, name_en, name_ar, description_en, description_ar, forks_json, columns_json, kind, has_checklist, has_cycle, has_template, has_table, sort_order, active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
    ).run(
      code,
      String(body.nameEn ?? code).trim(),
      String(body.nameAr ?? '').trim(),
      String(body.descriptionEn ?? '').trim(),
      String(body.descriptionAr ?? '').trim(),
      forksJson,
      JSON.stringify(columns),
      kind,
      body.hasChecklist === false ? 0 : 1,
      body.hasCycle === false ? 0 : 1,
      body.hasTemplate === false ? 0 : 1,
      body.hasTable === true ? 1 : 0,
      Number(body.sortOrder ?? maxOrder),
    );
    registry.invalidate();
    logEvent(db, req.user!.username, 'domain', code, `Created category ${code} (kind=${kind}, ${forks.length} forks)`);
    res.status(201).json({ ok: true, code });
  });

  r.patch('/categories/:code', adminRequired, (req, res) => {
    const code = String(req.params.code);
    const existing = db.prepare('SELECT code FROM domain_categories WHERE code = ?').get(code) as { code: string } | undefined;
    if (!existing) { res.status(404).json({ error: 'Category not found' }); return; }
    const body = req.body ?? {};
    // Prevent code change if active records exist (core invariant)
    if (body.code && body.code !== code) {
      const cnt = (db.prepare("SELECT COUNT(*) AS n FROM records WHERE category = ? AND deleted_at = ''").get(code) as { n: number }).n;
      if (cnt > 0) { res.status(400).json({ error: `Cannot change code — ${cnt} active records use ${code}` }); return; }
    }
    const nameEn = body.nameEn !== undefined ? String(body.nameEn) : undefined;
    const nameAr = body.nameAr !== undefined ? String(body.nameAr) : undefined;
    const descEn = body.descriptionEn !== undefined ? String(body.descriptionEn) : undefined;
    const kind = body.kind !== undefined ? String(body.kind) : undefined;
    if (kind && !['request','ncr','order_log'].includes(kind)) { res.status(400).json({ error: 'kind must be request|ncr|order_log' }); return; }
    // Build dynamic update
    const sets: string[] = [];
    const vals: unknown[] = [];
    if (nameEn !== undefined) { sets.push('name_en = ?'); vals.push(nameEn); }
    if (nameAr !== undefined) { sets.push('name_ar = ?'); vals.push(nameAr); }
    if (descEn !== undefined) { sets.push('description_en = ?'); vals.push(descEn); }
    if (kind !== undefined) { sets.push('kind = ?'); vals.push(kind); }
    if (body.hasChecklist !== undefined) { sets.push('has_checklist = ?'); vals.push(body.hasChecklist ? 1 : 0); }
    if (body.hasCycle !== undefined) { sets.push('has_cycle = ?'); vals.push(body.hasCycle ? 1 : 0); }
    if (body.hasTemplate !== undefined) { sets.push('has_template = ?'); vals.push(body.hasTemplate ? 1 : 0); }
    if (body.active !== undefined) { sets.push('active = ?'); vals.push(body.active ? 1 : 0); }
    if (sets.length === 0) { res.status(400).json({ error: 'No fields to update' }); return; }
    vals.push(code);
    db.prepare(`UPDATE domain_categories SET ${sets.join(', ')} WHERE code = ?`).run(...(vals as unknown as SQLInputValue[]));
    registry.invalidate();
    logEvent(db, req.user!.username, 'domain', code, `Updated category ${code}`);
    res.json({ ok: true });
  });

  // ---- Statuses ----
  r.get('/statuses', (_req, res) => {
    const rows = db.prepare('SELECT code, name_en AS nameEn, name_ar AS nameAr, slogan_en AS sloganEn, slogan_ar AS sloganAr, description_en AS descEn, bucket, sort_order AS sortOrder, active FROM domain_statuses ORDER BY sort_order').all();
    res.json(rows);
  });

  r.patch('/statuses/:code', adminRequired, (req, res) => {
    const code = String(req.params.code);
    const existing = db.prepare('SELECT code FROM domain_statuses WHERE code = ?').get(code) as { code: string } | undefined;
    if (!existing) { res.status(404).json({ error: 'Status not found' }); return; }
    const CORE = ['A','B','C','D','SS','PP','P','SC','Skipped'];
    const body = req.body ?? {};
    // Protect: cannot deactivate core 9 if it would break bucket mapping — allow but audit
    const sets: string[] = [];
    const vals: unknown[] = [];
    if (body.nameEn !== undefined) { sets.push('name_en = ?'); vals.push(String(body.nameEn)); }
    if (body.nameAr !== undefined) { sets.push('name_ar = ?'); vals.push(String(body.nameAr)); }
    if (body.sloganEn !== undefined) { sets.push('slogan_en = ?'); vals.push(String(body.sloganEn)); }
    if (body.bucket !== undefined) { sets.push('bucket = ?'); vals.push(String(body.bucket)); }
    if (body.active !== undefined) {
      if (!body.active && CORE.includes(code)) {
        // Warn but allow — audit
        logEvent(db, req.user!.username, 'domain', code, `Deactivated core status ${code} — bucket invariant at risk`);
      }
      sets.push('active = ?'); vals.push(body.active ? 1 : 0);
    }
    if (sets.length === 0) { res.status(400).json({ error: 'No fields' }); return; }
    vals.push(code);
    db.prepare(`UPDATE domain_statuses SET ${sets.join(', ')} WHERE code = ?`).run(...(vals as unknown as SQLInputValue[]));
    registry.invalidate();
    logEvent(db, req.user!.username, 'domain', code, `Updated status ${code}`);
    res.json({ ok: true });
  });

  // Prevent deletion of core statuses
  r.delete('/statuses/:code', adminRequired, (req, res) => {
    const code = String(req.params.code);
    const CORE = ['A','B','C','D','SS','PP','P','SC','Skipped'];
    if (CORE.includes(code)) { res.status(400).json({ error: 'Core status cannot be deleted' }); return; }
    const info = db.prepare('DELETE FROM domain_statuses WHERE code = ?').run(code);
    if (info.changes === 0) { res.status(404).json({ error: 'Not found' }); return; }
    db.prepare('DELETE FROM domain_transitions WHERE from_status = ? OR to_status = ?').run(code, code);
    registry.invalidate();
    logEvent(db, req.user!.username, 'domain', code, `Deleted status ${code}`);
    res.json({ ok: true });
  });

  /** Delete a category (wizard step 3) — blocked while active records use it. */
  r.delete('/categories/:code', adminRequired, (req, res) => {
    const code = String(req.params.code);
    const row = db.prepare('SELECT code FROM domain_categories WHERE code = ?').get(code) as { code: string } | undefined;
    if (!row) { res.status(404).json({ error: 'Category not found' }); return; }
    const cnt = (db.prepare("SELECT COUNT(*) AS n FROM records WHERE category = ? AND deleted_at = ''").get(code) as { n: number }).n;
    if (cnt > 0) { res.status(400).json({ error: `Cannot delete — ${cnt} active records use ${code}`, count: cnt }); return; }
    db.prepare('DELETE FROM domain_categories WHERE code = ?').run(code);
    db.prepare('DELETE FROM domain_transitions WHERE category_code = ?').run(code);
    db.prepare('DELETE FROM domain_cycles WHERE category_code = ?').run(code);
    db.prepare('DELETE FROM domain_fields WHERE category_code = ?').run(code);
    registry.invalidate();
    logEvent(db, req.user!.username, 'domain', code, `Deleted category ${code}`);
    res.json({ ok: true });
  });

  // ---- Buckets (display only per V5-007B) ----
  r.get('/buckets', (_req, res) => {
    const buckets = db.prepare('SELECT code, name_en AS nameEn, name_ar AS nameAr, sort_order AS sortOrder FROM domain_buckets ORDER BY sort_order').all();
    const statuses = db.prepare('SELECT code, bucket FROM domain_statuses ORDER BY sort_order').all() as Array<{ code: string; bucket: string }>;
    const map: Record<string, string[]> = {};
    for (const s of statuses) { (map[s.bucket] ??= []).push(s.code); }
    res.json(buckets.map((b: any) => ({ ...b, statuses: map[b.code] ?? [] })));
  });

  // ---- Forks (V5-007A) ----
  r.get('/forks', (_req, res) => {
    res.json(db.prepare('SELECT code, name_en AS nameEn, name_ar AS nameAr, active, sort_order AS sortOrder FROM domain_forks ORDER BY sort_order').all());
  });

  r.post('/forks', adminRequired, (req, res) => {
    const body = req.body ?? {};
    const code = String(body.code ?? '').trim().toUpperCase();
    if (!code) { res.status(400).json({ error: 'code required' }); return; }
    const exists = db.prepare('SELECT code FROM domain_forks WHERE code = ?').get(code);
    if (exists) { res.status(409).json({ error: 'Fork already exists' }); return; }
    db.prepare('INSERT INTO domain_forks (code, name_en, name_ar, active, sort_order) VALUES (?, ?, ?, 1, ?)').run(code, String(body.nameEn ?? code), String(body.nameAr ?? ''), Number(body.sortOrder ?? 99));
    // Also update category forks_json where needed — optionally add to all request categories
    registry.invalidate();
    logEvent(db, req.user!.username, 'domain', code, `Created fork ${code}`);
    res.status(201).json({ ok: true });
  });

  r.patch('/forks/:code', adminRequired, (req, res) => {
    const code = String(req.params.code);
    const row = db.prepare('SELECT code FROM domain_forks WHERE code = ?').get(code) as { code: string } | undefined;
    if (!row) { res.status(404).json({ error: 'Not found' }); return; }
    const body = req.body ?? {};
    const sets: string[] = [];
    const vals: unknown[] = [];
    if (body.nameEn !== undefined) { sets.push('name_en = ?'); vals.push(String(body.nameEn)); }
    if (body.nameAr !== undefined) { sets.push('name_ar = ?'); vals.push(String(body.nameAr)); }
    if (body.active !== undefined) {
      // Dependency warning: deactivating with active records
      if (!body.active) {
        const cnt = (db.prepare("SELECT COUNT(*) AS n FROM records WHERE fork = ? AND deleted_at = ''").get(code) as { n: number }).n;
        if (cnt > 0) { res.status(400).json({ error: `Fork ${code} has ${cnt} active records — reassign first`, count: cnt }); return; }
      }
      sets.push('active = ?'); vals.push(body.active ? 1 : 0);
    }
    if (sets.length === 0) { res.status(400).json({ error: 'No fields' }); return; }
    vals.push(code);
    db.prepare(`UPDATE domain_forks SET ${sets.join(', ')} WHERE code = ?`).run(...(vals as unknown as SQLInputValue[]));
    registry.invalidate();
    res.json({ ok: true });
  });

  r.delete('/forks/:code', adminRequired, (req, res) => {
    const code = String(req.params.code);
    const cnt = (db.prepare("SELECT COUNT(*) AS n FROM records WHERE fork = ? AND deleted_at = ''").get(code) as { n: number }).n;
    if (cnt > 0) { res.status(400).json({ error: `Fork ${code} has ${cnt} active records — reassign first`, count: cnt }); return; }
    const info = db.prepare('DELETE FROM domain_forks WHERE code = ?').run(code);
    if (info.changes === 0) { res.status(404).json({ error: 'Not found' }); return; }
    registry.invalidate();
    logEvent(db, req.user!.username, 'domain', code, `Deleted fork ${code}`);
    res.json({ ok: true });
  });

  // ---- Transitions (V5-007C) ----
  r.get('/transitions', (_req, res) => {
    res.json(db.prepare('SELECT id, from_status AS fromStatus, to_status AS toStatus, category_code AS categoryCode, allowed, requires_admin AS requiresAdmin, creates_revision AS createsRevision, creates_pp_placeholder AS createsPpPlaceholder, requires_due_date AS requiresDueDate FROM domain_transitions ORDER BY from_status, to_status').all());
  });

  r.patch('/transitions/:id', adminRequired, (req, res) => {
    const id = Number(req.params.id);
    const row = db.prepare('SELECT id FROM domain_transitions WHERE id = ?').get(id) as { id: number } | undefined;
    if (!row) { res.status(404).json({ error: 'Not found' }); return; }
    const body = req.body ?? {};
    const sets: string[] = [];
    const vals: unknown[] = [];
    if (body.allowed !== undefined) { sets.push('allowed = ?'); vals.push(body.allowed ? 1 : 0); }
    if (body.requiresAdmin !== undefined) { sets.push('requires_admin = ?'); vals.push(body.requiresAdmin ? 1 : 0); }
    if (body.createsRevision !== undefined) { sets.push('creates_revision = ?'); vals.push(body.createsRevision ? 1 : 0); }
    if (body.createsPpPlaceholder !== undefined) { sets.push('creates_pp_placeholder = ?'); vals.push(body.createsPpPlaceholder ? 1 : 0); }
    if (sets.length === 0) { res.status(400).json({ error: 'No fields' }); return; }
    // Validation: cannot make PP→A allowed if engine rejects — but allow tightening (disallow)
    vals.push(id);
    db.prepare(`UPDATE domain_transitions SET ${sets.join(', ')} WHERE id = ?`).run(...(vals as unknown as SQLInputValue[]));
    registry.invalidate();
    logEvent(db, req.user!.username, 'domain', String(id), `Updated transition ${id}`);
    res.json({ ok: true });
  });

  // ---- Fields (V5-007C) ----
  r.get('/fields/:category', (req, res) => {
    const cat = String(req.params.category);
    res.json(db.prepare('SELECT id, category_code AS categoryCode, field_key AS fieldKey, label_en AS labelEn, label_ar AS labelAr, sort_order AS sortOrder, active FROM domain_fields WHERE category_code = ? ORDER BY sort_order').all(cat));
  });

  r.post('/fields/:category', adminRequired, (req, res) => {
    const cat = String(req.params.category);
    const catExists = db.prepare('SELECT code FROM domain_categories WHERE code = ?').get(cat);
    if (!catExists) { res.status(404).json({ error: 'Category not found' }); return; }
    const body = req.body ?? {};
    const key = String(body.fieldKey ?? '').trim();
    if (!key) { res.status(400).json({ error: 'fieldKey required' }); return; }
    const maxOrder = (db.prepare('SELECT COALESCE(MAX(sort_order), -1) AS m FROM domain_fields WHERE category_code = ?').get(cat) as { m: number }).m + 1;
    db.prepare('INSERT INTO domain_fields (category_code, field_key, label_en, label_ar, sort_order, active) VALUES (?, ?, ?, ?, ?, 1)').run(cat, key, String(body.labelEn ?? key), String(body.labelAr ?? ''), maxOrder);
    registry.invalidate();
    res.status(201).json({ ok: true });
  });

  r.patch('/fields/:id', adminRequired, (req, res) => {
    const id = Number(req.params.id);
    const row = db.prepare('SELECT id FROM domain_fields WHERE id = ?').get(id) as { id: number } | undefined;
    if (!row) { res.status(404).json({ error: 'Not found' }); return; }
    const body = req.body ?? {};
    const sets: string[] = [];
    const vals: unknown[] = [];
    if (body.labelEn !== undefined) { sets.push('label_en = ?'); vals.push(String(body.labelEn)); }
    if (body.labelAr !== undefined) { sets.push('label_ar = ?'); vals.push(String(body.labelAr)); }
    if (body.sortOrder !== undefined) { sets.push('sort_order = ?'); vals.push(Number(body.sortOrder)); }
    if (body.active !== undefined) { sets.push('active = ?'); vals.push(body.active ? 1 : 0); }
    if (sets.length === 0) { res.status(400).json({ error: 'No fields' }); return; }
    vals.push(id);
    db.prepare(`UPDATE domain_fields SET ${sets.join(', ')} WHERE id = ?`).run(...(vals as unknown as SQLInputValue[]));
    registry.invalidate();
    res.json({ ok: true });
  });

  r.delete('/fields/:id', adminRequired, (req, res) => {
    const id = Number(req.params.id);
    const info = db.prepare('DELETE FROM domain_fields WHERE id = ?').run(id);
    if (info.changes === 0) { res.status(404).json({ error: 'Not found' }); return; }
    registry.invalidate();
    res.json({ ok: true });
  });

  return r;
}
