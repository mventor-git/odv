import type { ReactNode } from 'react';
import { useI18n } from '@/lib/i18n';
import { AlertTriangle } from 'lucide-react';

/** NCR Pulse (ticket 090) — animated urgent alert when NCRs are pending/PP.
 *  Click opens the NCR popover. */
export function NcrPulse({
  count,
  onSelect,
}: {
  count: number;
  onSelect: () => void;
}): ReactNode {
  const { t } = useI18n();
  if (count <= 0) return null;
  return (
    <button
      type="button"
      onClick={onSelect}
      className="group relative flex w-full items-center gap-3 overflow-hidden rounded-2xl border border-red-400/50 bg-destructive/10 p-4 text-start transition-all hover:bg-destructive/20 active:scale-[0.99]"
    >
      <span className="absolute inset-0 -z-0 animate-pulse rounded-2xl bg-destructive/10" aria-hidden="true" />
      <span className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-destructive text-white shadow-lg shadow-red-500/40">
        <AlertTriangle className="size-5" />
      </span>
      <span className="relative min-w-0 flex-1">
        <span className="block font-semibold text-destructive dark:text-destructive">
          {t('wall.ncrUrgent')} — {count}
        </span>
        <span className="block text-sm text-destructive/80 dark:text-destructive/80">{t('wall.ncrUrgentHint')}</span>
      </span>
      <span className="relative shrink-0 rounded-lg border border-destructive/30 px-3 py-1.5 text-xs font-medium text-destructive transition-colors group-hover:bg-destructive group-hover:text-white dark:border-destructive/30 dark:text-destructive">
        {t('wall.viewBreakdown')}
      </span>
    </button>
  );
}