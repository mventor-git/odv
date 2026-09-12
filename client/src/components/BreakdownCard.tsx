import type { ReactNode } from 'react';
import type { MetaBreakdown } from '@/components/WallMetaCard';

interface BreakdownCardProps {
  breakdown: MetaBreakdown;
  isSelected: boolean;
  /** Max value across the breakdown — the mini bar is relative to it. */
  max?: number;
  onClick: () => void;
}

/** A single breakdown entry as a clickable warm bordered card (ticket 114) —
 *  label + count + mini progress bar. Clicking drills into that criteria. */
export function BreakdownCard({ breakdown, isSelected, max = 1, onClick }: BreakdownCardProps): ReactNode {
  const pct = max > 0 ? Math.min(100, Math.round((breakdown.value / max) * 100)) : 0;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={isSelected}
      className={`flex cursor-pointer flex-col gap-1.5 rounded-xl border bg-card p-4 text-start shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md ${
        isSelected ? 'border-accent/50 ring-2 ring-accent/50' : 'border-border hover:border-accent/30'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0 truncate text-xs font-medium text-foreground">{breakdown.label}</span>
        <span className="shrink-0 text-sm font-bold tabular-nums text-foreground">{breakdown.value}</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div className={`h-full rounded-full ${breakdown.barClass}`} style={{ width: `${pct}%` }} />
      </div>
    </button>
  );
}
