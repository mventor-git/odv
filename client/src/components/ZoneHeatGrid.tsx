import { useState, useMemo, type ReactNode } from 'react';
import { useI18n } from '@/lib/i18n';
import { Search } from 'lucide-react';

/** Zone Heat Grid — tiles per zone, intensity = request count.
 *  Warm muted Claude + search + filters inside the card (other than zones). */
export function ZoneHeatGrid({
  zones,
  counts,
  onSelect,
}: {
  zones: Array<{ code: string; name: string; nameAr?: string }>;
  counts?: Record<string, number>;
  onSelect: (zone: string) => void;
}): ReactNode {
  const { t, lang } = useI18n();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<'all' | 'has' | 'empty'>('all');
  const safe = counts ?? {};
  const max = Math.max(1, ...zones.map((z) => safe[z.code] ?? 0));

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return zones.filter((z) => {
      const n = safe[z.code] ?? 0;
      if (filter === 'has' && n === 0) return false;
      if (filter === 'empty' && n !== 0) return false;
      if (!qq) return true;
      const hay = `${z.code} ${z.name} ${z.nameAr ?? ''}`.toLowerCase();
      return hay.includes(qq);
    });
  }, [zones, safe, q, filter]);

  const intensity = (n: number): string => {
    if (n === 0) return 'bg-muted/40 text-muted-foreground';
    const f = n / max;
    if (f >= 0.75) return 'bg-accent text-accent-foreground shadow-accent/20';
    if (f >= 0.5) return 'bg-accent/60 text-accent-foreground';
    if (f >= 0.25) return 'bg-accent/30 text-accent';
    return 'bg-accent/15 text-accent';
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Search + filters inside the zone card (other than zones) */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[160px]">
          <Search className="pointer-events-none absolute start-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t('records.search') ?? 'Search zones...'}
            className="h-8 w-full rounded-lg border border-border bg-card ps-7 pe-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
        <div className="flex overflow-hidden rounded-lg border border-border text-xs font-medium">
          <button type="button" onClick={() => setFilter('all')} className={`px-2.5 py-1.5 transition-colors ${filter === 'all' ? 'bg-accent text-white' : 'hover:bg-muted'}`}>{t('checklist.all') ?? 'All'}</button>
          <button type="button" onClick={() => setFilter('has')} className={`px-2.5 py-1.5 transition-colors ${filter === 'has' ? 'bg-accent text-white' : 'hover:bg-muted'}`}>{lang === 'ar' ? 'بها طلبات' : 'Has records'}</button>
          <button type="button" onClick={() => setFilter('empty')} className={`px-2.5 py-1.5 transition-colors ${filter === 'empty' ? 'bg-accent text-white' : 'hover:bg-muted'}`}>{lang === 'ar' ? 'فارغة' : 'Empty'}</button>
        </div>
        <span className="text-xs text-muted-foreground">{filtered.length}/{zones.length}</span>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-8">
        {filtered.length === 0 ? (
          <div className="col-span-full rounded-lg border border-dashed border-border p-4 text-center text-sm text-muted-foreground">{t('records.noResults')}</div>
        ) : (
          filtered.map((z) => {
            const n = safe[z.code] ?? 0;
            return (
              <button
                key={z.code}
                type="button"
                onClick={() => onSelect(z.code)}
                className={`flex flex-col items-center gap-0.5 rounded-xl border border-border/50 px-2 py-3 text-center shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md hover:border-accent/30 active:scale-95 ${intensity(n)}`}
                title={`${z.name} — ${n}`}
              >
                <span className="text-sm font-bold">{z.code}</span>
                <span className="truncate text-[10px] opacity-80">{lang === 'ar' && z.nameAr ? z.nameAr : z.name}</span>
                <span className="text-lg font-bold tabular-nums">{n}</span>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}