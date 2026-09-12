import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { sound } from '@/lib/sound';
import { useIsMobile } from '@/lib/useIsMobile';
import type { DcRecord, RecordsResponse } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { TrashListDesktop } from '@/components/TrashListDesktop';
import { TrashListMobile } from '@/components/TrashListMobile';
import { PurgeConfirmDialog } from '@/components/PurgeConfirmDialog';
import { Bell, Loader2, RotateCcw, Trash2 } from 'lucide-react';

const PAGE_SIZE = 50;

interface TrashedNotify {
  id: number;
  title: string;
  body: string;
  fromUser: string;
  toUser: string;
  status: string;
  deletedAt: string;
}

/** Hidden Trash page — soft-deleted records, restore or purge (ticket 031). */
export function TrashPage(): ReactNode {
  const { t } = useI18n();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin' || user?.role === 'dev';
  const isMobile = useIsMobile();
  const [rows, setRows] = useState<DcRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState('');
  const [offset, setOffset] = useState(0);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [purgeTarget, setPurgeTarget] = useState<DcRecord | null>(null);
  const [notifItems, setNotifItems] = useState<TrashedNotify[]>([]);
  const [notifBusy, setNotifBusy] = useState<number | null>(null);

  const loadNotifs = useCallback(async (): Promise<void> => {
    try {
      const res = await api<{ items: TrashedNotify[] }>('/api/notify/trash');
      setNotifItems(res.items ?? []);
    } catch {
      setNotifItems([]);
    }
  }, []);

  useEffect(() => {
    void loadNotifs();
  }, [loadNotifs]);

  const restoreNotify = async (n: TrashedNotify): Promise<void> => {
    setNotifBusy(n.id);
    setError('');
    try {
      await api(`/api/notify/${n.id}/restore`, { method: 'POST' });
      sound.success();
      setNotifItems((prev) => prev.filter((x) => x.id !== n.id));
    } catch (err) {
      sound.error();
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setNotifBusy(null);
    }
  };

  const purgeNotify = async (n: TrashedNotify): Promise<void> => {
    if (!window.confirm(t('trash.notifyPurgeConfirm'))) return;
    setNotifBusy(n.id);
    setError('');
    try {
      await api(`/api/notify/${n.id}/purge`, { method: 'DELETE' });
      sound.success();
      setNotifItems((prev) => prev.filter((x) => x.id !== n.id));
    } catch (err) {
      sound.error();
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setNotifBusy(null);
    }
  };

  const load = useCallback(async (query: string, off: number): Promise<void> => {
    setError('');
    try {
      const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(off) });
      if (query.trim()) params.set('q', query.trim());
      const res = await api<RecordsResponse>(`/api/trash?${params.toString()}`);
      setRows(res.items);
      setTotal(res.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setRows([]);
      setTotal(0);
    }
  }, []);

  useEffect(() => {
    void load(q, offset);
  }, [load, q, offset]);

  const search = (query: string): void => {
    setQ(query);
    setOffset(0);
  };

  const restore = async (r: DcRecord): Promise<void> => {
    setMsg('');
    try {
      await api(`/api/trash/${r.id}/restore`, { method: 'POST' });
      sound.success();
      setMsg('OK');
      void load(q, offset);
    } catch (err) {
      sound.error();
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const purge = async (r: DcRecord): Promise<void> => {
    setMsg('');
    try {
      const res = await api<{ ok: boolean; metadataFile?: string }>(`/api/trash/${r.id}`, {
        method: 'DELETE',
      });
      sound.success();
      setMsg(res.metadataFile ? `${t('trash.purgedWithFile')}: ${res.metadataFile}` : 'OK');
      setPurgeTarget(null);
      void load(q, offset);
    } catch (err) {
      sound.error();
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.floor(offset / PAGE_SIZE) + 1;
  const timeLabel = (iso: string): string => {
    if (!iso) return '';
    const d = new Date(iso.replace(' ', 'T') + 'Z');
    return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
  };

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">{t('trash.title')}</h1>
        <p className="text-sm text-muted-foreground">{t('trash.subtitle')}</p>
      </div>

      <Card>
        <CardContent className="p-4">
          <Input
            value={q}
            placeholder={t('trash.search')}
            onChange={(e) => search(e.target.value)}
          />
        </CardContent>
      </Card>

      {msg && <div className="text-sm text-success">{msg}</div>}
      {error && <div className="text-sm text-destructive">{error}</div>}

      {rows.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">{t('trash.empty')}</CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            {isMobile ? (
              <div className="p-3">
                <TrashListMobile
                  rows={rows}
                  isAdmin={isAdmin}
                  t={t}
                  timeLabel={timeLabel}
                  onRestore={(r) => void restore(r)}
                  onPurge={(r) => setPurgeTarget(r)}
                />
              </div>
            ) : (
              <TrashListDesktop
                rows={rows}
                isAdmin={isAdmin}
                t={t}
                timeLabel={timeLabel}
                onRestore={(r) => void restore(r)}
                onPurge={(r) => setPurgeTarget(r)}
              />
            )}
          </CardContent>
        </Card>
      )}

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          {total} {t('records.total')} — {page}/{pages}
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

      <Card>
        <CardContent className="p-4">
          <div className="mb-2 flex items-center gap-2">
            <Bell className="size-4 text-accent" />
            <h2 className="text-sm font-semibold text-foreground">{t('trash.notifyTitle')}</h2>
          </div>
          {notifItems.length === 0 ? (
            <div className="py-4 text-center text-sm text-muted-foreground">{t('trash.notifyEmpty')}</div>
          ) : (
            <div className="flex flex-col gap-2">
              {notifItems.map((n) => (
                <div
                  key={n.id}
                  className="flex items-start gap-3 rounded-xl border border-border/70 bg-muted/20 px-3 py-2.5"
                >
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent/15 text-accent">
                    <Bell className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-sm font-semibold text-foreground">
                        {n.title || n.body.slice(0, 60) || `#${n.id}`}
                      </span>
                      <span className="rounded bg-warning/15 px-1.5 py-0.5 text-[10px] font-bold uppercase text-warning">
                        {n.status}
                      </span>
                    </div>
                    <div className="mt-0.5 text-[11px] text-muted-foreground">
                      {t('vault.from')} {n.fromUser}
                      {n.toUser ? ` → ${n.toUser}` : ` → ${t('vault.everyone')}`}
                      {n.deletedAt && ` · ${t('trash.deletedAt')}: ${timeLabel(n.deletedAt)}`}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={notifBusy === n.id}
                      onClick={() => void restoreNotify(n)}
                      className="gap-1"
                    >
                      {notifBusy === n.id ? <Loader2 className="size-3.5 animate-spin" /> : <RotateCcw className="size-3.5" />}
                      {t('trash.restore')}
                    </Button>
                    {isAdmin && (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={notifBusy === n.id}
                        onClick={() => void purgeNotify(n)}
                        className="gap-1 text-destructive hover:bg-destructive/10 hover:text-destructive"
                      >
                        <Trash2 className="size-3.5" />
                        {t('trash.purge')}
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <PurgeConfirmDialog
        open={purgeTarget !== null}
        record={purgeTarget}
        purgedBy={user?.username ?? ''}
        onClose={() => setPurgeTarget(null)}
        onConfirm={() => {
          if (purgeTarget) void purge(purgeTarget);
        }}
      />
    </div>
  );
}