import { useEffect, useState, type ReactNode } from 'react';
import { useI18n } from '@/lib/i18n';
import { statusHex } from '@/lib/status';

/** Cosmetic status colors — warm muted Claude, single source (no neon). */
const STATUS_COLORS: Record<string, string> = {
  A: statusHex('A'),
  B: statusHex('B'),
  C: statusHex('C'),
  D: statusHex('D'),
  SS: statusHex('SS'),
  PP: statusHex('PP'),
  P: statusHex('P'),
  SC: statusHex('SC'),
  Skipped: statusHex('Skipped'),
};

/** Status Ring (ticket 090) — animated donut of the 9 statuses. Hover shows
 *  count + slogan; click selects the status for the popover. */
export function StatusRing({
  statuses,
  counts,
  total,
  onSelect,
}: {
  statuses: Array<{ code: string; slogan: string }>;
  counts: Record<string, number>;
  total: number;
  onSelect: (status: string) => void;
}): ReactNode {
  const { t } = useI18n();
  const [animated, setAnimated] = useState(false);
  const [hover, setHover] = useState<string | null>(null);

  useEffect(() => {
    const id = window.setTimeout(() => setAnimated(true), 80);
    return () => window.clearTimeout(id);
  }, []);

  const R = 70;
  const C = 2 * Math.PI * R;
  const items = statuses
    .map((s) => ({ ...s, count: counts[s.code] ?? 0 }))
    .filter((s) => s.count > 0);
  const totalCount = items.reduce((a, b) => a + b.count, 0) || 1;
  let acc = 0;
  const segs = items.map((s) => {
    const frac = s.count / totalCount;
    const seg = { ...s, start: acc, frac };
    acc += frac;
    return seg;
  });

  const hovered = hover ? segs.find((x) => x.code === hover) : null;

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width="210" height="210" viewBox="0 0 200 200" className="-rotate-90">
        <circle cx="100" cy="100" r={R} fill="none" stroke="rgba(148,163,184,0.15)" strokeWidth="24" />
        {segs.map((s) => (
          <circle
            key={s.code}
            cx="100"
            cy="100"
            r={R}
            fill="none"
            stroke={STATUS_COLORS[s.code] ?? 'var(--muted-foreground)'}
            strokeWidth="24"
            strokeDasharray={`${animated ? s.frac * C : 0} ${C}`}
            strokeDashoffset={-s.start * C}
            className="cursor-pointer transition-[stroke-dasharray] duration-1000 ease-out"
            onMouseEnter={() => setHover(s.code)}
            onMouseLeave={() => setHover(null)}
            onClick={() => onSelect(s.code)}
          />
        ))}
      </svg>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-bold tabular-nums text-foreground">{total}</span>
        <span className="text-[11px] text-muted-foreground">{t('cc.totalRequests')}</span>
      </div>
      {hovered && (
        <div className="pointer-events-none absolute -top-3 start-1/2 z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-lg border border-border/70 bg-card px-3 py-1.5 text-xs shadow-xl">
          <div className="font-bold text-foreground">
            {hovered.code} — {hovered.slogan}
          </div>
          <div className="text-muted-foreground">
            {hovered.count} ({((hovered.count / totalCount) * 100).toFixed(1)}%)
          </div>
        </div>
      )}
    </div>
  );
}