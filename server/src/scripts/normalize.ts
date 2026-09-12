// Data normalization (tickets 039): zones recover the ORIGINAL values from the
// legacy DB with the CORRECT rule — "/" and "\" mean 1 (A/ = A1) and zone
// combinations use "&" (A&A1). Floors: Arabic → English, واجهة* → Elevation 01-04.
// Idempotent; run with `npm run normalize`.
import { loadConfig } from '../config.ts';
import { openDb } from '../db.ts';
import { openLegacyDb } from '../legacy/db.ts';
import { categoryFromSheet, findCol, genRequestNo, genRevisionNo, valFromData } from './seed.ts';
import path from 'node:path';

/** "/" and "\" mean 1; separators (comma, &, +, -, ', space) become "&". */
function normalizeZone(raw: string): string {
  const v = raw.trim();
  if (!v || v === 'null') return '';
  if (/^CL12-Q\d+$/.test(v) || v === 'ALL') return v;
  const parts = v.split(/[,&+'\-\s]+/).filter(Boolean);
  const norm = parts.map((p) => {
    const m = p.match(/^([A-Za-z]+)[/\\]$/);
    return m ? m[1] + '1' : p;
  });
  return norm.join('&');
}

const FLOOR_MAP: Record<string, string> = {
  'البدروم': 'Basement',
  'الأرضي': 'Ground',
  'الارضي': 'Ground',
  'الارضى': 'Ground',
  'الاول': 'First',
  'الأول': 'First',
  'الثاني': 'Second',
  'الثانى': 'Second',
  'الثالث': 'Third',
  'الرابع': 'Fourth',
  'الخامس': 'Fifth',
  'السادس': 'Sixth',
};

/** "واجهة جانبية شمال رقم 1" / "واجهه رقم 4" / "واجهة 3" → "Elevation 01"… */
function elevationFloor(v: string): string | null {
  if (!/واجه/.test(v)) return null;
  const m = v.match(/(\d+)/);
  const n = m ? parseInt(m[1], 10) : 1;
  return `Elevation ${String(n).padStart(2, '0')}`;
}

const config = loadConfig();
const main = openDb(config);
const legacy = openLegacyDb(path.join(config.dataDir, 'legacy.db'));

// 1) Build the legacy key map: category|request_no|revision_no -> raw zone
//    (same key derivation as the seed, so live records match their originals).
const legacyRows = legacy
  .prepare(
    "SELECT sheet, row_no AS rowNo, data_json AS dataJson FROM legacy_rows WHERE source_key = 'requests' AND row_no > 1",
  )
  .all() as unknown as Array<{ sheet: string; rowNo: number; dataJson: string }>;
const zoneByKey = new Map<string, string>();
for (const r of legacyRows) {
  const data = JSON.parse(r.dataJson) as Record<string, string>;
  const headers = Object.keys(data);
  const rawNo = genRequestNo(r.sheet, r.rowNo, data);
  if (!rawNo) continue;
  const { category, fork } = categoryFromSheet(r.sheet);
  const revisionNo = genRevisionNo(data);
  const zone = valFromData(headers, data, ['zone']) || '';
  // Live request numbers are fork-prefixed for fork categories ("SUR-233"),
  // raw for no-fork ones ("95") — register both key forms.
  const keyRaw = `${category}|${rawNo}|${revisionNo}`;
  const keyFork = fork ? `${category}|${fork}-${rawNo}|${revisionNo}` : keyRaw;
  if (!zoneByKey.has(keyRaw)) zoneByKey.set(keyRaw, zone);
  if (!zoneByKey.has(keyFork)) zoneByKey.set(keyFork, zone);
}

// 2) Recover live zones from legacy with the CORRECT normalization.
const live = main
  .prepare('SELECT id, category, request_no, revision_no, zone FROM records')
  .all() as unknown as Array<{ id: number; category: string; request_no: string; revision_no: string; zone: string }>;
let zoneFixed = 0;
for (const rec of live) {
  const raw = zoneByKey.get(`${rec.category}|${rec.request_no}|${rec.revision_no}`);
  if (raw === undefined) continue;
  const corrected = normalizeZone(raw);
  if (corrected !== rec.zone) {
    main.prepare('UPDATE records SET zone = ? WHERE id = ?').run(corrected, rec.id);
    console.log(`zone "${rec.zone}" -> "${corrected}" (${rec.category} ${rec.request_no} rev ${rec.revision_no})`);
    zoneFixed++;
  }
}

// 3) Floors: Arabic → English (idempotent).
let floorFixed = 0;
for (const [from, to] of Object.entries(FLOOR_MAP)) {
  const info = main.prepare('UPDATE records SET floor = ? WHERE floor = ?').run(to, from);
  floorFixed += Number(info.changes);
}

// 4) Elevation floors (idempotent).
const elevRows = main
  .prepare("SELECT id, floor FROM records WHERE floor LIKE '%واجه%'")
  .all() as unknown as Array<{ id: number; floor: string }>;
for (const r of elevRows) {
  const to = elevationFloor(r.floor);
  if (to) {
    main.prepare('UPDATE records SET floor = ? WHERE id = ?').run(to, r.id);
    floorFixed++;
  }
}

console.log(`\nNormalization complete: ${zoneFixed} zones recovered, ${floorFixed} floors normalized.`);