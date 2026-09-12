import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useI18n } from '@/lib/i18n';
import { api } from '@/lib/api';
import type { DcRecord, Meta, RecordsResponse } from '@/lib/types';
import { AppIcon } from '@/icons/AppIcon';
import { StatusBadge } from '@/components/StatusBadge';
import { Select } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { padRequestNo, padRevisionNo, zoneDisplay, floorDisplay } from '@/lib/format';
import type { MetaBreakdown } from '@/components/WallMetaCard';

type DrillFilterKey = 'category' | 'status' | 'zone' | 'floor' | 'fork' | 'engineer';

interface NestedDrillDownProps {
  criteria: MetaBreakdown;
  /** Reference data for building the contextual filter options (ticket 120). */
  meta?: Meta | null;
  /** Distinct engineer names for the engineer filter. */
  engineers?: string[];
  onClose: () => void;
}

/**
 * Nested drill-down card (ticket 114 + 120) — shows the requests matching a
 * clicked breakdown criteria as a mini log, with a **contextual filter bar**
 * (ticket 120) that lets the user narrow the list inside the card. The live
 * preview and the "View all" link both respect the combined filters.
 */
export function NestedDrillDown({ criteria, meta, engineers = [], onClose }: NestedDrillDownProps): ReactNode {
  const { t, lang } = useI18n();
  const navigate = useNavigate();

  // The field the card already fixes (from its own breakdown criteria).
  const fixedField: DrillFilterKey | null = criteria.filter?.status
    ? 'status'
    : criteria.filter?.category
      ? 'category'
      : criteria.filter?.zone
        ? 'zone'
        : null;

  // Extra filters the user can apply inside the card (everything except the
  // field this card already represents).
  const [extras, setExtras] = useState<Partial<Record<DrillFilterKey, string>>>({});
  const [requests, setRequests] = useState<DcRecord[]>([]);
  const [busy, setBusy] = useState(true);

  // Reset extra filters whenever a different breakdown card is opened.
  useEffect(() => {
    setExtras({});
  }, [criteria.label]);

  // Fork options: the selected/implied category's forks, else the union of all.
  const forkOptions = useMemo(() => {
    const catCode = criteria.filter?.category ?? extras.category;
    if (catCode) {
      return meta?.categories.find((c) => c.code === catCode)?.forks ?? [];
    }
    const all = new Set<string>();
    for (const c of meta?.categories ?? []) for (const f of c.forks) all.add(f);
    return [...all];
  }, [meta, criteria.filter?.category, extras.category]);

  // Merge base (card) filters with the user's extra filters.
  const merged = useMemo(() => {
    const m: Partial<Record<DrillFilterKey, string>> = {};
    if (criteria.filter?.status) m.status = criteria.filter.status;
    if (criteria.filter?.category) m.category = criteria.filter.category;
    if (criteria.filter?.zone) m.zone = criteria.filter.zone;
    for (const k of ['category', 'status', 'zone', 'floor', 'fork', 'engineer'] as DrillFilterKey[]) {
      const v = extras[k];
      if (v) m[k] = v;
    }
    return m;
  }, [criteria.filter, extras]);

  const queryString = useMemo(() => {
    const sp = new URLSearchParams({ limit: '20' });
    for (const [k, v] of Object.entries(merged)) sp.set(k, v as string);
    return sp.toString();
  }, [merged]);

  // Live fetch of the (filtered) preview list.
  useEffect(() => {
    let alive = true;
    setBusy(true);
    api<RecordsResponse>(`/api/records?${queryString}`)
      .then((res) => {
        if (alive) setRequests(res.items);
      })
      .catch(() => {
        if (alive) setRequests([]);
      })
      .finally(() => {
        if (alive) setBusy(false);
      });
    return () => {
      alive = false;
    };
  }, [queryString]);

  const setExtra = (key: DrillFilterKey, value: string): void => {
    setExtras((prev) => ({ ...prev, [key]: value }));
  };

  // The selectable filters for this card (exclude the fixed one).
  const offered: DrillFilterKey[] = (['category', 'status', 'zone', 'floor', 'fork', 'engineer'] as DrillFilterKey[]).filter(
    (k) => k !== fixedField,
  );

  const renderSelect = (key: DrillFilterKey): ReactNode => {
    if (key === 'fork' && forkOptions.length === 0) return null;
    if (key === 'engineer' && engineers.length === 0) return null;
    return (
      <div key={key} className="flex flex-col gap-0.5">
        <Label className="text-[10px] font-medium text-muted-foreground">{t(`field.${key}`)}</Label>
        <Select value={extras[key] ?? ''} onChange={(e) => setExtra(key, e.target.value)} className="h-8 text-xs">
          <option value="">{t('records.filters')}</option>
          {key === 'category' &&
            meta?.categories.map((c) => (
              <option key={c.code} value={c.code}>
                {c.code} — {c.name}
              </option>
            ))}
          {key === 'status' &&
            meta?.statuses.map((s) => (
              <option key={s.code} value={s.code}>
                {s.code} — {s.slogan}
              </option>
            ))}
          {key === 'zone' &&
            meta?.zones.map((z) => (
              <option key={z.code} value={z.code}>
                {z.code} — {zoneDisplay(z, lang)}
              </option>
            ))}
          {key === 'floor' &&
            meta?.floors.map((f) => (
              <option key={f} value={f}>
                {floorDisplay(f, lang, meta.floorNamesAr)}
              </option>
            ))}
          {key === 'fork' &&
            forkOptions.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          {key === 'engineer' &&
            engineers.map((e) => (
              <option key={e} value={e}>
                {e}
              </option>
            ))}
        </Select>
      </div>
    );
  };

  const viewAllQuery = useMemo(() => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(merged)) sp.set(k, v as string);
    return sp.toString();
  }, [merged]);

  return (
    <div className="rounded-xl border border-accent/30 bg-card p-3 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-foreground">{criteria.label}</div>
          <div className="text-xs text-muted-foreground">
            {criteria.value} {t('wall.requests')}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={t('form.cancel')}
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <AppIcon name="close" className="size-3.5" />
        </button>
      </div>

      <div className="mt-2 grid grid-cols-2 gap-2 md:grid-cols-3">
        {offered.map((k) => renderSelect(k))}
      </div>

      <div className="mt-2 flex max-h-72 flex-col gap-1.5 overflow-y-auto">
        {busy && (
          <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
            <AppIcon name="loader" className="size-4 animate-spin" />
            {t('common.loading')}
          </div>
        )}
        {!busy && requests.length === 0 && (
          <div className="py-4 text-center text-sm text-muted-foreground">{t('records.noResults')}</div>
        )}
        {!busy &&
          requests.slice(0, 20).map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => navigate(`/requests/${encodeURIComponent(r.category)}/${encodeURIComponent(r.requestNo)}`)}
              className="flex items-center gap-2 rounded-lg border border-border/60 bg-card/60 px-2.5 py-2 text-start transition-all hover:-translate-y-0.5 hover:border-accent/30 hover:shadow-sm"
            >
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="font-mono text-xs font-bold text-foreground">{padRequestNo(r.requestNo)}</span>
                  <span className="font-mono text-[10px] text-muted-foreground">rev {padRevisionNo(r.revisionNo)}</span>
                </span>
                <span className="mt-0.5 block truncate text-xs text-muted-foreground">{r.description || '—'}</span>
                <span className="mt-0.5 block text-[11px] text-muted-foreground">
                  {[r.zone, r.floor, r.sentDate].filter(Boolean).join(' · ') || '—'}
                </span>
              </span>
              <StatusBadge status={r.status} />
            </button>
          ))}
      </div>

      {requests.length > 0 && (
        <button
          type="button"
          onClick={() => navigate(viewAllQuery ? `/requests/records?${viewAllQuery}` : '/requests/records')}
          className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg bg-accent/10 px-3 py-1.5 text-xs font-semibold text-accent transition-colors hover:bg-accent/20"
        >
          {t('wall.viewAll')}
          <span aria-hidden>→</span>
        </button>
      )}
    </div>
  );
}
