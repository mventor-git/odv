import { Router } from 'express';
import bcrypt from 'bcryptjs';
import type { DatabaseSync } from 'node:sqlite';
import type { Config } from '../config.ts';
import { adminRequired, authRequired, signToken, devRequired, type AuthRole, type AuthUser } from '../auth.ts';

interface UserRow {
  id: number;
  username: string;
  role: AuthRole;
  job_role: string;
  first_name: string;
  second_name: string;
  first_name_ar: string;
  second_name_ar: string;
  password_hash: string;
  password_set: number;
  active: number;
  created_at: string;
}

/** Job roles that map to the admin tier (ticket 117): Document Controller,
 *  Project Manager, Technical Office Engineer, Executive Manager.
 *  Dev maps to super (above all admins). Everything else is engineer. */
const ADMIN_JOB_ROLES = new Set([
  'Document Controller',
  'Project Manager',
  'Technical Office Engineer',
  'Executive Manager',
]);

/** Derive the system role from the job role. */
function systemRole(jobRole: string): AuthRole {
  if (jobRole === 'Dev') return 'dev';
  if (ADMIN_JOB_ROLES.has(jobRole)) return 'admin';
  return 'engineer';
}

function toPublic(u: UserRow): {
  id: number;
  username: string;
  role: string;
  jobRole: string;
  firstName: string;
  secondName: string;
  firstNameAr: string;
  secondNameAr: string;
  createdAt: string;
  active: boolean;
  passwordSet: boolean;
} {
  return {
    id: u.id,
    username: u.username,
    role: u.role,
    jobRole: u.job_role,
    firstName: u.first_name,
    secondName: u.second_name,
    firstNameAr: u.first_name_ar,
    secondNameAr: u.second_name_ar,
    createdAt: u.created_at,
    active: u.active === 1,
    passwordSet: u.password_set === 1,
  };
}

export function authRouter(db: DatabaseSync, config: Config): Router {
  const r = Router();

  r.post('/login', (req, res) => {
    const username = String(req.body?.username ?? '').trim();
    const password = String(req.body?.password ?? '');
    if (!username || !password) {
      res.status(400).json({ error: 'Username and password are required' });
      return;
    }
    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username) as unknown as UserRow | undefined;
    if (!user) {
      res.status(401).json({ error: 'Invalid username or password' });
      return;
    }
    // Deactivated accounts (ticket 042) need admin activation.
    if (user.active === 0) {
      res.status(403).json({ error: 'Account deactivated — contact the admin' });
      return;
    }
    // Pending engineer account (ticket 041): no password yet — first login creates it.
    if (user.password_set === 0) {
      res.json({ needsPasswordSetup: true, username: user.username });
      return;
    }
    if (!bcrypt.compareSync(password, user.password_hash)) {
      res.status(401).json({ error: 'Invalid username or password' });
      return;
    }
    const authUser: AuthUser = { id: user.id, username: user.username, role: user.role };
    res.json({ token: signToken(authUser, config), user: toPublic(user) });
  });

  /** Check a user ID — the login page asks for the ID first (ticket 063). */
  r.post('/check', (req, res) => {
    const username = String(req.body?.username ?? '').trim();
    if (!username) {
      res.status(400).json({ error: 'User ID is required' });
      return;
    }
    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username) as unknown as UserRow | undefined;
    if (!user) {
      res.json({ status: 'notfound', username });
      return;
    }
    if (user.active === 0) {
      res.json({ status: 'deactivated', username });
      return;
    }
    if (user.password_set === 0) {
      res.json({ status: 'pending', username });
      return;
    }
    res.json({ status: 'password', username });
  });

  /** First-login password setup for pending engineer accounts (ticket 041). */
  r.post('/setup-password', (req, res) => {
    const username = String(req.body?.username ?? '').trim();
    const password = String(req.body?.password ?? '');
    if (!username || password.length < 6) {
      res.status(400).json({ error: 'Username required; password at least 6 characters' });
      return;
    }
    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username) as unknown as UserRow | undefined;
    if (!user || user.password_set !== 0) {
      res.status(400).json({ error: 'No pending account for this username' });
      return;
    }
    db.prepare('UPDATE users SET password_hash = ?, password_set = 1 WHERE id = ?').run(
      bcrypt.hashSync(password, 10),
      user.id,
    );
    const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id) as unknown as UserRow;
    const authUser: AuthUser = { id: updated.id, username: updated.username, role: updated.role };
    res.json({ token: signToken(authUser, config), user: toPublic(updated) });
  });

  r.get('/me', authRequired, (req, res) => {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user!.id) as unknown as UserRow | undefined;
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    res.json(toPublic(user));
  });

  r.patch('/me/username', authRequired, (req, res) => {
    const username = String(req.body?.username ?? '').trim();
    if (!username) {
      res.status(400).json({ error: 'Username is required' });
      return;
    }
    const exists = db
      .prepare('SELECT 1 FROM users WHERE username = ? AND id != ?')
      .get(username, req.user!.id);
    if (exists) {
      res.status(409).json({ error: 'Username already exists' });
      return;
    }
    const info = db
      .prepare('UPDATE users SET username = ? WHERE id = ?')
      .run(username, req.user!.id);
    if (info.changes === 0) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    const user = db
      .prepare('SELECT * FROM users WHERE id = ?')
      .get(req.user!.id) as unknown as UserRow;
    // Fresh token so the username claim (used as the log actor) is current.
    const authUser: AuthUser = { id: user.id, username: user.username, role: user.role };
    res.json({ user: toPublic(user), token: signToken(authUser, config) });
  });

  r.patch('/me/password', authRequired, (req, res) => {
    const current = String(req.body?.currentPassword ?? '');
    const next = String(req.body?.newPassword ?? '');
    if (next.length < 6) {
      res.status(400).json({ error: 'New password must be at least 6 characters' });
      return;
    }
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user!.id) as unknown as UserRow | undefined;
    if (!user || !bcrypt.compareSync(current, user.password_hash)) {
      res.status(400).json({ error: 'Current password is incorrect' });
      return;
    }
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(
      bcrypt.hashSync(next, 10),
      user.id,
    );
    res.json({ ok: true });
  });

  // ---- admin user management ----
  // The Users tab is for admins + super (ticket 117) — members
  // are managed via the Project Members card in Settings. ?all=1 returns every
  // account (used to link members to their accounts).
  r.get('/users', authRequired, adminRequired, (req, res) => {
    const rows = (
      req.query.all === '1'
        ? db.prepare('SELECT * FROM users ORDER BY id').all()
        : db.prepare("SELECT * FROM users WHERE role IN ('admin','dev') OR job_role IN ('Document Controller','Project Manager','Technical Office Engineer','Executive Manager','Dev') ORDER BY id").all()
    ) as unknown as UserRow[];
    res.json(rows.map(toPublic));
  });

  r.post('/users', authRequired, adminRequired, (req, res) => {
    const username = String(req.body?.username ?? '').trim();
    const password = String(req.body?.password ?? '');
    const jobRole = String(req.body?.jobRole ?? '').trim();
    const role: AuthRole = jobRole
      ? systemRole(jobRole)
      : (['dev', 'admin', 'engineer'].includes(req.body?.role) ? req.body.role : 'admin');
    if (!username) {
      res.status(400).json({ error: 'Username is required' });
      return;
    }
    if (password && password.length < 6) {
      res.status(400).json({ error: 'Password must be at least 6 characters' });
      return;
    }
    const exists = db.prepare('SELECT 1 FROM users WHERE username = ?').get(username);
    if (exists) {
      res.status(409).json({ error: 'Username already exists' });
      return;
    }
    // Password optional (ticket 058): empty → pending account (first-login setup).
    const passwordSet = password ? 1 : 0;
    const active = password ? 1 : 0; // Pending accounts (no password) are inactive
    const info = db
      .prepare(
        `INSERT INTO users (username, password_hash, role, job_role, password_set, first_name, second_name, first_name_ar, second_name_ar, active)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        username,
        password ? bcrypt.hashSync(password, 10) : '',
        role,
        jobRole,
        passwordSet,
        String(req.body?.firstName ?? '').trim(),
        String(req.body?.secondName ?? '').trim(),
        String(req.body?.firstNameAr ?? '').trim(),
        String(req.body?.secondNameAr ?? '').trim(),
        active,
      );
    // Also add the user as a Project Member (ticket 057) — bare name (ticket 058).
    const firstName = String(req.body?.firstName ?? '').trim();
    const secondName = String(req.body?.secondName ?? '').trim();
    if (firstName || secondName) {
      db.prepare(
        `INSERT OR IGNORE INTO engineers (name, title, role, specialty, period_from, period_to, active)
         VALUES (?, '', ?, ?, ?, ?, ?)`,
      ).run(
        `${firstName} ${secondName}`.trim(),
        jobRole || 'Dev',
        String(req.body?.specialty ?? '').trim(),
        String(req.body?.periodFrom ?? '').trim(),
        String(req.body?.periodTo ?? '').trim(),
        req.body?.active === false ? 0 : 1,
      );
    }
    const user = db
      .prepare('SELECT * FROM users WHERE id = ?')
      .get(Number(info.lastInsertRowid)) as unknown as UserRow;
    res.status(201).json(toPublic(user));
  });

  r.post('/users/pending', authRequired, adminRequired, (req, res) => {
    const username = String(req.body?.username ?? '').trim();
    if (!username) {
      res.status(400).json({ error: 'Username is required' });
      return;
    }
    const exists = db.prepare('SELECT 1 FROM users WHERE username = ?').get(username);
    if (exists) {
      res.status(409).json({ error: 'Username already exists' });
      return;
    }
    const info = db
      .prepare('INSERT INTO users (username, password_hash, role, password_set) VALUES (?, ?, ?, 0)')
      .run(username, '', 'engineer');
    const user = db
      .prepare('SELECT * FROM users WHERE id = ?')
      .get(Number(info.lastInsertRowid)) as unknown as UserRow;
    res.status(201).json(toPublic(user));
  });

  r.patch('/users/:id/active', authRequired, adminRequired, (req, res) => {
    const id = Number(req.params.id);
    const active = req.body?.active === true ? 1 : 0;
    const info = db.prepare('UPDATE users SET active = ? WHERE id = ?').run(active, id);
    if (info.changes === 0) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    res.json({ ok: true, active: active === 1 });
  });

  /** Edit a user's metadata (username / job role) — admin (ticket 043/048). */
  r.patch('/users/:id', authRequired, adminRequired, (req, res) => {
    const id = Number(req.params.id);
    const row = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as unknown as UserRow | undefined;
    if (!row) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    const username = req.body?.username !== undefined ? String(req.body.username).trim() : row.username;
    const jobRole = req.body?.jobRole !== undefined ? String(req.body.jobRole).trim() : row.job_role;
    const firstName = req.body?.firstName !== undefined ? String(req.body.firstName).trim() : row.first_name;
    const secondName = req.body?.secondName !== undefined ? String(req.body.secondName).trim() : row.second_name;
    const firstNameAr = req.body?.firstNameAr !== undefined ? String(req.body.firstNameAr).trim() : row.first_name_ar;
    const secondNameAr = req.body?.secondNameAr !== undefined ? String(req.body.secondNameAr).trim() : row.second_name_ar;
    const active = req.body?.active !== undefined ? (req.body.active === true ? 1 : 0) : row.active;
    if (!username) {
      res.status(400).json({ error: 'Username is required' });
      return;
    }
    const exists = db
      .prepare('SELECT 1 FROM users WHERE username = ? AND id != ?')
      .get(username, id);
    if (exists) {
      res.status(409).json({ error: 'Username already exists' });
      return;
    }
    db.prepare(
      'UPDATE users SET username = ?, job_role = ?, role = ?, first_name = ?, second_name = ?, first_name_ar = ?, second_name_ar = ?, active = ? WHERE id = ?',
    ).run(username, jobRole, systemRole(jobRole), firstName, secondName, firstNameAr, secondNameAr, active, id);
    const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as unknown as UserRow;
    res.json(toPublic(updated));
  });

  /** Reset a user's password to "no password" (pending) — the user creates it on next login (ticket 043). */
  r.patch('/users/:id/password-set', authRequired, adminRequired, (req, res) => {
    const id = Number(req.params.id);
    const info = db
      .prepare("UPDATE users SET password_hash = '', password_set = 0 WHERE id = ?")
      .run(id);
    if (info.changes === 0) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    res.json({ ok: true, passwordSet: false });
  });

  r.patch('/users/:id/username', authRequired, adminRequired, (req, res) => {
    const username = String(req.body?.username ?? '').trim();
    if (!username) {
      res.status(400).json({ error: 'Username is required' });
      return;
    }
    const id = Number(req.params.id);
    const exists = db
      .prepare('SELECT 1 FROM users WHERE username = ? AND id != ?')
      .get(username, id);
    if (exists) {
      res.status(409).json({ error: 'Username already exists' });
      return;
    }
    const info = db.prepare('UPDATE users SET username = ? WHERE id = ?').run(username, id);
    if (info.changes === 0) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as unknown as UserRow;
    res.json({ ok: true, user: toPublic(user) });
  });

  r.patch('/users/:id/password', authRequired, adminRequired, (req, res) => {
    const next = String(req.body?.password ?? '');
    if (next.length < 6) {
      res.status(400).json({ error: 'Password must be at least 6 characters' });
      return;
    }
    const info = db
      .prepare('UPDATE users SET password_hash = ? WHERE id = ?')
      .run(bcrypt.hashSync(next, 10), Number(req.params.id));
    if (info.changes === 0) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    res.json({ ok: true });
  });

  r.delete('/users/:id', authRequired, adminRequired, (req, res) => {
    const id = Number(req.params.id);
    if (id === req.user!.id) {
      res.status(400).json({ error: 'Cannot delete your own account' });
      return;
    }
    const info = db.prepare('DELETE FROM users WHERE id = ?').run(id);
    if (info.changes === 0) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    res.json({ ok: true });
  });

  return r;
}
