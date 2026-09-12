import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { authRequired } from '../auth.ts';
import { buildFylerSpec, CATEGORIES_WITHOUT_TEMPLATE, getActiveMapping, resolveFylerSpec, runFylerPlan, TEMPLATE_DIR } from '../fyler.ts';
import type { Config } from '../config.ts';

/**
 * Request fyler generation (ticket 070) — the create form's metadata card
 * calls POST /api/fyler; Excel COM runs SUPER-SILENT (no window flashes) and
 * returns the generated fyler PDF.
 */
export function fylerRouter(db: DatabaseSync, config: Config): Router {
  const r = Router();
  r.use(authRequired);

  r.post('/', async (req, res) => {
    const body = req.body ?? {};
    const category = String(body.category ?? '');
    const activeMapping = getActiveMapping(db, category);
    const spec = resolveFylerSpec(category, {
      fork: String(body.fork ?? ''),
      requestNo: String(body.requestNo ?? ''),
      revisionNo: String(body.revisionNo ?? '00'),
      description: String(body.description ?? ''),
      sentDate: String(body.sentDate ?? ''),
      zone: String(body.zone ?? ''),
      floor: String(body.floor ?? ''),
      status: String(body.status ?? 'P'),
      documents: Array.isArray(body.documents) ? body.documents : [],
    }, activeMapping);
    if (!spec) {
      res.status(400).json({
        error: CATEGORIES_WITHOUT_TEMPLATE.includes(category)
          ? `No template yet for ${category} (NCR/SO/QC/CBR need templates in ticket 004)`
          : `Unknown category: ${category}`,
      });
      return;
    }
    const src = activeMapping?.template
      ? path.join(config.vaultDir, 'templates', category, 'v001', path.basename(activeMapping.template))
      : path.join(TEMPLATE_DIR, spec.template);
    const srcExists = fs.existsSync(src);
    if (!srcExists) {
      res.status(404).json({ error: `Template missing: ${path.basename(src)}` });
      return;
    }
    const outDir = path.join(config.vaultDir, 'reports');
    fs.mkdirSync(outDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const xlsx = path.join(outDir, `${category}_${stamp}.xlsx`);
    const pdf = path.join(outDir, `${category}_${stamp}.pdf`);
    fs.copyFileSync(src, xlsx);
    const results = await runFylerPlan(outDir, [
      { xlsx, pdf, sheet: spec.sheet, cells: spec.cells, table: spec.table },
    ]);
    const result = results[0];
    if (!result?.ok || !fs.existsSync(pdf)) {
      res.status(500).json({
        error: `Excel COM failed: ${result?.error ?? 'no result'}`,
        detail: result?.error ?? 'Excel did not produce a result file',
      });
      return;
    }
    res.json({ ok: true, pdf, category, requestNo: String(body.requestNo ?? '') });
  });

  /** Serve a generated fyler PDF (authenticated). V5-001: restricted to dataDir. */
  r.get('/view', (req, res) => {
    const p = String(req.query.path ?? '');
    if (!p) {
      res.status(400).json({ error: 'Missing path parameter' });
      return;
    }
    const resolved = path.resolve(p);
    const allowedData = path.resolve(config.dataDir);
    const allowedVault = path.resolve(config.vaultDir);
    // V5-001: only allow files within the data or vault directories — prevents arbitrary file reads
    const inData = resolved.startsWith(allowedData + path.sep) || resolved === allowedData;
    const inVault = resolved.startsWith(allowedVault + path.sep) || resolved === allowedVault;
    if (!inData && !inVault) {
      res.status(403).json({ error: 'Access denied: path outside data/vault directory' });
      return;
    }
    if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
      res.status(404).json({ error: 'Fyler not found' });
      return;
    }
    res.setHeader('Content-Disposition', `inline; filename="${path.basename(resolved)}"`);
    res.sendFile(resolved);
  });

  return r;
}