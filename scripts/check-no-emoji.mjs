#!/usr/bin/env node
// V5-024: no-emoji enforcement — fails build if emoji ranges appear in UI source or artifact builders.
import fs from 'node:fs';
import path from 'node:path';

const ROOTS = ['client/src', 'server/src'];
const ALLOW = new Set([]); // allowlist if needed

// Rough emoji range regex (most common)
const EMOJI_RE = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;

let failed = false;
for (const root of ROOTS) {
  const base = path.resolve(root);
  if (!fs.existsSync(base)) continue;
  const walk = (dir) => {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, ent.name);
      if (ent.isDirectory()) { walk(p); continue; }
      if (!/\.(ts|tsx|js|jsx)$/.test(ent.name)) continue;
      const txt = fs.readFileSync(p, 'utf8');
      if (EMOJI_RE.test(txt)) {
        // Check allowlist
        const rel = path.relative(process.cwd(), p);
        if (ALLOW.has(rel)) continue;
        console.error(`[no-emoji] emoji found in ${rel}`);
        failed = true;
      }
      // Also check generated artifact builders (report.ts, checklistReport.ts) — same regex
      if (p.includes('report') && txt.includes('🧱')) { console.error(`[no-emoji] brick emoji in ${path.relative(process.cwd(), p)}`); failed = true; }
    }
  };
  walk(base);
}
if (failed) {
  console.error('[no-emoji] FAILED — remove emojis from UI source');
  process.exit(1);
} else {
  console.log('[no-emoji] PASS — no emojis in UI source');
}
