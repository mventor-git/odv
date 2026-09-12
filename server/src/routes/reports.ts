import { Router, type Response } from 'express';
import { execFile, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { authRequired, adminRequired } from '../auth.ts';
import type { DomainRegistry } from '../domain-registry.ts';
import { PROJECT_ROOT, type Config } from '../config.ts';

/** Wall dashboard report export (v3 item 26) — HTML and/or MD files, saved
 *  where the user picks via a Windows folder-browse dialog on the server PC. */

/** Cairo variable font files (Arabic + Latin) used to make the exported HTML
 *  render correctly on ANY PC (no system font dependency). Sourced from the
 *  @fontsource-variable/cairo package installed in the client. */
const CAIRO_FONTS: Array<{ file: string; unicode: string }> = [
  { file: 'cairo-arabic-wght-normal.woff2', unicode: 'U+0600-06FF, U+0750-077F, U+0870-088E, U+0890-0891, U+0897-08E1, U+08E3-08FF, U+200C-200E, U+2010-2011, U+204F, U+2E41, U+FB50-FDFF, U+FE70-FE74, U+FE76-FEFC' },
  { file: 'cairo-latin-wght-normal.woff2', unicode: 'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD' },
  { file: 'cairo-latin-ext-wght-normal.woff2', unicode: 'U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF' },
];

const CAIRO_DIR = path.resolve(PROJECT_ROOT, 'client', 'node_modules', '@fontsource-variable', 'cairo', 'files');

/** Classic (UMD) PDF.js build — vendored in server/src/vendor/pdfjs so the
 *  exported HTML renders PDFs in-page and OFFLINE on any PC (plain <script> tag,
 *  no module/CORS issues on file://). */
const PDFJS_DIR = path.resolve(PROJECT_ROOT, 'server', 'src', 'vendor', 'pdfjs');
const PDFJS_FILES = ['pdf.min.js', 'pdf.worker.min.js'];


/** Build the @font-face block for the standalone export. `fontMode`:
 *  - 'inline': embed the woff2 as a base64 data URI (single self-contained file)
 *  - 'deps':   reference `deps/<filename>` (used with the hidden deps/ folder)  */
function fontFaceCss(fontMode: 'inline' | 'deps'): string {
  return CAIRO_FONTS.map(({ file, unicode }) => {
    let src: string;
    if (fontMode === 'inline') {
      try {
        const b64 = fs.readFileSync(path.join(CAIRO_DIR, file)).toString('base64');
        src = `url("data:font/woff2;base64,${b64}")`;
      } catch {
        src = `url("${file}")`;
      }
    } else {
      src = `url("deps/${file}")`;
    }
    return `@font-face{font-family:'Cairo';font-style:normal;font-weight:100 1000;font-display:swap;src:${src} format('woff2');unicode-range:${unicode}}`;
  }).join('\n');
}

interface WallStats {
  total: number;
  byStatus: Record<string, number>;
  byBucket: Record<string, number>;
  byCategory: Record<string, number>;
  ncrUrgent: { pending: number; pp: number };
}

function computeStats(db: DatabaseSync, registry: DomainRegistry): WallStats {
  const total = (db.prepare("SELECT COUNT(*) AS n FROM records WHERE deleted_at = ''").get() as { n: number }).n;
  const byStatus: Record<string, number> = {};
  const byBucket: Record<string, number> = {};
  const byCategory: Record<string, number> = {};
  for (const row of db
    .prepare("SELECT category, status FROM records WHERE deleted_at = ''")
    .all() as unknown as Array<{ category: string; status: string }>) {
    byStatus[row.status] = (byStatus[row.status] ?? 0) + 1;
    byCategory[row.category] = (byCategory[row.category] ?? 0) + 1;
    const bucket = registry.getStatus(row.status)?.bucket ?? 'open';
    byBucket[bucket] = (byBucket[bucket] ?? 0) + 1;
  }
  const ncr = db
    .prepare("SELECT status, COUNT(*) AS n FROM records WHERE deleted_at = '' AND category = 'NCR' AND status IN ('P','PP') GROUP BY status")
    .all() as unknown as Array<{ status: string; n: number }>;
  const ncrUrgent = { pending: 0, pp: 0 };
  for (const row of ncr) {
    if (row.status === 'P') ncrUrgent.pending = row.n;
    if (row.status === 'PP') ncrUrgent.pp = row.n;
  }
  return { total, byStatus, byBucket, byCategory, ncrUrgent };
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&#39;',
  );
}

/** The filename a record's PDF is copied to inside the export's PDFs/ folder
 *  (`<category>-<request_no>-<rev>-<status>.<ext>`, sanitized). Used both when
 *  copying and when building the export HTML so the viewer/fallback link to the
 *  file that actually exists. */
function pdfDestName(r: { category: string; request_no: string; revision_no: string; status: string; hyperlink: string }): string {
  const hl = String(r.hyperlink ?? '').trim();
  const ext = hl ? (path.extname(hl) || '.pdf') : '.pdf';
  return `${r.category}-${r.request_no}-${r.revision_no || '00'}-${r.status}${ext}`.replace(/[^a-zA-Z0-9._-]/g, '_');
}

interface SiteIdentity {
  name: string;
  projectId: string;
  projectName: string;
  workingArea: string;
  consultant: string;
  owner: string;
  ownerDelegate: string;
  logoPath: string;
  consultantLogoPath: string;
  ownerLogoPath: string;
}

/** Site identity (ticket 069 + 133) — used in report/export headers. Includes the
 *  short project id and the three logos (company/consultant/owner). */
function getIdentity(db: DatabaseSync, config: Config): SiteIdentity {
  const get = (key: string): string => {
    const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(key) as
      | { value: string }
      | undefined;
    return row?.value ?? '';
  };
  const logoFile = (extKey: string, base: string): string => {
    const ext = get(extKey);
    const p = ext ? path.join(config.dataDir, `${base}${ext}`) : '';
    return p && fs.existsSync(p) ? p : '';
  };
  return {
    name: get('name'),
    projectId: get('project_id') || 'PRJ-01',
    projectName: get('projectName'),
    workingArea: get('workingArea') || 'Cluster 12',
    consultant: get('consultant'),
    owner: get('owner'),
    ownerDelegate: get('ownerDelegate'),
    logoPath: logoFile('logo_ext', 'company-logo'),
    consultantLogoPath: logoFile('consultant_logo_ext', 'consultant-logo'),
    ownerLogoPath: logoFile('owner_logo_ext', 'owner-logo'),
  };
}

function buildHtml(stats: WallStats, generatedBy: string, id: SiteIdentity, registry: DomainRegistry, db: DatabaseSync): string {
  const now = new Date().toLocaleString();
  const logoHtml = id.logoPath
    ? `<img src="data:image/png;base64,${fs.readFileSync(id.logoPath).toString('base64')}" alt="logo" style="height:44px;width:88px;object-fit:contain">`
    : '';
  const idLine = [id.name, id.projectName, id.workingArea].filter(Boolean).join(' · ');
  const snap = registry.getSnapshot();
  const statusRows = snap.statuses.map((s) => {
    const n = stats.byStatus[s.code] ?? 0;
    const pct = stats.total > 0 ? ((n / stats.total) * 100).toFixed(1) : '0.0';
    return `<tr><td>${escapeHtml(s.code)}</td><td>${escapeHtml(s.slogan)}</td><td class="num">${n}</td><td class="num">${pct}%</td></tr>`;
  }).join('');
  const catRows = snap.categories.map((c) => {
    const n = stats.byCategory[c.code] ?? 0;
    const forks = (c.forks || []).join(', ');
    return `<tr><td>${escapeHtml(c.code)}</td><td>${escapeHtml(c.name)}</td><td>${escapeHtml(forks)}</td><td class="num">${n}</td></tr>`;
  }).join('');
  const bucketRows = Object.entries(stats.byBucket)
    .map(([b, n]) => `<tr><td>${escapeHtml(b)}</td><td class="num">${n}</td></tr>`)
    .join('');
  // ALL PROJECT METADATA — zones, floors, forks, custom labels, scans folder, users count
  const zones = db.prepare('SELECT code, name, name_ar AS nameAr, cluster FROM zones ORDER BY code').all() as Array<{ code: string; name: string; nameAr: string; cluster: string }>;
  const zonesRows = zones.map((z) => `<tr><td>${escapeHtml(z.code)}</td><td>${escapeHtml(z.name)}</td><td>${escapeHtml(z.nameAr)}</td><td>${escapeHtml(z.cluster)}</td></tr>`).join('');
  const floors = db.prepare('SELECT name, name_ar AS nameAr FROM floors ORDER BY name').all() as Array<{ name: string; nameAr: string }>;
  const floorsRows = floors.map((f) => `<tr><td>${escapeHtml(f.name)}</td><td>${escapeHtml(f.nameAr)}</td></tr>`).join('');
  const customMeta = (() => {
    try {
      const row = db.prepare("SELECT value FROM app_settings WHERE key = 'custom_metadata'").get() as { value: string } | undefined;
      if (!row?.value) return '';
      const arr = JSON.parse(row.value) as Array<{ key_en: string; key_ar: string; value_en: string; value_ar: string }>;
      if (!Array.isArray(arr) || arr.length === 0) return '';
      return arr.map((m) => `<tr><td>${escapeHtml(m.key_en)}${m.key_ar ? ' / ' + escapeHtml(m.key_ar) : ''}</td><td>${escapeHtml(m.value_en)}${m.value_ar ? ' / ' + escapeHtml(m.value_ar) : ''}</td></tr>`).join('');
    } catch { return ''; }
  })();
  const scansFolder = (() => {
    try {
      const row = db.prepare("SELECT value FROM app_settings WHERE key = 'scans_watch_dir'").get() as { value: string } | undefined;
      return row?.value ?? '';
    } catch { return ''; }
  })();
  const usersCount = (db.prepare('SELECT COUNT(*) AS n FROM users').get() as { n: number }).n;
  const membersCount = (db.prepare('SELECT COUNT(*) AS n FROM engineers').get() as { n: number }).n;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Wall Report — odv</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: "Segoe UI", Tahoma, Arial, sans-serif; color: #2D2926; background: #F6F3EE; padding: 32px; }
  .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 3px solid #C96D57; padding-bottom: 12px; margin-bottom: 24px; }
  .header .brand { font-size: 20px; font-weight: 700; color: #C96D57; }
  .header .meta { font-size: 12px; color: #6F6861; text-align: end; }
  h1 { font-size: 24px; margin-bottom: 4px; color: #2D2926; }
  .sub { color: #6F6861; font-size: 13px; margin-bottom: 8px; }
  .total { font-size: 40px; font-weight: 800; color: #C96D57; margin-bottom: 8px; }
  .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 16px; }
  .meta-card { border: 1px solid #E3DDD5; background: #FBF9F6; border-radius: 8px; padding: 10px 12px; }
  .meta-card h3 { font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: #6F6861; margin-bottom: 6px; }
  .meta-card p { font-size: 12px; color: #2D2926; }
  h2 { font-size: 16px; margin: 20px 0 8px; color: #2D2926; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
  th { text-align: start; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: #6F6861; border-bottom: 2px solid #E3DDD5; padding: 8px 6px; }
  td { padding: 8px 6px; border-bottom: 1px solid #E3DDD5; font-size: 13px; color: #2D2926; }
  td.num { text-align: end; font-variant-numeric: tabular-nums; font-weight: 600; }
  .footer { margin-top: 24px; font-size: 11px; color: #958D84; text-align: center; }
  @media print { body { padding: 0; background: #FFFFFF; } }
</style>
</head>
<body>
  <div class="header">
    <div class="brand">${logoHtml}${escapeHtml(idLine || 'odv')}</div>
    <div class="meta">Generated: ${escapeHtml(now)}<br>By: ${escapeHtml(generatedBy)}</div>
  </div>
  <h1>Wall Report</h1>
  <div class="sub">Performance dashboard — request workflow status</div>
  <div class="total">${stats.total}</div>
  <div class="meta-grid">
    <div class="meta-card"><h3>Project</h3><p>${escapeHtml(idLine || '—')}</p><p style="font-size:11px;color:#6F6861;margin-top:4px;">Consultant: ${escapeHtml(id.consultant || '—')} · Owner: ${escapeHtml(id.owner || '—')} · Delegate: ${escapeHtml(id.ownerDelegate || '—')}</p></div>
    <div class="meta-card"><h3>Counts</h3><p>Users: ${usersCount} · Members: ${membersCount} · Scans folder: ${escapeHtml(scansFolder || '—')}</p></div>
  </div>
  ${customMeta ? `<h2>Custom Project Metadata</h2><table><thead><tr><th>Label</th><th>Value</th></tr></thead><tbody>${customMeta}</tbody></table>` : ''}
  <h2>By Status</h2>
  <table><thead><tr><th>Code</th><th>Slogan</th><th class="num">Count</th><th class="num">%</th></tr></thead><tbody>${statusRows}</tbody></table>
  <h2>By Category (with Forks)</h2>
  <table><thead><tr><th>Code</th><th>Name</th><th>Forks</th><th class="num">Count</th></tr></thead><tbody>${catRows}</tbody></table>
  <h2>By File Bucket</h2>
  <table><thead><tr><th>Bucket</th><th class="num">Count</th></tr></thead><tbody>${bucketRows}</tbody></table>
  <h2>Zones</h2>
  <table><thead><tr><th>Code</th><th>Name</th><th>Arabic</th><th>Cluster</th></tr></thead><tbody>${zonesRows}</tbody></table>
  <h2>Floors</h2>
  <table><thead><tr><th>Name</th><th>Arabic</th></tr></thead><tbody>${floorsRows}</tbody></table>
  <div class="footer">odv — document control &amp; site logs · wall report — All project metadata included</div>
</body>
</html>`;
}

function buildMd(stats: WallStats, generatedBy: string, id: SiteIdentity, registry: DomainRegistry): string {
  const now = new Date().toLocaleString();
  const idLine = [id.name, id.projectName, id.workingArea].filter(Boolean).join(' · ');
  const parties = [
    id.consultant ? `Consultant: ${id.consultant}` : '',
    id.owner ? `Owner: ${id.owner}` : '',
    id.ownerDelegate ? `Owner's delegate: ${id.ownerDelegate}` : '',
  ]
    .filter(Boolean)
    .join(' — ');
  const snap = registry.getSnapshot();
  const statusRows = snap.statuses.map(
    (s) => `| ${s.code} | ${s.slogan} | ${stats.byStatus[s.code] ?? 0} |`,
  ).join('\n');
  const catRows = snap.categories.map(
    (c) => `| ${c.code} | ${c.name} | ${stats.byCategory[c.code] ?? 0} |`,
  ).join('\n');
  const bucketRows = Object.entries(stats.byBucket)
    .map(([b, n]) => `| ${b} | ${n} |`)
    .join('\n');
  return `# Wall Report — ${idLine || 'odv'}

${parties ? `${parties}\n\n` : ''}Generated: ${now} — By: ${generatedBy}

**Total requests: ${stats.total}**

## By Status

| Code | Slogan | Count |
| --- | --- | ---: |
${statusRows}

## By Category

| Code | Name | Count |
| --- | --- | ---: |
${catRows}

## By File Bucket

| Bucket | Count |
| --- | ---: |
${bucketRows}

---
odv — document control & site logs · wall report
`;
}

/** Ask the user (on the server PC) where to save the report — Windows folder dialog. */
function pickFolder(): Promise<string | null> {
  return new Promise((resolve) => {
    const ps = [
      'Add-Type -AssemblyName System.Windows.Forms',
      '$f = New-Object System.Windows.Forms.FolderBrowserDialog',
      "$f.Description = 'Choose where to save the report'",
      "$f.ShowNewFolderButton = $true",
      "if ($f.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { $f.SelectedPath }",
    ].join('; ');
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', ps],
      { timeout: 120000, windowsHide: false },
      (err, stdout) => {
        if (err) {
          resolve(null);
          return;
        }
        const p = stdout.trim();
        resolve(p && fs.existsSync(p) ? p : null);
      },
    );
  });
}

/** Shared folder picker for the wizard (ticket 109) — POST /api/scans/pick-folder
 *  opens a FolderBrowserDialog on the server and returns the selected path. */
export function pickFolderExternal(): Promise<string | null> {
  return pickFolder();
}

/** Zip a set of literal paths (files or a single dir) into a .zip via PowerShell
 *  Compress-Archive (warm, no new deps). When passed a single directory, the
 *  directory name becomes the zip root; when passed files, they are packed at root.
 *  Supports cancellation: on abort the child PowerShell is killed. */
function makeZip(srcs: string | string[], destZip: string, onChild?: (c: ChildProcess) => void): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const list = Array.isArray(srcs) ? srcs.map((s) => `'${s}'`).join(',') : `'${srcs}'`;
    const ps = `Compress-Archive -LiteralPath ${list} -DestinationPath '${destZip}' -Force`;
    const child = execFile('powershell.exe', ['-NoProfile', '-Command', ps], { timeout: 300000 }, (err) => {
      if (err) reject(err);
      else resolve();
    });
    onChild?.(child);
  });
}

export function reportsRouter(db: DatabaseSync, config: Config, registry: DomainRegistry): Router {
  const r = Router();
  r.use(authRequired);

  r.get('/view', (req, res) => {
    const p = String(req.query.path ?? '');
    if (!p) {
      res.status(400).json({ error: 'Missing path parameter' });
      return;
    }
    const resolved = path.resolve(p);
    const allowedBase = path.resolve(config.dataDir);
    // V5-001: only allow files within the data directory — prevents arbitrary file reads
    if (!resolved.startsWith(allowedBase + path.sep) && resolved !== allowedBase) {
      res.status(403).json({ error: 'Access denied: path outside data directory' });
      return;
    }
    if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
      res.status(404).json({ error: 'Report file not found' });
      return;
    }
    res.sendFile(resolved);
  });

  // Download a generated report/summary directly to the browser (no server folder
  // dialog — ticket 133 fix). Builds into a per-request temp dir, streams it as an
  // attachment with Content-Disposition, then removes the temp dir.
  const downloadFromDir = (
    res: Response,
    dir: string,
    file: string,
    downloadName: string,
    mime: string,
  ): void => {
    res.download(file, downloadName, (err) => {
      if (err && !res.headersSent) {
        res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
      }
      fsp.rm(dir, { recursive: true, force: true }).catch(() => undefined);
    });
  };

  r.post('/wall', adminRequired, async (req, res) => {
    const format = String(req.body?.format ?? 'html');
    if (!['html', 'md', 'both'].includes(format)) {
      res.status(400).json({ error: 'format must be html | md | both' });
      return;
    }
    const stats = computeStats(db, registry);
    const generatedBy = req.user?.username ?? 'admin';
    const id = getIdentity(db, config);
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const baseName = `wall-report-${stamp}`;
    // Per-request temp dir so cleanup never touches shared output.
    const exportsRoot = path.join(config.workDir, 'exports');
    const tmpDir = path.join(exportsRoot, `wall-${stamp}-${randomUUID().slice(0, 6)}`);
    await fsp.mkdir(tmpDir, { recursive: true });
    try {
      if (format === 'html' || format === 'both') {
        const file = path.join(tmpDir, `${baseName}.html`);
        await fsp.writeFile(file, buildHtml(stats, generatedBy, id, registry, db), 'utf8');
        if (format === 'html') {
          downloadFromDir(res, tmpDir, file, `${baseName}.html`, 'text/html');
          return;
        }
      }
      if (format === 'md' || format === 'both') {
        const file = path.join(tmpDir, `${baseName}.md`);
        await fsp.writeFile(file, buildMd(stats, generatedBy, id, registry), 'utf8');
        if (format === 'md') {
          downloadFromDir(res, tmpDir, file, `${baseName}.md`, 'text/markdown');
          return;
        }
      }
      // format = 'both': bundle the two files into a single .zip download.
      const zipPath = path.join(tmpDir, `${baseName}.zip`);
      await makeZip([path.join(tmpDir, `${baseName}.html`), path.join(tmpDir, `${baseName}.md`)], zipPath);
      downloadFromDir(res, tmpDir, zipPath, `${baseName}.zip`, 'application/zip');
    } catch (err) {
      await fsp.rm(tmpDir, { recursive: true, force: true }).catch(() => undefined);
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // FULL REQUESTS PANEL EXPORT (ticket 132 + 133) — cluster-scoped, fully
  // standalone. Two modes:
  //   mode='html' → a single self-contained .html (fonts inline).
  //   mode='zip'  → a .zip that extracts to `<projId>-<cluster>-requestslog-<ts>/`
  //                 containing the same-named .html + a hidden deps/ fonts folder
  //                 (+ PDFs/ when present). Runs on any PC — no Node/deps.
  // FULL REQUESTS PANEL EXPORT (ticket 132 + 133) — cluster-scoped, fully
  // standalone. Two modes:
  //   mode='html' → a single self-contained .html (fonts inline).
  //   mode='zip'  → a .zip that extracts to `<projId>-<cluster>-requestslog-<ts>/`
  //                 containing the same-named .html + a hidden deps/ folder
  //                 (+ PDFs/ when present). Runs on any PC — no Node/deps.
  // Flow: the server opens the folder picker FIRST, then runs the build as a
  // cancellable background job. The client polls status and can Stop it.
  const logoDataUrl = (p: string): string => {
    try { return p ? `data:${path.extname(p) === '.svg' ? 'image/svg+xml' : 'image/png'};base64,${fs.readFileSync(p).toString('base64')}` : ''; } catch { return ''; }
  };
  type ExportJob = {
    id: string;
    status: 'running' | 'done' | 'cancelled' | 'error';
    files: string[];
    error: string;
    copied: number;
    total: number;
    stage: 'read' | 'copy' | 'build' | 'compress' | 'done';
    abort: AbortController;
    child?: ChildProcess;
  };
  const jobs = new Map<string, ExportJob>();
  let _exportBusy = false;

  const runExportJob = async (
    job: ExportJob,
    opts: { folder: string; cluster: string; mode: 'html' | 'zip'; lang: 'en' | 'ar'; includePdfs: boolean; baseName: string; generatedBy: string; strings: { en: Record<string, string>; ar: Record<string, string> } },
  ): Promise<void> => {
    const { folder, cluster, lang, includePdfs, baseName, generatedBy, strings } = opts;
    const signal = job.abort.signal;
    const glob = getIdentity(db, config);
    const meta = {
      name: glob.name, projectId: glob.projectId, projectName: glob.projectName,
      workingArea: glob.workingArea, consultant: glob.consultant, owner: glob.owner,
      ownerDelegate: glob.ownerDelegate,
      logoDataUrl: logoDataUrl(glob.logoPath),
      consultantLogoDataUrl: logoDataUrl(glob.consultantLogoPath),
      ownerLogoDataUrl: logoDataUrl(glob.ownerLogoPath),
    };
    const tmpDir = path.join(folder, baseName);
    try {
      job.stage = 'read';
      const zoneCodes = (db.prepare('SELECT code FROM zones WHERE cluster = ?').all(cluster) as unknown as Array<{ code: string }>).map((z) => z.code);
      const params: string[] = [];
      let zoneFilter = '';
      if (zoneCodes.length > 0) {
        const ors = zoneCodes.map(() => '(zone = ? OR zone LIKE ? OR zone LIKE ? OR zone LIKE ?)');
        zoneFilter = ` AND (${ors.join(' OR ')})`;
        for (const c of zoneCodes) params.push(c, `${c}&%`, `%&${c}`, `%&${c}&%`);
      }
      const records = db.prepare(
        `SELECT category, request_no, revision_no, description, zone, floor, engineer, fork, status, sent_date, hyperlink
         FROM records WHERE deleted_at = ''${zoneFilter} ORDER BY category, request_no, revision_no`,
      ).all(...params) as Array<{ category: string; request_no: string; revision_no: string; description: string; zone: string; floor: string; engineer: string; fork: string; status: string; sent_date: string; hyperlink: string }>;
      // Natural numeric sort so ARCH-2 sorts before ARCH-10 (string sort puts ARCH-10 first).
      const num = (s: string): number => { const m = String(s ?? '').match(/(\d+)\s*$/); return m ? parseInt(m[1], 10) : 0; };
      records.sort((a, b) => {
        if (a.category !== b.category) return a.category < b.category ? -1 : 1;
        const na = num(a.request_no), nb = num(b.request_no);
        if (na !== nb) return na - nb;
        return num(a.revision_no) - num(b.revision_no);
      });
      const snap = registry.getSnapshot();
      const allForks = Array.from(new Set(records.map((r) => r.fork).filter(Boolean))).sort() as string[];
      const zones = db.prepare('SELECT code, name FROM zones ORDER BY code').all() as Array<{ code: string; name: string }>;
      const floors = db.prepare('SELECT name FROM floors ORDER BY name').all() as Array<{ name: string }>;
      const title = `${meta.projectId} ${cluster} Requests Log`;
      const buildHtml = (copied: number, fontMode: 'inline' | 'deps'): string =>
        buildFullPanelHtml({ records, meta, snap, allForks, zones, floors, lang, cluster, includePdfs, generatedBy, copied, fontMode, title, strings });

      // Both modes produce a ZIP. The folder always contains the same-named .html
      // + a hidden deps/ (fonts + PDF.js). Only `zip` mode also bundles PDFs/.
      const pdfsDir = path.join(tmpDir, 'PDFs');
      const depsDir = path.join(tmpDir, 'deps');
      await fsp.mkdir(tmpDir, { recursive: true });
      // Precompute which records have a copyable local PDF so `job.total` is
      // accurate (records without a resolvable file are skipped, so they must
      // not count toward the denominator — otherwise the bar stalls short of
      // 100% and looks like "faked" progress).
      const copyTargets: Array<{ r: (typeof records)[number]; src: string }> = [];
      if (includePdfs) {
        for (const r of records) {
          const hl = r.hyperlink?.trim();
          if (!hl) continue;
          if (/^https?:\/\//i.test(hl)) continue;
          let src: string | null = null;
          if (path.isAbsolute(hl) && fs.existsSync(hl)) src = hl;
          else {
            const try1 = path.join(config.filesDir, hl);
            if (fs.existsSync(try1)) src = try1;
            else {
              const flat = path.join(config.filesDir, path.basename(hl));
              if (fs.existsSync(flat)) src = flat;
            }
          }
          if (!src || !fs.existsSync(src)) continue;
          copyTargets.push({ r, src });
        }
      }
      job.total = copyTargets.length;
      if (includePdfs) {
        if (copyTargets.length > 0) job.stage = 'copy';
        await fsp.mkdir(pdfsDir, { recursive: true });
        for (const t of copyTargets) {
          if (signal.aborted) throw new Error('__cancelled__');
          const destName = pdfDestName(t.r);
          try { await fsp.copyFile(t.src, path.join(pdfsDir, destName)); } catch { /* skip */ }
          job.copied++;
        }
      }
      job.stage = 'build';
      if (signal.aborted) throw new Error('__cancelled__');
      // Hidden deps/ folder — Cairo fonts + PDF.js classic UMD so the HTML renders
      // offline on any PC (Arabic/Latin text + in-page PDF viewer).
      await fsp.mkdir(depsDir, { recursive: true });
      for (const f of CAIRO_FONTS) {
        try { await fsp.copyFile(path.join(CAIRO_DIR, f.file), path.join(depsDir, f.file)); } catch { /* skip */ }
      }
      for (const f of PDFJS_FILES) {
        try { await fsp.copyFile(path.join(PDFJS_DIR, f), path.join(depsDir, f)); } catch { /* skip */ }
      }
      // Same-named .html (not index.html) references deps/.
      const htmlPath = path.join(tmpDir, `${baseName}.html`);
      await fsp.writeFile(htmlPath, buildHtml(job.copied, 'deps'), 'utf8');
      if (signal.aborted) throw new Error('__cancelled__');
      job.stage = 'compress';
      const zipPath = path.join(folder, `${baseName}.zip`);
      await makeZip(tmpDir, zipPath, (c) => { job.child = c; });
      await fsp.rm(tmpDir, { recursive: true, force: true });
      job.files = [zipPath];
      job.status = 'done';
      job.stage = 'done';
    } catch (err) {
      try { await fsp.rm(tmpDir, { recursive: true, force: true }); } catch {}
      if (signal.aborted || (err instanceof Error && err.message === '__cancelled__')) {
        job.status = 'cancelled';
      } else {
        job.status = 'error';
        job.error = err instanceof Error ? err.message : String(err);
      }
    } finally {
      _exportBusy = false;
    }
  };

  // Start an export: open the folder picker FIRST, then kick off a cancellable job.
  r.post('/wall/full-panel', adminRequired, async (req, res) => {
    const cluster = String(req.body?.cluster ?? '').trim() || 'CL12';
    const mode: 'html' | 'zip' = req.body?.mode === 'zip' ? 'zip' : 'html';
    const lang: 'en' | 'ar' = req.body?.lang === 'ar' ? 'ar' : 'en';
    const includePdfs = mode === 'zip' && req.body?.includePdfs !== false;
    const strings: { en: Record<string, string>; ar: Record<string, string> } = req.body?.strings ?? { en: {}, ar: {} };
    // Only ONE export at a time — a parallel copy of 1600+ PDFs + zip could
    // overwhelm the server PC. Reject early so no duplicate folder dialog.
    if (_exportBusy) {
      res.status(409).json({ error: 'Another export is already running. Wait for it to finish before starting a new one.' });
      return;
    }
    const glob = getIdentity(db, config);
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const baseName = `${glob.projectId}-${cluster}-requestslog-${stamp}`;
    // 1) Folder picker FIRST (server dialog) — the user chooses where to write.
    const folder = await pickFolder();
    if (!folder) {
      res.json({ cancelled: true });
      return;
    }
    // 2) Start the cancellable job, return its id immediately.
    const job: ExportJob = {
      id: randomUUID(), status: 'running', files: [], error: '', copied: 0, total: 0, stage: 'read',
      abort: new AbortController(),
    };
    jobs.set(job.id, job);
    _exportBusy = true;
    void runExportJob(job, { folder, cluster, mode, lang, includePdfs, baseName, generatedBy: req.user?.username ?? 'admin', strings });
    res.json({ ok: true, jobId: job.id, baseName });
  });

  // Poll an export job's status (running | done | cancelled | error + files).
  r.get('/wall/full-panel/job/:id', (_req, res) => {
    const job = jobs.get(String(_req.params.id));
    if (!job) {
      res.status(404).json({ error: 'Job not found' });
      return;
    }
    res.json({ status: job.status, files: job.files, error: job.error, copied: job.copied, total: job.total, stage: job.stage });
  });

  // Stop an export job (kills the PowerShell zip child if running).
  r.post('/wall/full-panel/job/:id/cancel', (_req, res) => {
    const job = jobs.get(String(_req.params.id));
    if (!job) {
      res.status(404).json({ error: 'Job not found' });
      return;
    }
    job.abort.abort();
    try { job.child?.kill(); } catch { /* ignore */ }
    res.json({ ok: true });
  });

  return r;
}

/** Bilingual standalone full-requests panel (ticket 132) — cluster-scoped,
 *  live data baked in, client-side filters + cards, all metadata in the header.
 *  Uses a plain string (no nested template literals) for the embedded JS. */
export function buildFullPanelHtml(opts: {
  records: Array<{ category: string; request_no: string; revision_no: string; description: string; zone: string; floor: string; engineer: string; fork: string; status: string; sent_date: string; hyperlink: string }>;
  meta: { name: string; projectId: string; projectName: string; workingArea: string; consultant: string; owner: string; ownerDelegate: string; logoDataUrl: string; consultantLogoDataUrl: string; ownerLogoDataUrl: string };
  snap: { categories: Array<{ code: string; name: string }>; statuses: Array<{ code: string; slogan: string }> };
  allForks: string[];
  zones: Array<{ code: string; name: string }>;
  floors: Array<{ name: string }>;
  lang: 'en' | 'ar';
  cluster: string;
  includePdfs: boolean;
  generatedBy: string;
  copied: number;
  fontMode: 'inline' | 'deps';
  title: string;
  /** Bilingual UI strings from the client's i18n (key: en/ar text) — the single
   *  source; NO report strings are hardcoded server-side. Falls back to en.
   *  When omitted (e.g. smoke test / legacy caller) a built-in EN map is used. */
  strings?: { en: Record<string, string>; ar: Record<string, string> };
}): string {
  const { records, meta, snap, allForks, zones, floors, lang, cluster, includePdfs, generatedBy, copied, fontMode, title, strings } = opts;
  const SRC = strings ?? {
    en: { 'export.total': 'Total', 'export.zones': 'Zones', 'export.categories': 'Categories', 'export.statuses': 'Statuses', 'export.forks': 'Forks', 'export.pdfCopied': 'PDFs copied', 'export.generated': 'Generated', 'export.by': 'By', 'export.project': 'Project', 'export.projectId': 'Project ID', 'export.consultant': 'Consultant', 'export.owner': 'Owner', 'export.delegate': 'Delegate', 'export.stats': 'Stats', 'export.allCats': 'All Categories', 'export.allForks': 'All Forks', 'export.allStatuses': 'All Statuses', 'export.allZones': 'All Zones', 'export.allFloors': 'All Floors', 'export.searchPh': 'Search requestNo / description / zone...', 'export.tableView': 'Table view', 'export.showing': 'Showing {a} / {b}', 'export.category': 'Category', 'export.requestNo': 'Request No', 'export.rev': 'Rev', 'export.fork': 'Fork', 'export.status': 'Status', 'export.zone': 'Zone', 'export.floor': 'Floor', 'export.description': 'Description', 'export.pdf': 'PDF', 'export.openPdf': 'Open PDF', 'export.noPdf': 'no PDF', 'export.noMatches': 'No matches', 'export.view': 'View', 'export.loading': 'Loading…', 'export.prev': 'Prev', 'export.next': 'Next', 'export.openOriginal': 'Open original', 'export.pdfError': 'Could not render PDF — use "Open original".', 'export.footer': 'odv — standalone full panel — no Node.js needed — all project metadata',     'export.cluster': 'Cluster', 'export.language': 'Language', 'export.engineer': 'Engineer', 'export.sentDate': 'Sent', 'export.reset': 'Reset' },
    ar: {},
  };
  const ar = lang === 'ar';
  const tr = (key: string): string => {
    const dict = ar ? SRC.ar : SRC.en;
    return dict[key] ?? SRC.en[key] ?? key;
  };
  const S = {
    total: tr('export.total'),
    zones: tr('export.zones'),
    categories: tr('export.categories'),
    statuses: tr('export.statuses'),
    forks: tr('export.forks'),
    pdfCopied: tr('export.pdfCopied'),
    generated: tr('export.generated'),
    by: tr('export.by'),
    project: tr('export.project'),
    projectId: tr('export.projectId'),
    consultant: tr('export.consultant'),
    owner: tr('export.owner'),
    delegate: tr('export.delegate'),
    stats: tr('export.stats'),
    allCats: tr('export.allCats'),
    allForks: tr('export.allForks'),
    allStatuses: tr('export.allStatuses'),
    allZones: tr('export.allZones'),
    allFloors: tr('export.allFloors'),
    searchPh: tr('export.searchPh'),
    tableView: tr('export.tableView'),
    showing: tr('export.showing'),
    category: tr('export.category'),
    requestNo: tr('export.requestNo'),
    rev: tr('export.rev'),
    fork: tr('export.fork'),
    status: tr('export.status'),
    zone: tr('export.zone'),
    floor: tr('export.floor'),
    description: tr('export.description'),
    pdf: tr('export.pdf'),
    openPdf: tr('export.openPdf'),
    noPdf: tr('export.noPdf'),
    noMatches: tr('export.noMatches'),
    view: tr('export.view'),
    loading: tr('export.loading'),
    prev: tr('export.prev'),
    next: tr('export.next'),
    openOriginal: tr('export.openOriginal'),
    pdfError: tr('export.pdfError'),
    footer: tr('export.footer'),
    cluster: tr('export.cluster'),
    language: tr('export.language'),
    engineer: tr('export.engineer'),
    sentDate: tr('export.sentDate'),
    reset: tr('export.reset'),
  };
  const esc = escapeHtml;
  const dataJson = JSON.stringify(
    records.map((r) => ({ ...r, pdfLink: includePdfs ? pdfDestName(r) : '' })),
  ).replace(/</g, '\\u003c');
  const SJson = JSON.stringify(S).replace(/</g, '\\u003c');
  const idLine = [meta.projectName, meta.workingArea].filter(Boolean).join(' · ') || 'odv';
  const brandLine = [meta.projectName, meta.name].filter(Boolean).join(' — ') || 'odv';
  const statsLine = `${S.total}: ${records.length}`;
  const parties = `${S.consultant}: ${esc(meta.consultant || '—')} · ${S.owner}: ${esc(meta.owner || '—')} · ${S.delegate}: ${esc(meta.ownerDelegate || '—')}`;

  const catOpts = snap.categories.map((c) => `<option value="${esc(c.code)}">${esc(c.code)} — ${esc(c.name)}</option>`).join('');
  const forkOpts = allForks.map((f) => `<option value="${esc(f)}">${esc(f)}</option>`).join('');
  const statusOpts = snap.statuses.map((s) => `<option value="${esc(s.code)}">${esc(s.code)} — ${esc(s.slogan)}</option>`).join('');
  const zoneOpts = zones.map((z) => `<option value="${esc(z.code)}">${esc(z.code)}</option>`).join('');
  const floorOpts = floors.map((f) => `<option value="${esc(f.name)}">${esc(f.name)}</option>`).join('');

  const head = `<thead><tr style="background:#FBF9F6;text-align:start"><th style="padding:6px 8px;border-bottom:1px solid #E3DDD5">${esc(S.category)}</th><th style="padding:6px 8px;border-bottom:1px solid #E3DDD5">${esc(S.requestNo)}</th><th style="padding:6px 8px;border-bottom:1px solid #E3DDD5">${esc(S.rev)}</th><th style="padding:6px 8px;border-bottom:1px solid #E3DDD5">${esc(S.fork)}</th><th style="padding:6px 8px;border-bottom:1px solid #E3DDD5">${esc(S.status)}</th><th style="padding:6px 8px;border-bottom:1px solid #E3DDD5">${esc(S.zone)}</th><th style="padding:6px 8px;border-bottom:1px solid #E3DDD5">${esc(S.floor)}</th><th style="padding:6px 8px;border-bottom:1px solid #E3DDD5">${esc(S.description)}</th><th style="padding:6px 8px;border-bottom:1px solid #E3DDD5">${esc(S.pdf)}</th></tr></thead>`;

  return `<!doctype html>
<html lang="${lang}" dir="${ar ? 'rtl' : 'ltr'}">
<head>
<meta charset="utf-8">
<title>${esc(title || meta.projectName || 'odv')} — ${esc(cluster)}</title>
<style>
${fontFaceCss(fontMode)}
*{box-sizing:border-box;margin:0;padding:0}body{font-family:'Cairo','Segoe UI',Tahoma,Arial,sans-serif;color:#2D2926;background:#F6F3EE;padding:16px}
.header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #C96D57;padding-bottom:12px;margin-bottom:12px;gap:12px;flex-wrap:wrap}
.logo-strip{display:flex;align-items:center;gap:18px;flex-wrap:wrap}
.logo-item{display:flex;flex-direction:column;align-items:center;gap:3px}
.logo-item .logo-box{display:flex;align-items:center;justify-content:center;height:64px;min-width:108px;padding:4px 8px;border:1px solid #E3DDD5;background:#FBF9F6;border-radius:8px}
.logo-item img{height:100%;max-height:52px;width:auto;max-width:92px;object-fit:contain}
.logo-item .logo-label{font-size:10px;color:#6F6861}
.brand{font-size:18px;font-weight:700;color:#C96D57}
.meta{font-size:11px;color:#6F6861;text-align:end}
.meta-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px}
.meta-card{border:1px solid #E3DDD5;background:#FBF9F6;border-radius:8px;padding:10px 12px}
.meta-card h3{font-size:11px;text-transform:uppercase;letter-spacing:0.05em;color:#6F6861;margin-bottom:6px}
.filters{position:sticky;top:0;z-index:10;background:#F6F3EE;border:1px solid #E3DDD5;border-radius:10px;padding:10px;display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:12px}
.filters select,.filters input{height:32px;border:1px solid #E3DDD5;border-radius:8px;background:#FFFFFF;padding:0 8px;font-size:12px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:12px}
.card{border:1px solid #E3DDD5;background:#FBF9F6;border-radius:12px;padding:12px;box-shadow:0 1px 2px rgba(0,0,0,0.04)}
.card:hover{transform:translateY(-2px);box-shadow:0 8px 24px rgba(0,0,0,0.08);border-color:rgba(201,109,87,0.3)}
.badge{display:inline-block;border-radius:6px;padding:2px 6px;font-size:11px;border:1px solid #E3DDD5}
.footer{margin-top:16px;font-size:11px;color:#958D84;text-align:center}
.pdfbtn{display:inline-flex;align-items:center;gap:4px;border:1px solid #C96D57;color:#C96D57;background:#fff;border-radius:6px;padding:3px 8px;font-size:11px;cursor:pointer}
.pdfbtn:hover{background:#FBF9F6}
.vmodal{position:fixed;inset:0;z-index:200;background:rgba(0,0,0,.55);display:none;align-items:center;justify-content:center;padding:16px}
.vmodal.open{display:flex}
.vbox{background:#FBF9F6;border:1px solid #E3DDD5;border-radius:12px;width:min(96vw,960px);height:min(92vh,900px);display:flex;flex-direction:column;box-shadow:0 12px 40px rgba(0,0,0,.2)}
.vhead{display:flex;align-items:center;gap:10px;padding:10px 14px;border-bottom:1px solid #E3DDD5;font-weight:600;color:#2D2926}
.vhead .vt{min-width:0;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px}
.vclose{border:0;background:transparent;font-size:20px;line-height:1;cursor:pointer;color:#6F6861;padding:0 4px}
.vclose:hover{color:#2D2926}
.vbody{flex:1;overflow:auto;padding:12px;background:#5A5A5A}
.vbody canvas{display:block;margin:0 auto 10px;background:#fff;box-shadow:0 2px 10px rgba(0,0,0,.3)}
.vpgbar{display:flex;align-items:center;gap:10px;padding:8px 14px;border-top:1px solid #E3DDD5;font-size:12px;color:#6F6861;flex-wrap:wrap}
.vpgbar button{border:1px solid #E3DDD5;background:#fff;border-radius:6px;cursor:pointer;padding:3px 10px;color:#2D2926}
.vpgbar button:hover{background:#F6F3EE}
.vpgbar button:disabled{opacity:.4;cursor:default}
.vpageinfo{font-variant-numeric:tabular-nums}
.vfallback{margin-inline-start:auto}
.vfallback a{color:#C96D57;font-weight:600}
.vloading{padding:30px;text-align:center;color:#fff;font-size:13px}
.verror{padding:60px 20px;text-align:center;color:#fff;font-size:26px;font-weight:600;line-height:1.7}
.vbtnrow{margin-top:26px;text-align:center}
.vopenbtn{display:inline-block;background:#C96D57;color:#fff;border:0;border-radius:10px;padding:12px 28px;font-size:16px;font-weight:700;text-decoration:none;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.25)}
.vopenbtn:hover{background:#A9553F}
.vinfo{display:flex;flex-wrap:wrap;gap:4px 14px;padding:8px 14px;border-bottom:1px solid #E3DDD5;font-size:12px;color:#2D2926;background:#FBF9F6}
.vbadge{margin-inline-start:auto;font-size:11px;border:1px solid #E3DDD5;border-radius:6px;padding:2px 8px;background:#fff}
.card{cursor:pointer}
.rowclick{cursor:pointer}
.rowclick:hover td{background:#F9F6F1}
#tbl{table-layout:fixed;width:100%}
#tbl th,#tbl td{padding:6px 8px;border-bottom:1px solid #E3DDD5;font-size:12px;vertical-align:middle}
#tbl th{white-space:nowrap;font-weight:600;text-align:start}
#tbl .tdesc{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.filters input[type=date]{height:32px;border:1px solid #E3DDD5;border-radius:8px;background:#FFFFFF;padding:0 8px;font-size:12px;color-scheme:light}
.fbtn{border:1px solid #E3DDD5;background:#fff;border-radius:8px;padding:0 10px;height:32px;font-size:12px;cursor:pointer}
.fbtn:hover{background:#FBF9F6}
@media print{.filters{display:none} body{padding:0;background:#fff}.vmodal{display:none!important}}
</style>
</head>
<body>
<div class="header">
  <div class="logo-strip">
    ${meta.consultantLogoDataUrl ? `<div class="logo-item"><span class="logo-box"><img src="${meta.consultantLogoDataUrl}" alt="consultant"></span><span class="logo-label">${esc(S.consultant)}</span></div>` : ''}
    ${meta.logoDataUrl ? `<div class="logo-item"><span class="logo-box"><img src="${meta.logoDataUrl}" alt="contractor"></span><span class="logo-label">${esc(S.project)}</span></div>` : ''}
    ${meta.ownerLogoDataUrl ? `<div class="logo-item"><span class="logo-box"><img src="${meta.ownerLogoDataUrl}" alt="owner"></span><span class="logo-label">${esc(S.owner)}</span></div>` : ''}
    <div class="brand">${esc(brandLine)}</div>
  </div>
  <div style="text-align:end">
    <div class="meta">${esc(S.generated)}: ${esc(new Date().toLocaleString())}<br>${esc(S.by)}: ${esc(generatedBy)}</div>
    <div style="font-size:11px;color:#6F6861;margin-top:4px">${esc(S.cluster)}: ${esc(cluster)} · ${esc(S.projectId)}: ${esc(meta.projectId || '—')} · ${esc(S.zones)}: ${zones.length} · ${esc(S.forks)}: ${allForks.length} · ${includePdfs ? esc(S.pdfCopied) + ': ' + copied : ''}</div>
  </div>
</div>
<div class="meta-grid">
  <div class="meta-card"><h3>${esc(S.project)}</h3><p>${esc(idLine || '—')}</p><p style="font-size:11px;color:#6F6861;margin-top:4px">${esc(S.projectId)}: ${esc(meta.projectId || '—')} · ${parties}</p></div>
  <div class="meta-card"><h3>${esc(S.stats)}</h3><p>${esc(statsLine)} · ${esc(S.cluster)}: ${esc(cluster)}</p></div>
</div>
<div class="filters">
  <select id="fCat"><option value="">${esc(S.allCats)}</option>${catOpts}</select>
  <select id="fFork"><option value="">${esc(S.allForks)}</option>${forkOpts}</select>
  <select id="fStatus"><option value="">${esc(S.allStatuses)}</option>${statusOpts}</select>
  <select id="fZone"><option value="">${esc(S.allZones)}</option>${zoneOpts}</select>
  <select id="fFloor"><option value="">${esc(S.allFloors)}</option>${floorOpts}</select>
  <input id="fDate" type="date" title="${esc(S.sentDate)}" aria-label="${esc(S.sentDate)}">
  <input id="fQ" placeholder="${esc(S.searchPh)}">
  <label style="display:flex;align-items:center;gap:4px;font-size:12px;cursor:pointer"><input type="checkbox" id="asTable"> ${esc(S.tableView)}</label>
  <button type="button" class="fbtn" onclick="resetFilters()">${esc(S.reset)}</button>
  <span class="count" id="count" style="font-size:12px;color:#6F6861"></span>
</div>
<div class="grid" id="grid"></div>
<div id="tableWrap" style="display:none;overflow:auto;border:1px solid #E3DDD5;border-radius:8px;background:#FFFFFF"><table id="tbl" style="width:100%;border-collapse:collapse;font-size:12px"><colgroup><col style="width:8%"><col style="width:12%"><col style="width:6%"><col style="width:9%"><col style="width:9%"><col style="width:9%"><col style="width:8%"><col style="width:30%"><col style="width:9%"></colgroup>${head}<tbody id="tbody"></tbody></table></div>
<div class="footer">${esc(S.footer)}</div>
${fontMode === 'deps' ? '<script src="deps/pdf.min.js"></script>' : ''}
<div class="vmodal" id="vmodal"><div class="vbox"><div class="vhead"><span class="vt" id="vtitle"></span><span class="vbadge" id="vbadge"></span><button class="vclose" onclick="closeViewer()" title="Close">&times;</button></div><div class="vinfo" id="vinfo"></div><div class="vbody" id="vbody"><div class="vloading" id="vloading">${esc(S.loading)}</div></div><div class="vpgbar"><button id="vprev" onclick="navPage(-1)">&larr; ${esc(S.prev)}</button><span class="vpageinfo" id="vpageinfo"></span><button id="vnext" onclick="navPage(1)">${esc(S.next)} &rarr;</button><span class="vfallback" id="vfallback"></span></div></div></div>
<script>
window.__WALL_DATA = ${dataJson};
window.__S = ${SJson};
window.__HAS_PDF = ${includePdfs ? 'true' : 'false'};
window.__PDFJS = ${fontMode === 'deps' ? 'true' : 'false'};
window.__LANG = '${lang}';
var S = window.__S;
function escHtml(s){return String(s).replace(/[&<>"']/g,c=>c==='&'?'&amp;':c==='<'?'&lt;':c==='>'?'&gt;':c==='"'?'&quot;':'&#39;')}
function pad(s){return String(s).padStart(2,'0')}
var MONTHS_EN=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
var MONTHS_AR=['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
/* Calendar-formatted date (e.g. 25 Aug 2026 / ٢٥ أغسطس ٢٠٢٦). */
function fmtDate(s){
  if(!s) return '';
  var m=String(s).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if(!m) return String(s);
  var mo=+m[2],d=+m[3],y=+m[1];
  if(mo<1||mo>12) return String(s);
  var M=(window.__LANG==='ar')?MONTHS_AR:MONTHS_EN;
  return d+' '+M[mo-1]+' '+y;
}
function isoDay(s){return String(s||'').slice(0,10);}
/* Status colors mirror the app's single source (client/src/lib/status.ts). */
var STATUS_VARIANT={A:'success',B:'bGreen',C:'destructive',D:'destructive',SS:'muted',PP:'muted',P:'warning',SC:'accent',Skipped:'muted',Canceled:'muted'};
var STATUS_HEX={success:'#547A61',bGreen:'#8FA968',accent:'#C96D57',destructive:'#B64D48',warning:'#A68A6A',muted:'#958D84'};
function statusColor(st){return STATUS_HEX[STATUS_VARIANT[st]||'muted']||'#958D84';}
function statusBadge(st){
  if(!st) return '';
  var h=statusColor(st);
  return '<span class="badge" style="color:'+h+';border-color:'+h+'55;background:'+h+'14">'+escHtml(st)+'</span>';
}
var _pdf=null,_pages=1,_page=1,_pdfSrc=null;
/* The current record's "Open original" href, set in openRecord so showPdfError
 * can render a prominent button in the middle of the viewer. */
var _fbHref='';
function recIndex(r){return window.__WALL_DATA.indexOf(r);}
function pdfLabel(r){
  if(!r) return S.noPdf;
  if(r.pdfLink && window.__PDFJS) return S.view;
  if(r.pdfLink || r.hyperlink) return S.openPdf;
  return S.noPdf;
}
function pdfCell(r){
  if(!r.pdfLink && !r.hyperlink) return '<span style="color:#958D84">'+S.noPdf+'</span>';
  return '<button type="button" class="pdfbtn" onclick="event.stopPropagation();openRecord('+recIndex(r)+')">'+pdfLabel(r)+'</button>';
}
/* Open a record's detail preview: all labels + the in-page PDF viewer, with an
 * "Open original" fallback for when the PDF is missing or the viewer fails. */
function openRecord(i){
  var r=window.__WALL_DATA[i]; if(!r) return;
  var modal=document.getElementById('vmodal');
  document.getElementById('vtitle').textContent=(r.category||'')+'-'+(r.request_no||'')+'/'+pad(r.revision_no)+(S.pdf?(' — '+S.pdf):'');
  document.getElementById('vbadge').innerHTML=statusBadge(r.status);
  var info=[];
  if(r.fork) info.push(escHtml(S.fork)+': '+escHtml(r.fork));
  if(r.zone) info.push(escHtml(S.zone)+': '+escHtml(r.zone));
  if(r.floor) info.push(escHtml(S.floor)+': '+escHtml(r.floor));
  if(r.engineer) info.push(escHtml(S.engineer)+': '+escHtml(r.engineer));
  if(r.sent_date) info.push(escHtml(S.sentDate)+': '+escHtml(fmtDate(r.sent_date)));
  if(r.description) info.push(escHtml(S.description)+': '+escHtml(r.description));
  document.getElementById('vinfo').innerHTML=info.join(' &nbsp;·&nbsp; ');
  document.getElementById('vbody').innerHTML='<div class="vloading">'+escHtml(S.loading)+'</div>';
  var fb=document.getElementById('vfallback'); fb.innerHTML='';
  var rawLink=String(r.hyperlink||'').replace(/\\\\/g,'/');
  _fbHref = r.pdfLink ? 'PDFs/'+escHtml(r.pdfLink) : (rawLink ? escHtml(rawLink) : '');
  if(r.pdfLink){ fb.innerHTML='<a href="PDFs/'+escHtml(r.pdfLink)+'" target="_blank" rel="noopener">'+escHtml(S.openOriginal)+'</a>'; }
  else if(rawLink){ fb.innerHTML='<a href="'+escHtml(rawLink)+'" target="_blank" rel="noopener">'+escHtml(S.openOriginal)+'</a>'; }
  document.getElementById('vpageinfo').textContent='';
  document.getElementById('vprev').disabled=true;document.getElementById('vnext').disabled=true;
  modal.classList.add('open');_page=1;
  if(!window.pdfjsLib || !r.pdfLink){ showPdfError(); return; }
  _pdfSrc='PDFs/'+r.pdfLink;
  pdfjsLib.GlobalWorkerOptions.workerSrc='deps/pdf.worker.min.js';
  pdfjsLib.getDocument(_pdfSrc).promise.then(function(doc){_pdf=doc;_pages=doc.numPages;renderPage(_page);}).catch(function(){showPdfError();});
}
function renderPage(n){
  if(!_pdf)return;_page=n;
  document.getElementById('vpageinfo').textContent=n+' / '+_pages;
  document.getElementById('vprev').disabled=n<=1;document.getElementById('vnext').disabled=n>=_pages;
  _pdf.getPage(n).then(function(pg){
    var vp=pg.getViewport({scale:1.4});
    var body=document.getElementById('vbody');
    var c=document.createElement('canvas');
    c.width=vp.width;c.height=vp.height;
    body.innerHTML='';body.appendChild(c);
    var ctx=c.getContext('2d');
    pg.render({canvasContext:ctx,viewport:vp}).promise.then(function(){}).catch(function(){showPdfError();});
  }).catch(function(){showPdfError();});
}
function navPage(d){if(_pdf&&_page+d>=1&&_page+d<=_pages)renderPage(_page+d);}
function closeViewer(){document.getElementById('vmodal').classList.remove('open');_pdf=null;}
function showPdfError(){
  var html='<div class="verror">'+escHtml(S.pdfError);
  if(_fbHref){ html+='<div class="vbtnrow"><a class="vopenbtn" href="'+_fbHref+'" target="_blank" rel="noopener">'+escHtml(S.openOriginal)+'</a></div>'; }
  html+='</div>';
  document.getElementById('vbody').innerHTML=html;
}
document.getElementById('vmodal').addEventListener('click',function(e){if(e.target===this)closeViewer();});
document.addEventListener('keydown',function(e){if(e.key==='Escape')closeViewer();});
var grid=document.getElementById('grid'),tableWrap=document.getElementById('tableWrap'),tbody=document.getElementById('tbody'),countEl=document.getElementById('count'),fCat=document.getElementById('fCat'),fFork=document.getElementById('fFork'),fStatus=document.getElementById('fStatus'),fZone=document.getElementById('fZone'),fFloor=document.getElementById('fFloor'),fQ=document.getElementById('fQ'),fDate=document.getElementById('fDate'),asTable=document.getElementById('asTable');
function resetFilters(){fCat.value='';fFork.value='';fStatus.value='';fZone.value='';fFloor.value='';fQ.value='';fDate.value='';asTable.checked=false;render();}
var TD=' style="padding:6px 8px;border-bottom:1px solid #E3DDD5"';
function rowCells(r){
  return '<td'+TD+'>'+escHtml(r.category)+'</td>'
    +'<td'+TD+'>'+escHtml(r.request_no)+'</td>'
    +'<td'+TD+'>'+pad(r.revision_no)+'</td>'
    +'<td'+TD+'>'+escHtml(r.fork||'—')+'</td>'
    +'<td'+TD+'>'+statusBadge(r.status)+'</td>'
    +'<td'+TD+'>'+escHtml(r.zone||'')+'</td>'
    +'<td'+TD+'>'+escHtml(r.floor||'')+'</td>'
    +'<td'+TD+' class="tdesc" title="'+escHtml(r.description||'')+'">'+escHtml(r.description||'—')+'</td>'
    +'<td'+TD+'>'+pdfCell(r)+'</td>';
}
function cardBody(r){
  return '<div style="display:flex;justify-content:space-between;gap:8px;align-items:center"><h3 style="font-family:Consolas,monospace;font-size:13px;font-weight:700">'+escHtml(r.category)+'-'+escHtml(r.request_no)+' <span style="font-weight:400;color:#6F6861">'+S.rev+' '+pad(r.revision_no)+'</span>'+(r.fork?'<span style="font-size:10px;background:#E3DDD5;padding:2px 6px;border-radius:4px">'+escHtml(r.fork)+'</span>':'')+'</h3>'+statusBadge(r.status)+'</div><div style="font-size:12px;color:#6F6861;margin-top:4px">'+escHtml(r.description||'—')+'</div><div style="font-size:11px;color:#958D84;margin-top:6px">'+escHtml([r.zone,r.floor,r.engineer,fmtDate(r.sent_date)].filter(Boolean).join(' · '))+'</div>';
}
function render(){
  var cat=fCat.value,fork=fFork.value,status=fStatus.value,zone=fZone.value,floor=fFloor.value,q=fQ.value.trim().toLowerCase(),d=fDate.value;
  var showTable=asTable.checked;
  var list=window.__WALL_DATA.filter(function(r){
    if(cat && r.category!==cat) return false;
    if(fork && r.fork!==fork) return false;
    if(status && r.status!==status) return false;
    if(zone && r.zone!==zone) return false;
    if(floor && r.floor!==floor) return false;
    if(d){ var rk=isoDay(r.sent_date); if(!rk || rk<d) return false; }
    if(q && (r.category+' '+r.request_no+' '+r.description+' '+r.zone+' '+r.floor+' '+r.engineer+' '+r.fork+' '+r.status).toLowerCase().indexOf(q)<0) return false;
    return true;
  });
  countEl.textContent=S.showing.replace('{a}',list.length).replace('{b}',window.__WALL_DATA.length);
  if(showTable){
    grid.style.display='none';tableWrap.style.display='block';
    tbody.innerHTML=list.map(function(r){return '<tr class="rowclick" onclick="openRecord('+recIndex(r)+')">'+rowCells(r)+'</tr>';}).join('') || '<tr><td colspan="9" style="text-align:center;padding:24px;color:#958D84">'+S.noMatches+'</td></tr>';
  } else {
    grid.style.display='grid';tableWrap.style.display='none';
    grid.innerHTML=list.map(function(r){return '<div class="card" onclick="openRecord('+recIndex(r)+')" role="button" tabindex="0" onkeydown="if(event.keyCode===13||event.keyCode===32){event.preventDefault();openRecord('+recIndex(r)+');}">'+cardBody(r)+'</div>';}).join('') || '<div style="grid-column:1/-1;text-align:center;padding:24px;color:#958D84">'+S.noMatches+'</div>';
  }
}
[fCat,fFork,fStatus,fZone,fFloor,fQ,fDate,asTable].forEach(function(el){el.addEventListener('input',render)});
[fCat,fFork,fStatus,fZone,fFloor].forEach(function(el){el.addEventListener('change',render)});
render();
</script>
</body>
</html>`;
}