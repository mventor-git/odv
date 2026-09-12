import { useEffect, useState, type ReactNode } from 'react';
import { useI18n } from '@/lib/i18n';

/** Progress Bars (ticket 090) — P → A/B/C/D approval pipeline, animated fill. */
export function ProgressBars({
  counts,
  total,
}: {
  counts: Record<string, number>;
  total: number;
}): ReactNode {
  const { t } = useI18n();
  const [animated, setAnimated] = useState(false);

  useEffect(() => {
    const id = window.setTimeout(() => setAnimated(true), 150);
    return () => window.clearTimeout(id);
  }, []);

  // Single source — no hardcoding of neon hex
  const steps: Array<{ code: string; label: string; color: string }> = [
    { code: 'P', label: t('cc.statusPending'), color: 'bg-warning' },
    { code: 'A', label: t('cc.statusA'), color: 'bg-success' },
    { code: 'B', label: t('cc.statusB'), color: 'bg-accent' },
    { code: 'C', label: t('cc.statusC'), color: 'bg-destructive' },
    { code: 'D', label: t('cc.statusD'), color: 'bg-destructive' },
  ];

  return (
    <div className="flex flex-col gap-3">
      {steps.map((s) => {
        const n = counts[s.code] ?? 0;
        const pct = total > 0 ? (n / total) * 100 : 0;
        return (
          <div key={s.code} className="flex flex-col gap-1">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-foreground">{s.label}</span>
              <span className="tabular-nums text-muted-foreground">
                {n} · {pct.toFixed(1)}%
              </span>
            </div>
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className={`h-full rounded-full ${s.color} transition-[width] duration-1000 ease-out`}
                style={{ width: animated ? `${pct}%` : '0%' }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}