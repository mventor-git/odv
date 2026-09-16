import { Router, type Request } from 'express';
import type { DatabaseSync } from 'node:sqlite';
import { adminRequired, authRequired } from '../auth.ts';
import { emitAudit } from '../audit.ts';
import { personIdForUser, resolveActor, isActiveMember, withinWindow } from '../identity.ts';

/** mventor-ticket-014: identity enforcement API — the guard-rails that turn the
 *  modeled identity foundation into actual domain behavior:
 *  - an assignment REQUIRES an active org membership for that person (§4: orgs
 *    control their own people; authority flows through employment),
 *  - a person link is 1:1 (user_id AND person_id UNIQUE are DB-enforced),
 *  - revocation flips status; rows are never deleted (history stays),
 *  - every write appends typed audit (person_id resolved when linked).
 *  Reads of the resolver answer "who may act, where" for DC/HQ screens. */

const uniqError = (err: unknown): string | null => {
  const m = err instanceof Error ? err.message : String(err);
  return m.includes('UNIQUE') ? 'already exists' : m.includes('FOREIGN KEY') ? 'references a missing row' : null;
};

export function identityRouter(db: DatabaseSync): Router {
  const r = Router();
  r.use(authRequired);

  const auditAs = (req: Request, action: string, subjectId: number, payload: Record<string, unknown>) => {
    emitAudit(db, {
      personId: personIdForUser(db, req.user!.id),
      roleContext: `identity-admin:${req.user!.role}`,
      subjectType: 'identity',
      subjectId,
      action,
      payload,
    });
  };

  // --- Resolution views ---------------------------------------------------

  // GET /me — who the current session maps to and where it may act.
  r.get('/me', (req, res) => {
    res.json(resolveActor(db, req.user!.id));
  });

  // GET /who/:userId — admin view of any session's resolved identity.
  r.get('/who/:userId', adminRequired, (req, res) => {
    const uid = Number(req.params.userId);
    if (!db.prepare('SELECT 1 AS x FROM users WHERE id = ?').get(uid)) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    res.json(resolveActor(db, uid));
  });

  // --- Persons & memberships (org-owned facts) -----------------------------

  // POST /persons {code, display_name}
  r.post('/persons', adminRequired, (req, res) => {
    const code = String(req.body?.code ?? '').trim();
    const display_name = String(req.body?.display_name ?? '').trim();
    if (!code) { res.status(400).json({ error: 'code is required' }); return; }
    try {
      const info = db.prepare('INSERT INTO persons (code, display_name) VALUES (?, ?)').run(code, display_name);
      const id = Number(info.lastInsertRowid);
      auditAs(req, 'identity.person.created', id, { code, display_name });
      res.status(201).json(db.prepare('SELECT id, code, display_name, created_at AS createdAt FROM persons WHERE id = ?').get(id));
    } catch (err: unknown) {
      const e = uniqError(err);
      res.status(e === 'already exists' ? 409 : 400).json({ error: e ?? 'Could not create person' });
    }
  });

  // GET /persons — list with membership orgs (DC pickers, HQ screens).
  r.get('/persons', adminRequired, (_req, res) => {
    const persons = db
      .prepare('SELECT p.id, p.code, p.display_name, p.created_at AS createdAt, COALESCE(GROUP_CONCAT(o.code ORDER BY o.code), \'\') AS orgs FROM persons p LEFT JOIN org_memberships m ON m.person_id = p.id AND m.active = 1 LEFT JOIN organizations o ON o.id = m.organization_id GROUP BY p.id ORDER BY p.id')
      .all();
    res.json({ persons });
  });

  // POST /memberships {person_id, organization_id, job_title}
  r.post('/memberships', adminRequired, (req, res) => {
    const personId = Number(req.body?.person_id);
    const orgId = Number(req.body?.organization_id);
    const jobTitle = String(req.body?.job_title ?? '').trim();
    if (!personId || !orgId) { res.status(400).json({ error: 'person_id and organization_id are required' }); return; }
    if (!db.prepare('SELECT 1 AS x FROM persons WHERE id = ?').get(personId)) { res.status(400).json({ error: 'Person not found' }); return; }
    if (!db.prepare('SELECT 1 AS x FROM organizations WHERE id = ?').get(orgId)) { res.status(400).json({ error: 'Organization not found' }); return; }
    try {
      const info = db.prepare('INSERT INTO org_memberships (person_id, organization_id, job_title) VALUES (?, ?, ?)').run(personId, orgId, jobTitle);
      const id = Number(info.lastInsertRowid);
      auditAs(req, 'identity.membership.created', id, { person_id: personId, organization_id: orgId, job_title: jobTitle });
      res.status(201).json(db.prepare('SELECT id, person_id AS personId, organization_id AS organizationId, job_title AS jobTitle, active FROM org_memberships WHERE id = ?').get(id));
    } catch (err: unknown) {
      const e = uniqError(err);
      res.status(e === 'already exists' ? 409 : 400).json({ error: e ?? 'Could not create membership' });
    }
  });

  // --- Project roles & assignments (authority) -----------------------------

  // POST /project-roles {project_id, code, title}
  r.post('/project-roles', adminRequired, (req, res) => {
    const projectId = Number(req.body?.project_id);
    const code = String(req.body?.code ?? '').trim();
    const title = String(req.body?.title ?? '').trim();
    if (!projectId || !code) { res.status(400).json({ error: 'project_id and code are required' }); return; }
    if (!db.prepare('SELECT 1 AS x FROM projects WHERE id = ?').get(projectId)) { res.status(400).json({ error: 'Project not found' }); return; }
    try {
      const info = db.prepare('INSERT INTO project_roles (project_id, code, title) VALUES (?, ?, ?)').run(projectId, code, title);
      const id = Number(info.lastInsertRowid);
      auditAs(req, 'identity.project_role.created', id, { project_id: projectId, code });
      res.status(201).json(db.prepare('SELECT id, project_id AS projectId, code, title FROM project_roles WHERE id = ?').get(id));
    } catch (err: unknown) {
      const e = uniqError(err);
      res.status(e === 'already exists' ? 409 : 400).json({ error: e ?? 'Could not create project role' });
    }
  });

  // POST /assignments {person_id, organization_id, project_role_id, scope, valid_from, valid_to}
  // Invariant ENFORCED here: active membership of that person in that org (§4).
  r.post('/assignments', adminRequired, (req, res) => {
    const personId = Number(req.body?.person_id);
    const orgId = Number(req.body?.organization_id);
    const roleId = Number(req.body?.project_role_id);
    const scope = String(req.body?.scope ?? '').trim();
    const validFrom = String(req.body?.valid_from ?? '').trim();
    const validTo = String(req.body?.valid_to ?? '').trim();
    if (!personId || !orgId || !roleId) { res.status(400).json({ error: 'person_id, organization_id and project_role_id are required' }); return; }
    if (!db.prepare('SELECT 1 AS x FROM project_roles WHERE id = ?').get(roleId)) { res.status(400).json({ error: 'Project role not found' }); return; }
    if (!isActiveMember(db, personId, orgId)) {
      res.status(400).json({ error: 'Person must hold an ACTIVE membership in the organization before assignment' });
      return;
    }
    try {
      const info = db
        .prepare('INSERT INTO role_assignments (person_id, project_role_id, organization_id, scope, valid_from, valid_to) VALUES (?, ?, ?, ?, ?, ?)')
        .run(personId, roleId, orgId, scope, validFrom, validTo);
      const id = Number(info.lastInsertRowid);
      auditAs(req, 'identity.assignment.created', id, { person_id: personId, organization_id: orgId, project_role_id: roleId, scope, valid_from: validFrom, valid_to: validTo });
      res.status(201).json(db.prepare('SELECT id, person_id AS personId, project_role_id AS projectRoleId, organization_id AS organizationId, scope, valid_from AS validFrom, valid_to AS validTo, status FROM role_assignments WHERE id = ?').get(id));
    } catch (err: unknown) {
      const e = uniqError(err);
      res.status(e === 'already exists' ? 409 : 400).json({ error: e ?? 'Could not create assignment' });
    }
  });

  // GET /assignments?project_id= — live roster: who may act, in which scope.
  r.get('/assignments', adminRequired, (req, res) => {
    const projectId = Number(req.query.project_id);
    if (!projectId) { res.status(400).json({ error: 'project_id is required' }); return; }
    const rows = db
      .prepare(`SELECT a.id, a.person_id AS personId, p.code AS personCode, p.display_name AS personName,
        r.code AS role, r.project_id AS projectId, o.code AS org, a.scope, a.valid_from AS validFrom, a.valid_to AS validTo, a.status
        FROM role_assignments a JOIN persons p ON p.id = a.person_id JOIN project_roles r ON r.id = a.project_role_id
        JOIN organizations o ON o.id = a.organization_id WHERE r.project_id = ? ORDER BY a.id`)
      .all(projectId);
    const list = (rows as unknown as Array<Record<string, unknown> & { status: string; validFrom: string; validTo: string }>).map((a) => ({
      ...a,
      live: a.status === 'active' && withinWindow(a.validFrom, a.validTo),
    }));
    res.json({ assignments: list });
  });

  // POST /assignments/:id/revoke {reason} — status flip, never a delete.
  r.post('/assignments/:id/revoke', adminRequired, (req, res) => {
    const id = Number(req.params.id);
    const row = db.prepare('SELECT a.id, a.person_id AS personId, a.status, r.code AS role, r.project_id AS projectId FROM role_assignments a JOIN project_roles r ON r.id = a.project_role_id WHERE a.id = ?').get(id) as
      | { id: number; personId: number; status: string; role: string; projectId: number }
      | undefined;
    if (!row) { res.status(404).json({ error: 'Assignment not found' }); return; }
    if (row.status === 'revoked') { res.status(400).json({ error: 'Already revoked' }); return; }
    db.prepare("UPDATE role_assignments SET status = 'revoked' WHERE id = ?").run(id);
    auditAs(req, 'identity.assignment.revoked', id, { person_id: row.personId, role: row.role, project_id: row.projectId, reason: String(req.body?.reason ?? '') });
    res.json({ ok: true });
  });

  // POST /delegations {from_assignment_id, to_person_id, reason, valid_from, valid_to}
  // Guards: source assignment must be LIVE; same organization; never self.
  r.post('/delegations', adminRequired, (req, res) => {
    const fromId = Number(req.body?.from_assignment_id);
    const toId = Number(req.body?.to_person_id);
    const reason = String(req.body?.reason ?? '').trim();
    const validFrom = String(req.body?.valid_from ?? '').trim();
    const validTo = String(req.body?.valid_to ?? '').trim();
    if (!fromId || !toId) { res.status(400).json({ error: 'from_assignment_id and to_person_id are required' }); return; }
    const parent = db
      .prepare('SELECT a.id, a.person_id AS personId, a.organization_id AS orgId, a.status, a.valid_from AS validFrom, a.valid_to AS validTo FROM role_assignments a WHERE a.id = ?')
      .get(fromId) as { id: number; personId: number; orgId: number; status: string; validFrom: string; validTo: string } | undefined;
    if (!parent) { res.status(400).json({ error: 'Source assignment not found' }); return; }
    if (parent.personId === toId) { res.status(400).json({ error: 'Cannot delegate to yourself' }); return; }
    // Delegation is ALWAYS time-bounded (handoff §20: takeover must not extend
    // indefinitely) and the window must be well-ordered.
    if (!validFrom || !validTo) { res.status(400).json({ error: 'Delegation requires valid_from and valid_to — never open-ended' }); return; }
    if (validTo < validFrom) { res.status(400).json({ error: 'valid_to must not precede valid_from' }); return; }
    if (parent.status !== 'active' || !withinWindow(parent.validFrom, parent.validTo)) {
      res.status(400).json({ error: 'Source assignment is not live — delegating dead authority is meaningless' });
      return;
    }
    if (!isActiveMember(db, toId, parent.orgId)) { res.status(400).json({ error: 'Delegate target must be an active member of the same organization' }); return; }
    try {
      const info = db.prepare('INSERT INTO delegations (from_assignment_id, to_person_id, reason, valid_from, valid_to) VALUES (?, ?, ?, ?, ?)').run(fromId, toId, reason, validFrom, validTo);
      const id = Number(info.lastInsertRowid);
      auditAs(req, 'identity.delegation.created', id, { from_assignment_id: fromId, to_person_id: toId, reason, valid_from: validFrom, valid_to: validTo });
      res.status(201).json(db.prepare('SELECT id, from_assignment_id AS fromAssignmentId, to_person_id AS toPersonId, reason, valid_from AS validFrom, valid_to AS validTo, status FROM delegations WHERE id = ?').get(id));
    } catch (err: unknown) {
      const e = uniqError(err);
      res.status(e === 'already exists' ? 409 : 400).json({ error: e ?? 'Could not create delegation' });
    }
  });

  // POST /delegations/:id/revoke — status flip only; history rows never deleted.
  r.post('/delegations/:id/revoke', adminRequired, (req, res) => {
    const id = Number(req.params.id);
    const row = db.prepare('SELECT id, status FROM delegations WHERE id = ?').get(id) as { id: number; status: string } | undefined;
    if (!row) { res.status(404).json({ error: 'Delegation not found' }); return; }
    if (row.status === 'revoked') { res.status(400).json({ error: 'Already revoked' }); return; }
    db.prepare("UPDATE delegations SET status = 'revoked' WHERE id = ?").run(id);
    auditAs(req, 'identity.delegation.revoked', id, { reason: String(req.body?.reason ?? '') });
    res.json({ ok: true });
  });

  // GET /delegations?assignment_id= — active + expired, clearly flagged.
  r.get('/delegations', adminRequired, (req, res) => {
    const rows = db
      .prepare('SELECT d.id, d.from_assignment_id AS fromAssignmentId, p.code AS toPerson, d.reason, d.valid_from AS validFrom, d.valid_to AS validTo, d.status FROM delegations d JOIN persons p ON p.id = d.to_person_id WHERE (? = 0 OR d.from_assignment_id = ?) ORDER BY d.id')
      .all(Number(req.query.assignment_id) || 0, Number(req.query.assignment_id) || 0) as unknown as Array<{ status: string; validFrom: string; validTo: string }>;
    res.json({ delegations: rows.map((d) => ({ ...d, live: d.status === 'active' && withinWindow(d.validFrom, d.validTo) })) });
  });

  // --- Legacy-session bridge ----------------------------------------------

  // POST /links {user_id, person_id} — 1:1 bridge, DB-enforced both sides.
  r.post('/links', adminRequired, (req, res) => {
    const userId = Number(req.body?.user_id);
    const personId = Number(req.body?.person_id);
    if (!userId || !personId) { res.status(400).json({ error: 'user_id and person_id are required' }); return; }
    if (!db.prepare('SELECT 1 AS x FROM users WHERE id = ?').get(userId)) { res.status(400).json({ error: 'User not found' }); return; }
    if (!db.prepare('SELECT 1 AS x FROM persons WHERE id = ?').get(personId)) { res.status(400).json({ error: 'Person not found' }); return; }
    try {
      const info = db.prepare('INSERT INTO user_person_links (user_id, person_id) VALUES (?, ?)').run(userId, personId);
      const id = Number(info.lastInsertRowid);
      auditAs(req, 'identity.linked', id, { user_id: userId, person_id: personId });
      res.status(201).json(db.prepare('SELECT l.id, l.user_id AS userId, u.username, l.person_id AS personId, p.code AS personCode, l.created_at AS createdAt FROM user_person_links l JOIN users u ON u.id = l.user_id JOIN persons p ON p.id = l.person_id WHERE l.id = ?').get(id));
    } catch (err: unknown) {
      const e = uniqError(err);
      res.status(e === 'already exists' ? 409 : 400).json({ error: e ?? 'Could not link user to person' });
    }
  });

  // GET /links — full bridge list (HQ screens).
  r.get('/links', adminRequired, (_req, res) => {
    res.json({
      links: db
        .prepare('SELECT l.id, l.user_id AS userId, u.username, l.person_id AS personId, p.code AS personCode FROM user_person_links l JOIN users u ON u.id = l.user_id JOIN persons p ON p.id = l.person_id ORDER BY l.id')
        .all(),
    });
  });

  return r;
}
