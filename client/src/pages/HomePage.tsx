import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import type { Meta, RecordsStats } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { WallMetaCard, type MetaBreakdown } from '@/components/WallMetaCard';
import { WallReportDialog } from '@/components/WallReportDialog';
import { AnimateCount } from '@/components/unlumen-ui/animate-count';
import { openReport } from '@/lib/report';
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  FileText,
  Inbox,
  Layers,
  List,
  Printer,
  Workflow,
} from 'lucide-react';
import { statusChip } from '@/lib/status';

type MetaCardKind = 'total' | 'logged' | 'b' | 'pp' | null;

interface WallAction {
  label: string;
  icon: ReactNode;
  onClick: () => void;
}

/** Circular gauge (ticket 089 redesign) — animated ring showing a percentage,
 *  with the raw count + label beside it. */
function RingGauge({
  pct,
  color,
  count,
  label,
}: {
  pct: number;
  color: string;
  count: number;
  label: string;
}): ReactNode {
  const [animated, setAnimated] = useState(false);
  useEffect(() => {
    const id = window.setTimeout(() => setAnimated(true), 120);
    return () => window.clearTimeout(id);
  }, []);
  const R = 44;
  const C = 2 * Math.PI * R;
  return (
    <div className="flex items-center gap-4">
      <div className="relative inline-flex shrink-0 items-center justify-center">
        <svg width="110" height="110" viewBox="0 0 110 110" className="-rotate-90">
          <circle cx="55" cy="55" r={R} fill="none" stroke="rgba(148,163,184,0.15)" strokeWidth="10" />
          <circle
            cx="55"
            cy="55"
            r={R}
            fill="none"
            stroke={color}
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={`${animated ? (pct / 100) * C : 0} ${C}`}
            className="transition-[stroke-dasharray] duration-1000 ease-out"
          />
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xl font-bold tabular-nums text-foreground">{pct.toFixed(1)}%</span>
        </div>
      </div>
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="text-3xl font-bold tabular-nums text-foreground">{count}</span>
        <span className="truncate text-xs text-muted-foreground">{label}</span>
      </div>
    </div>
  );
}

/** Wall card (ticket 089 redesign) — icon chip + title header, big content,
 *  one-line metadata, and the action row INSIDE the card as pill buttons. */
function WallCard({
  icon,
  iconClass,
  title,
  meta,
  glow,
  actions,
  children,
}: {
  icon: ReactNode;
  iconClass: string;
  title: string;
  meta?: string;
  glow: string;
  actions: WallAction[];
  children: ReactNode;
}): ReactNode {
  return (
    <div className={`glass-card flex flex-col gap-3 rounded-2xl p-5 ${glow}`}>
      <div className="flex items-center gap-2.5">
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${iconClass}`}>
          {icon}
        </span>
        <span className="truncate text-sm font-semibold text-foreground">{title}</span>
      </div>
      <div className="flex min-h-0 flex-1 flex-col justify-center py-1">{children}</div>
      {meta && <div className="truncate text-xs text-muted-foreground">{meta}</div>}
      <div className="flex flex-wrap items-center gap-1.5">
        {actions.map((a) => (
          <button
            key={a.label}
            type="button"
            onClick={a.onClick}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border/70 bg-card/60 px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-all hover:border-primary/40 hover:text-foreground active:scale-95"
          >
            {a.icon}
            {a.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function HomePage(): ReactNode {
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const [meta, setMeta] = useState<Meta | null>(null);
  const [stats, setStats] = useState<RecordsStats | null>(null);
  const [metaCard, setMetaCard] = useState<MetaCardKind>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [engineers, setEngineers] = useState<string[]>([]);

  useEffect(() => {
    api<Meta>('/api/meta').then(setMeta).catch(() => undefined);
    api<RecordsStats>('/api/records/stats').then(setStats).catch(() => undefined);
    api<{ engineers: string[] }>('/api/records/engineers').then((r) => setEngineers(r.engineers)).catch(() => undefined);
  }, []);

  if (!meta || !stats) {
    return <div className="text-muted-foreground">{t('common.loading')}</div>;
  }

  const total = stats.total;
  const bPct = total > 0 ? ((stats.byStatus.B ?? 0) / total) * 100 : 0;
  const ncrUrgent = (stats.ncrUrgent.pending ?? 0) + (stats.ncrUrgent.pp ?? 0);

  const statusName = (code: string): string => {
    const s = meta.statuses.find((x) => x.code === code);
    return s ? `${s.code} — ${s.slogan}` : code;
  };
  const catName = (code: string): string =>
    meta.categories.find((c) => c.code === code)?.name ?? code;

  // Single source — no hardcoding here, defer to warm muted theme (lib/status.ts)
  const STATUS_CHIP: Record<string, string> = {
    A: statusChip('A'),
    B: statusChip('B'),
    C: statusChip('C'),
    D: statusChip('D'),
    SS: statusChip('SS'),
    PP: statusChip('PP'),
    P: statusChip('P'),
    SC: statusChip('SC'),
    Skipped: statusChip('Skipped'),
  };

  const statusBreakdown = (codes: string[]): MetaBreakdown[] =>
    codes
      .map((code) => ({
        label: statusName(code),
        value: stats.byStatus[code] ?? 0,
        barClass: STATUS_CHIP[code] ?? 'bg-muted text-muted-foreground dark:bg-muted dark:text-muted-foreground',
        filter: { status: code },
      }))
      .filter((b) => b.value > 0);

  const categoryBreakdown = (): MetaBreakdown[] =>
    Object.entries(stats.byCategory)
      .map(([code, value]) => ({
        label: `${code} — ${catName(code)}`,
        value,
        barClass: 'bg-accent',
        filter: { category: code },
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 12);

  const reportRows = (b: MetaBreakdown[]): { label: string; value: number }[] =>
    b.map((x) => ({ label: x.label, value: x.value }));

  const metaCardData = (): {
    title: string;
    subtitle: string;
    total: number;
    icon: ReactNode;
    accent: string;
    variant: 'status' | 'category' | 'blocks' | 'percent';
    percent?: number;
    breakdown: MetaBreakdown[];
    onReport: () => void;
  } | null => {
    switch (metaCard) {
      case 'total': {
        const b = statusBreakdown(['A', 'B', 'C', 'D', 'SS', 'PP', 'P', 'SC', 'Skipped']);
        return {
          title: t('wall.totalRequests'),
          subtitle: t('wall.metaTotalSub'),
          total,
          icon: <Layers className="size-5" />,
          accent: 'bg-accent',
          variant: 'status',
          breakdown: b,
          onReport: () => setExportOpen(true),
        };
      }
      case 'logged': {
        const b = categoryBreakdown();
        return {
          title: t('wall.loggedRequests'),
          subtitle: t('wall.metaLoggedSub'),
          total: stats.byBucket.open ?? 0,
          icon: <FileText className="size-5" />,
          accent: 'bg-success',
          variant: 'category',
          breakdown: b,
          onReport: () => openReport({ title: t('wall.loggedRequests'), subtitle: t('wall.metaLoggedSub'), rows: reportRows(b), lang }),
        };
      }
      case 'b': {
        const b = categoryBreakdown();
        return {
          title: t('wall.gradeB'),
          subtitle: t('wall.metaBSub'),
          total: stats.byStatus.B ?? 0,
          icon: <CheckCircle2 className="size-5" />,
          accent: 'bg-success',
          variant: 'percent',
          percent: Number(bPct.toFixed(1)),
          breakdown: b,
          onReport: () => openReport({ title: t('wall.gradeB'), subtitle: t('wall.metaBSub'), rows: reportRows(b), lang }),
        };
      }
      case 'pp': {
        const b = statusBreakdown(['PP']);
        return {
          title: t('cc.statusPP'),
          subtitle: t('wall.metaPPSub'),
          total: stats.byStatus.PP ?? 0,
          icon: <CalendarClock className="size-5" />,
          accent: 'bg-warning',
          variant: 'status',
          breakdown: b,
          onReport: () => openReport({ title: t('cc.statusPP'), subtitle: t('wall.metaPPSub'), rows: reportRows(b), lang }),
        };
      }
      default:
        return null;
    }
  };

  const data = metaCardData();

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">{t('wall.title')}</h1>
          <p className="text-sm text-muted-foreground">{t('wall.subtitle')}</p>
        </div>
      </div>

      {/* Section 1 — Insights: cards that open metadata + reports */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent text-white shadow-md">
            <Layers className="size-3.5" />
          </span>
          <h2 className="text-sm font-bold uppercase tracking-wider text-foreground">{t('wall.sectionInsights')}</h2>
          <span className="h-px flex-1 bg-primary/10" />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <WallCard
            icon={<Layers className="size-4" />}
            iconClass="bg-accent/10 text-accent"
            title={t('wall.totalRequests')}
            meta={t('wall.metaTotalSub')}
            glow="shadow-[0_8px_40px_-8px_rgba(201,109,87,0.12)]"
            actions={[
              { label: t('wall.viewBreakdown'), icon: <Layers className="size-3.5" />, onClick: () => setMetaCard('total') },
              { label: t('wall.export'), icon: <Printer className="size-3.5" />, onClick: () => setExportOpen(true) },
            ]}
          >
            <AnimateCount className="text-4xl font-bold text-foreground">{total}</AnimateCount>
          </WallCard>
          <WallCard
            icon={<FileText className="size-4" />}
            iconClass="bg-success/10 text-success"
            title={t('wall.loggedRequests')}
            meta={t('wall.metaLoggedSub')}
            glow="shadow-[0_8px_40px_-8px_rgba(84,122,97,0.12)]"
            actions={[
              { label: t('wall.viewBreakdown'), icon: <Layers className="size-3.5" />, onClick: () => setMetaCard('logged') },
              { label: t('wall.print'), icon: <Printer className="size-3.5" />, onClick: () => openReport({ title: t('wall.loggedRequests'), subtitle: t('wall.metaLoggedSub'), rows: reportRows(categoryBreakdown()), lang }) },
            ]}
          >
            <AnimateCount className="text-4xl font-bold text-foreground">{stats.byBucket.open ?? 0}</AnimateCount>
          </WallCard>
          <WallCard
            icon={<CheckCircle2 className="size-4" />}
            iconClass="bg-success/10 text-success border border-success/20"
            title={t('wall.gradeB')}
            meta={t('wall.metaBSub')}
            glow="shadow-[0_8px_40px_-8px_rgba(84,122,97,0.15)]"
            actions={[
              { label: t('wall.viewBreakdown'), icon: <Layers className="size-3.5" />, onClick: () => setMetaCard('b') },
              { label: t('wall.print'), icon: <Printer className="size-3.5" />, onClick: () => openReport({ title: t('wall.gradeB'), subtitle: t('wall.metaBSub'), rows: reportRows(categoryBreakdown()), lang }) },
            ]}
          >
            <RingGauge pct={Number(bPct.toFixed(1))} color="var(--success)" count={stats.byStatus.B ?? 0} label={t('cc.statusB')} />
          </WallCard>
          <WallCard
            icon={<CalendarClock className="size-4" />}
            iconClass="bg-warning/15 text-warning"
            title={t('cc.statusPP')}
            meta={t('wall.metaPPSub')}
            glow="shadow-[0_8px_40px_-8px_rgba(176,122,60,0.12)]"
            actions={[
              { label: t('wall.viewBreakdown'), icon: <Layers className="size-3.5" />, onClick: () => setMetaCard('pp') },
              { label: t('wall.print'), icon: <Printer className="size-3.5" />, onClick: () => openReport({ title: t('cc.statusPP'), subtitle: t('wall.metaPPSub'), rows: reportRows(statusBreakdown(['PP'])), lang }) },
            ]}
          >
            <AnimateCount className="text-4xl font-bold text-foreground">{stats.byStatus.PP ?? 0}</AnimateCount>
          </WallCard>
        </div>
      </div>

      {/* Section 2 — Workflow: cards that redirect to status pages */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent text-white shadow-md">
            <Workflow className="size-3.5" />
          </span>
          <h2 className="text-sm font-bold uppercase tracking-wider text-foreground">{t('wall.sectionWorkflow')}</h2>
          <span className="h-px flex-1 from-accent/10 to-transparent" />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <WallCard
            icon={<Inbox className="size-4" />}
            iconClass="bg-accent/10 text-accent"
            title={t('wall.pendingRequests')}
            meta={t('wall.metaPending')}
            glow="shadow-[0_8px_40px_-8px_rgba(201,109,87,0.12)]"
            actions={[
              { label: t('wall.openList'), icon: <List className="size-3.5" />, onClick: () => navigate('/requests/recorded/P') },
              { label: t('wall.print'), icon: <Printer className="size-3.5" />, onClick: () => openReport({ title: t('wall.pendingRequests'), subtitle: t('wall.metaPending'), rows: reportRows(statusBreakdown(['P'])), lang }) },
            ]}
          >
            <AnimateCount className="text-4xl font-bold text-foreground">{stats.byBucket.pending ?? 0}</AnimateCount>
          </WallCard>
          <WallCard
            icon={<CalendarClock className="size-4" />}
            iconClass="bg-muted text-muted-foreground"
            title={t('wall.onSchedule')}
            meta={t('wall.metaSC')}
            glow="shadow-[0_8px_40px_-8px_rgba(201,109,87,0.12)]"
            actions={[
              { label: t('wall.openList'), icon: <List className="size-3.5" />, onClick: () => navigate('/requests/recorded/SC') },
              { label: t('wall.print'), icon: <Printer className="size-3.5" />, onClick: () => openReport({ title: t('wall.onSchedule'), subtitle: t('wall.metaSC'), rows: reportRows(statusBreakdown(['SC'])), lang }) },
            ]}
          >
            <AnimateCount className="text-4xl font-bold text-foreground">{stats.byBucket.sc ?? 0}</AnimateCount>
          </WallCard>
          <WallCard
            icon={<Workflow className="size-4" />}
            iconClass="bg-warning/15 text-warning"
            title={t('wall.superSeeded')}
            meta={t('wall.metaSS')}
            glow="shadow-[0_8px_40px_-8px_rgba(176,122,60,0.12)]"
            actions={[
              { label: t('wall.openList'), icon: <List className="size-3.5" />, onClick: () => navigate('/requests/recorded/SS') },
              { label: t('wall.print'), icon: <Printer className="size-3.5" />, onClick: () => openReport({ title: t('wall.superSeeded'), subtitle: t('wall.metaSS'), rows: reportRows(statusBreakdown(['SS'])), lang }) },
            ]}
          >
            <AnimateCount className="text-4xl font-bold text-foreground">{stats.byBucket.superSeeded ?? 0}</AnimateCount>
          </WallCard>
        </div>
      </div>

      {ncrUrgent > 0 && (
        <Card className="border-destructive/30 bg-destructive/10 dark:border-destructive/30 dark:bg-destructive/10">
          <CardContent className="flex items-center gap-3 p-4">
            <AlertTriangle className="size-6 shrink-0 text-destructive dark:text-red-400" />
            <div className="min-w-0 flex-1">
              <div className="font-semibold text-destructive dark:text-destructive">
                {t('wall.ncrUrgent')} — {ncrUrgent}
              </div>
              <div className="text-sm text-destructive/80 dark:text-destructive/80">
                {t('wall.ncrUrgentHint')}
              </div>
            </div>
            <Button variant="outline" size="sm" className="border-destructive/30 text-destructive dark:border-destructive/30 dark:text-destructive" onClick={() => navigate('/requests?category=NCR')}>
              {t('nav.requests')}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Due-date reminders (ticket 086) — SC requests overdue or due soon */}
      {(() => {
        const rem = stats.reminders;
        const totalRem = (rem?.overdue.length ?? 0) + (rem?.dueSoon.length ?? 0);
        if (!rem || totalRem === 0) return null;
        const Row = ({ item, overdue }: { item: { category: string; request_no: string; description: string; due_date: string }; overdue: boolean }) => (
          <button
            type="button"
            onClick={() => navigate(`/requests/${encodeURIComponent(item.category)}/${encodeURIComponent(item.request_no)}`)}
            className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-1 text-start text-sm transition-colors hover:bg-card/40 dark:hover:bg-accent/[0.06]"
          >
            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${overdue ? 'bg-destructive' : 'bg-amber-400'}`} />
            <span className="truncate font-mono text-xs font-semibold text-foreground">
              {item.category} {item.request_no}
            </span>
            <span className="min-w-0 flex-1 truncate text-muted-foreground">{item.description || '—'}</span>
            <span className={`shrink-0 text-[11px] tabular-nums ${overdue ? 'font-semibold text-destructive dark:text-red-400' : 'text-amber-600 dark:text-amber-400'}`}>
              {item.due_date}
            </span>
          </button>
        );
        return (
          <Card className="border-warning/30 dark:border-warning/30">
            <CardContent className="flex flex-col gap-1 p-4">
              <div className="mb-1 flex items-center gap-2">
                <CalendarClock className="size-4 text-amber-600 dark:text-amber-400" />
                <span className="text-sm font-semibold text-foreground">{t('wall.reminders')}</span>
                <span className="h-px flex-1 from-warning/10 to-transparent" />
              </div>
              {rem.overdue.length > 0 && (
                <div className="flex flex-col">
                  <span className="px-2 text-[10px] font-bold uppercase tracking-wide text-red-500">{t('wall.remindersOverdue')}</span>
                  {rem.overdue.map((i) => <Row key={i.id} item={i} overdue />)}
                </div>
              )}
              {rem.dueSoon.length > 0 && (
                <div className="flex flex-col">
                  <span className="px-2 pt-1 text-[10px] font-bold uppercase tracking-wide text-warning">{t('wall.remindersDueSoon')}</span>
                  {rem.dueSoon.map((i) => <Row key={i.id} item={i} overdue={false} />)}
                </div>
              )}
            </CardContent>
          </Card>
        );
      })()}

      <WallMetaCard
        open={data !== null}
        title={data?.title ?? ''}
        subtitle={data?.subtitle ?? ''}
        total={data?.total ?? 0}
        icon={data?.icon ?? <Inbox className="size-5" />}
        accentClass={data?.accent ?? 'bg-accent'}
        variant={data?.variant ?? 'category'}
        percent={data?.percent ?? 0}
        breakdown={data?.breakdown ?? []}
        onClose={() => setMetaCard(null)}
        onReport={data?.onReport}
        meta={meta}
        engineers={engineers}
      />

      {/* Wall export (ticket 133) — Total card opens this in Export (full) mode */}
      <WallReportDialog open={exportOpen} onClose={() => setExportOpen(false)} initialMode="full" />
    </div>
  );
}