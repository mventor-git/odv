// Phase 4 (ticket 133): Import the legacy request PDFs into the repo's OWN data
// directory so the app no longer depends on an external monolith.
// Set LEGACY_PDFS_ROOT to a legacy PDFs folder.
//
// One-time, idempotent: for every *.pdf under the source root, compute its path
// relative to the root and copy it to data/pdfs/<relative> preserving folders.
// A file is skipped if the destination exists with the same size. Use:
//   LEGACY_PDFS_ROOT=<source> npm --prefix server run import:pdfs
// Default source = the archived requests-log PDFs folder.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(here, '..', '..', '..');

const DEFAULT_SOURCE = process.env.LEGACY_PDFS_ROOT ?? '';
const sourceRoot = process.env.LEGACY_PDFS_ROOT || DEFAULT_SOURCE;
const destRoot = path.join(PROJECT_ROOT, 'data', 'pdfs');

if (!fs.existsSync(sourceRoot)) {
  console.error(`[import:pdfs] Source not found: ${sourceRoot}`);
  console.error('[import:pdfs] Set LEGACY_PDFS_ROOT to the legacy PDFs folder.');
  process.exit(1);
}
fs.mkdirSync(destRoot, { recursive: true });

console.log(`[import:pdfs] Source: ${sourceRoot}`);
console.log(`[import:pdfs] Dest:   ${destRoot}`);

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (/\.pdf$/i.test(entry.name)) out.push(full);
  }
  return out;
}

const files = walk(sourceRoot);
console.log(`[import:pdfs] Found ${files.length} PDF(s).`);

let copied = 0;
let skipped = 0;
let failed = 0;
for (const src of files) {
  const rel = path.relative(sourceRoot, src);
  const dest = path.join(destRoot, rel);
  try {
    const sStat = fs.statSync(src);
    if (fs.existsSync(dest) && fs.statSync(dest).size === sStat.size) {
      skipped++;
      continue;
    }
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
    copied++;
  } catch (err) {
    failed++;
    console.error(`[import:pdfs] FAILED: ${rel} — ${err instanceof Error ? err.message : String(err)}`);
  }
}

console.log(`[import:pdfs] Done: ${copied} copied, ${skipped} skipped (already present), ${failed} failed.`);
