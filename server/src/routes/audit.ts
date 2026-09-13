import { Router } from 'express';
import type { DatabaseSync } from 'node:sqlite';
import { adminRequired, authRequired } from '../auth.ts';

/** mventor-ticket-012: read-only admin access to the foundation audit trail.
 *  Mirrors logsRouter conventions (limit-capped, newest first) plus optional
 *  subject/action filters. Admin-gated deliberately: broader (engineer/owner)
 *  visibility is a later policy slice, not a silent default. */

export interface AuditRow {
  id: number;
  person_id: number | null;
  organization_id: number | null;
  role_context: string;
  project_id: number | null;
  subject_type: string;
  subject_id: number;
  action: string;
  reason: string;
  payload_json: string;
  created_at: string;
}

export function auditRouter(db: DatabaseSync): Router {
  const r = Router();
  r.use(authRequired);

  r.get('/', adminRequired, (req, res) => {
    const limit = Math.min(Number(req.query.limit ?? 50) || 50, 200);
    const where: string[] = [];
    const args: (string | number)[] = [];
    for (const [key, col] of [['subject_type', 'subject_type'], ['action', 'action']] as const) {
      const v = req.query[key];
      if (typeof v === 'string' && v) { where.push(`${col} = ?`); args.push(v); }
    }
    if (typeof req.query.subject_id === 'string' && req.query.subject_id) {
      where.push('subject_id = ?'); args.push(Number(req.query.subject_id) || 0);
    }
    const rows = db
      .prepare(`SELECT * FROM audit_events${where.length ? ` WHERE ${where.join(' AND ')}` : ''} ORDER BY id DESC LIMIT ?`)
      .all(...args, limit) as unknown as AuditRow[];
    const total = (db.prepare(`SELECT COUNT(*) AS n FROM audit_events${where.length ? ` WHERE ${where.join(' AND ')}` : ''}`).get(...args) as { n: number }).n;
    res.json({
      total,
      items: rows.map((row) => {
        let payload: unknown = {};
        try { payload = JSON.parse(row.payload_json || '{}'); } catch { payload = {}; }
        return {
          id: row.id,
          personId: row.person_id,
          organizationId: row.organization_id,
          roleContext: row.role_context,
          projectId: row.project_id,
          subjectType: row.subject_type,
          subjectId: row.subject_id,
          action: row.action,
          reason: row.reason,
          payload,
          createdAt: row.created_at,
        };
      }),
    });
  });

  return r;
}
