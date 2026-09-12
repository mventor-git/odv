// Seed the live DB v2 from the swept legacy DB (ticket 003).
// Idempotent: skips tables that already have rows (use --force to re-seed).

import 'dotenv/config';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import type { Config } from '../config.ts';
import { ensureSchema } from '../db.ts';
import { openLegacyDb, type LegacyRowRecord } from '../legacy/db.ts';
import { isStatusCode } from '../domain.ts';

function normHeader(h: string): string {
  return h.toLowerCase().replace(/[^a-z0-9\u0600-\u06ff]/g, '');
}

function excelSerialToDate(v: string): string {
  const n = Number(v);
  if (Number.isFinite(n) && n > 20000 && n < 60000) {
    return new Date(Math.round((n - 25569) * 86400000)).toISOString().slice(0, 10);
  }
  return v;
}

function toNum(v: string): number {
  const n = Number(String(v).trim().replace(/,/g, '.'));
  return Number.isFinite(n) ? n : 0;
}

export function findCol(headers: string[], frags: string[]): string | undefined {
  for (const f of frags) {
    const hit = headers.find((h) => normHeader(h).includes(f));
    if (hit) return hit;
  }
  return undefined;
}

function legacyRows(db: DatabaseSync, sourceKey: string): LegacyRowRecord[] {
  const rows = db
    .prepare(
      `SELECT id, source_key AS sourceKey, sheet, row_no AS rowNo, data_json AS dataJson
       FROM legacy_rows WHERE source_key = ? AND row_no > 1 ORDER BY row_no`,
    )
    .all(sourceKey) as unknown as Array<{
    id: number;
    sourceKey: string;
    sheet: string;
    rowNo: number;
    dataJson: string;
  }>;
  return rows.map((r) => ({
    id: r.id,
    sourceKey: r.sourceKey,
    sheet: r.sheet,
    rowNo: r.rowNo,
    data: JSON.parse(r.dataJson) as Record<string, string>,
  }));
}

export interface SeedSummary {
  records: number;
  concreteStations: number;
  concreteLoose: number;
  concreteBatches: number;
}

// Maps sheet names to categories and forks using Tables.xlsx logic
export function categoryFromSheet(sheet: string): { category: string; fork: string } {
  // IR_CBR is now CBR, uses IR template, tied to Concrete domain
  if (sheet === 'IR_CBR') return { category: 'CBR', fork: '' };
  if (sheet === 'QC') return { category: 'QC', fork: '' };
  if (sheet === 'DR_STR') return { category: 'DR', fork: 'STR' };
  if (sheet === 'DS_STR') return { category: 'DS', fork: 'STR' };
  if (sheet === 'RFI') return { category: 'RFI', fork: '' };
  // QS categories
  if (sheet.startsWith('QS_Asbuilt_')) {
    return { category: 'QS', fork: `Asbuilt-${sheet.slice(11).replaceAll('_', '-')}` };
  }
  if (sheet.startsWith('QS_')) {
    return { category: 'QS', fork: sheet.slice(3).replaceAll('_', '-') };
  }
  // IR, SD, MIR, MS categories
  const parts = sheet.split('_');
  if (parts.length >= 2 && ['IR', 'SD', 'MIR', 'MS'].includes(parts[0])) {
    return { category: parts[0], fork: parts.slice(1).join('-') };
  }
  // Fallback: sheet name is the category, no fork
  return { category: sheet, fork: '' };
}

// Extract a value from data_json using fragment matching on column headers
export function valFromData(headers: string[], data: Record<string, string>, frags: string[]): string {
  const col = findCol(headers, frags);
  return col ? data[col] ?? '' : '';
}

// Generate request number: use data if available, otherwise fallback to sheet-rowNo
// Tables.xlsx logic: request numbers are per category, generated as max+1 or from template
export function genRequestNo(sheet: string, rowNo: number, data: Record<string, string>): string {
  const requestNo = valFromData(Object.keys(data), data, ['requestno']);
  if (requestNo.trim()) return requestNo;
  // Fallback: use sheet name + row number
  // Tables.xlsx: each category has its own numbering scheme
  return `${sheet}-${rowNo}`;
}

// Generate revision number: use data if available, otherwise default to '0'
// Tables.xlsx: revision 00 is default, 01+ requires attaching old request
export function genRevisionNo(data: Record<string, string>): string {
  const revisionNo = valFromData(Object.keys(data), data, ['revisionno', 'revision']);
  if (revisionNo.trim()) return revisionNo;
  // Default to '0' per Tables.xlsx logic
  return '0';
}

// Get status code from data, preferring Code field, falling back to Status field slogan
function getStatus(headers: string[], data: Record<string, string>): string {
  const statusFromCodeField = isStatusCode(valFromData(headers, data, ['Code']).trim())
    ? valFromData(headers, data, ['Code']).trim()
    : '';
  const statusFromStatusField = isStatusCode(valFromData(headers, data, ['status']).trim())
    ? valFromData(headers, data, ['status']).trim()
    : '';
  // Tables.xlsx status engine: A, B, C, D, SS, PP, P, SC, Skipped
  // Default to 'P' (Pending) if no valid status found
  return statusFromCodeField || statusFromStatusField || 'P';
}

function seedRecords(main: DatabaseSync, legacy: DatabaseSync): number {
  const count = (main.prepare('SELECT COUNT(*) AS n FROM records').get() as { n: number }).n;
  if (count > 0) return 0;

  console.log('seedRecords: count is 0, proceeding with seed');
  console.log('seedRecords: legacy rows count:', legacyRows(legacy, 'requests').length);

  const insert = main.prepare(
    `INSERT INTO records (category, request_no, revision_no, description, zone, floor,
      engineer, fork, sent_date, reply_date, status, hyperlink, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  let n = 0;
  for (const row of legacyRows(legacy, 'requests')) {
    const headers = Object.keys(row.data);
    // Generate request number with fallback (Tables.xlsx: generated from sheet-rowNo if not in data)
    const requestNo = genRequestNo(row.sheet, row.rowNo, row.data);
    if (!requestNo) continue;
    const { category, fork } = categoryFromSheet(row.sheet);
    // Generate revision number with fallback (Tables.xlsx: defaults to 0)
    const revisionNo = genRevisionNo(row.data);
    // Get status using Tables.xlsx logic (Code field or Status field slogan)
    const status = getStatus(headers, row.data);
    insert.run(
      category,
      requestNo,
      revisionNo,
      valFromData(headers, row.data, ['description']) || '',
      valFromData(headers, row.data, ['zone']) || '',
      valFromData(headers, row.data, ['floor']) || '',
      valFromData(headers, row.data, ['engineer']) || '',
      fork,
      excelSerialToDate(valFromData(headers, row.data, ['sentto', 'qualitycontrol', 'sent']) || ''),
      excelSerialToDate(valFromData(headers, row.data, ['replyby', 'replydate', 'reply']) || ''),
      status,
      valFromData(headers, row.data, ['hyperlink']) || '',
      1,
    );
    n++;
  }
  return n;
}

function seedConcrete(
  main: DatabaseSync,
  legacy: DatabaseSync,
): { stations: number; loose: number; batches: number } {
  const stationCount = (main.prepare('SELECT COUNT(*) AS n FROM concrete_stations').get() as { n: number }).n;
  const looseCount = (main.prepare('SELECT COUNT(*) AS n FROM concrete_loose').get() as { n: number }).n;
  const batchCount = (main.prepare('SELECT COUNT(*) AS n FROM concrete_batches').get() as { n: number }).n;
  if (stationCount + looseCount + batchCount > 0) {
    return { stations: 0, loose: 0, batches: 0 };
  }

  let loose = 0;
  let batches = 0;
  const stationNames = new Set<string>();
  const insertLoose = main.prepare(
    `INSERT INTO concrete_loose (station, policy_no, policy_date, quantity_ton, supplier,
      status, received_date, hyperlink, data_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const insertBatch = main.prepare(
    `INSERT INTO concrete_batches (station, work_statement, zone, floor, quantity_m3, pour_date,
      due_after_pour_qty, due_after_pour_date, due_1mo_qty, due_1mo_date, due_2mo_qty,
      due_2mo_date, notes, data_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );

  for (const row of legacyRows(legacy, 'batching')) {
    const headers = Object.keys(row.data);
    const val = (frags: string[]): string => {
      const col = findCol(headers, frags);
      return col ? row.data[col] ?? '' : '';
    };

    if (row.sheet === 'Loose-Cement') {
      const station = val(['station']);
      const policyNo = val(['policyno']);
      if (!station && !policyNo) continue;
      if (station) stationNames.add(station);
      insertLoose.run(
        station,
        policyNo,
        excelSerialToDate(val(['policydate', 'policy'])),
        toNum(val(['quantity'])),
        val(['supplier']),
        val(['status']),
        excelSerialToDate(val(['recived', 'received'])),
        val(['hyperlink']),
        JSON.stringify(row.data),
      );
      loose++;
    } else {
      // Supplier pours ledger — positional mapping by header order.
      const keys = headers;
      const cell = (i: number): string => keys[i] ? (row.data[keys[i]] ?? '') : '';
      const station = row.sheet;
      stationNames.add(station);
      insertBatch.run(
        station,
        cell(1), // بيان الأعمال
        cell(2), // building/zone
        cell(3), // floor
        toNum(cell(4)), // quantity m3
        excelSerialToDate(cell(5)), // pour date
        toNum(cell(6)), // due after pour qty
        excelSerialToDate(cell(7)), // due after pour date
        toNum(cell(8)), // due 1mo qty
        excelSerialToDate(cell(9)), // due 1mo date
        toNum(cell(10)), // due 2mo qty
        excelSerialToDate(cell(11)), // due 2mo date
        cell(12), // notes
        JSON.stringify(row.data),
      );
      batches++;
    }
  }

  const insertStation = main.prepare('INSERT INTO concrete_stations (name) VALUES (?)');
  let stations = 0;
  for (const name of [...stationNames].sort()) {
    if (!name.trim()) continue;
    insertStation.run(name.trim());
    stations++;
  }
  return { stations, loose, batches };
}

export function runSeed(config: Config, force = false): SeedSummary {
  const main = new DatabaseSync(path.join(config.dataDir, 'odv.db'));
  main.exec('PRAGMA journal_mode = WAL;');
  ensureSchema(main);
  const legacyPath = path.join(config.dataDir, 'legacy.db');
  if (!fs.existsSync(legacyPath)) {
    main.close();
    throw new Error('legacy.db not found — run `npm run sweep` first');
  }
  const legacy = openLegacyDb(legacyPath);

  if (force) {
    main.exec('DELETE FROM records; DELETE FROM concrete_stations; DELETE FROM concrete_loose; DELETE FROM concrete_batches;');
  }

  const records = seedRecords(main, legacy);
  console.log('runSeed: records inserted =', records);
  const concrete = seedConcrete(main, legacy);
  main.close();
  legacy.close();
  return {
    records,
    concreteStations: concrete.stations,
    concreteLoose: concrete.loose,
    concreteBatches: concrete.batches,
  };
}