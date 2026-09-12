import { Router } from 'express';
import type { DatabaseSync } from 'node:sqlite';
import { authRequired, adminRequired } from '../auth.ts';

export function cementRouter(db: DatabaseSync): Router {
  const r = Router();
  r.use(authRequired);

  // Stations
  r.get('/stations', (_req, res) => {
    const rows = db.prepare('SELECT id, name, notes, created_at AS createdAt FROM concrete_stations ORDER BY name').all();
    res.json(rows);
  });
  r.post('/stations', adminRequired, (req, res) => {
    const name = String(req.body?.name ?? '').trim();
    if (!name) { res.status(400).json({ error: 'name required' }); return; }
    const info = db.prepare('INSERT INTO concrete_stations (name, notes) VALUES (?, ?)').run(name, String(req.body?.notes ?? ''));
    res.status(201).json({ id: Number(info.lastInsertRowid) });
  });
  r.patch('/stations/:id', adminRequired, (req, res) => {
    const id = Number(req.params.id);
    const body = req.body ?? {};
    db.prepare('UPDATE concrete_stations SET name = COALESCE(?, name), notes = COALESCE(?, notes) WHERE id = ?').run(body.name ? String(body.name) : null, body.notes !== undefined ? String(body.notes) : null, id);
    res.json({ ok: true });
  });
  r.delete('/stations/:id', adminRequired, (req, res) => {
    const id = Number(req.params.id);
    const cnt = (db.prepare('SELECT COUNT(*) AS n FROM concrete_batches WHERE station = (SELECT name FROM concrete_stations WHERE id = ?)').get(id) as { n: number }).n;
    if (cnt > 0) { res.status(400).json({ error: `Station has ${cnt} batches — delete them first` }); return; }
    db.prepare('DELETE FROM concrete_stations WHERE id = ?').run(id);
    res.json({ ok: true });
  });

  // Loose
  r.get('/loose', (req, res) => {
    const station = req.query.station ? String(req.query.station) : '';
    const rows = station
      ? db.prepare('SELECT * FROM concrete_loose WHERE station = ? ORDER BY policy_date DESC').all(station)
      : db.prepare('SELECT * FROM concrete_loose ORDER BY policy_date DESC LIMIT 100').all();
    res.json(rows);
  });
  r.post('/loose', (req, res) => {
    const b = req.body ?? {};
    const info = db.prepare('INSERT INTO concrete_loose (station, policy_no, policy_date, quantity_ton, supplier, received_date, canceled) VALUES (?, ?, ?, ?, ?, ?, ?)').run(String(b.station ?? ''), String(b.policyNo ?? ''), String(b.policyDate ?? ''), Number(b.quantityTon ?? 0), String(b.supplier ?? ''), String(b.receivedDate ?? ''), b.canceled ? 1 : 0);
    res.status(201).json({ id: Number(info.lastInsertRowid) });
  });
  r.patch('/loose/:id', (req, res) => {
    const id = Number(req.params.id);
    const b = req.body ?? {};
    if (b.canceled !== undefined) db.prepare('UPDATE concrete_loose SET canceled = ? WHERE id = ?').run(b.canceled ? 1 : 0, id);
    res.json({ ok: true });
  });

  // Batches
  r.get('/batches', (req, res) => {
    const station = req.query.station ? String(req.query.station) : '';
    const rows = station
      ? db.prepare('SELECT * FROM concrete_batches WHERE station = ? ORDER BY pour_date DESC').all(station)
      : db.prepare('SELECT * FROM concrete_batches ORDER BY pour_date DESC LIMIT 100').all();
    res.json(rows);
  });
  r.post('/batches', (req, res) => {
    const b = req.body ?? {};
    const info = db.prepare('INSERT INTO concrete_batches (station, work_statement, zone, floor, quantity_m3, pour_date, cbr_no, mix_rate) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(String(b.station ?? ''), String(b.workStatement ?? ''), String(b.zone ?? ''), String(b.floor ?? ''), Number(b.quantityM3 ?? 0), String(b.pourDate ?? ''), String(b.cbrNo ?? ''), Number(b.mixRate ?? 400));
    res.status(201).json({ id: Number(info.lastInsertRowid) });
  });

  // Quantity review — live balance
  r.get('/review', (req, res) => {
    const station = req.query.station ? String(req.query.station) : '';
    const loose = station
      ? (db.prepare('SELECT COALESCE(SUM(quantity_ton),0) AS s FROM concrete_loose WHERE station = ? AND canceled = 0').get(station) as { s: number }).s
      : (db.prepare('SELECT COALESCE(SUM(quantity_ton),0) AS s FROM concrete_loose WHERE canceled = 0').get() as { s: number }).s;
    const batches = station
      ? (db.prepare('SELECT COALESCE(SUM(quantity_m3),0) AS s FROM concrete_batches WHERE station = ?').get(station) as { s: number }).s
      : (db.prepare('SELECT COALESCE(SUM(quantity_m3),0) AS s FROM concrete_batches').get() as { s: number }).s;
    res.json({ station: station || 'all', looseTon: loose, batchesM3: batches, balance: loose - batches });
  });

  // Dashboard
  r.get('/dashboard', (_req, res) => {
    const stations = db.prepare('SELECT COUNT(*) AS n FROM concrete_stations').get() as { n: number };
    const loose = db.prepare('SELECT COUNT(*) AS n FROM concrete_loose').get() as { n: number };
    const batches = db.prepare('SELECT COUNT(*) AS n FROM concrete_batches').get() as { n: number };
    res.json({ stations: stations.n, loose: loose.n, batches: batches.n });
  });

  return r;
}
