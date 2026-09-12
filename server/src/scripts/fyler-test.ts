// Fyler concept test (ticket 059): copy each category template into
  // data/work/fyler-test/, fill the mapped cells with FAKE metadata via Excel COM
// (PowerShell, super-silent), export the fyler PDF, and produce a small
// attachment page. Read-only toward the monolith — only copies are opened.
//
// Run:  npm --prefix server run fyler:test
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../config.ts';
import {
  buildFylerSpec,
  CATEGORIES_WITHOUT_TEMPLATE,
  runFylerPlan,
  SPECS,
  TEMPLATE_DIR,
} from '../fyler.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Fake metadata per category — proves the real pipeline (ticket 070). */
const FAKE: Record<string, { fork: string; requestNo: string; description: string; floor: string; documents: Array<{ no: number; doc: string; version: string }> }> = {
  IR: { fork: 'STR', requestNo: '9999', description: 'TEST FYLER — Fake Inspection Request to prove the template pipeline.', floor: '', documents: [] },
  SD: { fork: 'STR', requestNo: '9999', description: 'TEST DRAWING — Sheet title row', floor: 'Ground', documents: [{ no: 1, doc: 'TEST DRAWING — Sheet title row', version: 'REV-00' }] },
  DS: { fork: 'STR', requestNo: '9999', description: 'TEST DOCUMENT — submission row', floor: 'Ground', documents: [{ no: 1, doc: 'TEST DOCUMENT — submission row', version: 'REV-00' }] },
  DR: { fork: 'STR', requestNo: '9999', description: 'TEST FYLER — Fake Element Document Removal.', floor: '', documents: [] },
  MIR: { fork: 'STR', requestNo: '9999', description: 'TEST MATERIAL — reinf bars grade 36', floor: '', documents: [{ no: 1, doc: 'TEST MATERIAL — reinf bars grade 36', version: 'REV-00' }] },
  MS: { fork: 'MECH', requestNo: '9999', description: 'TEST QUANTITY — ceiling works', floor: '', documents: [{ no: 1, doc: 'TEST QUANTITY — ceiling works', version: 'REV-00' }] },
  QS: { fork: 'STR', requestNo: '9999', description: 'TEST FYLER — Fake quantity surveying request.', floor: 'Ground', documents: [
    { no: 1, doc: 'EXAMPLE QTY ROW 1 — plastering, 120 m2', version: 'REV-00' },
    { no: 2, doc: 'EXAMPLE QTY ROW 2 — screed, 85 m2', version: 'REV-00' },
  ] },
  RFI: { fork: 'STR', requestNo: '9999', description: 'TEST FYLER — Fake RFI.', floor: '', documents: [] },
};

async function main(): Promise<void> {
  const config = loadConfig();
  const outDir = path.join(config.workDir, 'fyler-test');
  fs.mkdirSync(outDir, { recursive: true });
  // Clean stale outputs so a failed run can never show an old PDF as OK.
  for (const f of fs.readdirSync(outDir)) {
    if (f.endsWith('.pdf') || f.endsWith('.xlsx') || f === '_plan.json' || f === '_fill.ps1' || f === '_results.json') {
      fs.rmSync(path.join(outDir, f), { force: true });
    }
  }

  // 1. Copy templates (read-only source → our data dir) + build specs.
  const files: Array<{ xlsx: string; pdf: string; sheet: string; cells: Record<string, string>; table?: import('../fyler.ts').RangeTable }> = [];
  for (const [cat, fake] of Object.entries(FAKE)) {
    const spec = buildFylerSpec(cat, { ...fake, revisionNo: '00', sentDate: '16-08-2026', status: 'A' });
    if (!spec) continue;
    const src = path.join(TEMPLATE_DIR, spec.template);
    if (!fs.existsSync(src)) {
      console.log(`[fyler] MISSING template for ${cat}: ${spec.template}`);
      continue;
    }
    const xlsx = path.join(outDir, `${cat}_TEST_fyler.xlsx`);
    fs.copyFileSync(src, xlsx);
    files.push({ xlsx, pdf: path.join(outDir, `${cat}_TEST_fyler.pdf`), sheet: spec.sheet, cells: spec.cells, table: spec.table });
  }

  // 2. Run the super-silent Excel COM session (shared pipeline).
  const results = await runFylerPlan(outDir, files);

  // 3. Create an attachment placeholder page per category (attach concept).
  for (const [cat] of Object.entries(SPECS)) {
    const attPath = path.join(outDir, `${cat}_TEST_attachment.pdf`);
    fs.writeFileSync(attPath, attachmentPdf(cat), 'utf8');
  }

  // 4. Report.
  console.log('\n=== FYLER TEST RESULTS ===');
  for (const cat of Object.keys(SPECS)) {
    const pdf = path.join(outDir, `${cat}_TEST_fyler.pdf`);
    const res = results.find((r) => r.file === `${cat}_TEST_fyler.xlsx`);
    const built = buildFylerSpec(cat, { ...FAKE[cat], revisionNo: '00', sentDate: '16-08-2026', status: 'A' });
    const tableInfo = built?.table ? ` | table rows=${built.table.rows.length}/${built.table.max}` : '';
    const ok = res?.ok === true && fs.existsSync(pdf);
    if (ok) console.log(`  ${cat.padEnd(4)} OK${tableInfo} -> ${pdf}`);
    else console.log(`  ${cat.padEnd(4)} FAIL (${res?.error ?? 'no result / no PDF'})${tableInfo}`);
  }
  console.log(`\nCategories without a template (need one in ticket 004): ${CATEGORIES_WITHOUT_TEMPLATE.join(', ')}`);
  console.log(`Output: ${outDir}`);
}

/** Minimal one-page PDF showing the attachment placeholder (attach concept). */
function attachmentPdf(cat: string): string {
  const content = `BT
/F1 18 Tf
72 720 Td
(odv FYLER TEST - ${cat} ATTACHMENT PAGE) Tj
0 -24 Td
/F1 11 Tf
(Fake attachment page to prove the attach-and-print concept.) Tj
0 -18 Td
(In ticket 004 the attachment engine selects real pages from scanned PDFs.) Tj
ET
`;
  const objs = [
    '<</Type/Catalog/Pages 2 0 R>>',
    '<</Type/Pages/Kids[3 0 R]/Count 1>>',
    '<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>',
    `<</Length ${Buffer.byteLength(content, 'utf8')}>>stream\n${content}endstream`,
    '<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>',
  ];
  const lines: string[] = ['%PDF-1.4'];
  const offsets: number[] = [];
  for (let i = 0; i < objs.length; i++) {
    offsets.push(Buffer.byteLength(lines.join('\n'), 'utf8'));
    lines.push(`${i + 1} 0 obj`);
    lines.push(objs[i]);
    lines.push('endobj');
  }
  const xrefStart = Buffer.byteLength(lines.join('\n'), 'utf8');
  lines.push('xref');
  lines.push(`0 ${objs.length + 1}`);
  lines.push('0000000000 65535 f ');
  for (const off of offsets) lines.push(`${String(off).padStart(10, '0')} 00000 n `);
  lines.push('trailer');
  lines.push(`<</Size ${objs.length + 1}/Root 1 0 R>>`);
  lines.push('startxref');
  lines.push(String(xrefStart));
  lines.push('%%EOF');
  return lines.join('\n');
}

main().catch((err) => {
  console.error('[fyler-test] failed:', err);
  process.exit(1);
});