import { useEffect, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import type { Meta, RecordsStats } from '@/lib/types';
import { RequestCard } from '@/components/RequestCard';
import { StatusRing } from '@/components/StatusRing';
import { ProgressBars } from '@/components/ProgressBars';
import { ZoneHeatGrid } from '@/components/ZoneHeatGrid';
import { NcrPulse } from '@/components/NcrPulse';
import { DashPopover } from '@/components/DashPopover';
import { Layers, TrendingUp, MapPin } from 'lucide-react';

type PopoverFilter = { status?: string; zone?: string; category?: string } | null;

/** Request Dashboard (ticket 090) — the visual home of the Request Area.
 *  No tables, no logs: Status Ring, Progress Bars, Zone Heat Grid, NCR Pulse.
 *  Every click opens an animated popover with the matching records as cards.
 *  Deep links (?status=&zone=&category=) open the matching popover (ticket 114). */
export function RequestsPage(): ReactNode {
  const { t } = useI18n();
  const [searchParams] = useSearchParams();
  const [meta, setMeta] = useState<Meta | null>(null);
  const [stats, setStats] = useState<RecordsStats | null>(null);
  const [engineers, setEngineers] = useState<string[]>([]);
  const [popover, setPopover] = useState<PopoverFilter>(null);
  const [card, setCard] = useState<{ category: string; requestNo: string; revisionId?: number } | null>(null);

  useEffect(() => {
    api<Meta>('/api/meta').then(setMeta).catch(() => undefined);
    api<RecordsStats>('/api/records/stats').then(setStats).catch(() => undefined);
    api<{ engineers: string[] }>('/api/records/engineers').then((r) => setEngineers(r.engineers)).catch(() => undefined);
  }, []);

  // Ticket 114: "View all" links arrive as ?category=&status=&zone= — open the popover.
  useEffect(() => {
    const status = searchParams.get('status');
    const zone = searchParams.get('zone');
    const category = searchParams.get('category');
    if (status || zone || category) {
      setPopover({ status: status ?? undefined, zone: zone ?? undefined, category: category ?? undefined });
    }
  }, [searchParams]);

  if (!meta || !stats) {
    return <div className="text-muted-foreground">{t('common.loading')}</div>;
  }

  const ncrUrgent = (stats.ncrUrgent.pending ?? 0) + (stats.ncrUrgent.pp ?? 0);
  const isNcrCategory = (code: string): boolean =>
    meta?.categories.find((c) => c.code === code)?.kind === 'ncr';
  const popoverTitle = (f: PopoverFilter): string => {
    if (!f) return '';
    if (f.status) return `${t('cc.popoverStatus')} ${f.status}`;
    if (f.zone) return `${t('cc.popoverZone')} ${f.zone}`;
    if (f.category && isNcrCategory(f.category)) {
      const ncr = meta?.categories.find((c) => c.code === f.category);
      return ncr ? `${ncr.code} — ${ncr.name}` : t('cc.popoverNcr');
    }
    return '';
  };

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">{t('cc.title')}</h1>
        <p className="text-sm text-muted-foreground">{t('cc.subtitle')}</p>
      </div>

      {/* NCR Pulse — animated urgent alert */}
      <NcrPulse count={ncrUrgent} onSelect={() => {
        const ncr = meta?.categories.find((c) => c.kind === 'ncr');
        if (ncr) setPopover({ category: ncr.code });
      }} />

      {/* Status Ring + Approval Progress */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="glass-card flex flex-col gap-3 rounded-2xl p-5">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent text-white shadow-md">
              <Layers className="size-3.5" />
            </span>
            <h2 className="text-sm font-bold uppercase tracking-wider text-foreground">{t('cc.ringTitle')}</h2>
            <span className="h-px flex-1 bg-primary/10" />
          </div>
          <div className="flex items-center justify-center py-2">
            <StatusRing
              statuses={meta.statuses}
              counts={stats.byStatus}
              total={stats.total}
              onSelect={(status) => setPopover({ status })}
            />
          </div>
        </div>

        <div className="glass-card flex flex-col gap-3 rounded-2xl p-5">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-success text-white shadow-md">
              <TrendingUp className="size-3.5" />
            </span>
            <h2 className="text-sm font-bold uppercase tracking-wider text-foreground">{t('cc.progressTitle')}</h2>
            <span className="h-px flex-1 from-success/10 to-transparent" />
          </div>
          <div className="flex flex-col justify-center py-2">
            <ProgressBars counts={stats.byStatus} total={stats.total} />
          </div>
        </div>
      </div>

      {/* Zone Heat Grid */}
      <div className="glass-card flex flex-col gap-3 rounded-2xl p-5">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent text-white shadow-md">
            <MapPin className="size-3.5" />
          </span>
          <h2 className="text-sm font-bold uppercase tracking-wider text-foreground">{t('cc.zonesTitle')}</h2>
          <span className="h-px flex-1 from-accent/10 to-transparent" />
        </div>
        <ZoneHeatGrid zones={meta.zones} counts={stats.byZone} onSelect={(zone) => setPopover({ zone })} />
      </div>

      <DashPopover
        open={popover !== null}
        title={popoverTitle(popover)}
        filter={popover ?? {}}
        meta={meta}
        engineers={engineers}
        onClose={() => setPopover(null)}
        onOpenRecord={(category, requestNo, revisionId) => setCard({ category, requestNo, revisionId })}
      />

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