import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { sound } from '@/lib/sound';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Bell, BellRing, CheckCheck, Loader2, Plus, Reply, Search, Send, Table2, Trash2, Vault } from 'lucide-react';
import type { NotifyTable } from '@/components/TableMaker';

interface NotifyItem {
  id: number;
  title: string;
  body: string;
  target: string;
  notifyDate: string;
  toUser: string;
  fromUser: string;
  status: 'active' | 'notified' | 'responded';
  response: string;
  createdAt: string;
  notifiedAt: string;
  respondedAt: string;
  table: NotifyTable | null;
}

type Scope = 'all' | 'mine' | 'sent' | 'off';

const SCOPE_KEY = 'odv_vault_scope';

/** Compact glassy table rendering for a saved notify table (ticket 082). */
function NotifyTableBlock({ table }: { table: NotifyTable }): ReactNode {
  if (!table.headers || table.headers.length === 0) return null;
  const cols = table.headers.length;
  return (
    <div className="overflow-x-auto rounded-xl border border-border/70">
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="border-b border-border/60 bg-muted/30 text-muted-foreground">
            {table.headers.map((h, i) => (
              <th key={i} className="px-2.5 py-1.5 text-start font-semibold">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows && table.rows.length > 0 ? (
            table.rows.map((row, ri) => (
              <tr key={ri} className="border-b border-border/40 last:border-0">
                {Array.from({ length: cols }, (_, ci) => (
                  <td key={ci} className="px-2.5 py-1.5 text-muted-foreground">
                    {row[ci] || '—'}
                  </td>
                ))}
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={cols} className="px-2.5 py-2 text-center text-muted-foreground">
                —
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

/** Vault (ticket 073, v3.2 item 41) — notifications between active users,
 *  attachable to any element with a date; popup note UI, respond, "notified"
 *  label; switch panel all / per-user / off. */
export function VaultPage(): ReactNode {
  const { t } = useI18n();
  const { user } = (() => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mod = require('@/lib/auth') as { useAuth: () => { user?: { username: string; role: string } } };
      return mod.useAuth();
    } catch {
      return { user: undefined } as { user?: { username: string; role: string } };
    }
  })();
  const isVaultAdmin = user?.role === 'admin' || user?.role === 'dev';
  const [items, setItems] = useState<NotifyItem[]>([]);
  const [scope, setScope] = useState<Scope>(() => {
    const s = localStorage.getItem(SCOPE_KEY);
    return s === 'mine' || s === 'sent' || s === 'off' ? s : 'all';
  });
  const [open, setOpen] = useState<NotifyItem | null>(null);
  const [response, setResponse] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({ title: '', body: '', target: '', notifyDate: '', toUser: '' });
  const [users, setUsers] = useState<Array<{ username: string }>>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [searchQ, setSearchQ] = useState('');

  const load = useCallback(async (): Promise<void> => {
    if (scope === 'off') {
      setItems([]);
      return;
    }
    setError('');
    try {
      const params = scope === 'mine' ? 'scope=mine' : scope === 'sent' ? 'scope=sent' : '';
      const res = await api<{ items: NotifyItem[] }>(`/api/notify?${params}`);
      setItems(res.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [scope]);

  useEffect(() => {
    void load();
    api<Array<{ username: string }>>('/api/auth/users')
      .then(setUsers)
      .catch(() => undefined);
    // Tell header bell we have seen the vault — clears the (1) badge until new arrives
    window.dispatchEvent(new Event('odv:vault-open'));
  }, [load]);

  const changeScope = (s: Scope): void => {
    setScope(s);
    localStorage.setItem(SCOPE_KEY, s);
  };

  const create = async (): Promise<void> => {
    setBusy(true);
    setError('');
    try {
      await api('/api/notify', { method: 'POST', body: form });
      sound.success();
      setAddOpen(false);
      setForm({ title: '', body: '', target: '', notifyDate: '', toUser: '' });
      void load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      sound.error();
    } finally {
      setBusy(false);
    }
  };

  const markNotified = async (n: NotifyItem): Promise<void> => {
    setError('');
    try {
      await api(`/api/notify/${n.id}/notified`, { method: 'POST' });
      sound.success();
      setOpen(null);
      void load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      sound.error();
    }
  };

  const respond = async (n: NotifyItem): Promise<void> => {
    const text = response.trim();
    if (!text) return;
    setBusy(true);
    setError('');
    try {
      await api(`/api/notify/${n.id}/respond`, { method: 'POST', body: { response: text } });
      sound.success();
      setResponse('');
      setOpen(null);
      void load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      sound.error();
    } finally {
      setBusy(false);
    }
  };

  const trash = async (n: NotifyItem): Promise<void> => {
    if (!window.confirm('Move this notification to trash? You can restore it later.')) return;
    setError('');
    try {
      await api(`/api/notify/${n.id}`, { method: 'DELETE' });
      sound.success();
      setOpen(null);
      void load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      sound.error();
    }
  };

  const filteredItems = (() => {
    const q = searchQ.trim().toLowerCase();
    if (!q) return items;
    return items.filter((n) => `${n.title} ${n.body} ${n.target} ${n.fromUser} ${n.toUser}`.toLowerCase().includes(q));
  })();

  const statusBadge = (n: NotifyItem): ReactNode => {
    const cls =
      n.status === 'responded'
        ? 'bg-success/10 text-success dark:bg-success/20 dark:text-success'
        : n.status === 'notified'
          ? 'bg-accent/10 text-accent dark:bg-accent/20 dark:text-accent'
          : 'bg-warning/15 text-warning dark:bg-warning/20 dark:text-warning';
    return (
      <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${cls}`}>
        {n.status === 'responded' ? t('vault.responded') : n.status === 'notified' ? t('vault.notified') : t('vault.active')}
      </span>
    );
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">{t('vault.title')}</h1>
          <p className="text-sm text-muted-foreground">{t('vault.subtitle')}</p>
        </div>
        <Button onClick={() => setAddOpen(true)} className="gap-1.5">
          <Plus className="size-4" />
          {t('vault.addNotify')}
        </Button>
      </div>

      {/* Modern switch panel + search — warm, pill, with icons */}
      <div className="flex flex-col gap-3 rounded-xl border border-border bg-card/60 p-3 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <Vault className="size-3.5" />
            {t('vault.switchPanel')}
          </span>
          <div className="flex rounded-full border border-border/60 bg-muted/30 p-1">
            {(['all', 'mine', 'sent', 'off'] as Scope[]).map((s) => (
              <button
                key={s}
                onClick={() => changeScope(s)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-all ${
                  scope === s
                    ? 'bg-accent text-white shadow-sm'
                    : 'text-muted-foreground hover:bg-card hover:text-foreground hover:shadow-sm'
                }`}
              >
                {s === 'all' ? t('vault.scopeAll') : s === 'mine' ? t('vault.scopeMine') : s === 'sent' ? t('vault.scopeSent') : t('vault.scopeOff')}
              </button>
            ))}
          </div>
          <span className="ms-auto text-xs text-muted-foreground">
            {items.length} {items.length === 1 ? 'note' : 'notes'}
          </span>
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchQ}
            placeholder={t('records.search') ?? 'Search notifications...'}
            onChange={(e) => setSearchQ(e.target.value)}
            className="ps-8"
          />
        </div>
      </div>

      {error && <div className="text-sm text-destructive">{error}</div>}

      {scope === 'off' ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">{t('vault.off')}</CardContent>
        </Card>
      ) : filteredItems.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            {items.length === 0 ? t('vault.empty') : 'No matches — try another search or scope.'}
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {filteredItems.map((n) => (
            <div
              key={n.id}
              className="group/card relative flex items-start gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md hover:border-accent/20"
            >
              <button
                type="button"
                onClick={() => {
                  setOpen(n);
                  setResponse('');
                }}
                className="absolute inset-0 rounded-2xl"
                aria-label="Open notification"
              />
              <span className="relative mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
                {n.status === 'responded' ? <Reply className="size-4" /> : <Bell className="size-4" />}
              </span>
              <div className="relative min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  {statusBadge(n)}
                  <span className="text-sm font-semibold text-foreground">{n.title || n.body.slice(0, 60)}</span>
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {t('vault.from')} {n.fromUser}
                  {n.toUser ? ` → ${n.toUser}` : ` → ${t('vault.everyone')}`}
                  {n.target && ` · ${n.target}`}
                  {n.notifyDate && ` · ${n.notifyDate}`}
                </div>
                {n.response && (
                  <div className="mt-1 rounded-lg bg-success/10 px-2 py-1 text-xs text-success dark:text-success">
                    {t('vault.response')}: {n.response}
                  </div>
                )}
                {n.table && n.table.headers.length > 0 && (
                  <div className="mt-2">
                    <div className="mb-1 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                      <Table2 className="size-3" />
                      {t('vault.checkTable')}
                    </div>
                    <NotifyTableBlock table={n.table} />
                  </div>
                )}
              </div>
              {(isVaultAdmin || n.fromUser === user?.username) && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); void trash(n); }}
                  className="relative shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                  title={t('vault.trash')}
                  aria-label={t('vault.trash')}
                >
                  <Trash2 className="size-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Popup note UI — full view + respond + notified label */}
      <Dialog open={open !== null} onOpenChange={(o) => { if (!o) setOpen(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sm">
              <BellRing className="size-4 text-primary" />
              {open?.title || t('vault.note')}
            </DialogTitle>
          </DialogHeader>
          {open && (
            <div className="-mt-1 flex flex-col gap-4 px-6 pb-6">
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                {statusBadge(open)}
                <span>
                  {t('vault.from')} {open.fromUser}
                  {open.toUser ? ` → ${open.toUser}` : ` → ${t('vault.everyone')}`}
                </span>
                {open.target && <span>· {open.target}</span>}
                {open.notifyDate && <span>· {open.notifyDate}</span>}
              </div>

              {open.body && (
                <div className="rounded-xl border border-border/70 bg-card p-3 text-sm text-foreground">{open.body}</div>
              )}

              {open.table && open.table.headers.length > 0 && (
                <div>
                  <div className="mb-1 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                    <Table2 className="size-3" />
                    {t('vault.checkTable')}
                  </div>
                  <NotifyTableBlock table={open.table} />
                </div>
              )}

              {open.response && (
                <div className="rounded-xl bg-success/10 p-3 text-sm text-success dark:text-success">
                  {t('vault.response')}: {open.response}
                </div>
              )}

              {open.status === 'active' && (
                <>
                  <div className="flex flex-col gap-2">
                    <Label>{t('vault.respondLabel')}</Label>
                    <Input
                      value={response}
                      placeholder={t('vault.respondPlaceholder')}
                      onChange={(e) => setResponse(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') void respond(open);
                      }}
                    />
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" size="sm" onClick={() => void markNotified(open)} className="gap-1.5">
                      <CheckCheck className="size-4" />
                      {t('vault.markNotified')}
                    </Button>
                    <Button size="sm" onClick={() => void respond(open)} disabled={busy || !response.trim()} className="gap-1.5">
                      {busy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                      {t('vault.respond')}
                    </Button>
                  </div>
                </>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Add a notify */}
      <Dialog open={addOpen} onOpenChange={(o) => { if (!o) setAddOpen(false); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sm">
              <Vault className="size-4 text-primary" />
              {t('vault.addNotify')}
            </DialogTitle>
          </DialogHeader>
          <div className="-mt-1 flex flex-col gap-3 px-6 pb-6">
            <div>
              <Label>{t('vault.title')}</Label>
              <Input value={form.title} placeholder={t('vault.titlePh')} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
            </div>
            <div>
              <Label>{t('vault.body')}</Label>
              <Input value={form.body} placeholder={t('vault.bodyPh')} onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>{t('vault.target')}</Label>
                <Input value={form.target} placeholder={t('vault.targetPh')} onChange={(e) => setForm((f) => ({ ...f, target: e.target.value }))} />
              </div>
              <div>
                <Label>{t('vault.notifyDate')}</Label>
                <Input type="date" value={form.notifyDate} onChange={(e) => setForm((f) => ({ ...f, notifyDate: e.target.value }))} />
              </div>
            </div>
            <div>
              <Label>{t('vault.toUser')}</Label>
              <Select value={form.toUser} onChange={(e) => setForm((f) => ({ ...f, toUser: e.target.value }))}>
                <option value="">{t('vault.everyone')}</option>
                {users.map((u) => (
                  <option key={u.username} value={u.username}>
                    {u.username}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setAddOpen(false)}>
                {t('form.cancel')}
              </Button>
              <Button size="sm" onClick={() => void create()} disabled={busy || (!form.title && !form.body)} className="gap-1.5">
                {busy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                {t('vault.send')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}