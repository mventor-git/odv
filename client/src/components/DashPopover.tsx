import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import type { DcRecord, Meta, RecordsResponse } from '@/lib/types';
import { StatusBadge } from '@/components/StatusBadge';
import { Select } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Loader2, MousePointerClick } from 'lucide-react';
import { zoneDisplay, floorDisplay } from '@/lib/format';

type FilterKey = 'status' | 'zone' | 'category' | 'floor' | 'fork' | 'engineer';

interface DashPopoverFilter {
  status?: string;
  zone?: string;
  category?: string;
}

/** Dashboard popover (ticket 090 + contextual filters, mventor-ticket-120 style).
 *  Animated modal with the matching records as compact cards. The card already
 *  fixes one dimension (status / zone / category) and offers the rest as a
 *  contextual filter bar, so the user can narrow the list without navigating. */
export function DashPopover({
  open,
  title,
  filter,
  meta,
  engineers = [],
  onClose,
  onOpenRecord,
}: {
  open: boolean;
  title: string;
  filter: DashPopoverFilter;
  meta?: Meta | null;
  engineers?: string[];
  onClose: () => void;
  onOpenRecord: (category: string, requestNo: string, revisionId?: number) => void;
}): ReactNode {
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const [records, setRecords] = useState<DcRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [busy, setBusy] = useState(false);
  // Extra filters the user can apply inside the popover (everything except the
  // dimension this card already represents).
  const [extras, setExtras] = useState<Partial<Record<FilterKey, string>>>({});

  // The dimension this popover already fixes.
  const fixedField: FilterKey | null = filter.status
    ? 'status'
    : filter.zone
      ? 'zone'
      : filter.category
        ? 'category'
        : null;

  // Reset extras whenever a different popover opens.
  useEffect(() => {
    setExtras({});
  }, [filter.status, filter.zone, filter.category]);

  // Fork options: the (implied) category's forks, else the union of all.
  const forkOptions = useMemo(() => {
    const catCode = filter.category ?? extras.category;
    if (catCode) {
      return meta?.categories.find((c) => c.code === catCode)?.forks ?? [];
    }
    const all = new Set<string>();
    for (const c of meta?.categories ?? []) for (const f of c.forks) all.add(f);
    return [...all];
  }, [meta, filter.category, extras.category]);

  // Merge the base (card) filter with the user's extra filters.
  const merged = useMemo(() => {
    const m: Partial<Record<FilterKey, string>> = {};
    if (filter.status) m.status = filter.status;
    if (filter.zone) m.zone = filter.zone;
    if (filter.category) m.category = filter.category;
    for (const k of ['status', 'zone', 'category', 'floor', 'fork', 'engineer'] as FilterKey[]) {
      const v = extras[k];
      if (v) m[k] = v;
    }
    return m;
  }, [filter, extras]);

  const queryString = useMemo(() => {
    const sp = new URLSearchParams({ limit: '50' });
    for (const [k, v] of Object.entries(merged)) sp.set(k, v as string);
    return sp.toString();
  }, [merged]);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    setBusy(true);
    api<RecordsResponse>(`/api/records?${queryString}`)
      .then((res) => {
        if (!alive) return;
        setRecords(res.items);
        setTotal(res.total);
      })
      .catch(() => undefined)
      .finally(() => {
        if (alive) setBusy(false);
      });
    return () => {
      alive = false;
    };
  }, [open, queryString]);

  const setExtra = (key: FilterKey, value: string): void => {
    setExtras((prev) => ({ ...prev, [key]: value }));
  };

  // The selectable filters for this popover (exclude the fixed dimension).
  const offered: FilterKey[] = (['status', 'zone', 'category', 'floor', 'fork', 'engineer'] as FilterKey[]).filter(
    (k) => k !== fixedField,
  );

  const renderSelect = (key: FilterKey): ReactNode => {
    if (key === 'fork' && forkOptions.length === 0) return null;
    if (key === 'engineer' && engineers.length === 0) return null;
    return (
      <div key={key} className="flex flex-col gap-0.5">
        <Label className="text-[10px] font-medium text-muted-foreground">{t(`field.${key}`)}</Label>
        <Select value={extras[key] ?? ''} onChange={(e) => setExtra(key, e.target.value)} className="h-8 text-xs">
          <option value="">{t('records.filters')}</option>
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
          {key === 'category' &&
            meta?.categories.map((c) => (
              <option key={c.code} value={c.code}>
                {c.code} — {c.name}
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
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            {title}
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">{busy ? '…' : total}</span>
          </DialogTitle>
        </DialogHeader>
        <div className="-mt-1 flex flex-col gap-3 px-6 pb-6">
          <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
            {offered.map((k) => renderSelect(k))}
          </div>
          <div className="flex max-h-[50vh] flex-col gap-2 overflow-y-auto">
            {busy && (
              <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                {t('common.loading')}
              </div>
            )}
            {!busy && records.length === 0 && (
              <div className="flex flex-col items-center gap-2 py-10 text-center text-muted-foreground">
                <MousePointerClick className="size-7 opacity-50" />
                <span className="text-sm">{t('records.noResults')}</span>
              </div>
            )}
            {!busy &&
              records.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => onOpenRecord(r.category, r.requestNo, r.id)}
                  className="glass-card flex items-center gap-3 rounded-xl p-3 text-start transition-all hover:-translate-y-0.5 hover:border-primary/40 active:scale-[0.99]"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-bold text-foreground">
                        {r.category} {r.requestNo}
                      </span>
                      <span className="font-mono text-xs text-muted-foreground">rev {r.revisionNo}</span>
                    </div>
                    <div className="truncate text-xs text-muted-foreground">{r.description || '—'}</div>
                    <div className="mt-0.5 text-[11px] text-muted-foreground">
                      {[r.zone, r.floor, r.fork].filter(Boolean).join(' · ') || '—'}
                    </div>
                  </div>
                  <StatusBadge status={r.status} />
                </button>
              ))}
          </div>
          {records.length > 0 && (
            <button
              type="button"
              onClick={() => navigate(viewAllQuery ? `/requests/records?${viewAllQuery}` : '/requests/records')}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary transition-colors hover:bg-primary/20"
            >
              {t('wall.viewAll')}
              <span aria-hidden>→</span>
            </button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
