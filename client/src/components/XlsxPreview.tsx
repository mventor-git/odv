import { type ReactNode } from 'react';
import { useI18n } from '@/lib/i18n';

interface Merge {
  r1: number; c1: number; r2: number; c2: number;
}

interface XlsxPreviewProps {
  rows: string[][];
  merges: Merge[];
  /** Selected cell refs (e.g. "A14", "G1") to highlight. */
  selected?: string[];
  /** When set, clicking a cell calls this with the cell ref (e.g. "C11"). */
  onPick?: (ref: string) => void;
}

const colLetter = (n: number): string => {
  let s = '';
  let x = n;
  while (x > 0) { x--; s = String.fromCharCode(65 + (x % 26)) + s; x = Math.floor(x / 26); }
  return s;
};

const rowCount = (r1: number, c1: number, r2: number, c2: number): number => (r2 - r1 + 1) * (c2 - c1 + 1);

/** Read-only A1:Z40 grid preview with merged-range highlighting (ticket 108). */
export function XlsxPreview({
  rows,
  merges,
  selected = [],
  onPick,
}: XlsxPreviewProps): ReactNode {
  const { t } = useI18n();
  const selectedSet = new Set(selected);
  // Map each cell to a merge it belongs to (skip continuation cells).
  const mergeOwner = new Map<string, Merge>();
  for (const m of merges) {
    if (rowCount(m.r1, m.c1, m.r2, m.c2) <= 1) continue;
    for (let r = m.r1; r <= m.r2; r++) {
      for (let c = m.c1; c <= m.c2; c++) {
        mergeOwner.set(`${r}:${c}`, m);
      }
    }
  }
  const MAX_C = 26;

  return (
    <div className="overflow-auto rounded-lg border border-border/60 bg-card">
      <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-border/60 bg-muted/40 px-2 py-1.5">
        <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
          {t('wall.filters')}
        </span>
        <span className="text-[10px] text-muted-foreground">
          {t('wizard.importPreview').replace('{n}', String(rows.length)).replace('{total}', String(rows.length))}
        </span>
        {onPick && <span className="text-[10px] text-accent">{t('wizard.tapCell')}</span>}
      </div>
      <table className="w-full border-collapse text-[10px]">
        <thead>
          <tr>
            <th className="sticky left-0 z-10 w-8 border-b border-r border-border/40 bg-muted/60 px-1 py-0.5 text-start font-semibold text-muted-foreground">#</th>
            {Array.from({ length: MAX_C }, (_, i) => (
              <th key={i} className="border-b border-r border-border/40 bg-muted/40 px-1 py-0.5 text-start font-semibold text-muted-foreground">
                {colLetter(i + 1)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rIdx) => {
            const r = rIdx + 1;
            return (
              <tr key={r}>
                <th className="sticky left-0 z-10 w-8 border-b border-r border-border/40 bg-muted/60 px-1 py-0.5 text-start font-semibold text-muted-foreground">
                  {r}
                </th>
                {row.slice(0, MAX_C).map((v, cIdx) => {
                  const c = cIdx + 1;
                  const ref = `${colLetter(c)}${r}`;
                  const merged = mergeOwner.get(`${r}:${c}`);
                  // Show content only on the top-left of a merge; blank the continuation cells.
                  const isOrigin = merged ? merged.r1 === r && merged.c1 === c : true;
                  const isSelected = selectedSet.has(ref);
                  const isMergedOrigin = merged && isOrigin;
                  return (
                    <td
                      key={c}
                      onClick={() => onPick && isOrigin && onPick(ref)}
                      title={ref}
                      className={`border-b border-r border-border/30 px-1 py-0.5 align-top transition-colors ${
                        onPick && isOrigin ? 'cursor-pointer hover:bg-accent/20' : ''
                      } ${
                        isMergedOrigin
                          ? 'bg-accent/10 ring-1 ring-inset ring-accent/30'
                          : merged && !isOrigin
                            ? 'bg-accent/5'
                            : ''
                      } ${isSelected ? 'bg-primary/15 ring-1 ring-inset ring-primary/40 font-semibold' : ''}`}
                      style={isMergedOrigin ? { gridRow: `${merged.r2 - merged.r1 + 1}` } : undefined}
                    >
                      <span className="block max-w-[9rem] truncate whitespace-nowrap text-muted-foreground">
                        {v || ''}
                      </span>
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}