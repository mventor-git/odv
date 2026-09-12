import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { usePersistentState } from '@/lib/usePersistentState';
import type { DcRecord, Meta, RecordsResponse } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { RecordTable } from '@/components/RecordTable';
import { RequestCard } from '@/components/RequestCard';
import { getDefaultRequest } from '@/pages/SettingsPage';
import { floorDisplay, zoneDisplay } from '@/lib/format';

const PAGE_SIZE = 50;

interface Filters {
  category: string;
  status: string;
  zone: string;
  floor: string;
  fork: string;
  engineer: string;
  q: string;
  cluster: string;
}

const EMPTY_FILTERS: Filters = {
  category: '',
  status: '',
  zone: '',
  floor: '',
  fork: '',
  engineer: '',
  q: '',
  cluster: '',
};

export function RecordsPage(): ReactNode {
  const { t, lang } = useI18n();
  const [meta, setMeta] = useState<Meta | null>(null);
  const [records, setRecords] = useState<DcRecord[]>([]);
  const [total, setTotal] = useState(0);
  // v3 item 18 — filters/offset/sort survive refresh & resize (localStorage).
  const [offset, setOffset] = usePersistentState('records_offset', 0);
  const [filters, setFilters] = usePersistentState<Filters>('records_filters', {
    ...EMPTY_FILTERS,
  });
  const [error, setError] = useState('');
  const [engineers, setEngineers] = useState<string[]>([]);
  const [sortDir, setSortDir] = usePersistentState<'asc' | 'desc'>('records_sort', 'asc');
  const [card, setCard] = useState<{ category: string; requestNo: string; revisionId?: number } | null>(null);
  // URL params (e.g. from a Wall drill-down "View all" link) seed the filters.
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    api<Meta>('/api/meta').then(setMeta).catch(() => undefined);
    api<{ engineers: string[] }>('/api/records/engineers')
      .then((r) => setEngineers(r.engineers))
      .catch(() => undefined);
  }, []);

  // Apply incoming URL filters once on mount (ticket 120) — merge over stored
  // filters so a drill-down "View all" link actually narrows the page.
  useEffect(() => {
    if (searchParams.toString() === '') return;
    const next: Filters = { ...EMPTY_FILTERS };
    for (const key of ['category', 'status', 'zone', 'floor', 'fork', 'engineer', 'cluster', 'q'] as const) {
      const v = searchParams.get(key);
      if (v) next[key] = v;
    }
    setFilters(next);
    setOffset(0);
    setSearchParams({}, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Apply the Settings default request (category + fork) when no filter is applied yet.
  useEffect(() => {
    const def = getDefaultRequest();
    if (def.category) {
      setFilters((prev) =>
        prev.category ? prev : { ...prev, category: def.category, fork: def.fork },
      );
    }
  }, []);

  const load = useCallback(async (f: Filters, off: number, sort: 'asc' | 'desc'): Promise<void> => {
    try {
      const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(off), sort });
      if (f.category) params.set('category', f.category);
      if (f.status) params.set('status', f.status);
      if (f.cluster) params.set('cluster', f.cluster);
      if (f.zone) params.set('zone', f.zone);
      if (f.floor) params.set('floor', f.floor);
      if (f.fork) params.set('fork', f.fork);
      if (f.engineer) params.set('engineer', f.engineer);
      if (f.q.trim()) params.set('q', f.q.trim());
      const res = await api<RecordsResponse>(`/api/records?${params.toString()}`);
      setRecords(res.items);
      setTotal(res.total);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    void load(filters, offset, sortDir);
  }, [load, filters, offset, sortDir]);

  const setFilter = (key: keyof Filters, value: string): void => {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setOffset(0);
  };

  const resetFilters = (): void => {
    setFilters(EMPTY_FILTERS);
    setOffset(0);
  };

  const pages = useMemo(() => Math.max(1, Math.ceil(total / PAGE_SIZE)), [total]);
  const page = Math.floor(offset / PAGE_SIZE) + 1;

  const forks = useMemo(() => {
    const cat = meta?.categories.find((c) => c.code === filters.category);
    return cat ? cat.forks : [];
  }, [meta, filters.category]);

  /** Zones grouped by cluster (ticket 038) — all zones belong to Cluster 12. */
  const zoneGroups = useMemo(() => {
    const groups = new Map<string, NonNullable<Meta['zones']>>();
    for (const z of meta?.zones ?? []) {
      const key = z.cluster ?? '';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(z);
    }
    return [...groups.entries()];
  }, [meta]);

  const clusterName = (code: string): string =>
    meta?.zones.find((z) => z.code === code)?.name ?? code;

  const changeZone = (v: string): void => {
    if (v === '__CL12') {
      setFilters((prev) => ({ ...prev, cluster: 'CL12', zone: '' }));
    } else {
      setFilters((prev) => ({ ...prev, cluster: '', zone: v }));
    }
    setOffset(0);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-foreground">{t('records.title')}</h1>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-border/70 bg-card p-0.5">
            <button
              onClick={() => setSortDir('asc')}
              className={`rounded-md px-3 py-1 text-sm font-medium transition-colors ${
                sortDir === 'asc' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}
              title={t('records.sortAsc')}
            >
              ↑ {t('records.sortAsc')}
            </button>
            <button
              onClick={() => setSortDir('desc')}
              className={`rounded-md px-3 py-1 text-sm font-medium transition-colors ${
                sortDir === 'desc' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}
              title={t('records.sortDesc')}
            >
              ↓ {t('records.sortDesc')}
            </button>
          </div>
        </div>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-7">
            <div>
              <Label>{t('field.category')}</Label>
              <Select value={filters.category} onChange={(e) => setFilter('category', e.target.value)}>
                <option value="">{t('records.filters')}</option>
                {meta?.categories.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.code} — {c.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>{t('records.search')}</Label>
              <Input
                value={filters.q}
                placeholder={t('records.search')}
                onChange={(e) => setFilter('q', e.target.value)}
              />
            </div>
            {filters.category !== '' && (
              <>
                {forks.length > 0 && (
                  <div>
                    <Label>{t('field.fork')}</Label>
                    <Select value={filters.fork} onChange={(e) => setFilter('fork', e.target.value)}>
                      <option value="">{t('records.filters')}</option>
                      {forks.map((f) => (
                        <option key={f} value={f}>
                          {f}
                        </option>
                      ))}
                    </Select>
                  </div>
                )}
                <div>
                  <Label>{t('field.status')}</Label>
                  <Select value={filters.status} onChange={(e) => setFilter('status', e.target.value)}>
                    <option value="">{t('records.filters')}</option>
                    {meta?.statuses.map((s) => (
                      <option key={s.code} value={s.code}>
                        {s.code} — {s.slogan}
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <Label>{t('field.zone')}</Label>
                  <Select
                    value={filters.cluster ? '__CL12' : filters.zone}
                    onChange={(e) => changeZone(e.target.value)}
                  >
                    <option value="">{t('records.filters')}</option>
                    <option value="__CL12">{t('field.clusterAll')}</option>
                    {zoneGroups.map(([cluster, zones]) => (
                      <optgroup key={cluster} label={clusterName(cluster)}>
                        {zones.map((z) => (
                          <option key={z.code} value={z.code}>
                            {z.code} — {zoneDisplay(z, lang)}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </Select>
                </div>
                <div>
                  <Label>{t('field.cluster')}</Label>
                  <Select value={filters.cluster} onChange={(e) => setFilter('cluster', e.target.value)}>
                    <option value="">{t('records.filters')}</option>
                    {zoneGroups.map(([cluster, zones]) => (
                      <option key={cluster} value={cluster}>
                        {cluster} — {zones.map((z) => z.code).join(', ')}
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <Label>{t('field.floor')}</Label>
                  <Select value={filters.floor} onChange={(e) => setFilter('floor', e.target.value)}>
                    <option value="">{t('records.filters')}</option>
                    {meta?.floors.map((f) => (
                      <option key={f} value={f}>
                        {floorDisplay(f, lang, meta.floorNamesAr)}
                      </option>
                    ))}
                  </Select>
                </div>
                {engineers.length > 0 && (
                  <div>
                    <Label>{t('field.engineer')}</Label>
                    <Select value={filters.engineer} onChange={(e) => setFilter('engineer', e.target.value)}>
                      <option value="">{t('records.filters')}</option>
                      {engineers.map((e) => (
                        <option key={e} value={e}>
                          {e}
                        </option>
                      ))}
                    </Select>
                  </div>
                )}
              </>
            )}
            <div className="flex items-end">
              <Button variant="outline" className="w-full" onClick={resetFilters}>
                ✕
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {error && <div className="text-sm text-destructive">{error}</div>}

      {records.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            {t('records.noResults')}
          </CardContent>
        </Card>
      ) : (
        <RecordTable
          records={records}
          meta={meta}
          category={filters.category}
          onOpen={(cat, no, revisionId) => setCard({ category: cat, requestNo: no, revisionId })}
        />
      )}

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          {total} {t('records.total')} — {t('records.filters')} {page}/{pages}
        </span>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={offset === 0}
            onClick={() => setOffset((o) => Math.max(0, o - PAGE_SIZE))}
          >
            {t('records.prev')}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={offset + PAGE_SIZE >= total}
            onClick={() => setOffset((o) => o + PAGE_SIZE)}
          >
            {t('records.next')}
          </Button>
        </div>
      </div>

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
