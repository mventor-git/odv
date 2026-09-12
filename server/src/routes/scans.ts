import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import type { DatabaseSync, SQLInputValue } from 'node:sqlite';
import sharp from 'sharp';
import PDFDocument from 'pdfkit';
import { authRequired, adminRequired } from '../auth.ts';
import { logEvent } from './logs.ts';
import { pickFolderExternal } from './reports.ts';
import type { Config } from '../config.ts';
import { allowedTransitionsFor, createPlaceholder, removePlaceholders, type RecordRow } from './records.ts';
import type { DomainRegistry } from '../domain-registry.ts';

/**
 * Scan intake (ticket 067) — the scan watch-folder; this route lists, previews
 * (TIFF → PNG), converts (TIFF → PDF), and routes a scan into a request record.
 */

const SCAN_EXTS = ['.tif', '.tiff', '.pdf', '.jpg', '.jpeg', '.png'];

/** TIFF → PDF: render every page to PNG (sharp) and assemble (pdfkit). */
async function convertTiffToPdf(file: string, outPath: string): Promise<void> {
  const meta = await sharp(file, { pages: -1 }).metadata();
  const pages = meta.pages ?? 1;
  const doc = new PDFDocument({ autoFirstPage: false });
  const stream = fs.createWriteStream(outPath);
  doc.pipe(stream);
  for (let i = 0; i < pages; i++) {
    const png = await sharp(file, { page: i }).png().toBuffer();
    const pm = await sharp(png).metadata();
    const w = pm.width ?? 595;
    const h = pm.height ?? 842;
    doc.addPage({ size: [w, h], margin: 0 });
    doc.image(png, 0, 0, { width: w, height: h });
  }
  doc.end();
  await new Promise<void>((resolve, reject) => {
    stream.on('finish', () => resolve());
    stream.on('error', reject);
  });
}

export function scansRouter(db: DatabaseSync, config: Config, registry: DomainRegistry): Router {
  const r = Router();
  r.use(authRequired);

  const defaultScansDir = config.scansDir;
  /** Effective scan watch folder — the admin-set SCANS_WATCH_DIR (if any) else
   *  the config default. Read live from app_settings so a change takes effect
   *  without restarting the server. */
  const getScansDir = (): string => {
    const saved = db.prepare("SELECT value FROM app_settings WHERE key = 'SCANS_WATCH_DIR'").get() as
      | { value: string }
      | undefined;
    return saved?.value || defaultScansDir;
  };
  fs.mkdirSync(defaultScansDir, { recursive: true });

  /** Reject traversal — only bare filenames are allowed. */
  const safeName = (name: string): string | null => {
    const base = path.basename(name);
    return base === name ? base : null;
  };

  /** List the watch folder. */
  r.get('/', (_req, res) => {
    const items = fs
      .readdirSync(getScansDir())
      .filter((f) => SCAN_EXTS.includes(path.extname(f).toLowerCase()))
      .map((f) => {
        const st = fs.statSync(path.join(getScansDir(), f));
        return { name: f, size: st.size, modifiedAt: st.mtime.toISOString() };
      })
      .sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));
    res.json({ items, dir: getScansDir() });
  });

  /** Serve the raw scan file inline (PDFs render in the browser). */
  r.get('/:name/file', (req, res) => {
    const name = safeName(String(req.params.name));
    if (!name) {
      res.status(400).json({ error: 'Invalid name' });
      return;
    }
    const file = path.join(getScansDir(), name);
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
      res.status(404).json({ error: 'Scan not found' });
      return;
    }
    res.setHeader('Content-Disposition', `inline; filename="${name}"`);
    res.sendFile(file);
  });

  /** TIFF metadata (page count + dimensions); PDFs report kind only. */
  r.get('/:name/meta', async (req, res) => {
    const name = safeName(String(req.params.name));
    if (!name) {
      res.status(400).json({ error: 'Invalid name' });
      return;
    }
    const file = path.join(getScansDir(), name);
    if (!fs.existsSync(file)) {
      res.status(404).json({ error: 'Scan not found' });
      return;
    }
    if (path.extname(name).toLowerCase() === '.pdf') {
      res.json({ kind: 'pdf' });
      return;
    }
    try {
      const meta = await sharp(file, { pages: -1 }).metadata();
      res.json({ kind: 'tiff', pages: meta.pages ?? 1, width: meta.width, height: meta.height });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  /** TIFF page → PNG preview (1-based page). */
  r.get('/:name/preview/:page', async (req, res) => {
    const name = safeName(String(req.params.name));
    if (!name) {
      res.status(400).json({ error: 'Invalid name' });
      return;
    }
    const file = path.join(getScansDir(), name);
    if (!fs.existsSync(file)) {
      res.status(404).json({ error: 'Scan not found' });
      return;
    }
    const page = Math.max(1, Number(req.params.page) || 1);
    try {
      const png = await sharp(file, { page: page - 1 }).png().toBuffer();
      res.setHeader('Content-Type', 'image/png');
      res.send(png);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  /** TIFF → PDF (v3 item 33) — saved next to the scan. */
  r.post('/:name/convert', async (req, res) => {
    const name = safeName(String(req.params.name));
    if (!name) {
      res.status(400).json({ error: 'Invalid name' });
      return;
    }
    const file = path.join(getScansDir(), name);
    if (!fs.existsSync(file)) {
      res.status(404).json({ error: 'Scan not found' });
      return;
    }
    if (path.extname(name).toLowerCase() === '.pdf') {
      res.json({ ok: true, file });
      return;
    }
    try {
      const outPath = path.join(getScansDir(), name.replace(/\.[^.]+$/, '') + '.pdf');
      await convertTiffToPdf(file, outPath);
      res.json({ ok: true, file: outPath });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });
  /** Wizard step 7 (ticket 109): pick the scan watch folder (server dialog) and
   *  persist to app_settings.SCANS_WATCH_DIR. */
  r.post('/pick-folder', adminRequired, async (req, res) => {
    const picked = await pickFolderExternal();
    if (!picked) {
      res.json({ ok: false, cancelled: true, current: getScansDir() });
      return;
    }
    fs.mkdirSync(picked, { recursive: true });
    db.prepare(
      'INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    ).run('SCANS_WATCH_DIR', picked);
    res.json({ ok: true, dir: picked, current: getScansDir() });
  });

  /** Wizard step 7: current scan watch folder (display only). */
  r.get('/watch-folder', (_req, res) => {
    const saved = db.prepare("SELECT value FROM app_settings WHERE key = 'SCANS_WATCH_DIR'").get() as
      | { value: string }
      | undefined;

    res.json({ dir: saved?.value || defaultScansDir });
  });

  /** Route a scan into a request record (Add Metadata flow). */
  r.post('/:name/route', async (req, res) => {
    const name = safeName(String(req.params.name));
    if (!name) {
      res.status(400).json({ error: 'Invalid name' });
      return;
    }
    const file = path.join(getScansDir(), name);
    if (!fs.existsSync(file)) {
      res.status(404).json({ error: 'Scan not found' });
      return;
    }
    const body = req.body ?? {};
    const category = String(body.category ?? '');
    if (!registry.getCategory(category)) {
      res.status(400).json({ error: 'Unknown category' });
      return;
    }
    const requestNo = String(body.requestNo ?? '');
    if (!requestNo.trim()) {
      res.status(400).json({ error: 'Request No. is required' });
      return;
    }
    if (body.status !== undefined && !registry.isStatusCode(String(body.status))) {
      res.status(400).json({ error: 'Unknown status' });
      return;
    }
    // Ensure a PDF exists for the scan (TIFF → PDF on route, v3 item 33).
    let pdfPath = file;
    if (path.extname(name).toLowerCase() !== '.pdf') {
      const converted = path.join(getScansDir(), name.replace(/\.[^.]+$/, '') + '.pdf');
      if (!fs.existsSync(converted)) {
        try {
          await convertTiffToPdf(file, converted);
        } catch (err) {
          res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
          return;
        }
      }
      pdfPath = converted;
    }
    const revisionNo = String(body.revisionNo ?? '00');
    const dup = db
      .prepare(
        "SELECT 1 FROM records WHERE category = ? AND request_no = ? AND revision_no = ? AND deleted_at = ''",
      )
      .get(category, requestNo, revisionNo);
    if (dup) {
      res.status(409).json({ error: 'A record with this category + request no. + revision no. already exists' });
      return;
    }
    const info = db
      .prepare(
        `INSERT INTO records (category, request_no, revision_no, description, zone, floor, engineer,
          fork, sent_date, sent_by_consultant_date, reply_date, reply_by_contractor_date,
          status, hyperlink, data_hyperlink, created_by, documents_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        category,
        requestNo,
        revisionNo,
        String(body.description ?? ''),
        String(body.zone ?? ''),
        String(body.floor ?? ''),
        String(body.engineer ?? ''),
        String(body.fork ?? ''),
        String(body.sentDate ?? ''),
        String(body.sentByConsultantDate ?? ''),
        String(body.replyDate ?? ''),
        String(body.replyByContractorDate ?? ''),
        String(body.status ?? 'P'),
        pdfPath,
        String(body.dataHyperlink ?? ''),
        req.user!.id,
        String(body.documents ?? '[]'),
      );
    const row = db.prepare('SELECT * FROM records WHERE id = ?').get(Number(info.lastInsertRowid)) as
      | RecordRow
      | undefined;
    logEvent(
      db,
      req.user!.username,
      'create',
      `${category} ${requestNo}`,
      `Created ${category} ${requestNo} rev ${String(revisionNo).padStart(2, '0')} from scan ${name}`,
    );
    res.status(201).json({ ok: true, id: row?.id });
  });

  /** Attach a watch-folder scan to an EXISTING request (by record id): convert
   *  TIFF/image → PDF, copy into the PDFs vault, set hyperlink, log. Used by the
   *  P-status request card "log scan PDF" flow. */
  r.post('/:name/attach', async (req, res) => {
    const name = safeName(String(req.params.name));
    if (!name) {
      res.status(400).json({ error: 'Invalid name' });
      return;
    }
    const file = path.join(getScansDir(), name);
    if (!fs.existsSync(file)) {
      res.status(404).json({ error: 'Scan not found' });
      return;
    }
    const body = req.body ?? {};
    const recordId = Number(body.recordId);
    if (!recordId) {
      res.status(400).json({ error: 'recordId is required' });
      return;
    }
    const row = db.prepare('SELECT * FROM records WHERE id = ? AND deleted_at = ?').get(recordId, '') as
      | RecordRow
      | undefined;
    if (!row) {
      res.status(404).json({ error: 'Record not found' });
      return;
    }
    // 1) Ensure a PDF exists for the scan (TIFF/image → PDF, PDF passes through).
    let pdfData: Buffer;
    if (path.extname(name).toLowerCase() === '.pdf') {
      pdfData = fs.readFileSync(file);
    } else {
      const converted = path.join(getScansDir(), name.replace(/\.[^.]+$/, '') + '.pdf');
      if (!fs.existsSync(converted)) {
        try {
          await convertTiffToPdf(file, converted);
        } catch (err) {
          res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
          return;
        }
      }
      pdfData = fs.readFileSync(converted);
    }
    // 2) Copy into the PDFs vault with a stable, revision-aware name.
    const filesDir = config.filesDir;
    fs.mkdirSync(filesDir, { recursive: true });
    const base = `${row.category}-${row.request_no}-${row.revision_no}-${row.status || 'P'}`.replace(/[^a-zA-Z0-9._-]/g, '_');
    let destName = base + '.pdf';
    let n = 1;
    while (fs.existsSync(path.join(filesDir, destName))) {
      destName = `${base}-${n}.pdf`;
      n++;
    }
    const dest = path.join(filesDir, destName);
    fs.writeFileSync(dest, pdfData);
    const rel = path.relative(filesDir, dest).replace(/\\/g, '/');
    // Optional grading (ticket 136): the scan is a reply — set status + the
    // correct reply-date field for the category (NCR inverted, else normal).
    const gradeStatus = String(body.status ?? '').trim();
    const replyDate = String(body.replyDate ?? '').trim();
    let setClause = 'hyperlink = ?, updated_at = datetime(\'now\')';
    const params: SQLInputValue[] = [rel, recordId];
    if (gradeStatus) {
      const allowed = allowedTransitionsFor(registry, row.status);
      if (allowed.length > 0 && !allowed.includes(gradeStatus)) {
        res.status(400).json({ error: `Status ${row.status} can only change to ${allowed.join(', ')}` });
        return;
      }
      if (replyDate && !/^\d{4}-\d{2}-\d{2}$/.test(replyDate)) {
        res.status(400).json({ error: 'replyDate must be YYYY-MM-DD' });
        return;
      }
      const replyCol = row.category === 'NCR' ? 'reply_by_contractor_date' : 'reply_date';
      setClause = `hyperlink = ?, ${replyCol} = ?, status = ?, updated_at = datetime('now')`;
      params.push(replyDate, gradeStatus, recordId);
    }
    db.prepare(`UPDATE records SET ${setClause} WHERE id = ?`).run(...params);
    // Held-PP engine (ticket 033): C holds a placeholder; A/B release it.
    if (gradeStatus && row.status !== gradeStatus) {
      if (gradeStatus === 'C') createPlaceholder(db, row);
      if (gradeStatus === 'A' || gradeStatus === 'B') removePlaceholders(db, row.category, row.request_no);
    }
    logEvent(
      db,
      req.user!.username,
      'update',
      `${row.category} ${row.request_no}`,
      gradeStatus
        ? `Attached scan ${name} → ${rel} + graded ${row.category} ${row.request_no} ${gradeStatus}${replyDate ? ' on ' + replyDate : ''}`
        : `Attached scan ${name} → ${rel}`,
    );
    res.json({ ok: true, hyperlink: rel, dest, status: gradeStatus || undefined });
  });

  return r;
}