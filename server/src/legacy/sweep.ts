// Legacy sweep engine — reads the monolith's ACTIVE logs (read-only),
// cleans/arranges rows, packs them into data/legacy.db (ADR-008).

import ExcelJS from 'exceljs';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import type { Config } from '../config.ts';
import { buildSources, type LegacySource } from './config.ts';
import { beginSweep, insertRow, openLegacyDb, recordSource } from './db.ts';

function cellValue(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (v instanceof Uint8Array) return '[blob]';
  if (typeof v === 'object') {
    const o = v as { text?: unknown; result?: unknown; richText?: unknown };
    if (typeof o.text === 'string') return o.text.trim();
    if (o.result !== undefined && o.result !== null) return String(o.result).trim();
    if (Array.isArray(o.richText)) {
      return o.richText
        .map((r) => ((r as { text?: string }).text ?? ''))
        .join('')
        .trim();
    }
    return '';
  }
  return String(v).trim();
}

function fileSha(p: string): string {
  try {
    if (!fs.existsSync(p)) return '';
    return createHash('sha256').update(fs.readFileSync(p)).digest('hex').slice(0, 16);
  } catch {
    return '';
  }
}

interface SheetRow {
  rowNo: number;
  data: Record<string, string>;
}

function sweepSheet(ws: ExcelJS.Worksheet): SheetRow[] {
  const maxRow = Math.min(ws.rowCount, 3000);
  // Header detection: first row (1..15) with >=3 non-empty cells.
  let headerCells: string[] = [];
  let headerRow = -1;
  for (let r = 1; r <= Math.min(15, maxRow); r++) {
    const row = ws.getRow(r);
    const vals: string[] = [];
    for (let c = 1; c <= 40; c++) vals.push(cellValue(row.getCell(c).value));
    const nonEmpty = vals.filter((v) => v !== '');
    if (nonEmpty.length >= 3) {
      headerRow = r;
      headerCells = vals;
      break;
    }
  }
  if (headerRow < 0) return [];

  const out: SheetRow[] = [];
  for (let r = headerRow + 1; r <= maxRow; r++) {
    const row = ws.getRow(r);
    const data: Record<string, string> = {};
    let any = false;
    for (let c = 0; c < headerCells.length; c++) {
      const h = headerCells[c].trim();
      if (!h) continue;
      const v = cellValue(row.getCell(c + 1).value);
      data[h] = v;
      if (v !== '') any = true;
    }
    if (any) out.push({ rowNo: r, data });
  }
  return out;
}

async function sweepXlsx(
  db: DatabaseSync,
  source: LegacySource,
): Promise<{ rows: number; note: string }> {
  if (!fs.existsSync(source.file)) return { rows: 0, note: 'file missing' };
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(source.file);
  let total = 0;
  for (const ws of wb.worksheets) {
    if (source.sheets && !source.sheets.includes(ws.name)) continue;
    const rows = sweepSheet(ws);
    for (const r of rows) {
      insertRow(db, source.key, ws.name, r.rowNo, r.data);
      total++;
    }
  }
  return { rows: total, note: '' };
}

function sweepSqlite(
  db: DatabaseSync,
  source: LegacySource,
): { rows: number; note: string } {
  if (!fs.existsSync(source.file)) return { rows: 0, note: 'dir missing' };
  const dbFiles = fs.readdirSync(source.file).filter((f) => f.endsWith('.db'));
  if (dbFiles.length === 0) return { rows: 0, note: 'no .db files found' };

  let total = 0;
  const notes: string[] = [];
  for (const f of dbFiles) {
    const p = path.join(source.file, f);
    let src: DatabaseSync;
    try {
      src = new DatabaseSync(p, { readOnly: true });
    } catch {
      try {
        src = new DatabaseSync(p);
      } catch (e) {
        notes.push(`${f}: cannot open (${(e as Error).message})`);
        continue;
      }
    }
    try {
      const tables = src
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
        .all() as unknown as Array<{ name: string }>;
      for (const t of tables) {
        const cols = (
          src.prepare(`PRAGMA table_info("${t.name}")`).all() as unknown as Array<{ name: string }>
        ).map((c) => c.name);
        if (cols.length === 0) continue;
        const rows = src.prepare(`SELECT * FROM "${t.name}"`).all() as unknown as Array<
          Record<string, unknown>
        >;
        for (let i = 0; i < rows.length; i++) {
          const data: Record<string, string> = {};
          for (const c of cols) data[c] = cellValue(rows[i][c]);
          insertRow(db, source.key, `${f}::${t.name}`, i + 1, data);
          total++;
        }
      }
    } finally {
      src.close();
    }
  }
  return { rows: total, note: notes.join('; ') };
}

export async function runSweep(
  config: Config,
): Promise<Array<{ key: string; display: string; rows: number; note: string }>> {
  const db = openLegacyDb(path.join(config.dataDir, 'legacy.db'));
  beginSweep(db);
  const summary: Array<{ key: string; display: string; rows: number; note: string }> = [];

  for (const source of buildSources(config)) {
    try {
      const res =
        source.kind === 'xlsx'
          ? await sweepXlsx(db, source)
          : sweepSqlite(db, source);
      recordSource(db, {
        key: source.key,
        kind: source.kind,
        display: source.display,
        filePath: source.file,
        sheets: source.sheets ?? [],
        rows: res.rows,
        fileSha: fileSha(source.file),
        note: res.note,
      });
      summary.push({ key: source.key, display: source.display, rows: res.rows, note: res.note });
    } catch (e) {
      const msg = `sweep failed: ${(e as Error).message}`;
      recordSource(db, {
        key: source.key,
        kind: source.kind,
        display: source.display,
        filePath: source.file,
        sheets: source.sheets ?? [],
        rows: 0,
        fileSha: '',
        note: msg,
      });
      summary.push({ key: source.key, display: source.display, rows: 0, note: msg });
    }
  }

  db.close();
  return summary;
}
