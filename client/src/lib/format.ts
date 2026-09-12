// Display formatting helpers for request/revision numbers (ticket 011).
// Display-only: stored values are untouched (e.g. "STR-1" stays in the DB).

/** Pad the trailing numeric part of a request no. to 4 digits: "STR-1" → "STR-0001", "1" → "0001". */
export function padRequestNo(no: string): string {
  const m = no.match(/^(.*?)(\d+)$/);
  if (!m) return no;
  return m[1] + m[2].padStart(4, '0');
}

/** Pad a pure-numeric revision to 2 digits: "0" → "00", "12" → "12". */
export function padRevisionNo(rev: string): string {
  const m = rev.match(/^(\d+)$/);
  if (!m) return rev;
  return m[1].padStart(2, '0');
}

/** Numeric-aware sort key for request numbers: prefix first, then the number. */
export function requestNoSortKey(no: string): [string, number] {
  const m = no.match(/^(.*?)(\d+)$/);
  if (!m) return [no, 0];
  return [m[1], Number(m[2])];
}

/** Numeric sort key for revisions ("0" < "1" < "10"). */
export function revisionSortKey(rev: string): number {
  const n = Number(rev);
  return Number.isFinite(n) ? n : 0;
}

/** Star badge classes per DB star value (ticket 097): 'gold' → gold badge,
 *  'white' → white badge. The role→star mapping lives in the roles table —
 *  this is a cosmetic display map only (no hardcoded role names). */
const STAR_CLASSES: Record<string, string> = {
  gold: 'bg-amber-400/15 text-warning',
  white: 'bg-slate-900/10 text-slate-900 ring-1 ring-slate-900/30 dark:bg-white/20 dark:text-white dark:ring-white/40',
};

/** Tailwind classes for a star badge value, or null when the role has none. */
export function starClass(star?: string): string | null {
  return star ? (STAR_CLASSES[star] ?? null) : null;
}

/** Strip the title prefix (Mr/Ms/Mrs/Eng/Engineer) — the bare name. */
export function bareName(name: string): string {
  return name.replace(/^(Mr|Ms|Mrs|Eng|Engineer)\s+/, '');
}

/** Account display name — Arabic names when the UI is Arabic (ticket 050). */
export function userDisplayName(
  u: { username: string; firstName?: string; secondName?: string; firstNameAr?: string; secondNameAr?: string },
  lang: 'en' | 'ar',
): string {
  const first = lang === 'ar' ? u.firstNameAr : u.firstName;
  const second = lang === 'ar' ? u.secondNameAr : u.secondName;
  if (first || second) return `${first} ${second}`.trim();
  return u.username;
}

/** Zone display delegate (ticket 068) — Arabic name when the UI is Arabic. */
export function zoneDisplay(
  z: { code: string; name: string; nameAr?: string },
  lang: 'en' | 'ar',
): string {
  return lang === 'ar' && z.nameAr ? z.nameAr : z.name;
}

/** Floor display delegate (ticket 068) — Arabic name when the UI is Arabic. */
export function floorDisplay(
  floor: string,
  lang: 'en' | 'ar',
  namesAr?: Record<string, string>,
): string {
  return lang === 'ar' && namesAr?.[floor] ? namesAr[floor] : floor;
}