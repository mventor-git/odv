import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Download, Plus, RotateCcw, Save, Trash2, UserPlus } from 'lucide-react';
import { bareName } from '@/lib/format';

export type RefKind = 'zones' | 'floors' | 'members' | 'roles';

export interface RefItem {
  code?: string;
  name: string;
  /** Arabic delegate (ticket 068) — zones and floors. */
  nameAr?: string;
  cluster?: string;
  title?: string;
  role?: string;
  specialty?: string;
  specialty2?: string;
  periodFrom?: string;
  periodTo?: string;
  active?: boolean;
  executive?: boolean;
  locked?: boolean;
}

type TKey = Parameters<ReturnType<typeof useI18n>['t']>[0];

interface RefManagerCardProps {
  kind: RefKind;
  title: string;
  t: (key: TKey) => string;
  /** Names that are locked labels — not editable/deletable (default roles). */
  lockedNames?: Set<string>;
}

/** Reference data manager card — fetch from legacy, add, edit, apply, revert (ticket 040). */
export function RefManagerCard({ kind, title, t, lockedNames }: RefManagerCardProps): ReactNode {
  const { lang } = useI18n();
  const [items, setItems] = useState<RefItem[]>([]);
  const [applied, setApplied] = useState<RefItem[]>([]);
  const [addValue, setAddValue] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [roles, setRoles] = useState<Array<{ name: string; nameAr: string }>>([]);

  useEffect(() => {
    api<Array<{ name: string; nameAr: string }>>('/api/ref/roles')
      .then(setRoles)
      .catch(() => undefined);
  }, []);

  const load = useCallback(async (): Promise<void> => {
    try {
      const res = await api<RefItem[]>(`/api/ref/${kind}`);
      setItems(res);
      setApplied(res);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }, [kind]);

  useEffect(() => {
    void load();
  }, [load]);

  const isLocked = (it: RefItem): boolean => it.locked === true || (lockedNames?.has(it.name) ?? false);

  const setItem = (idx: number, patch: Partial<RefItem>): void => {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  };

  const addItem = (): void => {
    const v = addValue.trim();
    if (!v) return;
    if (kind === 'zones') {
      setItems((prev) => [...prev, { code: v, name: v, nameAr: '', cluster: 'CL12' }]);
    } else if (kind === 'floors') {
      setItems((prev) => [...prev, { name: v, nameAr: '' }]);
    } else if (kind === 'members') {
      setItems((prev) => [
        ...prev,
        { name: v, role: '', specialty: '', specialty2: '', periodFrom: '', periodTo: '', active: true, executive: false },
      ]);
    } else {
      setItems((prev) => [...prev, { name: v }]);
    }
    setAddValue('');
  };

  const fetchLegacy = async (): Promise<void> => {
    setBusy(true);
    setErr('');
    setMsg('');
    try {
      const res = await api<{ items: string[] }>(`/api/ref/${kind}/fetch`);
      const existing = new Set(items.map((i) => (kind === 'zones' ? i.code : i.name)));
      const fresh = res.items.filter((v) => !existing.has(v));
      if (kind === 'zones') {
        setItems((prev) => [...prev, ...fresh.map((v) => ({ code: v, name: v, cluster: 'CL12' }))]);
      } else if (kind === 'members') {
        setItems((prev) => [
          ...prev,
          ...fresh.map((v) => ({ name: v, role: '', specialty: '', specialty2: '', periodFrom: '', periodTo: '', active: true, executive: false })),
        ]);
      } else {
        setItems((prev) => [...prev, ...fresh.map((v) => ({ name: v }))]);
      }
      setMsg(`${t('settings.fetched')}: ${fresh.length}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const apply = async (): Promise<void> => {
    setBusy(true);
    setErr('');
    setMsg('');
    try {
      const payload =
        kind === 'zones'
          ? { items }
          : kind === 'floors'
            ? { items: items.map((i) => ({ name: i.name, nameAr: i.nameAr ?? '' })) }
            : { items: items.map((i) => i.name) };
      const res = await api<{ items: RefItem[] }>(`/api/ref/${kind}/sync`, {
        method: 'POST',
        body: payload,
      });
      setItems(res.items);
      setApplied(res.items);
      setMsg(t('settings.applied'));
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const revert = (): void => {
    setItems(applied);
    setMsg(t('settings.reverted'));
  };

  const removeItem = async (idx: number): Promise<void> => {
    const it = items[idx];
    if (isLocked(it)) return;
    const id = kind === 'zones' ? it.code : it.name;
    if (!id) return;
    try {
      await api(`/api/ref/${kind}/${encodeURIComponent(id)}`, { method: 'DELETE' });
      setItems((prev) => prev.filter((_, i) => i !== idx));
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  };

  const createUser = async (name: string): Promise<void> => {
    setErr('');
    setMsg('');
    try {
      await api('/api/auth/users/pending', { method: 'POST', body: { username: name } });
      setMsg(`${t('settings.userCreated')}: ${name}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  };

  const inputCls =
    'h-8 w-full rounded-md border border-border bg-card px-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

  return (
    <Card className="glass-card">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-sm">{title}</CardTitle>
          <div className="flex flex-wrap gap-1.5">
            <Button size="sm" variant="outline" className="gap-1" onClick={() => void fetchLegacy()} disabled={busy}>
              <Download className="size-3.5" />
              {t('settings.fetch')}
            </Button>
            <Button size="sm" variant="outline" className="gap-1" onClick={revert} disabled={busy}>
              <RotateCcw className="size-3.5" />
              {t('settings.revert')}
            </Button>
            <Button size="sm" className="gap-1" onClick={() => void apply()} disabled={busy}>
              <Save className="size-3.5" />
              {t('settings.apply')}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {msg && <div className="text-sm text-success">{msg}</div>}
        {err && <div className="text-sm text-destructive">{err}</div>}

        <div className="flex gap-2">
          <Input value={addValue} onChange={(e) => setAddValue(e.target.value)} placeholder={t('settings.addPlaceholder')} />
          <Button variant="outline" className="gap-1" onClick={addItem}>
            <Plus className="size-4" />
            {t('settings.add')}
          </Button>
        </div>

        <div className="flex flex-col gap-2">
          {items.length === 0 && <div className="text-sm text-muted-foreground">—</div>}
          {items.map((it, idx) => {
            const locked = isLocked(it);
            return (
              <div key={idx} className="flex flex-wrap items-center gap-2 rounded-lg border border-border/60 bg-card p-2">
                {locked ? (
                  <span className="flex h-8 items-center rounded-md bg-muted px-3 text-sm font-medium text-muted-foreground">
                    {it.name}
                    <span className="ms-2 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-primary">
                      {t('settings.locked')}
                    </span>
                  </span>
                ) : kind === 'zones' ? (
                  <>
                    <Input className={`${inputCls} w-24`} value={it.code ?? ''} placeholder={t('ref.codePh')} onChange={(e) => setItem(idx, { code: e.target.value })} />
                    <Input className={`${inputCls} w-40`} value={it.name} placeholder={t('ref.namePh')} onChange={(e) => setItem(idx, { name: e.target.value })} />
                    <Input className={`${inputCls} w-40`} value={it.nameAr ?? ''} placeholder={t('settings.nameAr')} onChange={(e) => setItem(idx, { nameAr: e.target.value })} />
                    <Input className={`${inputCls} w-32`} value={it.cluster ?? ''} placeholder={t('ref.clusterPh')} onChange={(e) => setItem(idx, { cluster: e.target.value })} />
                  </>
                ) : kind === 'floors' ? (
                  <>
                    <Input className={`${inputCls} w-40`} value={it.name} placeholder={t('ref.namePh')} onChange={(e) => setItem(idx, { name: e.target.value })} />
                    <Input className={`${inputCls} w-40`} value={it.nameAr ?? ''} placeholder={t('settings.nameAr')} onChange={(e) => setItem(idx, { nameAr: e.target.value })} />
                  </>
                ) : kind === 'members' ? (
                  <>
                    <Input
                      className={`${inputCls} w-40`}
                      value={bareName(it.name)}
                      placeholder={t('settings.userName')}
                      onChange={(e) => setItem(idx, { name: e.target.value })}
                    />
                    <select
                      className={`${inputCls} w-44`}
                      value={it.role ?? ''}
                      onChange={(e) => setItem(idx, { role: e.target.value })}
                    >
                      <option value="">—</option>
                      {roles.map((r) => (
                        <option key={r.name} value={r.name}>
                          {lang === 'ar' && r.nameAr ? r.nameAr : r.name}
                        </option>
                      ))}
                    </select>
                    <Input className={`${inputCls} w-32`} value={it.specialty ?? ''} placeholder={t('settings.userSpecialty')} onChange={(e) => setItem(idx, { specialty: e.target.value })} />
                    <Input className={`${inputCls} w-32`} value={it.specialty2 ?? ''} placeholder={t('settings.userSpecialty2')} onChange={(e) => setItem(idx, { specialty2: e.target.value })} />
                    <Input type="month" className={`${inputCls} w-32`} value={it.periodFrom ?? ''} placeholder={t('settings.userFrom')} onChange={(e) => setItem(idx, { periodFrom: e.target.value })} />
                    <Input type="month" className={`${inputCls} w-32`} value={it.periodTo ?? ''} placeholder={t('settings.userTo')} onChange={(e) => setItem(idx, { periodTo: e.target.value })} />
                    <button
                      type="button"
                      onClick={() => setItem(idx, { active: !(it.active ?? true) })}
                      className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                        it.active === false
                          ? 'bg-destructive/10 text-destructive dark:bg-destructive/15 dark:text-destructive'
                          : 'bg-success/10 text-success dark:bg-success/20 dark:text-success'
                      }`}
                    >
                      {it.active === false ? t('settings.inactive') : t('settings.active')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setItem(idx, { executive: !(it.executive ?? false) })}
                      className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                        it.executive === true
                          ? 'bg-accent/10 text-accent dark:bg-accent/20 dark:text-accent'
                          : 'bg-muted text-muted-foreground'
                      }`}
                      title={t('settings.executiveHint')}
                    >
                      {it.executive === true ? t('settings.executive') : t('settings.notExecutive')}
                    </button>
                    <Button size="sm" variant="outline" className="gap-1" onClick={() => void createUser(it.name)}>
                      <UserPlus className="size-3.5" />
                      {t('settings.createUser')}
                    </Button>
                  </>
                ) : (
                  <Input className={`${inputCls} flex-1`} value={it.name} onChange={(e) => setItem(idx, { name: e.target.value })} />
                )}
                {!locked && (
                  <Button size="icon" variant="ghost" className="text-destructive" onClick={() => void removeItem(idx)}>
                    <Trash2 className="size-4" />
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}