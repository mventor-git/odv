// Modular Setup Wizard (ticket 107) — first-run server support.
// Step 1 metadata save lives in settings.ts (POST /api/settings/metadata).
// This router handles: wizard status, example xlsx download, zones xlsx
// parse/preview, and zones import upsert. Everything is DB-driven.
import { Router } from 'express';
import fs from 'node:fs';
import type { DatabaseSync } from 'node:sqlite';
import { adminRequired, authRequired } from '../auth.ts';
import { logEvent } from './logs.ts';

interface ZoneRow {
  code: string;
  name: string;
  nameAr: string;
  cluster: string;
}

/** Normalize a parsed row from the example xlsx (code | name | name_ar | cluster). */
function rowToZone(raw: Record<string, unknown>, headerMap: Record<string, string>): ZoneRow | null {
  const get = (keys: string[]): string => {
    for (const k of keys) {
      const v = raw[k];
      if (v !== undefined && v !== null) return String(v).trim();
      const mapped = headerMap[k];
      if (mapped && raw[mapped] !== undefined && raw[mapped] !== null) return String(raw[mapped]).trim();
    }
    return '';
  };
  const code = get(['code', 'Code', 'zone', 'Zone', 'الرمز']);
  if (!code) return null;
  return {
    code,
    name: get(['name', 'Name', 'الاسم']) || code,
    nameAr: get(['name_ar', 'nameAr', 'NameAr', 'name_ar', 'الاسم عربي']),
    cluster: get(['cluster', 'Cluster', 'المجموعة']) || 'CL12',
  };
}

export function setupRouter(db: DatabaseSync): Router {
  const r = Router();
  r.use(authRequired);

  /** First-run check — the wizard runs when no zones exist yet. */
  r.get('/status', (_req, res) => {
    const cnt = (db.prepare('SELECT COUNT(*) AS n FROM zones').get() as { n: number }).n;
    res.json({ needsWizard: cnt === 0 });
  });

  /** POST /api/setup/zones/example — generate the example xlsx (exceljs). */
  r.post('/zones/example', (_req, res) => {
    // Deferred import keeps the route module light.
    void import('exceljs').then(async (exceljs) => {
      const wb = new exceljs.Workbook();
      const ws = wb.addWorksheet('Zones');
      ws.addRow(['code', 'name', 'name_ar', 'cluster']);
      ws.addRow(['A', 'Zone A', 'منطقة أ', 'CL12']);
      ws.addRow(['A1', 'Zone A1', 'منطقة أ1', 'CL12']);
      ws.addRow(['B', 'Zone B', 'منطقة ب', 'CL12']);
      ws.addRow(['C', 'Zone C', 'منطقة ج', 'CL12']);
      ws.columns.forEach((c) => {
        if (c) c.width = 16;
      });
      const buf = Buffer.from(new Uint8Array(await wb.xlsx.writeBuffer()));
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename="zones-example.xlsx"');
      res.send(buf);
    }).catch((err) => {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    });
  });

  /** POST /api/setup/zones/parse — parse an uploaded xlsx into rows + preview. */
  r.post('/zones/parse', async (req, res) => {
    try {
      const exceljs = (await import('exceljs')) as typeof import('exceljs');
      const body = req.body ?? {};
      const base64 = String(body.fileBase64 ?? '');
      if (!base64) {
        res.status(400).json({ error: 'fileBase64 is required' });
        return;
      }
      const buf = new Uint8Array(Buffer.from(base64, 'base64'));
      // exceljs's xlsx.load types still reference the pre-generic Buffer — cast is library-type workaround.
      const wb = await new exceljs.Workbook().xlsx.load(buf as never);
      const ws = wb.worksheets[0];
      if (!ws) {
        res.status(400).json({ error: 'No worksheet found in the workbook' });
        return;
      }
      const rows: Array<Record<string, unknown>> = [];
      const headerMap: Record<string, string> = {};
      let headerRow = -1;
      ws.eachRow((row, rowNumber) => {
        const values = row.values as Array<unknown>;
        const cells = values.slice(1).map((v) => String(v ?? '').trim());
        if (headerRow === -1 && cells.some((c) => /code|zone|الرمز/i.test(c))) {
          headerRow = rowNumber;
          cells.forEach((c, i) => { headerMap[c.toLowerCase().replace(/\s+/g, '_')] = i.toString(); });
          return;
        }
        if (headerRow === -1) return;
        const rec: Record<string, unknown> = {};
        cells.forEach((c, i) => { rec[i.toString()] = c; });
        rows.push(rec);
      });
      const zones = rows
        .map((raw) => rowToZone(raw, headerMap))
        .filter((z): z is ZoneRow => z !== null);
      const preview = zones.slice(0, 5);
      res.json({ headers: ['code', 'name', 'name_ar', 'cluster'], total: zones.length, preview, zones });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  /** POST /api/setup/zones/import — upsert parsed zones into the table. */
  r.post('/zones/import', adminRequired, (req, res) => {
    const body = req.body ?? {};
    const zones = Array.isArray(body.zones) ? body.zones : [];
    const ins = db.prepare(
      'INSERT INTO zones (code, name, name_ar, cluster) VALUES (?, ?, ?, ?) ON CONFLICT(code) DO UPDATE SET name = excluded.name, name_ar = excluded.name_ar, cluster = excluded.cluster',
    );
    let added = 0;
    let updated = 0;
    for (const z of zones) {
      const code = String((z as ZoneRow).code ?? '').trim();
      if (!code) continue;
      const exists = db.prepare('SELECT 1 FROM zones WHERE code = ?').get(code);
      ins.run(
        code,
        String((z as ZoneRow).name ?? code).trim(),
        String((z as ZoneRow).nameAr ?? '').trim(),
        String((z as ZoneRow).cluster ?? 'CL12').trim(),
      );
      if (exists) updated++;
      else added++;
    }
    logEvent(db, req.user!.username, 'domain', 'zones', `Imported ${zones.length} zones (+${added} added, ${updated} updated)`);
    res.json({ ok: true, added, updated, total: zones.length });
  });

  /** POST /api/setup/status-wizard-done — mark wizard complete (safety latch). */
  r.post('/complete', adminRequired, (_req, res) => {
    // The wizard is complete once zones exist; the latch prevents a re-run loop.
    const cnt = (db.prepare('SELECT COUNT(*) AS n FROM zones').get() as { n: number }).n;
    if (cnt > 0) {
      db.prepare(
        'INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      ).run('wizard_completed', '1');
      logEvent(db, _req.user!.username, 'domain', 'setup', 'Setup wizard completed');
      res.json({ ok: true });
    } else {
      res.status(400).json({ error: 'Add at least one zone before finishing setup' });
    }
  });

  return r;
}
