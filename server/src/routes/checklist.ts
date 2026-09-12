import { Router } from 'express';
import type { DatabaseSync } from 'node:sqlite';
import { authRequired } from '../auth.ts';
import type { DomainRegistry } from '../domain-registry.ts';

/**
 * Checklist (ticket 071, v3.1 items 35-39) — the requests made on a chosen
 * day, grouped by category, for the A4 Landscape checklist HTML.
 * SO has NO checklist; NCR is included normally.
 */
export function checklistRouter(db: DatabaseSync, registry: DomainRegistry): Router {
  const r = Router();
  r.use(authRequired);

  r.get('/', (req, res) => {
    const date = String(req.query.date ?? '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      res.status(400).json({ error: 'date must be YYYY-MM-DD' });
      return;
    }
    const statusFilter = String(req.query.status ?? 'all'); // all | pending | made
    const rows = db
      .prepare(
        "SELECT category, request_no, revision_no, description, sent_date, status FROM records WHERE deleted_at = '' AND sent_date = ? AND category != 'SO' ORDER BY category, request_no, revision_no",
      )
      .all(date) as unknown as Array<{
      category: string;
      request_no: string;
      revision_no: string;
      description: string;
      sent_date: string;
      status: string;
    }>;
    const items = rows
      .filter((row) => {
        if (statusFilter === 'pending') return row.status === 'P';
        if (statusFilter === 'made') return row.status !== 'P';
        return true;
      })
      .map((row) => ({
        category: row.category,
        code: `${row.category}-${row.request_no}`,
        requestNo: row.revision_no || '00',
        description: row.description,
        sentDate: row.sent_date,
        status: row.status,
      }));
    // Group by category, preserving the domain category order.
    const order = ['IR', 'SD', 'DS', 'DR', 'MIR', 'MS', 'QS', 'RFI', 'NCR', 'QC', 'CBR'];
    const groups = new Map<string, typeof items>();
    for (const it of items) {
      if (!groups.has(it.category)) groups.set(it.category, []);
      groups.get(it.category)!.push(it);
    }
    const sections = [...groups.entries()]
      .sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]))
      .map(([category, list]) => ({ category, items: list }));
    res.json({ date, total: items.length, sections, cycles: registry.getCycles() });
  });

  return r;
}