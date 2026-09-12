import { useEffect, useState, type ReactNode } from 'react';
import { useI18n } from '@/lib/i18n';
import type { Meta } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AnimateCount } from '@/components/unlumen-ui/animate-count';
import { AppIcon } from '@/icons/AppIcon';
import { BreakdownCard } from '@/components/BreakdownCard';
import { NestedDrillDown } from '@/components/NestedDrillDown';

export interface MetaBreakdown {
  label: string;
  value: number;
  barClass: string;
  /** Optional query filters for the nested drill-down (ticket 114) — which
   *  field the breakdown groups by (status / category / zone). */
  filter?: { status?: string; category?: string; zone?: string };
}

interface WallMetaCardProps {
  open: boolean;
  title: string;
  subtitle: string;
  total: number;
  icon: ReactNode;
  accentClass: string;
  /** Distinct layouts so no two metadata cards look the same (ticket 026). */
  variant: 'status' | 'category' | 'blocks' | 'percent';
  /** For the percent variant: the percentage to headline (e.g. B% of total). */
  percent?: number;
  breakdown: MetaBreakdown[];
  onClose: () => void;
  onReport?: () => void;
  /** Fired when a breakdown card is clicked (ticket 114) — lets the parent
   *  react if it wants; the nested drill-down is managed internally. */
  onBreakdownCardClick?: (item: MetaBreakdown) => void;
  /** Reference data for the drill-down's contextual filters (ticket 120). */
  meta?: Meta | null;
  /** Distinct engineer names for the drill-down's engineer filter. */
  engineers?: string[];
}

/** Fancy metadata card modal for the Wall stat cards (tickets 021 + 026 +
 *  114 + 120: interactive warm breakdown cards + nested drill-down + print). */
export function WallMetaCard({
  open,
  title,
  subtitle,
  total,
  icon,
  accentClass,
  variant,
  percent = 0,
  breakdown,
  onClose,
  onReport,
  onBreakdownCardClick,
  meta,
  engineers,
}: WallMetaCardProps): ReactNode {
  const { t } = useI18n();
  const max = Math.max(1, ...breakdown.map((b) => b.value));
  const [selected, setSelected] = useState<MetaBreakdown | null>(null);

  // Reset the selection whenever the modal closes.
  useEffect(() => {
    if (!open) setSelected(null);
  }, [open]);

  const toggle = (b: MetaBreakdown): void => {
    const next = selected?.label === b.label ? null : b;
    setSelected(next);
    if (next) onBreakdownCardClick?.(b);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${accentClass} text-white shadow-md`}>
                {icon}
              </span>
              <div className="min-w-0">
                <DialogTitle>{title}</DialogTitle>
                <div className="text-xs text-muted-foreground">{subtitle}</div>
              </div>
            </div>
            {onReport && (
              <Button size="sm" variant="outline" className="shrink-0 gap-1.5" onClick={onReport}>
                <AppIcon name="printer" className="size-4" />
                {t('wall.printReport')}
              </Button>
            )}
          </div>
        </DialogHeader>

        <div className="-mt-1 flex flex-col gap-4 px-6 pb-6">
          <AnimateCount className="text-4xl font-bold tabular-nums text-foreground">{total}</AnimateCount>

          {variant === 'percent' && (
            <div className="flex items-center gap-5 rounded-xl border border-border/60 bg-card p-5">
              <div className="relative h-28 w-28 shrink-0">
                <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
                  <circle cx="50" cy="50" r="42" fill="none" strokeWidth="10" className="stroke-muted" />
                  <circle
                    cx="50"
                    cy="50"
                    r="42"
                    fill="none"
                    strokeWidth="10"
                    strokeLinecap="round"
                    strokeDasharray={`${(Number(percent.toFixed(1)) / 100) * 264} 264`}
                    className={percent >= 50 ? 'stroke-[var(--success)]' : 'stroke-[var(--destructive)]'}
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <AnimateCount className="text-2xl font-bold tabular-nums text-foreground">{Number(percent.toFixed(1))}</AnimateCount>
                  <span className="text-xs font-semibold text-muted-foreground">%</span>
                </div>
              </div>
              <div className="flex min-w-0 flex-col gap-1">
                <span className="text-sm font-semibold text-foreground">{title}</span>
                <span className="text-xs text-muted-foreground">{subtitle}</span>
                <div className="mt-1 flex items-baseline gap-2">
                  <AnimateCount className="text-3xl font-bold tabular-nums text-foreground">{total}</AnimateCount>
                  <span className="text-xs text-muted-foreground">{t('records.total')}</span>
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            {breakdown.length === 0 && (
              <div className="col-span-full text-sm text-muted-foreground">—</div>
            )}
            {breakdown.map((b) => (
              <BreakdownCard
                key={b.label}
                breakdown={b}
                max={max}
                isSelected={selected?.label === b.label}
                onClick={() => toggle(b)}
              />
            ))}
          </div>

          {selected && (
            <NestedDrillDown
              criteria={selected}
              meta={meta}
              engineers={engineers}
              onClose={() => setSelected(null)}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
