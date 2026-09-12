// CLI: npm run sweep — one-shot sweep of the monolith's active logs into data/legacy.db.
import 'dotenv/config';
import path from 'node:path';
import { loadConfig } from '../config.ts';
import { runSweep } from '../legacy/sweep.ts';

const config = loadConfig();
const summary = await runSweep(config);

for (const s of summary) {
  console.log(
    `[sweep] ${s.key.padEnd(14)} ${String(s.rows).padStart(6)} rows  ${s.note ? `(${s.note})` : ''}`,
  );
}
console.log(`[sweep] done -> ${path.join(config.dataDir, 'legacy.db')}`);
