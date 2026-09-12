import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { adminRequired, authRequired } from '../auth.ts';
import { logEvent } from './logs.ts';
import type { Config } from '../config.ts';

/**
 * Vault notifications (ticket 073, v3.2 item 41) — notes that notify users
 * ("active users only"), attachable to any element with a date. Clicking a
 * note opens a popup; the user can respond or mark "notified" (becomes a
 * label). The maker gets the respond. Self-notify + self-respond is logged
 * without a UI trigger. Admins see all notify logs via a secret icon next to
 * the trash.
 */

interface NotifyRow {
  id: number;
  title: string;
  body: string;
  target: string;
  notify_date: string;
  to_user: string;
  from_user: string;
  status: string;
  response: string;
  created_at: string;
  notified_at: string;
  responded_at: string;
  table_json: string;
  deleted_at: string;
}

/** A saved notify table: headers + rows of values (cell strings). */
export interface NotifyTable {
  headers: string[];
  rows: string[][];
}

const MAX_HEADERS = 12;
const MAX_ROWS = 50;
const MAX_CELL = 200;

/** Validate + normalize a client-supplied table to NotifyTable (or null). */
function sanitizeTable(value: unknown): NotifyTable | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as { headers?: unknown; rows?: unknown };
  if (!Array.isArray(v.headers) || !Array.isArray(v.rows)) return null;
  const headers = v.headers.slice(0, MAX_HEADERS).map((h) => String(h ?? '').trim().slice(0, MAX_CELL));
  const rows = v.rows
    .slice(0, MAX_ROWS)
    .map((r) => (Array.isArray(r) ? r.slice(0, MAX_HEADERS).map((c) => String(c ?? '').slice(0, MAX_CELL)) : []));
  if (headers.every((h) => !h) || headers.length === 0) return null;
  return { headers, rows };
}

const toApi = (row: NotifyRow) => {
  let table: NotifyTable | null = null;
  if (row.table_json) {
    try {
      const parsed = JSON.parse(row.table_json) as unknown;
      table = sanitizeTable(parsed);
    } catch {
      table = null;
    }
  }
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    target: row.target,
    notifyDate: row.notify_date,
    toUser: row.to_user,
    fromUser: row.from_user,
    status: row.status,
    response: row.response,
    createdAt: row.created_at,
    notifiedAt: row.notified_at,
    respondedAt: row.responded_at,
    table,
    deletedAt: row.deleted_at,
  };
};

export function notifyRouter(db: DatabaseSync, config: Config): Router {
  const r = Router();
  r.use(authRequired);

  /** Active rows only — every list scope below must exclude trashed. */
  const ACTIVE = "deleted_at = ''";
  const TRASHED = "deleted_at != ''";

  /** Write a purge metadata file for a notification (mirrors records purge, v3 item 25). */
  const writePurgeMetadata = (row: NotifyRow, purgedBy: string): string => {
    const dir = path.join(config.dataDir, 'purged-logs');
    fs.mkdirSync(dir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const file = path.join(dir, `purged-notify-${row.id}-${stamp}.md`);
    const lines = [
      '# Purged Notification Metadata',
      '',
      `- Purged by: ${purgedBy}`,
      `- Purged at: ${new Date().toISOString()}`,
      `- Deleted at: ${row.deleted_at || 'unknown'}`,
      `- Notification id: ${row.id}`,
      '',
      '## Notification',
      '',
      `- Title: ${row.title || '—'}`,
      `- Body: ${row.body || '—'}`,
      `- Target: ${row.target || '—'}`,
      `- Notify Date: ${row.notify_date || '—'}`,
      `- To: ${row.to_user || 'all'}`,
      `- From: ${row.from_user || '—'}`,
      `- Status: ${row.status}`,
      `- Response: ${row.response || '—'}`,
      `- Created At: ${row.created_at || '—'}`,
      '',
    ];
    fs.writeFileSync(file, lines.join('\n'), 'utf8');
    return file;
  };

  /** List — scope: all | mine (to me) | user=<name> | sent (by me). */
  r.get('/', (req, res) => {
    const scope = String(req.query.scope ?? 'all');
    const user = String(req.query.user ?? '');
    const me = req.user!.username;
    let rows: NotifyRow[];
    if (scope === 'mine') {
      // Strict: only direct messages to me. Broadcasts (to_user='') go to scope=all.
      rows = db
        .prepare(`SELECT * FROM app_notifications WHERE ${ACTIVE} AND to_user = ? ORDER BY id DESC LIMIT 200`)
        .all(me) as unknown as NotifyRow[];
    } else if (scope === 'sent') {
      // Strict: only notifications I sent. Drops broadcasts (no from_user attribution).
      rows = db
        .prepare(`SELECT * FROM app_notifications WHERE ${ACTIVE} AND from_user = ? ORDER BY id DESC LIMIT 200`)
        .all(me) as unknown as NotifyRow[];
    } else if (user) {
      rows = db
        .prepare(`SELECT * FROM app_notifications WHERE ${ACTIVE} AND from_user = ? ORDER BY id DESC LIMIT 200`)
        .all(user) as unknown as NotifyRow[];
    } else {
      rows = db
        .prepare(`SELECT * FROM app_notifications WHERE ${ACTIVE} ORDER BY id DESC LIMIT 200`)
        .all() as unknown as NotifyRow[];
    }
    res.json({ items: rows.map(toApi) });
  });

  /** Trashed notifications (ticket 134) — auth users see their own trashed
   *  (to or from them); Dev/Admin see all. Viewable later + restore. */
  r.get('/trash', (req, res) => {
    const me = req.user!.username;
    let rows: NotifyRow[];
    if (req.user!.role === 'admin' || req.user!.role === 'dev') {
      rows = db
        .prepare(`SELECT * FROM app_notifications WHERE ${TRASHED} ORDER BY deleted_at DESC, id DESC LIMIT 200`)
        .all() as unknown as NotifyRow[];
    } else {
      rows = db
        .prepare(
          `SELECT * FROM app_notifications WHERE ${TRASHED} AND (to_user = ? OR from_user = ?) ORDER BY deleted_at DESC, id DESC LIMIT 200`,
        )
        .all(me, me) as unknown as NotifyRow[];
    }
    res.json({ items: rows.map(toApi) });
  });

  /** Create a notification (to a user, or everyone when toUser is empty). */
  r.post('/', (req, res) => {
    const body = req.body ?? {};
    const title = String(body.title ?? '').trim();
    const note = String(body.body ?? '').trim();
    if (!title && !note) {
      res.status(400).json({ error: 'title or body is required' });
      return;
    }
    const notifyDate = String(body.notifyDate ?? '').trim();
    if (notifyDate && !/^\d{4}-\d{2}-\d{2}$/.test(notifyDate)) {
      res.status(400).json({ error: 'notifyDate must be YYYY-MM-DD' });
      return;
    }
    const table = sanitizeTable(body.table);
    const info = db
      .prepare(
        `INSERT INTO app_notifications (title, body, target, notify_date, to_user, from_user, table_json)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        title,
        note,
        String(body.target ?? '').trim(),
        notifyDate,
        String(body.toUser ?? '').trim(),
        req.user!.username,
        table ? JSON.stringify(table) : '',
      );
    const row = db.prepare('SELECT * FROM app_notifications WHERE id = ?').get(Number(info.lastInsertRowid)) as
      | NotifyRow
      | undefined;
    // Self-notifications are logged WITHOUT a UI trigger (v3.2).
    if (row && row.to_user !== req.user!.username) {
      logEvent(
        db,
        req.user!.username,
        'notify',
        row.target || 'vault',
        `Notified ${row.to_user || 'all'} — ${title || note.slice(0, 60)}`,
      );
    }
    res.status(201).json({ ok: true, id: row?.id });
  });

  /** SC scheduling (ticket 112) — a self-notification with a combined
   *  date+time stored in notify_date ("YYYY-MM-DD HH:MM"). When the client
   *  polls and the datetime has passed, it shows the Print / Delegate popup. */
  r.post('/sc-schedule', (req, res) => {
    const body = req.body ?? {};
    const date = String(body.date ?? '').trim();
    const time = String(body.time ?? '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      res.status(400).json({ error: 'date must be YYYY-MM-DD' });
      return;
    }
    if (!/^\d{2}:\d{2}$/.test(time)) {
      res.status(400).json({ error: 'time must be HH:MM' });
      return;
    }
    const target = String(body.target ?? '').trim();
    const info = db
      .prepare(
        `INSERT INTO app_notifications (title, body, target, notify_date, to_user, from_user)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        String(body.title ?? ''),
        String(body.body ?? ''),
        target,
        `${date} ${time}`,
        req.user!.username,
        req.user!.username,
      );
    const row = db.prepare('SELECT * FROM app_notifications WHERE id = ?').get(Number(info.lastInsertRowid)) as
      | NotifyRow
      | undefined;
    logEvent(
      db,
      req.user!.username,
      'notify',
      target || 'vault',
      `Scheduled SC notify ${date} ${time} — ${String(body.title ?? '').slice(0, 60)}`,
    );
    res.status(201).json({ ok: true, id: row?.id });
  });

  /** Mark "notified" — the click becomes a label. */  r.post('/:id/notified', (req, res) => {
    const id = Number(req.params.id);
    const row = db.prepare('SELECT * FROM app_notifications WHERE id = ?').get(id) as NotifyRow | undefined;
    if (!row) {
      res.status(404).json({ error: 'Notification not found' });
      return;
    }
    db.prepare("UPDATE app_notifications SET status = 'notified', notified_at = datetime('now') WHERE id = ?").run(id);
    // The maker gets a respond (logged; self-respond has no UI trigger).
    if (row.from_user !== req.user!.username) {
      logEvent(
        db,
        req.user!.username,
        'notify',
        row.target || 'vault',
        `${req.user!.username} marked notified: ${row.title || row.body.slice(0, 60)}`,
      );
    }
    res.json({ ok: true });
  });

  /** Respond to a notification. */
  r.post('/:id/respond', (req, res) => {
    const id = Number(req.params.id);
    const row = db.prepare('SELECT * FROM app_notifications WHERE id = ?').get(id) as NotifyRow | undefined;
    if (!row) {
      res.status(404).json({ error: 'Notification not found' });
      return;
    }
    const response = String(req.body?.response ?? '').trim();
    if (!response) {
      res.status(400).json({ error: 'response is required' });
      return;
    }
    db.prepare(
      "UPDATE app_notifications SET status = 'responded', response = ?, responded_at = datetime('now') WHERE id = ?",
    ).run(response, id);
    // The maker gets the respond (logged; self-respond has no UI trigger).
    if (row.from_user !== req.user!.username) {
      logEvent(
        db,
        req.user!.username,
        'notify',
        row.target || 'vault',
        `${req.user!.username} responded to ${row.from_user}: ${response.slice(0, 60)}`,
      );
    }
    res.json({ ok: true });
  });

  /** TRASH (soft delete) — the notification is hidden from active views but
   *  saved for later viewing/restore (ticket 134). Author or Dev/Admin. */
  r.delete('/:id', (req, res) => {
    const id = Number(req.params.id);
    const row = db.prepare(`SELECT * FROM app_notifications WHERE id = ? AND ${ACTIVE}`).get(id) as
      | NotifyRow
      | undefined;
    if (!row) {
      res.status(404).json({ error: 'Notification not found' });
      return;
    }
    const isAdmin = req.user!.role === 'admin' || req.user!.role === 'dev';
    if (!isAdmin && row.from_user !== req.user!.username) {
      res.status(403).json({ error: 'Only the author or an admin can trash this notification' });
      return;
    }
    db.prepare(`UPDATE app_notifications SET deleted_at = datetime('now') WHERE id = ? AND ${ACTIVE}`).run(id);
    logEvent(
      db,
      req.user!.username,
      'notify',
      row.target || 'vault',
      `Trashed notification ${row.id} — ${(row.title || row.body).slice(0, 60)}`,
    );
    res.json({ ok: true });
  });

  /** RESTORE a trashed notification — author or Dev/Admin (ticket 134). */
  r.post('/:id/restore', (req, res) => {
    const id = Number(req.params.id);
    const row = db.prepare(`SELECT * FROM app_notifications WHERE id = ? AND ${TRASHED}`).get(id) as
      | NotifyRow
      | undefined;
    if (!row) {
      res.status(404).json({ error: 'Trashed notification not found' });
      return;
    }
    const isAdmin = req.user!.role === 'admin' || req.user!.role === 'dev';
    if (!isAdmin && row.from_user !== req.user!.username) {
      res.status(403).json({ error: 'Only the author or an admin can restore this notification' });
      return;
    }
    db.prepare(`UPDATE app_notifications SET deleted_at = '' WHERE id = ? AND ${TRASHED}`).run(id);
    logEvent(
      db,
      req.user!.username,
      'notify',
      row.target || 'vault',
      `Restored notification ${row.id} — ${(row.title || row.body).slice(0, 60)}`,
    );
    res.json({ ok: true });
  });

  /** PURGE a trashed notification permanently — Dev/Admin only. Writes a
   *  metadata file into data/purged-logs/ (ticket 134, pattern of ticket 031). */
  r.delete('/:id/purge', adminRequired, (req, res) => {
    const id = Number(req.params.id);
    const row = db.prepare(`SELECT * FROM app_notifications WHERE id = ? AND ${TRASHED}`).get(id) as
      | NotifyRow
      | undefined;
    if (!row) {
      res.status(404).json({ error: 'Trashed notification not found' });
      return;
    }
    db.prepare('DELETE FROM app_notifications WHERE id = ?').run(id);
    const file = writePurgeMetadata(row, req.user!.username);
    logEvent(db, req.user!.username, 'purge', row.target || 'vault', `Purged notification ${row.id}`);
    res.json({ ok: true, metadataFile: file });
  });

  /** Admin: notify logs — every ACTIVE notification with its lifecycle. */
  r.get('/logs', adminRequired, (_req, res) => {
    const rows = db
      .prepare(`SELECT * FROM app_notifications WHERE ${ACTIVE} ORDER BY id DESC LIMIT 500`)
      .all() as unknown as NotifyRow[];
    res.json({ items: rows.map(toApi) });
  });

  return r;
}