import { Router, type Request } from 'express';
import type { DatabaseSync } from 'node:sqlite';
import { adminRequired, authRequired } from '../auth.ts';
import { emitAudit } from '../audit.ts';
import { personIdForUser } from '../identity.ts';

/** mventor-ticket-015: material chain enforcement — the point where "table
 *  exists" becomes "domain behavior enforced" (§14 genealogy):
 *  - events are APPEND-ONLY facts (DB triggers from v37 reject UPDATE/DELETE),
 *  - physical balance: consumption+return+waste can never exceed the lot
 *    quantity (E2 — this is physics, not accounting),
 *  - evidence links must exist AND belong to the material's project (E3 — no
 *    cross-project laundering),
 *  - quantity > 0 everywhere; code uniqueness per project / per def (E4),
 *  - writes are admin-gated and typed-audited (E5),
 *  - the chain endpoint DERIVES stage/remaining from events only (E6) —
 *    lot.status stays compatibility metadata, never the truth. */

const KINDS = ['purchase', 'receipt', 'storage_transfer', 'consumption', 'return', 'waste'] as const;
const REDUCERS = new Set(['consumption', 'return', 'waste']);

function httpFor(err: unknown): { status: number; error: string } | null {
  const m = err instanceof Error ? err.message : String(err);
  if (m.includes('UNIQUE')) return { status: 409, error: 'already exists' };
  if (m.includes('CHECK constraint')) return { status: 400, error: 'invalid value (kind/source_kind)' };
  if (m.includes('FOREIGN KEY')) return { status: 400, error: 'references a missing row' };
  return null;
}

const qty = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
};

export function materialsRouter(db: DatabaseSync): Router {
  const r = Router();
  r.use(authRequired);

  const auditAs = (req: Request, action: string, subjectId: number, payload: Record<string, unknown>) =>
    emitAudit(db, {
      personId: personIdForUser(db, req.user!.id),
      roleContext: `materials:${req.user!.role}`,
      subjectType: 'material',
      subjectId,
      action,
      payload,
    });

  // --- Definitions ---------------------------------------------------------

  // POST /defs {project_id, code, name, unit?, payload?}
  r.post('/defs', adminRequired, (req, res) => {
    const projectId = Number(req.body?.project_id);
    const code = String(req.body?.code ?? '').trim();
    const name = String(req.body?.name ?? '').trim();
    if (!projectId || !code || !name) { res.status(400).json({ error: 'project_id, code and name are required' }); return; }
    try {
      const info = db
        .prepare('INSERT INTO material_defs (project_id, code, name, unit, payload_json) VALUES (?, ?, ?, ?, ?)')
        .run(projectId, code, name, String(req.body?.unit ?? ''), JSON.stringify(req.body?.payload ?? {}));
      const id = Number(info.lastInsertRowid);
      auditAs(req, 'materials.def.created', id, { project_id: projectId, code, name });
      res.status(201).json(db.prepare('SELECT id, project_id AS projectId, code, name, unit FROM material_defs WHERE id = ?').get(id));
    } catch (err: unknown) {
      const h = httpFor(err);
      if (h) { res.status(h.status).json({ error: h.error }); return; }
      res.status(400).json({ error: 'Could not create material definition' });
    }
  });

  // GET /defs?project_id=
  r.get('/defs', (_req, res) => {
    const projectId = Number(_req.query.project_id);
    if (!projectId) { res.status(400).json({ error: 'project_id is required' }); return; }
    res.json({ defs: db.prepare('SELECT id, code, name, unit FROM material_defs WHERE project_id = ? ORDER BY code').all(projectId) });
  });

  // --- Lots ------------------------------------------------------------------

  // POST /lots {def_id, code, quantity, source_kind?, supplier_org_id?, payload?}
  r.post('/lots', adminRequired, (req, res) => {
    const defId = Number(req.body?.def_id);
    const code = String(req.body?.code ?? '').trim();
    const quantity = qty(req.body?.quantity);
    if (!defId || !code) { res.status(400).json({ error: 'def_id and code are required' }); return; }
    if (quantity === null) { res.status(400).json({ error: 'quantity must be a positive number' }); return; }
    try {
      const info = db
        .prepare('INSERT INTO material_lots (def_id, code, quantity, source_kind, supplier_org_id, payload_json) VALUES (?, ?, ?, ?, ?, ?)')
        .run(defId, code, quantity, String(req.body?.source_kind ?? 'contractor_supplied'),
          Number(req.body?.supplier_org_id) || null, JSON.stringify(req.body?.payload ?? {}));
      const id = Number(info.lastInsertRowid);
      auditAs(req, 'materials.lot.created', id, { def_id: defId, code, quantity, source_kind: String(req.body?.source_kind ?? 'contractor_supplied') });
      res.status(201).json(db.prepare('SELECT id, def_id AS defId, code, quantity, source_kind AS sourceKind, supplier_org_id AS supplierOrgId FROM material_lots WHERE id = ?').get(id));
    } catch (err: unknown) {
      const h = httpFor(err);
      if (h) { res.status(h.status).json({ error: h.error }); return; }
      res.status(400).json({ error: 'Could not create lot' });
    }
  });

  // GET /lots?def_id=
  r.get('/lots', (_req, res) => {
    const defId = Number(_req.query.def_id);
    if (!defId) { res.status(400).json({ error: 'def_id is required' }); return; }
    res.json({ lots: db.prepare('SELECT id, code, quantity, source_kind AS sourceKind, supplier_org_id AS supplierOrgId FROM material_lots WHERE def_id = ? ORDER BY id').all(defId) });
  });

  // --- Events (append-only movement facts) -----------------------------------

  // POST /lots/:id/events {kind, quantity, from_ref?, to_ref?, evidence_id?, payload?}
  r.post('/lots/:id/events', adminRequired, (req, res) => {
    const lotId = Number(req.params.id);
    const kind = String(req.body?.kind ?? '');
    const quantity = qty(req.body?.quantity);
    const lot = db.prepare(
      `SELECT l.id, l.quantity, d.project_id AS projectId, d.code AS def_code
       FROM material_lots l JOIN material_defs d ON d.id = l.def_id WHERE l.id = ?`,
    ).get(lotId) as { id: number; quantity: number; projectId: number; def_code: string } | undefined;
    if (!lot) { res.status(404).json({ error: 'Lot not found' }); return; }
    const fail = (why: string) => {
      auditAs(req, 'materials.event.rejected', lotId, { kind, quantity: req.body?.quantity ?? null, reason: why });
      res.status(400).json({ error: why });
    };
    if (!KINDS.includes(kind as (typeof KINDS)[number])) { fail(`Unknown event kind '${kind}'`); return; }
    if (quantity === null) { fail('quantity must be a positive number'); return; }
    // E2 physical balance: reducers can never exceed the lot quantity — no
    // material from nowhere. Receipts/transfers are location facts, uncapped.
    if (REDUCERS.has(kind)) {
      const { s } = db
        .prepare(`SELECT COALESCE(SUM(quantity), 0) AS s FROM material_events WHERE lot_id = ? AND kind IN ('consumption','return','waste')`)
        .get(lotId) as { s: number };
      if (s + quantity > lot.quantity + 1e-9) {
        fail(`Insufficient lot quantity: ${s}/${lot.quantity} already reduced — a lot cannot give out more than it holds`);
        return;
      }
    }
    if (req.body?.evidence_id !== undefined && req.body?.evidence_id !== null) {
      const evId = Number(req.body.evidence_id);
      const ev = db.prepare('SELECT id, project_id AS projectId FROM evidence WHERE id = ?').get(evId) as { id: number; projectId: number } | undefined;
      if (!ev) { fail('Evidence not found'); return; }
      if (ev.projectId !== lot.projectId) { fail('Evidence belongs to a different project — traceability cannot be laundered'); return; }
    }
    try {
      const info = db
        .prepare('INSERT INTO material_events (lot_id, kind, quantity, from_ref, to_ref, evidence_id, payload_json) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(lotId, kind, quantity, String(req.body?.from_ref ?? ''), String(req.body?.to_ref ?? ''),
          Number(req.body?.evidence_id ?? 0) || null, JSON.stringify(req.body?.payload ?? {}));
      const id = Number(info.lastInsertRowid);
      auditAs(req, 'materials.event.appended', Number(lotId), { event_id: id, kind, quantity, from_ref: String(req.body?.from_ref ?? ''), to_ref: String(req.body?.to_ref ?? ''), evidence_id: Number(req.body?.evidence_id ?? 0) || null, def_code: lot.def_code });
      res.status(201).json(db.prepare('SELECT id, kind, quantity, from_ref AS fromRef, to_ref AS toRef, evidence_id AS evidenceId, created_at AS createdAt FROM material_events WHERE id = ?').get(id));
    } catch (err: unknown) {
      const h = httpFor(err);
      if (h) { res.status(h.status).json({ error: h.error }); return; }
      res.status(400).json({ error: 'Could not append event' });
    }
  });

  // GET /lots/:id/events
  r.get('/lots/:id/events', (req, res) => {
    const lotId = Number(req.params.id);
    if (!db.prepare('SELECT 1 AS x FROM material_lots WHERE id = ?').get(lotId)) { res.status(404).json({ error: 'Lot not found' }); return; }
    res.json({
      events: db.prepare('SELECT id, kind, quantity, from_ref AS fromRef, to_ref AS toRef, evidence_id AS evidenceId, created_at AS createdAt FROM material_events WHERE lot_id = ? ORDER BY id').all(lotId),
    });
  });

  // GET /lots/:id/chain — full genealogy derived FROM EVENTS ONLY (E6).
  r.get('/lots/:id/chain', (req, res) => {
    const lotId = Number(req.params.id);
    const lot = db.prepare(
      `SELECT l.id, l.code, l.quantity, l.status AS legacyStatus, l.source_kind AS sourceKind, s.code AS supplierCode,
        d.id AS defId, d.code AS defCode, d.name AS defName, d.unit, d.project_id AS projectId
       FROM material_lots l JOIN material_defs d ON d.id = l.def_id LEFT JOIN organizations s ON s.id = l.supplier_org_id
       WHERE l.id = ?`,
    ).get(lotId) as
      | { id: number; code: string; quantity: number; legacyStatus: string; sourceKind: string; supplierCode: string | null; defId: number; defCode: string; defName: string; unit: string; projectId: number }
      | undefined;
    if (!lot) { res.status(404).json({ error: 'Lot not found' }); return; }
    const events = db
      .prepare(`SELECT e.id, e.kind, e.quantity, e.from_ref AS fromRef, e.to_ref AS toRef, e.created_at AS createdAt,
        ev.kind AS evidenceKind, ev.hash AS evidenceHash, ev.file_ref AS evidenceRef
        FROM material_events e LEFT JOIN evidence ev ON ev.id = e.evidence_id WHERE e.lot_id = ? ORDER BY e.id`)
      .all(lotId) as unknown as Array<{ id: number; kind: string; quantity: number; evidenceKind: string | null; [k: string]: unknown }>;
    let received = 0;
    let issued = 0;
    let delivered = false;
    for (const e of events) {
      if (e.kind === 'receipt') { received += e.quantity; delivered = true; }
      else if (REDUCERS.has(e.kind)) issued += e.quantity;
    }
    const stage = issued <= 0 ? (delivered ? 'delivered' : 'expected') : issued >= lot.quantity ? 'consumed' : 'partially_consumed';
    res.json({ lot, events, derived: { stage, received, issued, remaining: Math.max(0, lot.quantity - issued) } });
  });

  return r;
}
