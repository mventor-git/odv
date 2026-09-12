import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import type { DcRecord, Meta, RecordsResponse } from '@/lib/types';
import { Card, CardContent } from '@/components/ui/card';
import { StatusBadge } from '@/components/StatusBadge';
import { FileLink } from '@/components/FileLink';
import { RequestCard } from '@/components/RequestCard';
import { NotifyButton } from '@/components/NotifyButton';
import { padRequestNo } from '@/lib/format';
import { Sparkles } from 'lucide-react';

/** Full-page Latest Records — fancy card grid, clickable → request card (ticket 023). */
export function LatestPage(): ReactNode {
  const { t } = useI18n();
  const [meta, setMeta] = useState<Meta | null>(null);
  const [records, setRecords] = useState<DcRecord[]>([]);
  const [card, setCard] = useState<{ category: string; requestNo: string; revisionId?: number } | null>(null);

  useEffect(() => {
    api<Meta>('/api/meta').then(setMeta).catch(() => undefined);
    api<RecordsResponse>('/api/records?limit=200&sort=desc')
      .then((r) => setRecords(r.items))
      .catch(() => undefined);
  }, []);

  const latest = useMemo(() => [...records].sort((a, b) => b.id - a.id), [records]);

  const catName = (code: string): string =>
    meta?.categories.find((c) => c.code === code)?.name ?? code;
  const statusDef = (code: string) => meta?.statuses.find((s) => s.code === code);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">{t('nav.latest')}</h1>
        <p className="text-sm text-muted-foreground">{t('wall.subtitle')}</p>
      </div>

      {latest.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">—</CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {latest.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => setCard({ category: r.category, requestNo: r.requestNo })}
              className="glass-card flex flex-col gap-3 rounded-2xl p-4 text-start transition-all hover:-translate-y-0.5"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <StatusBadge status={r.status} />
                  <span className="truncate font-semibold text-foreground">
                    {padRequestNo(r.requestNo) || r.category}
                  </span>
                </div>
                <span className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                  <NotifyButton target={`${r.category} ${r.requestNo}`} small />
                  <FileLink recordId={r.id} hyperlink={r.hyperlink} label="PDF" />
                </span>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Sparkles className="size-3.5" />
                <span className="truncate">
                  {catName(r.category)} {statusDef(r.status)?.slogan ?? r.status}
                </span>
              </div>
              {r.description && (
                <div className="line-clamp-2 text-sm text-muted-foreground">{r.description}</div>
              )}
              <div className="mt-auto flex items-center justify-between text-xs text-muted-foreground">
                <span>{r.zone || r.floor || ''}</span>
                <span className="font-mono">{r.revisionNo ? `rev ${r.revisionNo}` : ''}</span>
              </div>
            </button>
          ))}
        </div>
      )}

      <RequestCard
        open={card !== null}
        category={card?.category ?? ''}
        requestNo={card?.requestNo ?? ''}
        initialViewId={card?.revisionId}
        onClose={() => setCard(null)}
      />
    </div>
  );
}