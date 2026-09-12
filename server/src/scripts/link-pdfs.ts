// Link records to their PDFs by the site's naming convention (ticket 013).
// PDF name: {CATEGORY}-{FORK}-{0000}-{00}-{STATUS}.pdf  (e.g. DR-STR-0001-00-B.pdf)
//   → category DR, fork STR, request_no "STR-1", revision "0", status "B".
// Walks FILES_DIR recursively, matches records, writes the relative hyperlink.
// Idempotent: skips records already linked to the same file.

import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { loadConfig } from '../config.ts';

const NAME_RE = /^(.+)-(\d{4})-(\d{2})-([A-Za-z]+)$/;

function walkPdfs(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(p);
      else if (entry.name.toLowerCase().endsWith('.pdf')) out.push(p);
    }
  };
  walk(root);
  return out;
}

export function linkPdfs(config: ReturnType<typeof loadConfig>): {
  linked: number;
  already: number;
  unmatched: Array<{ file: string; reason: string }>;
} {
  const root = path.resolve(config.filesDir);
  if (!fs.existsSync(root)) {
    throw new Error(`FILES_DIR does not exist: ${root}`);
  }
  const db = new DatabaseSync(path.join(config.dataDir, 'odv.db'));
  const find = db.prepare(
    'SELECT id, status, hyperlink FROM records WHERE category = ? AND request_no = ? AND revision_no = ?',
  );
  const update = db.prepare('UPDATE records SET hyperlink = ? WHERE id = ?');

  const linked: string[] = [];
  const already: string[] = [];
  const unmatched: Array<{ file: string; reason: string }> = [];

  for (const file of walkPdfs(root)) {
    const name = path.basename(file, '.pdf');
    const m = NAME_RE.exec(name);
    if (!m) {
      unmatched.push({ file, reason: 'name does not match convention' });
      continue;
    }
    const [, prefix, numStr, revStr, status] = m;
    const segments = prefix.split('-');
    let category = segments[0];
    let fork = segments.slice(1).join('-');
    // Domain law: CBR was split from IR-CBR — PDFs keep the old prefix, records live in CBR.
    if (prefix === 'IR-CBR') {
      category = 'CBR';
      fork = '';
    }
    const num = String(parseInt(numStr, 10));
    const requestNo = fork ? `${fork}-${num}` : num;
    const revisionNo = String(parseInt(revStr, 10));

    const row = find.get(category, requestNo, revisionNo) as
      | { id: number; status: string; hyperlink: string }
      | undefined;
    if (!row) {
      unmatched.push({ file, reason: `no record ${category}/${requestNo} rev ${revisionNo}` });
      continue;
    }
    if (row.status !== status) {
      unmatched.push({
        file,
        reason: `record status ${row.status} != file status ${status}`,
      });
      continue;
    }
    const rel = path.relative(root, file);
    if (row.hyperlink === rel) {
      already.push(rel);
      continue;
    }
    update.run(rel, row.id);
    linked.push(rel);
  }

  db.close();
  return { linked: linked.length, already: already.length, unmatched };
}

// CLI: npm run link:pdfs
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const config = loadConfig();
  const result = linkPdfs(config);
  console.log(`[link-pdfs] linked ${result.linked}, already linked ${result.already}, unmatched ${result.unmatched.length}`);
  for (const u of result.unmatched.slice(0, 30)) {
    console.log(`  unmatched: ${u.file} — ${u.reason}`);
  }
  if (result.unmatched.length > 30) {
    console.log(`  ... and ${result.unmatched.length - 30} more`);
  }
}