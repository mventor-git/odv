import { useState, type ReactNode } from 'react';
import { useI18n } from '@/lib/i18n';
import { api } from '@/lib/api';
import { bareName } from '@/lib/format';
import { RoleStarBadge } from '@/components/RoleStarBadge';
import type { User } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MonthYearPicker } from '@/components/MonthYearPicker';
import { ToggleSwitch } from '@/components/ToggleSwitch';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { KeyRound, Power, RotateCcw, Save, Trash2, UserCog, UserPlus } from 'lucide-react';

export interface Member {
  name: string;
  title?: string;
  role?: string;
  specialty?: string;
  specialty2?: string;
  periodFrom?: string;
  periodTo?: string;
  active?: boolean;
  executive?: boolean;
  /** Star badge value from the roles table (ticket 097): 'gold' | 'white' | ''. */
  star?: string;
}

interface MemberCardProps {
  open: boolean;
  member: Member | null;
  /** Linked user account (merged view, ticket 056). */
  user?: User | null;
  /** Roles from the DB (ticket 097): name + Arabic name + star badge value. */
  roles: Array<{ name: string; nameAr: string; star: string }>;
  onClose: () => void;
  onSaved: (m: Member) => void;
  onDeleted: (m: Member) => void;
  onCreateUser: (m: Member) => Promise<void>;
  onSaveUser?: (u: User, patch: { username?: string }) => Promise<void>;
  onToggleUserActive?: (u: User) => Promise<void>;
  onChangeUserPassword?: (u: User, password: string) => Promise<void>;
  onResetUserPassword?: (u: User) => Promise<void>;
  onDeleteUser?: (u: User) => Promise<void>;
}

/** Member card modal — member metadata + linked account (ticket 055/056). */
export function MemberCard({
  open,
  member,
  user,
  roles,
  onClose,
  onSaved,
  onDeleted,
  onCreateUser,
  onSaveUser,
  onToggleUserActive,
  onChangeUserPassword,
  onResetUserPassword,
  onDeleteUser,
}: MemberCardProps): ReactNode {
  const { t, lang } = useI18n();
  const [name, setName] = useState(bareName(member?.name ?? ''));
  const [role, setRole] = useState(member?.role ?? '');
  const [specialty, setSpecialty] = useState(member?.specialty ?? '');
  const [specialty2, setSpecialty2] = useState(member?.specialty2 ?? '');
  const [periodFrom, setPeriodFrom] = useState(member?.periodFrom ?? '');
  const [periodTo, setPeriodTo] = useState(member?.periodTo ?? '');
  const [active, setActive] = useState(member?.active ?? true);
  const [executive, setExecutive] = useState(member?.executive ?? false);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [accountUsername, setAccountUsername] = useState(user?.username ?? '');
  const [accountPassword, setAccountPassword] = useState('');

const [lastSig, setLastSig] = useState<string | null>(null);
  const sig = member
    ? `${member.name}|${member.executive ?? false}|${member.active ?? true}|${member.role ?? ''}`
    : '';
  if (member && sig !== lastSig) {
    setLastSig(sig);
    setName(bareName(member.name ?? ''));
    setRole(member.role ?? '');
    setSpecialty(member.specialty ?? '');
    setSpecialty2(member.specialty2 ?? '');
    setPeriodFrom(member.periodFrom ?? '');
    setPeriodTo(member.periodTo ?? '');
    setActive(member.active ?? true);
    setExecutive(member.executive ?? false);
    setErr('');
    setMsg('');
  }

  if (!member) return null;

  const run = async (fn: () => Promise<void>): Promise<void> => {
    setBusy(true);
    setErr('');
    setMsg('');
    try {
      await fn();
      setMsg(t('settings.applied'));
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const save = async (): Promise<void> => {
    setBusy(true);
    setErr('');
    setMsg('');
    try {
      const base = name.trim();
      const res = await api<Member>(`/api/ref/members/${encodeURIComponent(member.name)}`, {
        method: 'PATCH',
        body: { name: base, role, specialty, specialty2, periodFrom, periodTo, active, executive },
      });
      setMsg(t('settings.applied'));
      onSaved(res);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  /** Toggle active/executive and persist immediately (ticket 072) — the name is
   *  never rewritten (ticket 058): no title prefix composition, no rename on
   *  toggle. */
  const toggleAndSave = async (patch: { active?: boolean; executive?: boolean; periodTo?: string }): Promise<void> => {
    if (patch.active !== undefined) setActive(patch.active);
    if (patch.executive !== undefined) setExecutive(patch.executive);
    if (patch.periodTo !== undefined) setPeriodTo(patch.periodTo);
    setBusy(true);
    setErr('');
    setMsg('');
    try {
      const res = await api<Member>(`/api/ref/members/${encodeURIComponent(member.name)}`, {
        method: 'PATCH',
        body: {
          name: member.name,
          role,
          specialty,
          specialty2,
          periodFrom,
          periodTo: patch.periodTo !== undefined ? patch.periodTo : periodTo,
          active: patch.active !== undefined ? patch.active : active,
          executive: patch.executive !== undefined ? patch.executive : executive,
        },
      });
      setMsg(t('settings.applied'));
      onSaved(res);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const del = async (): Promise<void> => {
    if (!window.confirm(t('users.deleteConfirm'))) return;
    try {
      await api(`/api/ref/members/${encodeURIComponent(member.name)}`, { method: 'DELETE' });
      onDeleted(member);
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  };

  const meta: Array<{ label: string; value: string }> = [
    { label: t('settings.userName'), value: bareName(name) },
    { label: t('settings.userRole'), value: role || '—' },
    { label: t('settings.userSpecialty'), value: specialty || '—' },
    { label: t('settings.userSpecialty2'), value: specialty2 || '—' },
    { label: t('settings.userFrom'), value: periodFrom || '—' },
    { label: t('settings.userTo'), value: periodTo || t('settings.tillNow') },
    { label: t('settings.active'), value: active === false ? t('settings.inactive') : t('settings.active') },
    { label: t('settings.executive'), value: executive === true ? t('settings.executive') : t('settings.notExecutive') },
  ];

  const inputCls =
    'h-8 w-full rounded-md border border-border bg-card px-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent text-sm font-bold text-white shadow-md">
              {(bareName(member.name)[0] ?? 'M').toUpperCase()}
            </div>
            <div className="min-w-0">
              <DialogTitle>
                {bareName(member.name)}
                <RoleStarBadge star={member.star} title={t('settings.executive')} />
              </DialogTitle>
              <div className="flex items-center gap-1.5 text-xs">
                <span className="rounded-md bg-primary/10 px-2 py-0.5 font-medium text-primary">{member.role || '—'}</span>
                <span
                  className={`rounded-full border px-2 py-0.5 font-medium ${
                    member.active === false
                      ? 'border-destructive/30 bg-destructive/10 text-destructive dark:border-destructive/30 dark:bg-destructive/15'
                      : 'border-success/30 bg-success/10 text-success dark:border-success/30 dark:bg-success/15'
                  }`}
                >
                  {member.active === false ? t('settings.inactive') : t('settings.active')}
                </span>
                {member.executive === true && (
                  <span className="rounded-full border border-amber-600/20 bg-amber-500/10 px-2 py-0.5 font-medium text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/15 dark:text-amber-300">
                    {t('settings.executive')} ★
                  </span>
                )}
                {member.star && (
                  <RoleStarBadge star={member.star} title={t('settings.executive')} />
                )}
              </div>
            </div>
          </div>
        </DialogHeader>

        <div className="-mt-1 flex flex-col gap-4 px-6 pb-6">
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-xl border border-border/70 bg-card p-4 sm:grid-cols-4">
            {meta.map((m) => (
              <div key={m.label} className="flex flex-col gap-0.5">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{m.label}</span>
                <span className="truncate text-sm text-foreground">{m.value}</span>
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-3 rounded-xl border border-border/70 bg-card p-4">
            <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <UserCog className="size-3.5" />
              {t('users.editMetadata')}
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div>
                <Label>{t('settings.userName')}</Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div>
                <Label>{t('settings.userRole')}</Label>
                <select className={inputCls} value={role} onChange={(e) => setRole(e.target.value)}>
                  <option value="">—</option>
                  {!roles.some((r) => r.name === role) && role && (
                    <option value={role}>{role}</option>
                  )}
                  {roles.map((r) => (
                    <option key={r.name} value={r.name}>
                      {lang === 'ar' && r.nameAr ? r.nameAr : r.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label>{t('settings.userSpecialty')}</Label>
                <Input value={specialty} onChange={(e) => setSpecialty(e.target.value)} />
              </div>
              <div>
                <Label>{t('settings.userSpecialty2')}</Label>
                <Input value={specialty2} onChange={(e) => setSpecialty2(e.target.value)} />
              </div>
              <div>
                <Label>{t('settings.userFrom')}</Label>
                <MonthYearPicker value={periodFrom} onChange={setPeriodFrom} />
              </div>
              <div>
                <Label>{t('settings.userTo')}</Label>
                <MonthYearPicker
                  value={periodTo}
                  onChange={(v) => {
                    setPeriodTo(v);
                    if (v) setActive(false); // picking an end date deactivates by default
                  }}
                />
              </div>
              <div className="flex items-end gap-3">
                <div className="flex flex-col gap-1">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {t('settings.active')}
                  </span>
                  <ToggleSwitch
                    checked={active}
                    color={active ? 'success' : 'destructive'}
                    label={active ? t('settings.active') : t('settings.inactive')}
                    onChange={() => {
                      if (active) {
                        void toggleAndSave({ active: false });
                      } else {
                        void toggleAndSave({ active: true, periodTo: '' });
                      }
                    }}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {t('settings.executive')}
                  </span>
                  <ToggleSwitch
                    checked={executive}
                    color="accent"
                    label={executive ? t('settings.executive') : t('settings.notExecutive')}
                    onChange={() => void toggleAndSave({ executive: !executive })}
                  />
                </div>
              </div>
            </div>
            <div className="flex flex-wrap justify-end gap-2 border-t border-border/50 pt-3">
              {!user && (
                <Button size="sm" variant="outline" className="gap-1.5" disabled={busy} onClick={() => void run(() => onCreateUser(member))}>
                  <UserPlus className="size-3.5" />
                  {t('settings.createUser')}
                </Button>
              )}
              <Button size="sm" className="gap-1.5" disabled={busy} onClick={() => void save()}>
                <Save className="size-3.5" />
                {t('form.save')}
              </Button>
              <Button size="sm" variant="destructive" className="gap-1.5" disabled={busy} onClick={() => void del()}>
                <Trash2 className="size-3.5" />
                {t('users.delete')}
              </Button>
            </div>
          </div>

          {/* Linked account */}
          <div className="flex flex-col gap-2 rounded-xl border border-border/70 bg-card p-4">
            <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <KeyRound className="size-3.5" />
              {t('users.title')}
            </div>
            {user ? (
              <>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  <div>
                    <Label>{t('users.username')}</Label>
                    <Input value={accountUsername} onChange={(e) => setAccountUsername(e.target.value)} />
                  </div>
                  <div>
                    <Label>{t('users.passwordStatus')}</Label>
                    <div className="flex h-8 items-center">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          user.passwordSet === false
                            ? 'bg-warning/15 text-warning dark:bg-warning/20 dark:text-warning'
                            : 'bg-muted text-muted-foreground'
                        }`}
                      >
                        {user.passwordSet === false ? t('users.noPassword') : t('users.passwordSet')}
                      </span>
                    </div>
                  </div>
                  <div>
                    <Label>{t('users.status')}</Label>
                    <div className="flex h-8 items-center">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          user.active === false
                            ? 'bg-destructive/10 text-destructive dark:bg-destructive/15 dark:text-destructive'
                            : 'bg-success/10 text-success dark:bg-success/20 dark:text-success'
                        }`}
                      >
                        {user.active === false ? t('users.inactive') : t('users.active')}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <Input
                    type="password"
                    placeholder={t('users.newPassword')}
                    value={accountPassword}
                    onChange={(e) => setAccountPassword(e.target.value)}
                    className="h-8 w-44"
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy || accountPassword.length < 6}
                    onClick={() =>
                      void run(async () => {
                        await onChangeUserPassword?.(user, accountPassword);
                        setAccountPassword('');
                      })
                    }
                  >
                    {t('users.setPassword')}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5"
                    disabled={busy}
                    onClick={() => void run(async () => { await onResetUserPassword?.(user); })}
                  >
                    <RotateCcw className="size-3.5" />
                    {t('users.resetToNoPassword')}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5"
                    disabled={busy}
                    onClick={() => void run(async () => { await onToggleUserActive?.(user); })}
                  >
                    <Power className="size-3.5" />
                    {user.active === false ? t('users.activate') : t('users.deactivate')}
                  </Button>
                  <Button
                    size="sm"
                    className="gap-1.5"
                    disabled={busy || !accountUsername.trim()}
                    onClick={() =>
                      void run(async () => {
                        await onSaveUser?.(user, { username: accountUsername.trim() });
                        onClose();
                      })
                    }
                  >
                    <Save className="size-3.5" />
                    {t('form.save')}
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    className="gap-1.5"
                    disabled={busy}
                    onClick={() => void run(async () => { await onDeleteUser?.(user); onClose(); })}
                  >
                    <Trash2 className="size-3.5" />
                    {t('users.deleteAccount')}
                  </Button>
                </div>
              </>
            ) : (
              <Button size="sm" variant="outline" className="gap-1.5 self-start" disabled={busy} onClick={() => void run(() => onCreateUser(member))}>
                <UserPlus className="size-3.5" />
                {t('settings.createUser')}
              </Button>
            )}
          </div>

          {msg && <div className="text-sm text-success">{msg}</div>}
          {err && <div className="text-sm text-destructive">{err}</div>}
        </div>
      </DialogContent>
    </Dialog>
  );
}