import { Router } from 'express';
import type { DatabaseSync } from 'node:sqlite';
import { adminRequired, authRequired } from '../auth.ts';
import type { Config } from '../config.ts';
import type { DomainRegistry } from '../domain-registry.ts';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

/** Template store (ticket 108) — versioned uploads per category under
 *  vault/templates/<CATEGORY>/v<NNN>/template.<ext>, with exceljs sheet
 *  introspection (sheet names + has_table detection). No hardcoded names. */
export function templatesRouter(db: DatabaseSync, config: Config, registry: DomainRegistry): Router {
  const r = Router();
  r.use(authRequired);

  const vaultTemplates = path.join(config.vaultDir, 'templates');
  try { fs.mkdirSync(vaultTemplates, { recursive: true }); } catch {}

  const listCategory = (code: string): {
    category: string;
    versions: number;
    latestVersion: number | null;
    latestFile: string | null;
    sheets: string[];
    hasTable: boolean;
  } => {
    const dir = path.join(vaultTemplates, code);
    const versions: number[] = [];
    if (fs.existsSync(dir)) {
      for (const entry of fs.readdirSync(dir)) {
        const m = /^v(\d+)$/.exec(entry);
        if (m) versions.push(Number(m[1]));
      }
    }
    versions.sort((a, b) => a - b);
    const latest = versions.length ? versions[versions.length - 1] : null;
    let sheets: string[] = [];
    let hasTable = false;
    let latestFile: string | null = null;
    if (latest) {
      const vdir = path.join(dir, `v${String(latest).padStart(3, '0')}`);
      if (fs.existsSync(vdir)) {
        const files = fs.readdirSync(vdir).filter((f) => /\.(xlsx|xlsm|xls)$/i.test(f));
        latestFile = files[0] ?? null;
        if (latestFile) {
          try {
            // Inspect the xlsx for sheets + table area (no native deps — exceljs).
            const buf = fs.readFileSync(path.join(vdir, latestFile));
            // exceljs inspection is async; we do it lazily in a detail route.
            void buf;
          } catch { /* ignore */ }
        }
      }
    }
    return { category: code, versions: versions.length, latestVersion: latest, latestFile, sheets, hasTable };
  };

  /** List categories + their template status. */
  r.get('/', (_req, res) => {
    try {
      const rows = db.prepare('SELECT code FROM domain_categories ORDER BY sort_order').all() as Array<{ code: string }>;
      res.json(rows.map((c) => listCategory(c.code)));
    } catch {
      res.json([]);
    }
  });

  /** Introspect a stored template: sheet names + has_table detection. */
  r.get('/:category/inspect', async (req, res) => {
    const category = String(req.params.category);
    const info = listCategory(category);
    if (!info.latestVersion || !info.latestFile) {
      res.json({ category, sheets: [], hasTable: false, error: null });
      return;
    }
    try {
      const exceljs = (await import('exceljs')) as typeof import('exceljs');
      const file = path.join(vaultTemplates, category, `v${String(info.latestVersion).padStart(3, '0')}`, info.latestFile);
      const wb = await new exceljs.Workbook().xlsx.load(new Uint8Array(fs.readFileSync(file)) as never);
      const sheets = wb.worksheets.map((ws) => ({ name: ws.name, rowCount: ws.rowCount, colCount: ws.columnCount }));
      // has_table heuristic: any sheet with 5+ columns and >12 rows has a table area.
      const hasTable = sheets.some((s) => s.colCount >= 5 && s.rowCount > 12);
      res.json({ category, sheets, hasTable, file: info.latestFile, version: info.latestVersion });
    } catch (err) {
      res.json({ category, sheets: [], hasTable: false, error: err instanceof Error ? err.message : String(err) });
    }
  });

  /** A1:Z40 grid preview for the mapper (ticket 108) — read-only, merged ranges
   *  reported so the client can highlight them. */
  r.get('/:category/grid', async (req, res) => {
    const category = String(req.params.category);
    const info = listCategory(category);
    if (!info.latestVersion || !info.latestFile) {
      res.json({ category, rows: [], merges: [] });
      return;
    }
    try {
      const exceljs = (await import('exceljs')) as typeof import('exceljs');
      const file = path.join(vaultTemplates, category, `v${String(info.latestVersion).padStart(3, '0')}`, info.latestFile);
      const wb = await new exceljs.Workbook().xlsx.load(new Uint8Array(fs.readFileSync(file)) as never);
      const ws = wb.worksheets[0];
      if (!ws) { res.json({ category, rows: [], merges: [] }); return; }
      const MAX_R = 40;
      const MAX_C = 26;
      const rows: string[][] = [];
      for (let r = 1; r <= MAX_R; r++) {
        const row: string[] = [];
        for (let c = 1; c <= MAX_C; c++) {
          const cell = ws.getCell(r, c);
          const v = cell?.value;
          row.push(v === null || v === undefined ? '' : typeof v === 'object' && 'result' in v ? String((v as { result: unknown }).result ?? '') : String(v));
        }
        rows.push(row);
      }
      const merges: Array<{ r1: number; c1: number; r2: number; c2: number }> = [];
      const colIndex = (ref: string): number => {
        const letters = ref.replace(/[0-9]/g, '');
        let n = 0;
        for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
        return n;
      };
      const rawMerges = ws.model?.merges ?? [];
      for (const m of rawMerges as unknown as string[]) {
        const [a, b] = String(m).split(':');
        if (!a || !b) continue;
        const r1 = Number(a.replace(/[A-Z]/g, ''));
        const r2 = Number(b.replace(/[A-Z]/g, ''));
        merges.push({ r1, c1: colIndex(a), r2, c2: colIndex(b) });
      }
      res.json({ category, rows, merges });
    } catch (err) {
      res.json({ category, rows: [], merges: [], error: err instanceof Error ? err.message : String(err) });
    }
  });

  /** Upload a template for a category — versioned (v001, v002…) never overwrites. */
  r.post('/upload', adminRequired, async (req, res) => {
    const body = req.body ?? {};
    const category = String(body.category ?? '').trim().toUpperCase();
    if (!registry.getCategory(category)) { res.status(400).json({ error: 'Unknown category' }); return; }
    const filename = String(body.filename ?? 'template.xlsx').replace(/[^a-zA-Z0-9._-]/g, '');
    if (!/\.(xlsx|xlsm|xls)$/i.test(filename)) { res.status(400).json({ error: 'Only .xlsx/.xlsm/.xls allowed' }); return; }
    const contentB64 = String(body.contentBase64 ?? '');
    if (!contentB64) { res.status(400).json({ error: 'contentBase64 required' }); return; }
    const buf = Buffer.from(contentB64, 'base64');
    const hash = crypto.createHash('sha256').update(buf).digest('hex');
    const info = listCategory(category);
    const nextVersion = (info.latestVersion ?? 0) + 1;
    const dir = path.join(vaultTemplates, category, `v${String(nextVersion).padStart(3, '0')}`);
    fs.mkdirSync(dir, { recursive: true });
    const dest = path.join(dir, filename);
    fs.writeFileSync(dest, buf);
    // Record in template_versions
    const vi = db
      .prepare('INSERT INTO template_versions (category, version_no, filename, storage_path, file_sha256, mime_type, file_size, source_name, is_active, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)')
      .run(category, nextVersion, filename, path.relative(config.vaultDir, dest), hash, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buf.length, filename, req.user?.username ?? '');
    void vi;
    // Introspect sheets for the response
    let sheets: Array<{ name: string; rowCount: number; colCount: number }> = [];
    let hasTable = false;
    try {
      const exceljs = (await import('exceljs')) as typeof import('exceljs');
      const wb = await new exceljs.Workbook().xlsx.load(new Uint8Array(buf) as never);
      sheets = wb.worksheets.map((ws) => ({ name: ws.name, rowCount: ws.rowCount, colCount: ws.columnCount }));
      hasTable = sheets.some((s) => s.colCount >= 5 && s.rowCount > 12);
    } catch { /* introspection is best-effort */ }
    res.json({ ok: true, category, version: nextVersion, file: path.relative(config.vaultDir, dest), sha256: hash, size: buf.length, sheets, hasTable });
  });

  return r;
}
