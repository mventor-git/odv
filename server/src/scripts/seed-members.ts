// Seed demo placeholders for testing/showing (no real names).
// Idempotent — skips names that already exist. Names are stored BARE.
import { loadConfig } from '../config.ts';
import { openDb } from '../db.ts';

interface EngineerSeed {
  name: string;
  role: string;
  specialty: string;
  specialty2: string;
  from: string;
  to: string;
  active: number;
}

const ENGINEERS: EngineerSeed[] = [
  { name: 'Civil Lead', role: 'Project Manager', specialty: '', specialty2: '', from: '01-2024', to: '', active: 1 },
  { name: 'Site Eng Architecture', role: 'Site Engineer', specialty: 'Architecture', specialty2: '', from: '', to: '', active: 1 },
  { name: 'Site Eng Structure', role: 'Site Engineer', specialty: 'Structure', specialty2: '', from: '', to: '', active: 1 },
  { name: 'Technical Office Eng', role: 'Technical Office Engineer', specialty: '', specialty2: '', from: '', to: '', active: 1 },
  { name: 'QA/QC Inspector', role: 'Site Engineer', specialty: '', specialty2: '', from: '', to: '', active: 1 },
  { name: 'Document Controller', role: 'Document Controller', specialty: '', specialty2: '', from: '', to: '', active: 1 },
];

/** demo usernames for placeholders */
const USERNAMES: Record<string, string> = {
  'Civil Lead': 'civil.lead',
  'Site Eng Architecture': 'site.arch',
  'Site Eng Structure': 'site.struct',
  'Technical Office Eng': 'tech.office',
  'QA/QC Inspector': 'qa.qc',
  'Document Controller': 'doc.control',
};

const config = loadConfig();
const db = openDb(config);

let engAdded = 0;
const insEng = db.prepare(
  `INSERT OR IGNORE INTO engineers (name, role, specialty, specialty2, period_from, period_to, active)
   VALUES (?, ?, ?, ?, ?, ?, ?)`,
);
for (const e of ENGINEERS) {
  const info = insEng.run(e.name, e.role, e.specialty, e.specialty2, e.from, e.to, e.active);
  engAdded += Number(info.changes);
}

let userAdded = 0;
const insUser = db.prepare(
  `INSERT OR IGNORE INTO users (username, password_hash, role, password_set, active)
   VALUES (?, '', ?, 0, ?)`,
);
for (const e of ENGINEERS) {
  const username = USERNAMES[e.name];
  if (!username) continue;
  const role = e.name === 'Civil Lead' ? 'admin' : 'engineer';
  const info = insUser.run(username, role, e.active);
  userAdded += Number(info.changes);
}

console.log(`Engineers added: ${engAdded}, user accounts added: ${userAdded}.`);
console.log('Total engineers:', (db.prepare('SELECT COUNT(*) AS n FROM engineers').get() as { n: number }).n);
