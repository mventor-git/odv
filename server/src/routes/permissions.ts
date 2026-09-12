import { Router } from 'express';
import type { DatabaseSync } from 'node:sqlite';
import { authRequired, adminRequired } from '../auth.ts';

export function permissionsRouter(db: DatabaseSync): Router {
  const r = Router();
  r.use(authRequired);

  r.get('/', (_req, res) => {
    res.json(db.prepare('SELECT key, name_en AS nameEn FROM permissions ORDER BY key').all());
  });

  r.get('/roles/:role', (req, res) => {
    const role = String(req.params.role);
    res.json(db.prepare('SELECT permission FROM role_permissions WHERE role = ? ORDER BY permission').all(role));
  });

  r.post('/roles/:role', adminRequired, (req, res) => {
    const role = String(req.params.role);
    const body = req.body ?? {};
    const perms: string[] = Array.isArray(body.permissions) ? body.permissions.map((s: unknown) => String(s)) : [];
    db.exec('BEGIN');
    try {
      db.prepare('DELETE FROM role_permissions WHERE role = ?').run(role);
      const ins = db.prepare('INSERT INTO role_permissions (role, permission) VALUES (?, ?)');
      for (const p of perms) ins.run(role, p);
      db.exec('COMMIT');
      res.json({ ok: true });
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
  });

  r.get('/users/:id', (req, res) => {
    const uid = Number(req.params.id);
    res.json(db.prepare('SELECT role FROM user_roles WHERE user_id = ?').all(uid));
  });

  return r;
}
