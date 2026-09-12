import { Router } from 'express';
import type { DatabaseSync } from 'node:sqlite';
import { authRequired, adminRequired } from '../auth.ts';

interface HelpRow {
  id: number;
  parent_id: number;
  kind: string;
  en: string;
  ar: string;
  sort_order: number;
}

/**
 * Help Docs (ticket 072/093) — date-based user notes + an editable structured
 * document (sections → headers → bullets). Admin edits; engineers read.
 * The cycles documentation comes from /api/meta (server-authoritative).
 */
export function helpRouter(db: DatabaseSync): Router {
  const r = Router();
  r.use(authRequired);

  const allRows = (): HelpRow[] =>
    db
      .prepare('SELECT id, parent_id, kind, en, ar, sort_order FROM help_docs ORDER BY sort_order, id')
      .all() as unknown as HelpRow[];

  /** The editable help document as a tree: sections → headers → bullets. */
  r.get('/docs', (_req, res) => {
    const rows = allRows();
    const sections = rows
      .filter((x) => x.kind === 'section')
      .map((s) => ({
        id: s.id,
        en: s.en,
        ar: s.ar,
        headers: rows
          .filter((h) => h.kind === 'header' && h.parent_id === s.id)
          .map((h) => ({
            id: h.id,
            en: h.en,
            ar: h.ar,
            bullets: rows
              .filter((b) => b.kind === 'bullet' && b.parent_id === h.id)
              .map((b) => ({ id: b.id, en: b.en, ar: b.ar })),
          })),
      }));
    res.json({ sections });
  });

  /** Create a section / header / bullet (admin). */
  r.post('/docs', adminRequired, (req, res) => {
    const body = req.body ?? {};
    const kind = String(body.kind ?? '');
    const parentId = Number(body.parentId ?? 0) || 0;
    const en = String(body.en ?? '').trim();
    const ar = String(body.ar ?? '').trim();
    if (!['section', 'header', 'bullet'].includes(kind)) {
      res.status(400).json({ error: 'kind must be section | header | bullet' });
      return;
    }
    if (!en && !ar) {
      res.status(400).json({ error: 'en or ar is required' });
      return;
    }
    const max = (db.prepare('SELECT COALESCE(MAX(sort_order), 0) AS m FROM help_docs').get() as { m: number }).m;
    const info = db
      .prepare('INSERT INTO help_docs (parent_id, kind, en, ar, sort_order) VALUES (?, ?, ?, ?, ?)')
      .run(parentId, kind, en, ar, max + 1);
    res.status(201).json({ ok: true, id: Number(info.lastInsertRowid) });
  });

  /** Update a section / header / bullet (admin). */
  r.patch('/docs/:id', adminRequired, (req, res) => {
    const id = Number(req.params.id);
    const row = db.prepare('SELECT id FROM help_docs WHERE id = ?').get(id);
    if (!row) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    const body = req.body ?? {};
    const en = String(body.en ?? '').trim();
    const ar = String(body.ar ?? '').trim();
    db.prepare('UPDATE help_docs SET en = ?, ar = ? WHERE id = ?').run(en, ar, id);
    res.json({ ok: true });
  });

  /** Delete a section / header / bullet (admin) — children go with it. */
  r.delete('/docs/:id', adminRequired, (req, res) => {
    const id = Number(req.params.id);
    const row = db.prepare('SELECT id FROM help_docs WHERE id = ?').get(id);
    if (!row) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    db.prepare('DELETE FROM help_docs WHERE id = ? OR parent_id = ?').run(id, id);
    res.json({ ok: true });
  });

  /** Notes for a date (or all when no date). */
  r.get('/notes', (req, res) => {
    const date = String(req.query.date ?? '').trim();
    const rows = date
      ? (db
          .prepare('SELECT id, note_date, note, created_by, created_at FROM app_notes WHERE note_date = ? ORDER BY id DESC')
          .all(date) as unknown as Array<{ id: number; note_date: string; note: string; created_by: string; created_at: string }>)
      : (db
          .prepare('SELECT id, note_date, note, created_by, created_at FROM app_notes ORDER BY note_date DESC, id DESC LIMIT 200')
          .all() as unknown as Array<{ id: number; note_date: string; note: string; created_by: string; created_at: string }>);
    res.json({
      items: rows.map((row) => ({
        id: row.id,
        noteDate: row.note_date,
        note: row.note,
        createdBy: row.created_by,
        createdAt: row.created_at,
      })),
    });
  });

  /** Add a note for a date. */
  r.post('/notes', (req, res) => {
    const body = req.body ?? {};
    const noteDate = String(body.noteDate ?? '').trim();
    const note = String(body.note ?? '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(noteDate)) {
      res.status(400).json({ error: 'noteDate must be YYYY-MM-DD' });
      return;
    }
    if (!note) {
      res.status(400).json({ error: 'note is required' });
      return;
    }
    const info = db
      .prepare('INSERT INTO app_notes (note_date, note, created_by) VALUES (?, ?, ?)')
      .run(noteDate, note, req.user!.username);
    res.status(201).json({ ok: true, id: Number(info.lastInsertRowid) });
  });

  /** Delete a note — the author or an admin. */
  r.delete('/notes/:id', (req, res) => {
    const id = Number(req.params.id);
    const row = db.prepare('SELECT created_by FROM app_notes WHERE id = ?').get(id) as
      | { created_by: string }
      | undefined;
    if (!row) {
      res.status(404).json({ error: 'Note not found' });
      return;
    }
    if (row.created_by !== req.user!.username && req.user!.role !== 'admin') {
      res.status(403).json({ error: 'Only the author or an admin can delete this note' });
      return;
    }
    db.prepare('DELETE FROM app_notes WHERE id = ?').run(id);
    res.json({ ok: true });
  });

  return r;
}