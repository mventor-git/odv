import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import type { LegacyRowInfo, LegacyRowsResponse, LegacySourceInfo } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

const PAGE = 50;

export function LegacyPage(): ReactNode {
  const { t } = useI18n();
  const [sources, setSources] = useState<LegacySourceInfo[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [rows, setRows] = useState<LegacyRowInfo[]>([]);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState('');
  const [offset, setOffset] = useState(0);
  const [error, setError] = useState('');

  useEffect(() => {
    api<LegacySourceInfo[]>('/api/legacy')
      .then(setSources)
      .catch(() => setSources([]));
  }, []);

  const load = useCallback(async (key: string, query: string, off: number): Promise<void> => {
    setError('');
    try {
      const params = new URLSearchParams({ limit: String(PAGE), offset: String(off) });
      if (query.trim()) params.set('q', query.trim());
      const res = await api<LegacyRowsResponse>(
        `/api/legacy/${encodeURIComponent(key)}?${params.toString()}`,
      );
      setRows(res.items);
      setTotal(res.total);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setRows([]);
      setTotal(0);
    }
  }, []);

  const open = (key: string): void => {
    setActive(key);
    setQ('');
    setOffset(0);
    void load(key, '', 0);
  };

  const search = (query: string): void => {
    setQ(query);
    setOffset(0);
    if (active) void load(active, query, 0);
  };

  const columns = rows.length > 0 ? Object.keys(rows[0].data) : [];

  if (!active) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-semibold text-foreground">{t('legacy.title')}</h1>
        <p className="text-sm text-muted-foreground">{t('legacy.subtitle')}</p>
        {sources.length === 0 && (
          <Card>
            <CardContent className="p-8 text-center text-muted-foreground">{t('legacy.empty')}</CardContent>
          </Card>
        )}
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {sources.map((s) => (
            <Card key={s.key} className="cursor-pointer transition-shadow hover:shadow-md">
              <CardHeader>
                <CardTitle>{s.display}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">
                    {s.rows} {t('legacy.rows')}
                    {s.sheets ? ` · ${s.sheets.split('|').length} ${t('legacy.sheets')}` : ''}
                  </span>
                  <Button size="sm" variant="secondary" onClick={() => open(s.key)}>
                    {t('legacy.open')}
                  </Button>
                </div>
                {s.sweptAt && (
                  <div className="mt-1 text-xs text-muted-foreground">
                    {t('legacy.sweptAt')}: {s.sweptAt}
                  </div>
                )}
                {s.note && <div className="mt-1 text-xs text-amber-600">{s.note}</div>}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  const source = sources.find((s) => s.key === active);
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const page = Math.floor(offset / PAGE) + 1;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">{source?.display}</h1>
          <div className="text-sm text-muted-foreground">
            {total} {t('legacy.rows')} — {source?.sheets.split('|').join(', ')}
          </div>
        </div>
        <Button variant="outline" onClick={() => setActive(null)}>
          {t('legacy.back')}
        </Button>
      </div>

      <Card>
        <CardContent className="p-4">
          <Input
            value={q}
            placeholder={t('legacy.search')}
            onChange={(e) => search(e.target.value)}
          />
        </CardContent>
      </Card>

      {error && <div className="text-sm text-destructive">{error}</div>}

      {rows.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">{t('legacy.empty')}</CardContent>
        </Card>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((c) => (
                <TableHead key={c}>{c}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id}>
                {columns.map((c) => (
                  <TableCell key={c} className="max-w-[14rem] truncate text-muted-foreground">
                    {r.data[c] || '—'}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          {t('legacy.rows')} {page}/{pages}
        </span>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={offset === 0}
            onClick={() => {
              const next = Math.max(0, offset - PAGE);
              setOffset(next);
              void load(active, q, next);
            }}
          >
            {t('records.prev')}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={offset + PAGE >= total}
            onClick={() => {
              const next = offset + PAGE;
              setOffset(next);
              void load(active, q, next);
            }}
          >
            {t('records.next')}
          </Button>
        </div>
      </div>
    </div>
  );
}
