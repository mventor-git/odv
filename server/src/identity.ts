import type { DatabaseSync } from 'node:sqlite';

/** mventor-ticket-014: identity resolution core.
 *
 *  Turns a session user into "who may act, where":
 *  person ← user_person_links, job facts ← org_memberships, authority ←
 *  role_assignments + delegations — status-filtered, TIME WINDOWS DERIVED AT
 *  READ TIME (expired rows are never rewritten; history stays as it was).
 *
 *  An unlinked user is NOT an error: empty resolution is returned, which keeps
 *  every legacy path byte-identical until the approved migration/dual-write
 *  slice decides to gate sessions on this data. */

export function isoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Open-ended windows: empty bound = unbounded on that side. */
export function withinWindow(from: string, to: string, date: string = isoDate()): boolean {
  return (!from || from <= date) && (!to || to >= date);
}

export interface PersonRef {
  id: number;
  code: string;
  display_name: string;
}

export interface MembershipRef {
  id: number;
  organizationId: number;
  orgCode: string;
  jobTitle: string;
}

export interface AssignmentRef {
  id: number;
  projectRoleId: number;
  roleCode: string;
  projectId: number;
  organizationId: number;
  orgCode: string;
  scope: string;
  validFrom: string;
  validTo: string;
  status: string;
  live: boolean;
  viaDelegation: boolean;
}

export interface DelegationRef {
  id: number;
  fromAssignmentId: number;
  reason: string;
  validFrom: string;
  validTo: string;
  status: string;
  live: boolean;
}

export interface ResolvedActor {
  userId: number;
  person: PersonRef | null;
  memberships: MembershipRef[];
  assignments: AssignmentRef[];
  delegationsIn: DelegationRef[];
  /** live own + delegated authority — the answer to "where may I act". */
  authority: AssignmentRef[];
}

const ASSIGN_SQL = `SELECT a.id, a.project_role_id AS projectRoleId, r.code AS roleCode, r.project_id AS projectId,
  a.organization_id AS organizationId, o.code AS orgCode, a.scope, a.valid_from AS validFrom, a.valid_to AS validTo, a.status
  FROM role_assignments a JOIN project_roles r ON r.id = a.project_role_id JOIN organizations o ON o.id = a.organization_id
  WHERE a.person_id = ? ORDER BY a.id`;

const RAW_ASSIGNS = `SELECT a.id, a.project_role_id AS projectRoleId, r.code AS roleCode, r.project_id AS projectId,
  a.organization_id AS organizationId, o.code AS orgCode, a.scope, a.valid_from AS validFrom, a.valid_to AS validTo, a.status
  FROM role_assignments a JOIN project_roles r ON r.id = a.project_role_id JOIN organizations o ON o.id = a.organization_id WHERE a.id = ?`;

type RawAssignment = Omit<AssignmentRef, 'live' | 'viaDelegation'>;

export function resolveActor(db: DatabaseSync, userId: number, date: string = isoDate()): ResolvedActor {
  const empty: ResolvedActor = { userId, person: null, memberships: [], assignments: [], delegationsIn: [], authority: [] };
  const link = db.prepare('SELECT person_id FROM user_person_links WHERE user_id = ?').get(userId) as { person_id: number } | undefined;
  if (!link) return empty;
  const person = db.prepare('SELECT id, code, display_name FROM persons WHERE id = ?').get(link.person_id) as PersonRef | undefined;
  if (!person) return empty; // link to a missing person: treated as unlinked (never invented)

  const memberships = db
    .prepare(`SELECT m.id, m.organization_id AS organizationId, o.code AS orgCode, m.job_title AS jobTitle
      FROM org_memberships m JOIN organizations o ON o.id = m.organization_id
      WHERE m.person_id = ? AND m.active = 1 ORDER BY m.id`)
    .all(link.person_id) as unknown as MembershipRef[];

  const assignments = (db.prepare(ASSIGN_SQL).all(link.person_id) as unknown as RawAssignment[]).map((a) => ({
    ...a,
    live: a.status === 'active' && withinWindow(a.validFrom, a.validTo, date),
    viaDelegation: false,
  }));

  const delegationsIn = (db
    .prepare(`SELECT d.id, d.from_assignment_id AS fromAssignmentId, d.reason, d.valid_from AS validFrom, d.valid_to AS validTo, d.status
      FROM delegations d WHERE d.to_person_id = ? ORDER BY d.id`)
    .all(link.person_id) as unknown as Omit<DelegationRef, 'live'>[]).map((d) => ({
    ...d,
    live: d.status === 'active' && withinWindow(d.validFrom, d.validTo, date),
  }));

  const authority = [...assignments.filter((a) => a.live)];
  for (const d of delegationsIn.filter((x) => x.live)) {
    const parent = db.prepare(RAW_ASSIGNS).get(d.fromAssignmentId) as RawAssignment | undefined;
    if (parent && parent.status === 'active' && withinWindow(parent.validFrom, parent.validTo, date)) {
      authority.push({ ...parent, live: true, viaDelegation: true });
    }
  }
  return { userId, person, memberships, assignments, delegationsIn, authority };
}

/** Typed attribution for audit emits: NULL person = legacy/unlinked actor. */
export function personIdForUser(db: DatabaseSync, userId: number): number | null {
  const link = db.prepare('SELECT person_id FROM user_person_links WHERE user_id = ?').get(userId) as { person_id: number } | undefined;
  return link?.person_id ?? null;
}

/** Invariant helper for the identity API (ticket-014): active membership gate. */
export function isActiveMember(db: DatabaseSync, personId: number, organizationId: number): boolean {
  return !!db.prepare('SELECT 1 AS x FROM org_memberships WHERE person_id = ? AND organization_id = ? AND active = 1').get(personId, organizationId);
}
