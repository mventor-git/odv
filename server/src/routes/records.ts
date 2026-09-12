import { Router } from 'express';
import type { DatabaseSync, SQLInputValue } from 'node:sqlite';
import { adminRequired, authRequired } from '../auth.ts';
import type { DomainRegistry } from '../domain-registry.ts';
import { logEvent } from './logs.ts';

/** Display padding for revision numbers in log text: "1" → "01" (stored values untouched). */
export function padRev(rev: string | null | undefined): string {
  return String(rev ?? '00').padStart(2, '0');
}

export interface RecordRow {
  id: number;
  category: string;
  request_no: string;
  revision_no: string;
  description: string;
  zone: string;
  floor: string;
  engineer: string;
  fork: string;
  sent_date: string;
  sent_by_consultant_date: string;
  reply_date: string;
  reply_by_contractor_date: string;
  status: string;
  hyperlink: string;
  data_hyperlink: string;
  parent_id: number | null;
  created_by: number | null;
  created_at: string;
  updated_at: string;
  deleted_at: string;
  documents_json: string;
  due_date: string;
}

const FIELDS = [
  'category', 'requestNo', 'revisionNo', 'description', 'zone', 'floor',
  'engineer', 'fork', 'sentDate', 'sentByConsultantDate', 'replyDate',
  'replyByContractorDate', 'status', 'hyperlink', 'dataHyperlink', 'documents',
  'dueDate',
];

const COLUMN_MAP: Record<string, string> = {
  requestNo: 'request_no',
  revisionNo: 'revision_no',
  sentDate: 'sent_date',
  sentByConsultantDate: 'sent_by_consultant_date',
  replyDate: 'reply_date',
  replyByContractorDate: 'reply_by_contractor_date',
  dataHyperlink: 'data_hyperlink',
  dueDate: 'due_date',
};

export function toApi(row: RecordRow): Record<string, unknown> {
  let documents: unknown[] = [];
  try {
    documents = JSON.parse(row.documents_json || '[]') as unknown[];
  } catch {
    documents = [];
  }
  return {
    id: row.id,
    category: row.category,
    requestNo: row.request_no,
    revisionNo: row.revision_no,
    description: row.description,
    zone: row.zone,
    floor: row.floor,
    engineer: row.engineer,
    fork: row.fork,
    sentDate: row.sent_date,
    sentByConsultantDate: row.sent_by_consultant_date,
    replyDate: row.reply_date,
    replyByContractorDate: row.reply_by_contractor_date,
    status: row.status,
    hyperlink: row.hyperlink,
    dataHyperlink: row.data_hyperlink,
    parentId: row.parent_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
    dueDate: row.due_date,
    documents,
  };
}

function clean(body: Record<string, unknown>): Partial<Record<string, unknown>> {
  const out: Partial<Record<string, unknown>> = {};
  for (const key of FIELDS) {
    const val = body[key];
    if (val === undefined || val === null) continue;
    if (key === 'documents') {
      out.documents = JSON.stringify(Array.isArray(val) ? val : []);
    } else {
      out[key] = String(val);
    }
  }
  return out;
}

function validate(data: Record<string, unknown>, registry: DomainRegistry): string | null {
  const category = String(data.category ?? '');
  if (!registry.getCategory(category)) return 'Unknown category';
  if (data.status !== undefined && !registry.isStatusCode(String(data.status))) return 'Unknown status';
  const cols = registry.getCategory(category)!.columns;
  if (!cols.includes('orderNo') && !String(data.requestNo ?? '').trim()) {
    return 'Request No. is required';
  }
  if (cols.includes('orderNo') && !String(data.requestNo ?? '').trim()) {
    return 'Order No. is required';
  }
  return null;
}

/** Suggest next revision/status when creating a new revision (per status slogans). */
export function suggestNext(parent: RecordRow): { revisionNo: string; status: string } {
  let revisionNo = '';
  const cur = parent.revision_no.trim();
  if (!cur) {
    // First revision of a fresh log (e.g. NCR reply) is named 00 (ticket 065).
    revisionNo = '00';
  } else if (/^\d+$/.test(cur)) {
    const n = parseInt(cur, 10) + 1;
    revisionNo = String(n).padStart(cur.length, '0');
  } else if (/^[A-Za-z]$/.test(cur)) {
    revisionNo = String.fromCharCode(cur.charCodeAt(0) + 1).toUpperCase();
  }
  let status = 'P';
  if (parent.status === 'C') status = 'PP';
  else if (parent.status === 'B') status = 'A';
  else if (parent.status === 'A') status = 'A';
  return { revisionNo, status };
}

/** Status transition laws (ticket 033 + V5-005 registry): PP→P|SC; P→A|B|C|D|Skipped; SC→P|PP. */
export function allowedTransitionsFor(registry: DomainRegistry, from: string): string[] {
  const fromDb = registry.getAllowedTransitions(from);
  if (fromDb.length > 0) return fromDb;
  // fallback identical to legacy hardcoded map
  const fallback: Record<string, string[]> = { PP: ['P', 'SC'], P: ['A', 'B', 'C', 'D', 'Skipped'], SC: ['P', 'PP'] };
  return fallback[from] ?? [];
}

/** Auto-create the held PP placeholder for the next revision of a C-graded request (ticket 033). */
export function createPlaceholder(db: DatabaseSync, parent: RecordRow, revOverride?: string): void {
  const { revisionNo } = suggestNext(parent);
  const rev = revOverride ?? revisionNo;
  if (!rev) return;
  const exists = db
    .prepare("SELECT 1 FROM records WHERE category = ? AND request_no = ? AND revision_no = ? AND deleted_at = ''")
    .get(parent.category, parent.request_no, rev);
  if (exists) return;
  db.prepare(
    `INSERT INTO records (category, request_no, revision_no, description, zone, floor, engineer,
      fork, sent_date, sent_by_consultant_date, reply_date, reply_by_contractor_date,
      status, hyperlink, data_hyperlink, parent_id, created_by, documents_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    parent.category, parent.request_no, rev, parent.description, parent.zone, parent.floor,
    parent.engineer, parent.fork, parent.sent_date, parent.sent_by_consultant_date,
    parent.reply_date, parent.reply_by_contractor_date, 'PP', parent.hyperlink,
    parent.data_hyperlink, parent.id, parent.created_by, parent.documents_json,
  );
}

/** Remove all held PP records of a request no. — the revision no. is released (ticket 033). */
export function removePlaceholders(db: DatabaseSync, category: string, requestNo: string): void {
  db.prepare(
    "DELETE FROM records WHERE category = ? AND request_no = ? AND status = 'PP' AND deleted_at = ''",
  ).run(category, requestNo);
}

export function recordsRouter(db: DatabaseSync, registry: DomainRegistry): Router {
  const r = Router();
  r.use(authRequired);

  /** Aggregate counts for The Wall / Command Center (one call, no client loops).
   *  Supports optional filters: ?status=&category=&zone=&q=  — the zone heat grid
   *  uses these to show filtered counts without a second endpoint. */
  r.get('/stats', (req, res) => {
    const filter = req.query as Record<string, string | undefined>;
    const where: string[] = ["deleted_at = ''"];
    const params: SQLInputValue[] = [];
    if (filter.status) { where.push('status = ?'); params.push(filter.status); }
    if (filter.category) { where.push('category = ?'); params.push(filter.category); }
    if (filter.zone) {
      const z = filter.zone;
      where.push('(zone = ? OR zone LIKE ? OR zone LIKE ? OR zone LIKE ?)');
      params.push(z, `${z}&%`, `%&${z}`, `%&${z}&%`);
    }
    if (filter.q) {
      const qq = String(filter.q).trim();
      if (qq.length >= 3) {
        const phrase = qq.replace(/"/g, '""');
        where.push("(id IN (SELECT rowid FROM records_fts WHERE records_fts MATCH ?))");
        params.push(`"${phrase}"`);
      } else if (qq) {
        where.push('(request_no LIKE ? OR description LIKE ? OR engineer LIKE ?)');
        const like = `%${qq}%`;
        params.push(like, like, like);
      }
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const total = (db.prepare(`SELECT COUNT(*) AS n FROM records ${whereSql}`).get(...params) as { n: number }).n;
    const byStatus: Record<string, number> = {};
    const byBucket: Record<string, number> = {};
    const byCategory: Record<string, number> = {};
    const byZone: Record<string, number> = {};
    for (const row of db
      .prepare(`SELECT category, status, zone FROM records ${whereSql}`)
      .all(...params) as unknown as Array<{ category: string; status: string; zone: string }>) {
      byStatus[row.status] = (byStatus[row.status] ?? 0) + 1;
      byCategory[row.category] = (byCategory[row.category] ?? 0) + 1;
      const bucket = registry.getStatus(row.status)?.bucket ?? 'open';
      byBucket[bucket] = (byBucket[bucket] ?? 0) + 1;
      // Zone fields may hold combinations ("A&A1") — count each part (ticket 090).
      for (const z of String(row.zone).split('&')) {
        const zz = z.trim();
        if (zz) byZone[zz] = (byZone[zz] ?? 0) + 1;
      }
    }
    const ncr = db
      .prepare("SELECT status, COUNT(*) AS n FROM records WHERE deleted_at = '' AND category = 'NCR' AND status IN ('P','PP') GROUP BY status")
      .all() as unknown as Array<{ status: string; n: number }>;
    const ncrUrgent = { pending: 0, pp: 0 };
    for (const row of ncr) {
      if (row.status === 'P') ncrUrgent.pending = row.n;
      if (row.status === 'PP') ncrUrgent.pp = row.n;
    }
    // Due-date reminders (ticket 086): SC records with a due date — overdue
    // (due < today) and due soon (today .. +3 days). ISO strings sort correctly.
    const today = new Date().toISOString().slice(0, 10);
    const soon = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const reminders = {
      overdue: db
        .prepare(
          `SELECT id, category, request_no, revision_no, description, due_date, status
           FROM records WHERE deleted_at = '' AND status = 'SC' AND due_date != '' AND due_date < ?
           ORDER BY due_date LIMIT 50`,
        )
        .all(today) as unknown as Array<{ id: number; category: string; request_no: string; revision_no: string; description: string; due_date: string; status: string }>,
      dueSoon: db
        .prepare(
          `SELECT id, category, request_no, revision_no, description, due_date, status
           FROM records WHERE deleted_at = '' AND status = 'SC' AND due_date != '' AND due_date >= ? AND due_date <= ?
           ORDER BY due_date LIMIT 50`,
        )
        .all(today, soon) as unknown as Array<{ id: number; category: string; request_no: string; revision_no: string; description: string; due_date: string; status: string }>,
    };
    res.json({ total, byStatus, byBucket, byCategory, byZone, ncrUrgent, reminders });
  });

  r.get('/', (req, res) => {
    const {
      category, status, zone, floor, fork, engineer, bucket, q, requestNo, cluster,
    } = req.query as Record<string, string | undefined>;
    const limit = Math.min(Number(req.query.limit ?? 200) || 200, 500);
    const offset = Math.max(Number(req.query.offset ?? 0) || 0, 0);

    const where: string[] = ["deleted_at = ''"];
    const params: SQLInputValue[] = [];
    if (category) { where.push('category = ?'); params.push(category); }
    if (requestNo) { where.push('request_no = ?'); params.push(requestNo); }
    if (status) { where.push('status = ?'); params.push(status); }
    if (zone) {
      // Zone fields may hold combinations ("A&A1") — match any part.
      where.push('(zone = ? OR zone LIKE ? OR zone LIKE ? OR zone LIKE ?)');
      params.push(zone, `${zone}&%`, `%&${zone}`, `%&${zone}&%`);
    }
    if (cluster) {
      // Cluster zones come from the DB (ticket 038) — no hardcoding.
      const zoneCodes = (
        db.prepare('SELECT code FROM zones WHERE cluster = ?').all(cluster) as unknown as Array<{ code: string }>
      ).map((z) => z.code);
      if (zoneCodes.length > 0) {
        const ors = zoneCodes.map(() => '(zone = ? OR zone LIKE ? OR zone LIKE ? OR zone LIKE ?)');
        where.push(`(${ors.join(' OR ')})`);
        for (const c of zoneCodes) params.push(c, `${c}&%`, `%&${c}`, `%&${c}&%`);
      }
    }
    if (floor) { where.push('floor = ?'); params.push(floor); }
    if (fork) { where.push('fork = ?'); params.push(fork); }
    if (engineer) { where.push('engineer = ?'); params.push(engineer); }
    if (bucket) {
      const bucketSnap = registry.getBuckets()[bucket];
      const codes = bucketSnap?.statuses;
      if (codes && codes.length > 0) {
        where.push(`status IN (${codes.map(() => '?').join(',')})`);
        params.push(...codes);
      }
    }
    if (q) {
      // Arabic smart search (ticket 084): FTS5 trigram for 3+ char queries
      // (matches Arabic/Latin substrings), LIKE fallback for short queries.
      const trimmed = String(q).trim();
      if (trimmed.length >= 3) {
        const phrase = trimmed.replace(/"/g, '""');
        where.push('(id IN (SELECT rowid FROM records_fts WHERE records_fts MATCH ?))');
        params.push(`"${phrase}"`);
      } else {
        where.push('(request_no LIKE ? OR revision_no LIKE ? OR description LIKE ? OR hyperlink LIKE ? OR engineer LIKE ?)');
        const like = `%${q}%`;
        params.push(like, like, like, like, like);
      }
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const total = (
      db.prepare(`SELECT COUNT(*) AS n FROM records ${whereSql}`).get(...params) as { n: number }
    ).n;
    const sortDir = req.query.sort === 'desc' ? 'DESC' : 'ASC';
    // Numeric-aware ordering: "STR-1" < "STR-2" < ... < "STR-10" < ... < "STR-100".
    // rtrim(request_no, '0123456789') = the text prefix; the trailing digits sort as a number.
    const rows = db
      .prepare(
        `SELECT * FROM records ${whereSql}
         ORDER BY category,
           rtrim(request_no, '0123456789') ${sortDir},
           CAST(substr(request_no, length(rtrim(request_no, '0123456789')) + 1) AS INTEGER) ${sortDir},
           CAST(revision_no AS INTEGER) ${sortDir},
           id ${sortDir}
         LIMIT ? OFFSET ?`,
      )
      .all(...params, limit, offset) as unknown as RecordRow[];
    res.json({ total, items: rows.map(toApi) });
  });

  /** Smart numbering + held PP placeholders for the create form (ticket 033). */
  r.get('/next', (req, res) => {
    const category = String(req.query.category ?? '');
    const fork = String(req.query.fork ?? '');
    const rows = db
      .prepare("SELECT request_no FROM records WHERE category = ? AND fork = ? AND deleted_at = ''")
      .all(category, fork) as unknown as Array<{ request_no: string }>;
    let max = 0;
    for (const r of rows) {
      const m = r.request_no.match(/(\d+)$/);
      if (m) max = Math.max(max, parseInt(m[1], 10));
    }
    const requestNo = fork ? `${fork}-${max + 1}` : String(max + 1);
    const held = db
      .prepare(
        "SELECT id, request_no, revision_no, parent_id FROM records WHERE category = ? AND fork = ? AND status = 'PP' AND deleted_at = '' ORDER BY request_no, revision_no",
      )
      .all(category, fork) as unknown as Array<{
      id: number;
      request_no: string;
      revision_no: string;
      parent_id: number | null;
    }>;
    res.json({
      requestNo,
      revisionNo: '00',
      held: held.map((h) => {
        // The held PP defaults to the old (parent) request as an attachment (ticket 067).
        let parentHyperlink = '';
        if (h.parent_id) {
          const parent = db
            .prepare('SELECT hyperlink FROM records WHERE id = ?')
            .get(h.parent_id) as unknown as { hyperlink: string } | undefined;
          parentHyperlink = parent?.hyperlink ?? '';
        }
        return {
          id: h.id,
          requestNo: h.request_no,
          revisionNo: h.revision_no,
          parentId: h.parent_id,
          parentHyperlink,
        };
      }),
    });
  });

  // Distinct engineer names for filter dropdowns (ticket 120). Read-only.
  r.get('/engineers', authRequired, (_req, res) => {
    const rows = db
      .prepare(
        "SELECT DISTINCT engineer FROM records WHERE deleted_at = '' AND engineer IS NOT NULL AND engineer != '' ORDER BY engineer",
      )
      .all() as unknown as Array<{ engineer: string }>;
    res.json({ engineers: rows.map((r) => r.engineer) });
  });

  r.get('/:id', (req, res) => {
    const row = db
      .prepare("SELECT * FROM records WHERE id = ? AND deleted_at = ''")
      .get(Number(req.params.id)) as unknown as RecordRow | undefined;
    if (!row) {
      res.status(404).json({ error: 'Record not found' });
      return;
    }
    res.json(toApi(row));
  });

  r.post('/', (req, res) => {
    const data = clean(req.body ?? {});
    const error = validate(data, registry);
    if (error) {
      res.status(400).json({ error });
      return;
    }
    const category = String(data.category);
    const requestNo = String(data.requestNo ?? '');
    const revisionNo = String(data.revisionNo ?? '');
    const dup = db
      .prepare("SELECT 1 FROM records WHERE category = ? AND request_no = ? AND revision_no = ? AND deleted_at = ''")
      .get(category, requestNo, revisionNo);
    if (dup) {
      res.status(409).json({ error: 'A record with this category + request no. + revision no. already exists' });
      return;
    }
    const info = db
      .prepare(
        `INSERT INTO records (category, request_no, revision_no, description, zone, floor, engineer,
          fork, sent_date, sent_by_consultant_date, reply_date, reply_by_contractor_date,
          status, hyperlink, data_hyperlink, created_by, documents_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        category,
        requestNo,
        revisionNo,
        String(data.description ?? ''),
        String(data.zone ?? ''),
        String(data.floor ?? ''),
        String(data.engineer ?? ''),
        String(data.fork ?? ''),
        String(data.sentDate ?? ''),
        String(data.sentByConsultantDate ?? ''),
        String(data.replyDate ?? ''),
        String(data.replyByContractorDate ?? ''),
        String(data.status ?? 'P'),
        String(data.hyperlink ?? ''),
        String(data.dataHyperlink ?? ''),
        req.user!.id,
        String(data.documents ?? '[]'),
      );
    const row = db
      .prepare('SELECT * FROM records WHERE id = ?')
      .get(Number(info.lastInsertRowid)) as unknown as RecordRow;
    logEvent(
      db,
      req.user!.username,
      'create',
      `${category} ${requestNo}`,
      `Created ${category} ${requestNo} rev ${revisionNo || '00'} (${String(data.status ?? 'P')})`,
    );
    // Status law (ticket 033): grading C holds a PP placeholder for the next revision.
    if (String(data.status ?? 'P') === 'C') createPlaceholder(db, row);
    res.status(201).json(toApi(row));
  });

  r.patch('/:id', (req, res) => {
    const row = db.prepare('SELECT * FROM records WHERE id = ?').get(Number(req.params.id)) as
      | RecordRow
      | undefined;
    if (!row) {
      res.status(404).json({ error: 'Record not found' });
      return;
    }
    const data = clean(req.body ?? {});
    // Merge over the API-shaped record (camelCase) so validation sees requestNo etc.
    const merged = { ...toApi(row), ...data };
    const error = validate(merged as Record<string, unknown>, registry);
    if (error) {
      res.status(400).json({ error });
      return;
    }
    if (merged.category && merged.requestNo && merged.revisionNo) {
      const dup = db
        .prepare(
          "SELECT 1 FROM records WHERE category = ? AND request_no = ? AND revision_no = ? AND id != ? AND deleted_at = ''",
        )
        .get(
          String(merged.category),
          String(merged.requestNo),
          String(merged.revisionNo),
          row.id,
        );
      if (dup) {
        res.status(409).json({ error: 'A record with this category + request no. + revision no. already exists' });
        return;
      }
    }
    // Status transition laws (ticket 033 + registry).
    const prevStatus = row.status;
    const nextStatus = String(merged.status ?? row.status);
    if (prevStatus !== nextStatus) {
      const allowed = allowedTransitionsFor(registry, prevStatus);
      if (allowed.length > 0 && !allowed.includes(nextStatus)) {
        res.status(400).json({ error: `Status ${prevStatus} can only change to ${allowed.join(', ')}` });
        return;
      }
    }
    db.prepare(
      `UPDATE records SET
        category = ?, request_no = ?, revision_no = ?, description = ?, zone = ?, floor = ?,
        engineer = ?, fork = ?, sent_date = ?, sent_by_consultant_date = ?, reply_date = ?,
        reply_by_contractor_date = ?, status = ?, hyperlink = ?, data_hyperlink = ?,
        documents_json = ?, updated_at = datetime('now')
       WHERE id = ?`,
    ).run(
      String(merged.category ?? ''), String(merged.requestNo ?? ''), String(merged.revisionNo ?? ''),
      String(merged.description ?? ''), String(merged.zone ?? ''), String(merged.floor ?? ''),
      String(merged.engineer ?? ''), String(merged.fork ?? ''), String(merged.sentDate ?? ''),
      String(merged.sentByConsultantDate ?? ''), String(merged.replyDate ?? ''),
      String(merged.replyByContractorDate ?? ''), String(merged.status ?? 'P'),
      String(merged.hyperlink ?? ''), String(merged.dataHyperlink ?? ''),
      String(data.documents !== undefined ? data.documents : (row.documents_json || '[]')), row.id,
    );
    const updated = db
      .prepare('SELECT * FROM records WHERE id = ?')
      .get(row.id) as unknown as RecordRow;
    // Held-PP engine (ticket 033): C holds a placeholder; A/B release it; SC→PP
    // deletes the SC record and recreates the placeholder (same revision).
    if (prevStatus !== nextStatus) {
      if (nextStatus === 'C') createPlaceholder(db, updated);
      if (nextStatus === 'A' || nextStatus === 'B') removePlaceholders(db, updated.category, updated.request_no);
      if (nextStatus === 'PP' && prevStatus === 'SC') {
        db.prepare('DELETE FROM records WHERE id = ?').run(updated.id);
        createPlaceholder(db, updated, updated.revision_no);
        res.json({ ok: true, deleted: true });
        return;
      }
    }
    const changed = FIELDS.filter(
      (f) => f !== 'documents' && String(merged[f] ?? '') !== String(toApi(row)[f] ?? ''),
    );
    const changes = changed
      .map((f) => {
        const before = String(toApi(row)[f] ?? '');
        const after = String(merged[f] ?? '');
        return after ? `${f} ${before ? before + '→' : ''}${after}` : f;
      })
      .join(', ');
    logEvent(
      db,
      req.user!.username,
      'update',
      `${updated.category} ${updated.request_no}${updated.revision_no ? ' rev ' + padRev(updated.revision_no) : ''}`,
      changes ? `Updated: ${changes}` : 'Updated record',
    );
    res.json(toApi(updated));
  });

r.delete('/:id', adminRequired, (req, res) => {
    const row = db
      .prepare("SELECT * FROM records WHERE id = ? AND deleted_at = ''")
      .get(Number(req.params.id)) as unknown as RecordRow | undefined;
    if (!row) {
      res.status(404).json({ error: 'Record not found' });
      return;
    }
    // Soft delete (ticket 031): the record moves to the Trash, restorable.
    db.prepare("UPDATE records SET deleted_at = datetime('now') WHERE id = ?").run(row.id);
    logEvent(
      db,
      req.user!.username,
      'trash',
      `${row.category} ${row.request_no}`,
      `Trashed ${row.category} ${row.request_no}${row.revision_no ? ' rev ' + padRev(row.revision_no) : ''}`,
    );
    res.json({ ok: true });
  });

  /** Super edit (admin only): update metadata for ALL revisions with the same
   *  category + request_no as the given record. Logs the batch update. */
  r.post('/:id/super-edit', adminRequired, (req, res) => {
    const row = db.prepare('SELECT * FROM records WHERE id = ?').get(Number(req.params.id)) as RecordRow | undefined;
    if (!row) {
      res.status(404).json({ error: 'Record not found' });
      return;
    }
    const data = req.body ?? {};
    const zone = String(data.zone ?? row.zone);
    const floor = String(data.floor ?? row.floor);
    const engineer = String(data.engineer ?? row.engineer);
    const description = String(data.description ?? row.description);
    const sentDate = String(data.sentDate ?? row.sent_date);
    const affected = db
      .prepare(
        `UPDATE records SET
          zone = ?, floor = ?, engineer = ?, description = ?, sent_date = ?,
          updated_at = datetime('now')
         WHERE category = ? AND request_no = ? AND deleted_at = ''`,
      )
      .run(zone, floor, engineer, description, sentDate, row.category, row.request_no);
    logEvent(
      db,
      req.user!.username,
      'super-edit',
      `${row.category} ${row.request_no}`,
      `Super-edited all revisions (${affected.changes} rows): zone/floor/member/desc/sentDate`,
    );
    res.json({ ok: true, affected: affected.changes });
  });

  /** Create the next revision of a request (copies fields, suggests status). */
  r.post('/:id/revision', (req, res) => {
    const row = db
      .prepare("SELECT * FROM records WHERE id = ? AND deleted_at = ''")
      .get(Number(req.params.id)) as unknown as RecordRow | undefined;
    if (!row) {
      res.status(404).json({ error: 'Record not found' });
      return;
    }
    const { revisionNo, status } = suggestNext(row);
    // The held PP placeholder (ticket 033) already occupies the next revision —
    // claim it instead of inserting a duplicate.
    const existing = db
      .prepare(
        "SELECT * FROM records WHERE category = ? AND request_no = ? AND revision_no = ? AND deleted_at = ''",
      )
      .get(row.category, row.request_no, revisionNo) as unknown as RecordRow | undefined;
    let created: RecordRow;
    if (existing) {
      db.prepare('UPDATE records SET parent_id = ?, created_by = ? WHERE id = ?').run(
        row.id,
        req.user!.id,
        existing.id,
      );
      created = existing;
    } else {
      const info = db
        .prepare(
          `INSERT INTO records (category, request_no, revision_no, description, zone, floor, engineer,
          fork, sent_date, sent_by_consultant_date, reply_date, reply_by_contractor_date,
          status, hyperlink, data_hyperlink, parent_id, created_by, documents_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          row.category, row.request_no, revisionNo, row.description, row.zone, row.floor,
          row.engineer, row.fork, row.sent_date, row.sent_by_consultant_date, row.reply_date,
          row.reply_by_contractor_date, status, row.hyperlink, row.data_hyperlink, row.id,
          req.user!.id, row.documents_json ?? '[]',
        );
      created = db
        .prepare('SELECT * FROM records WHERE id = ?')
        .get(Number(info.lastInsertRowid)) as unknown as RecordRow;
    }
    logEvent(
      db,
      req.user!.username,
      'revision',
      `${created.category} ${created.request_no}`,
      `New revision ${padRev(created.revision_no)} (suggested ${status}) for ${created.category} ${created.request_no}`,
    );
    res.status(201).json({ ...toApi(created), suggested: true });
  });

  return r;
}
