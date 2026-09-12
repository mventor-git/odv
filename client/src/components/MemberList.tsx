import { type ReactNode } from 'react';
import { useI18n } from '@/lib/i18n';
import { useIsMobile } from '@/lib/useIsMobile';
import { bareName } from '@/lib/format';
import { RoleStarBadge } from '@/components/RoleStarBadge';
import type { Member } from '@/components/MemberCard';
import type { User } from '@/lib/types';

export interface Person {
  member: Member;
  user?: User;
}

/** Display name — Arabic names when the UI is Arabic (ticket 062). */
function personName(p: Person, lang: 'en' | 'ar'): string {
  const u = p.user;
  if (lang === 'ar' && u && (u.firstNameAr || u.secondNameAr)) {
    return `${u.firstNameAr ?? ''} ${u.secondNameAr ?? ''}`.trim();
  }
  return bareName(p.member.name);
}

interface MemberListProps {
  people: Person[];
  onOpen: (p: Person) => void;
}

/** Unified person cards — member + account merged, click opens the card (ticket 056). */
export function MemberList({ people, onOpen }: MemberListProps): ReactNode {
  const { t, lang } = useI18n();
  const isMobile = useIsMobile();

  const card = (p: Person): ReactNode => {
    const m = p.member;
    const u = p.user;
    const name = personName(p, lang);
    return (
      <button
        key={m.name}
        type="button"
        onClick={() => onOpen(p)}
        className="glass-card flex flex-col gap-2.5 rounded-2xl p-4 text-start transition-all hover:-translate-y-0.5 active:scale-[0.99]"
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-bold text-white shadow-md">
              {(name[0] ?? 'M').toUpperCase()}
            </div>
            <div className="min-w-0">
              <div className="truncate font-semibold text-foreground">
                {name}
                <RoleStarBadge star={m.star} />
              </div>
              <div className="truncate text-xs text-muted-foreground">
                {m.role || '—'}
                {m.specialty ? ` · ${m.specialty}` : ''}
                {m.specialty2 ? ` + ${m.specialty2}` : ''}
              </div>
            </div>
          </div>
          <span
            className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
              (u ? u.active === false : m.active === false)
                ? 'bg-destructive/10 text-destructive dark:bg-destructive/15 dark:text-destructive'
                : 'bg-success/10 text-success dark:bg-success/20 dark:text-success'
            }`}
          >
            {(u ? u.active === false : m.active === false) ? t('settings.inactive') : t('settings.active')}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          {u ? (
            <span className="rounded-md border border-border bg-card px-2 py-0.5 font-medium font-mono text-foreground shadow-sm">@{u.username}</span>
          ) : (
            <span className="rounded-md border border-border bg-muted px-2 py-0.5 font-medium text-muted-foreground">
              {t('settings.noAccount')}
            </span>
          )}
          {u && (
            <span
              className={`rounded-md border px-2 py-0.5 font-medium ${
                u.passwordSet === false
                  ? 'border-warning/30 bg-warning/10 text-warning dark:border-warning/30 dark:bg-warning/15'
                  : 'border-border bg-muted text-muted-foreground'
              }`}
            >
              {u.passwordSet === false ? t('users.noPassword') : t('users.passwordSet')}
            </span>
          )}
          {m.executive === true && (
            <span className="rounded-md border border-amber-600/20 bg-warning/10 px-2 py-0.5 font-medium text-warning dark:border-amber-500/30 dark:bg-amber-500/15 dark:text-warning">
              {t('settings.executive')} ★
            </span>
          )}
          {(m.periodFrom || m.periodTo) && (
            <span className="rounded-md bg-muted px-2 py-0.5 font-medium text-muted-foreground">
              {m.periodFrom || '?'} → {m.periodTo || t('settings.tillNow')}
            </span>
          )}
        </div>
      </button>
    );
  };

  if (isMobile) {
    return <div className="flex flex-col gap-3">{people.map(card)}</div>;
  }
  return <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{people.map(card)}</div>;
}