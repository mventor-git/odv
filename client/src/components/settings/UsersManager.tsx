import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import type { User } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { MemberCard, type Member } from '@/components/MemberCard';
import { MemberList, type Person } from '@/components/MemberList';
import { MonthYearPicker } from '@/components/MonthYearPicker';
import { Star, UserPlus } from 'lucide-react';

/** Which Users-page section to host inside Settings (ticket 098):
 *  `members` — the full Project Members manager,
 *  `accounts` — DC accounts (active list + create user),
 *  `account` — the caller's own account card. */
export type UsersView = 'members' | 'accounts' | 'account';

export function UsersManager({ view }: { view: UsersView }): ReactNode {
  const { t, lang } = useI18n();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin' || user?.role === 'dev';

  // admin: users (any role from the DB roles table — no hardcoding)
  const [users, setUsers] = useState<User[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newFirstName, setNewFirstName] = useState('');
  const [newSecondName, setNewSecondName] = useState('');
  const [newFirstNameAr, setNewFirstNameAr] = useState('');
  const [newSecondNameAr, setNewSecondNameAr] = useState('');
  const [newRole, setNewRole] = useState('');
  const [newSpecialty, setNewSpecialty] = useState('');
  const [newPeriodFrom, setNewPeriodFrom] = useState('');
  const [newPeriodTo, setNewPeriodTo] = useState('');
  const [newActive, setNewActive] = useState(true);
  const [adminMsg, setAdminMsg] = useState('');
  const [adminError, setAdminError] = useState('');
  const [members, setMembers] = useState<Member[]>([]);
  const [cardMember, setCardMember] = useState<Person | null>(null);
  const [roles, setRoles] = useState<Array<{ name: string; nameAr: string; star: string }>>([]);

  useEffect(() => {
    api<Array<{ name: string; nameAr: string; star: string }>>('/api/ref/roles')
      .then((r) => {
        setRoles(r);
        // Default role comes from the DB list (ticket 097) — no hardcoding.
        setNewRole((prev) => (prev && r.some((x) => x.name === prev) ? prev : (r[0]?.name ?? '')));
      })
      .catch(() => undefined);
    api<Member[]>('/api/ref/members')
      .then(setMembers)
      .catch(() => undefined);
  }, []);

  /** Merge members with their linked user accounts (ticket 056) — names are
   *  bare (ticket 058), the strip is a safety no-op. */
  const people: Person[] = useMemo(() => {
    const base = (name: string): string => name.replace(/^(Mr|Ms|Mrs|Eng|Engineer)\s+/i, '').trim();
    return members.map((m) => {
      const match = users.find(
        (u) => `${u.firstName ?? ''} ${u.secondName ?? ''}`.trim() === base(m.name),
      );
      return { member: m, user: match };
    });
  }, [members, users]);

  /** Top section: active members with a password set (working accounts). */
  const activeWithPassword = useMemo(
    () => people.filter((p) => p.user && p.user.active !== false && p.user.passwordSet !== false),
    [people],
  );

  /** Members filter module (ticket 061) + executives filter (ticket 096). */
  const [memberQ, setMemberQ] = useState('');
  const [memberStatus, setMemberStatus] = useState('');
  const [memberRole, setMemberRole] = useState('');
  const [execOnly, setExecOnly] = useState(false);
  const filteredMembers = useMemo(() => {
    const q = memberQ.trim().toLowerCase();
    return people.filter((p) => {
      const haystack = [
        p.member.name,
        p.member.role ?? '',
        p.member.specialty ?? '',
        p.member.specialty2 ?? '',
        p.member.periodFrom ?? '',
        p.member.periodTo ?? '',
        p.user?.username ?? '',
        p.user?.firstName ?? '',
        p.user?.secondName ?? '',
        p.user?.firstNameAr ?? '',
        p.user?.secondNameAr ?? '',
      ]
        .join(' ')
        .toLowerCase();
      if (q && !haystack.includes(q)) return false;
      const active = p.user ? p.user.active !== false : p.member.active !== false;
      if (memberStatus === 'active' && !active) return false;
      if (memberStatus === 'inactive' && active) return false;
      if (memberRole && p.member.role !== memberRole) return false;
      if (execOnly && p.member.executive !== true) return false;
      return true;
    });
  }, [people, memberQ, memberStatus, memberRole, execOnly]);

  /** The DC-only list for the accounts section. Returns the fresh list (ticket 058). */
  const loadUsers = useCallback(async (): Promise<User[]> => {
    if (!isAdmin) return [];
    return api<User[]>('/api/auth/users?all=1')
      .then((r) => {
        setUsers(r);
        return r;
      })
      .catch(() => []);
  }, [isAdmin]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  // My Account sub-page → open the logged-in user's member card (was /users?me=1).
  useEffect(() => {
    if (view !== 'account') return;
    if (isAdmin) {
      const mine = people.find((p) => p.user?.id === user?.id);
      if (mine) setCardMember(mine);
    } else {
      api<User>('/api/auth/me')
        .then((u) => {
          const mine = people.find(
            (p) => `${p.user?.firstName ?? ''} ${p.user?.secondName ?? ''}`.trim() === `${u.firstName ?? ''} ${u.secondName ?? ''}`.trim(),
          );
          if (mine) setCardMember(mine);
        })
        .catch(() => undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, isAdmin, people, user?.id]);

  const createUser = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    setAdminError('');
    setAdminMsg('');
    try {
      await api('/api/auth/users', {
        method: 'POST',
        body: {
          username: newUsername,
          password: newUserPassword,
          jobRole: newRole,
          firstName: newFirstName,
          secondName: newSecondName,
          firstNameAr: newFirstNameAr,
          secondNameAr: newSecondNameAr,
          specialty: newSpecialty,
          periodFrom: newPeriodFrom,
          periodTo: newPeriodTo,
          active: newActive,
        },
      });
      setShowCreate(false);
      setNewUsername('');
      setNewUserPassword('');
      setNewFirstName('');
      setNewSecondName('');
      setNewFirstNameAr('');
      setNewSecondNameAr('');
      setNewRole(roles[0]?.name ?? '');
      setNewSpecialty('');
      setNewPeriodFrom('');
      setNewPeriodTo('');
      setNewActive(true);
      setAdminMsg('OK');
      loadUsers();
    } catch (err) {
      setAdminError(err instanceof Error ? err.message : String(err));
    }
  };

  /** Shared member-card dialog — every view opens it. */
  const cardDialog = (
    <MemberCard
      open={cardMember !== null}
      member={cardMember?.member ?? null}
      user={cardMember?.user ?? null}
      roles={roles}
      onClose={() => setCardMember(null)}
      onSaved={(m) => {
        setMembers((prev) => prev.map((x) => (x.name === cardMember?.member.name ? m : x)));
        setCardMember((prev) => (prev ? { ...prev, member: m } : prev));
      }}
      onDeleted={(m) => setMembers((prev) => prev.filter((x) => x.name !== m.name))}
      onCreateUser={async (m) => {
        // Clean username from the member name: "Civil Lead" → "civil.lead"
        const base = m.name.replace(/^(Mr|Ms|Mrs|Eng|Engineer)\s+/i, '').trim().toLowerCase();
        const username = base.replace(/\s+/g, '.');
        await api('/api/auth/users/pending', { method: 'POST', body: { username } });
      }}
      onSaveUser={async (u, patch) => {
        await api(`/api/auth/users/${u.id}`, { method: 'PATCH', body: patch });
        loadUsers();
      }}
      onToggleUserActive={async (u) => {
        await api(`/api/auth/users/${u.id}/active`, {
          method: 'PATCH',
          body: { active: u.active === false },
        });
        // Refresh the open card's user reference so the badge updates live.
        const freshUsers = await loadUsers();
        setCardMember((prev) => {
          if (!prev) return prev;
          const fresh = freshUsers.find((x) => x.id === u.id) ?? prev.user;
          return { ...prev, user: fresh };
        });
      }}
      onChangeUserPassword={async (u, password) => {
        await api(`/api/auth/users/${u.id}/password`, { method: 'PATCH', body: { password } });
        loadUsers();
      }}
      onResetUserPassword={async (u) => {
        await api(`/api/auth/users/${u.id}/password-set`, { method: 'PATCH', body: { passwordSet: false } });
        loadUsers();
      }}
      onDeleteUser={async (u) => {
        if (!window.confirm(t('users.deleteConfirm'))) return;
        await api(`/api/auth/users/${u.id}`, { method: 'DELETE' });
        loadUsers();
      }}
    />
  );

  // My Account — hint + own member card (all roles).
  if (view === 'account') {
    return (
      <div className="flex flex-col gap-4">
        <Card className="glass-card">
          <CardContent className="p-4 text-sm text-muted-foreground">{t('users.myAccountHint')}</CardContent>
        </Card>
        {cardDialog}
      </div>
    );
  }

  // Admin-only managers.
  if (!isAdmin) {
    return (
      <>
        <Card className="glass-card">
          <CardContent className="p-4 text-sm text-muted-foreground">{t('users.adminOnly')}</CardContent>
        </Card>
        {cardDialog}
      </>
    );
  }

  // Accounts — active DC accounts + create user.
  if (view === 'accounts') {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">{t('users.accountsNote')}</p>
          <button
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-2 rounded-2xl bg-accent px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-accent/20 transition-all duration-150 hover:shadow-indigo-500/50 hover:brightness-110 active:scale-95"
          >
            <UserPlus className="size-4" />
            {t('users.newUser')}
          </button>
        </div>
        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="text-sm">{t('users.activeAccounts')}</CardTitle>
          </CardHeader>
          <CardContent>
            <MemberList people={activeWithPassword} onOpen={(p) => setCardMember(p)} />
          </CardContent>
        </Card>

        <Dialog open={showCreate} onOpenChange={(o) => setShowCreate(o)}>
          <DialogContent className="max-w-5xl">
            <DialogHeader>
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent text-sm font-bold text-white shadow-md">
                  {(newFirstName?.[0] ?? newUsername?.[0] ?? 'N').toUpperCase()}
                  {(newSecondName?.[0] ?? '').toUpperCase()}
                </div>
                <div className="min-w-0">
                  <DialogTitle>{t('users.newUser')}</DialogTitle>
                  <div className="text-xs text-muted-foreground">{t('users.accountsNote')}</div>
                </div>
              </div>
            </DialogHeader>
            <form onSubmit={createUser} className="-mt-1 flex flex-col gap-4 px-6 pb-6">
              <div className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-xl border border-border/70 bg-card p-4 sm:grid-cols-3">
                <div className="col-span-2 sm:col-span-3">
                  <Label>{t('users.username')}</Label>
                  <Input value={newUsername} onChange={(e) => setNewUsername(e.target.value)} required />
                </div>
                <div className="col-span-2 sm:col-span-3">
                  <Label>{t('users.password')} <span className="text-muted-foreground">({t('field.optional')})</span></Label>
                  <Input
                    type="password"
                    value={newUserPassword}
                    onChange={(e) => setNewUserPassword(e.target.value)}
                  />
                </div>
                <div>
                  <Label>{t('users.firstName')}</Label>
                  <Input value={newFirstName} onChange={(e) => setNewFirstName(e.target.value)} />
                </div>
                <div>
                  <Label>{t('users.secondName')}</Label>
                  <Input value={newSecondName} onChange={(e) => setNewSecondName(e.target.value)} />
                </div>
                <div>
                  <Label>{t('users.firstNameAr')}</Label>
                  <Input value={newFirstNameAr} onChange={(e) => setNewFirstNameAr(e.target.value)} />
                </div>
                <div>
                  <Label>{t('users.secondNameAr')}</Label>
                  <Input value={newSecondNameAr} onChange={(e) => setNewSecondNameAr(e.target.value)} />
                </div>
                <div>
                  <Label>{t('users.role')}</Label>
                  <Select value={newRole} onChange={(e) => setNewRole(e.target.value)}>
                    {roles.map((r) => (
                      <option key={r.name} value={r.name}>
                        {lang === 'ar' && r.nameAr ? r.nameAr : r.name}
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <Label>{t('settings.userSpecialty')}</Label>
                  <Input value={newSpecialty} onChange={(e) => setNewSpecialty(e.target.value)} />
                </div>
                <div>
                  <Label>{t('settings.userFrom')}</Label>
                  <MonthYearPicker value={newPeriodFrom} onChange={setNewPeriodFrom} />
                </div>
                <div>
                  <Label>{t('settings.userTo')}</Label>
                  <MonthYearPicker
                    value={newPeriodTo}
                    onChange={(v) => {
                      setNewPeriodTo(v);
                      if (v) setNewActive(false);
                    }}
                  />
                </div>
                <div className="flex items-end">
                  <button
                    type="button"
                    onClick={() => {
                      setNewActive(!newActive);
                      if (!newActive) setNewPeriodTo('');
                    }}
                    className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                      newActive === false
                        ? 'bg-destructive/10 text-destructive dark:bg-destructive/15 dark:text-destructive'
                        : 'bg-success/10 text-success dark:bg-success/20 dark:text-success'
                    }`}
                  >
                    {newActive === false ? t('settings.inactive') : t('settings.active')}
                  </button>
                </div>
              </div>
              {adminError && <div className="text-sm text-destructive">{adminError}</div>}
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setShowCreate(false)}>
                  {t('form.cancel')}
                </Button>
                <Button type="submit">{t('form.create')}</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
        {cardDialog}
      </div>
    );
  }

  // Project Members — full manager (filters + executives + cards).
  return (
    <div className="flex flex-col gap-4">
      {adminMsg && <div className="text-sm text-success">{adminMsg}</div>}
      {adminError && <div className="text-sm text-destructive">{adminError}</div>}
      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="text-sm">{t('settings.members')}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <div className="col-span-2">
              <Label>{t('records.search')}</Label>
              <Input value={memberQ} placeholder={t('records.search')} onChange={(e) => setMemberQ(e.target.value)} />
            </div>
            <div>
              <Label>{t('users.status')}</Label>
              <Select value={memberStatus} onChange={(e) => setMemberStatus(e.target.value)}>
                <option value="">{t('records.filters')}</option>
                <option value="active">{t('users.active')}</option>
                <option value="inactive">{t('users.inactive')}</option>
              </Select>
            </div>
            <div>
              <Label>{t('users.role')}</Label>
              <Select value={memberRole} onChange={(e) => setMemberRole(e.target.value)}>
                <option value="">{t('records.filters')}</option>
                {roles.map((r) => (
                  <option key={r.name} value={r.name}>
                    {lang === 'ar' && r.nameAr ? r.nameAr : r.name}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          {/* Executives filter (ticket 096) — one click shows the executives */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setExecOnly((e) => !e)}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-all active:scale-95 ${
                execOnly
                  ? 'bg-accent text-white shadow-md shadow-violet-500/30'
                  : 'border border-border/70 bg-card text-muted-foreground hover:border-violet-400/50 hover:text-foreground'
              }`}
            >
              <Star className="size-3.5" />
              {t('users.executives')}
              <span className="rounded-full bg-white/20 px-1.5 text-[10px] tabular-nums">
                {people.filter((p) => p.member.executive === true).length}
              </span>
            </button>
            {execOnly && (
              <button
                type="button"
                onClick={() => setExecOnly(false)}
                className="text-xs text-muted-foreground underline-offset-2 hover:underline"
              >
                {t('users.allMembers')}
              </button>
            )}
          </div>
          <MemberList people={filteredMembers} onOpen={(p) => setCardMember(p)} />
        </CardContent>
      </Card>
      {cardDialog}
    </div>
  );
}
