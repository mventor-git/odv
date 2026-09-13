import type { DatabaseSync } from 'node:sqlite';

/** mventor-ticket-011: foundation audit emission helper.
 *
 *  Best-effort by design: it NEVER throws into callers. Legacy writes must
 *  succeed even if the audit insert fails (same class as app_logs today).
 *  person_id stays NULL until the users<->persons link lands (later ticket);
 *  the actor username + role travel in payload_json so no attribution is lost.
 */
export interface AuditEmit {
  personId?: number | null;
  organizationId?: number | null;
  roleContext?: string;
  projectId?: number | null;
  subjectType: string;
  subjectId?: number | null;
  action: string;
  reason?: string;
  payload?: Record<string, unknown>;
}

export function emitAudit(db: DatabaseSync, evt: AuditEmit): void {
  try {
    db.prepare(
      `INSERT INTO audit_events (person_id, organization_id, role_context, project_id, subject_type, subject_id, action, reason, payload_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      evt.personId ?? null,
      evt.organizationId ?? null,
      evt.roleContext ?? '',
      evt.projectId ?? null,
      evt.subjectType,
      evt.subjectId ?? 0,
      evt.action,
      evt.reason ?? '',
      JSON.stringify(evt.payload ?? {}),
    );
  } catch {
    // Fail-safe: audit must never break the operation it records.
  }
}
