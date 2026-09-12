import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { adminRequired, authRequired } from '../auth.ts';
import type { Config } from '../config.ts';
import { lastBackupInfo, runBackup } from '../backup.ts';

/**
 * Site identity settings (ticket 069) — logo + name + project info used in
 * reports/dashboards/HTML/MD. Stored in app_settings (DB) + logo file in data/.
 */

export interface CompanySettings {
  name: string;
  projectId: string;
  projectName: string;
  workingArea: string;
  consultant: string;
  owner: string;
  ownerDelegate: string;
}

const COMPANY_KEYS: Array<keyof CompanySettings> = [
  'name',
  'projectId',
  'projectName',
  'workingArea',
  'consultant',
  'owner',
  'ownerDelegate',
];

/** Map the client field name (camelCase) to its app_settings DB key. Most are
 *  identical; projectId is stored under the literal key `project_id`. */
const COMPANY_DB_KEY: Record<keyof CompanySettings, string> = {
  name: 'name',
  projectId: 'project_id',
  projectName: 'projectName',
  workingArea: 'workingArea',
  consultant: 'consultant',
  owner: 'owner',
  ownerDelegate: 'ownerDelegate',
};

const LOGO_EXT: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/svg+xml': '.svg',
};

/** Three logos can be set in Project Identity: the company logo (global), a
 *  consultant logo, and an owner logo. Each stores its extension in app_settings
 *  and its file in dataDir, mirroring the original company-logo pattern (069). */
type LogoKind = 'company' | 'consultant' | 'owner';
const LOGO_KIND_META: Record<LogoKind, { extKey: string; file: string; bodyKey: string; hasKey: string }> = {
  company: { extKey: 'logo_ext', file: 'company-logo', bodyKey: 'logoDataUrl', hasKey: 'hasLogo' },
  consultant: { extKey: 'consultant_logo_ext', file: 'consultant-logo', bodyKey: 'consultantLogoDataUrl', hasKey: 'hasConsultantLogo' },
  owner: { extKey: 'owner_logo_ext', file: 'owner-logo', bodyKey: 'ownerLogoDataUrl', hasKey: 'hasOwnerLogo' },
};

/**
 * V5-001: Sanitize SVG content to prevent stored XSS.
 * Removes <script> tags, event handler attributes (on*), and <foreignObject>.
 */
function sanitizeSvg(svg: string): string {
  return svg
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi, '')
    .replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/javascript\s*:/gi, '');
}

export function settingsRouter(db: DatabaseSync, config: Config): Router {
  const r = Router();

  const get = (key: string): string => {
    const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(key) as
      | { value: string }
      | undefined;
    return row?.value ?? '';
  };

  const logoPath = (kind: LogoKind): string => {
    const ext = get(LOGO_KIND_META[kind].extKey);
    return ext ? path.join(config.dataDir, `${LOGO_KIND_META[kind].file}${ext}`) : '';
  };

  r.get('/company', (_req, res) => {
    const settings: CompanySettings = {
      name: get('name'),
      projectId: get('project_id'),
      projectName: get('projectName'),
      workingArea: get('workingArea') || 'Cluster 12',
      consultant: get('consultant'),
      owner: get('owner'),
      ownerDelegate: get('ownerDelegate'),
    };
    const out: Record<string, unknown> = { ...settings };
    for (const kind of ['company', 'consultant', 'owner'] as LogoKind[]) {
      const lp = logoPath(kind);
      out[LOGO_KIND_META[kind].hasKey] = lp ? fs.existsSync(lp) : false;
    }
    res.json(out);
  });

  /** Serve a logo file (authenticated) — ?kind=company|consultant|owner. */
  r.get('/company/logo', (_req, res) => {
    const kind = (String(_req.query.kind ?? 'company') as LogoKind) || 'company';
    if (!(kind in LOGO_KIND_META)) {
      res.status(400).json({ error: 'kind must be company | consultant | owner' });
      return;
    }
    const lp = logoPath(kind);
    if (!lp || !fs.existsSync(lp)) {
      res.status(404).json({ error: 'No logo uploaded' });
      return;
    }
    res.setHeader('Content-Disposition', `inline; filename="${path.basename(lp)}"`);
    res.sendFile(lp);
  });

  /** Extra project metadata for printable reports (ticket 114) — the custom
   *  labels/values and the scan watch folder live in app_settings. */
  r.get('/meta', (_req, res) => {
    const get = (key: string): string => {
      const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(key) as
        | { value: string }
        | undefined;
      return row?.value ?? '';
    };
    let customMetadata: Array<{ key_en: string; key_ar: string; value_en: string; value_ar: string }> = [];
    try {
      const v = get('custom_metadata');
      if (v) {
        const parsed = JSON.parse(v) as unknown;
        if (Array.isArray(parsed)) customMetadata = parsed as Array<{ key_en: string; key_ar: string; value_en: string; value_ar: string }>;
      }
    } catch {
      customMetadata = [];
    }
    res.json({ custom_metadata: customMetadata, scans_watch_dir: get('scans_watch_dir') });
  });

  r.use(authRequired);

  /** Save project metadata + custom metadata labels (admin; wizard step 1). */
  r.post('/metadata', adminRequired, (req, res) => {
    const body = req.body ?? {};
    const set = (key: string, value: string): void => {
      db.prepare(
        'INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      ).run(key, value);
    };
    for (const key of COMPANY_KEYS) {
      set(COMPANY_DB_KEY[key], String(body[key] ?? '').trim());
    }
    // Custom metadata: [{key_en, key_ar, value_en, value_ar}] — JSON array in app_settings.
    const custom = Array.isArray(body.customMetadata) ? body.customMetadata : [];
    const clean = custom
      .map((c: unknown) => {
        const o = (c ?? {}) as { key_en?: unknown; key_ar?: unknown; value_en?: unknown; value_ar?: unknown };
        return {
          key_en: String(o.key_en ?? '').trim(),
          key_ar: String(o.key_ar ?? '').trim(),
          value_en: String(o.value_en ?? '').trim(),
          value_ar: String(o.value_ar ?? '').trim(),
        };
      })
      .filter((c: { key_en: string; key_ar: string }) => c.key_en || c.key_ar);
    set('custom_metadata', JSON.stringify(clean));
    res.json({ ok: true, customMetadata: clean });
  });

  /** Save the site identity (admin). Body may include base64 logo data URLs for
   *  the company, consultant, and/or owner logos. */
  r.post('/company', adminRequired, (req, res) => {
    const body = req.body ?? {};
    const set = (key: string, value: string): void => {
      db.prepare(
        'INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      ).run(key, value);
    };
    for (const key of COMPANY_KEYS) {
      set(COMPANY_DB_KEY[key], String(body[key] ?? '').trim());
    }
    for (const kind of ['company', 'consultant', 'owner'] as LogoKind[]) {
      const dataUrl = String(body[LOGO_KIND_META[kind].bodyKey] ?? '');
      if (!dataUrl) continue;
      const m = dataUrl.match(/^data:(image\/(?:png|jpeg|svg\+xml));base64,(.+)$/);
      if (!m) {
        res.status(400).json({ error: 'Logo must be a PNG, JPG or SVG data URL' });
        return;
      }
      const ext = LOGO_EXT[m[1]];
      const file = path.join(config.dataDir, `${LOGO_KIND_META[kind].file}${ext}`);
      let data = Buffer.from(m[2], 'base64');
      // V5-001: sanitize SVG uploads to prevent stored XSS
      if (m[1] === 'image/svg+xml') {
        const svgContent = data.toString('utf8');
        const sanitized = sanitizeSvg(svgContent);
        data = Buffer.from(sanitized, 'utf8');
      }
      fs.writeFileSync(file, data);
      set(LOGO_KIND_META[kind].extKey, ext);
    }
    res.json({ ok: true });
  });

  /** GET /api/settings/backup — last backup info (admin). */
  r.get('/backup', adminRequired, (_req, res) => {
    res.json(lastBackupInfo(config));
  });

  /** POST /api/settings/backup — run a backup now (admin, async). */
  r.post('/backup', adminRequired, async (req, res) => {
    try {
      const b = await runBackup(db, config);
      res.json({ ok: true, ...b });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  return r;
}