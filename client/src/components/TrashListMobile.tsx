import { type ReactNode } from 'react';
import type { DcRecord } from '@/lib/types';
import { useI18n } from '@/lib/i18n';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/StatusBadge';
import { padRequestNo, padRevisionNo } from '@/lib/format';
import { RotateCcw, Trash2 } from 'lucide-react';

type TKey = Parameters<ReturnType<typeof useI18n>['t']>[0];

interface Props {
  rows: DcRecord[];
  isAdmin: boolean;
  t: (key: TKey) => string;
  timeLabel: (iso: string) => string;
  onRestore: (r: DcRecord) => void;
  onPurge: (r: DcRecord) => void;
}

/** Mobile trash cards (ticket 037 split). */
export function TrashListMobile({ rows, isAdmin, t, timeLabel, onRestore, onPurge }: Props): ReactNode {
  return (
    <div className="flex flex-col gap-3">
      {rows.map((r) => (
        <div key={r.id} className="glass-card flex flex-col gap-2 rounded-2xl p-4">
          <div className="flex items-center justify-between gap-2">
            <span className="font-mono text-base font-bold text-foreground">
              {padRequestNo(r.requestNo)}
            </span>
            <StatusBadge status={r.status} />
          </div>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <span className="rounded bg-muted px-1.5 py-0.5 font-semibold uppercase tracking-wide">
              {r.category}
            </span>
            <span className="font-mono">{padRevisionNo(r.revisionNo)}</span>
            <span>· {timeLabel(r.deletedAt ?? '')}</span>
          </div>
          {r.description && (
            <div className="line-clamp-2 text-sm text-muted-foreground">{r.description}</div>
          )}
          {isAdmin ? (
            <div className="flex flex-wrap gap-1.5">
              <Button size="sm" variant="outline" className="gap-1" onClick={() => onRestore(r)}>
                <RotateCcw className="size-3.5" />
                {t('trash.restore')}
              </Button>
              <Button size="sm" variant="destructive" className="gap-1" onClick={() => onPurge(r)}>
                <Trash2 className="size-3.5" />
                {t('trash.deleteForever')}
              </Button>
            </div>
          ) : (
            <span className="text-xs text-muted-foreground">{t('users.adminOnly')}</span>
          )}
        </div>
      ))}
    </div>
  );
}