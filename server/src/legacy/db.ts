// legacy.db — the packed, read-only "check legacy" database (ADR-008).

import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

export interface LegacyRowRecord {
  id: number;
  sourceKey: string;
  sheet: string;
  rowNo: number;
  data: Record<string, string>;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS legacy_sources (
  key TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  display TEXT NOT NULL,
  file_path TEXT NOT NULL DEFAULT '',
  sheets TEXT NOT NULL DEFAULT '',
  rows INTEGER NOT NULL DEFAULT 0,
  file_sha TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  swept_at TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS legacy_rows (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_key TEXT NOT NULL,
  sheet TEXT NOT NULL DEFAULT '',
  row_no INTEGER NOT NULL DEFAULT 0,
  data_json TEXT NOT NULL,
  search_text TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_legacy_source ON legacy_rows(source_key, row_no);
`;

export function openLegacyDb(dbPath: string): DatabaseSync {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec(SCHEMA);
  return db;
}

export function beginSweep(db: DatabaseSync): void {
  db.exec('DELETE FROM legacy_rows; DELETE FROM legacy_sources;');
}

export function recordSource(
  db: DatabaseSync,
  s: {
    key: string;
    kind: string;
    display: string;
    filePath: string;
    sheets: string[];
    rows: number;
    fileSha: string;
    note: string;
  },
): void {
  db.prepare(
    `INSERT INTO legacy_sources (key, kind, display, file_path, sheets, rows, file_sha, note, swept_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
  ).run(
    s.key,
    s.kind,
    s.display,
    s.filePath,
    s.sheets.join('|'),
    s.rows,
    s.fileSha,
    s.note,
  );
}

export function insertRow(
  db: DatabaseSync,
  sourceKey: string,
  sheet: string,
  rowNo: number,
  data: Record<string, string>,
): void {
  const search = Object.values(data)
    .filter((v) => v !== '')
    .join(' ')
    .toLowerCase();
  db.prepare(
    `INSERT INTO legacy_rows (source_key, sheet, row_no, data_json, search_text)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(sourceKey, sheet, rowNo, JSON.stringify(data), search);
}

export function listSources(db: DatabaseSync): Array<{
  key: string;
  kind: string;
  display: string;
  filePath: string;
  sheets: string;
  rows: number;
  note: string;
  sweptAt: string;
}> {
  return db
    .prepare(
      `SELECT key, kind, display, file_path AS filePath, sheets, rows, note, swept_at AS sweptAt
       FROM legacy_sources ORDER BY rows DESC`,
    )
    .all() as unknown as Array<{
    key: string;
    kind: string;
    display: string;
    filePath: string;
    sheets: string;
    rows: number;
    note: string;
    sweptAt: string;
  }>;
}

export function queryRows(
  db: DatabaseSync,
  sourceKey: string,
  q: string,
  limit: number,
  offset: number,
): { total: number; items: LegacyRowRecord[] } {
  const where = q
    ? 'source_key = ? AND search_text LIKE ?'
    : 'source_key = ?';
  const params: SQLInputValue[] = q ? [sourceKey, `%${q.toLowerCase()}%`] : [sourceKey];
  const total = (
    db.prepare(`SELECT COUNT(*) AS n FROM legacy_rows WHERE ${where}`).get(...params) as {
      n: number;
    }
  ).n;
  const rows = db
    .prepare(
      `SELECT id, source_key AS sourceKey, sheet, row_no AS rowNo, data_json AS dataJson
       FROM legacy_rows WHERE ${where} ORDER BY row_no, id LIMIT ? OFFSET ?`,
    )
    .all(...params, limit, offset) as unknown as Array<{
    id: number;
    sourceKey: string;
    sheet: string;
    rowNo: number;
    dataJson: string;
  }>;
  const items = rows.map((r) => ({
    id: r.id,
    sourceKey: r.sourceKey,
    sheet: r.sheet,
    rowNo: r.rowNo,
    data: JSON.parse(r.dataJson) as Record<string, string>,
  }));
  return { total, items };
}
