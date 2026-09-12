import { Fragment, useState, type MouseEvent, type ReactNode } from 'react';
import { useI18n } from '@/lib/i18n';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { ThemeToggle } from '@/components/ThemeToggle';
import type { NavItem } from '@/lib/nav';
import { userDisplayName } from '@/lib/format';
import { ChevronDown, HardHat, LogOut } from 'lucide-react';

interface SidebarContentProps {
  nav: NavItem[];
  system: NavItem[];
  go: (path: string) => (e: MouseEvent<HTMLAnchorElement>) => void;
  user: { username: string; role: string; firstName?: string; secondName?: string; firstNameAr?: string; secondNameAr?: string } | null;
  logout: () => void;
  dark: boolean;
  toggleTheme: () => void;
  location: { pathname: string };
  /** Extra links shown above the system group (mobile drawer dock). */
  dock?: Array<{ path: string; label: string; icon: ReactNode }>;
  /** Collapsed icon-rail mode (desktop). */
  collapsed?: boolean;
  /** Clicking the account card opens the user's own page. */
  onProfile?: () => void;
}

const itemBase =
  'group relative flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm font-medium transition-all duration-150 active:scale-[0.97]';

function itemClass(active: boolean): string {
  return active
    ? 'bg-accent/10 text-primary shadow-sm shadow-accent/10'
    : 'text-muted-foreground hover:bg-accent/70 hover:text-foreground hover:translate-x-0.5';
}

/** The full sidebar body — shared by the desktop sidebar and the mobile drawer. */
export function SidebarContent({
  nav,
  system,
  go,
  user,
  logout,
  dark,
  toggleTheme,
  location,
  dock,
  collapsed = false,
  onProfile,
}: SidebarContentProps): ReactNode {
  const { t, lang } = useI18n();

  // v3 item 18 addendum — parent tabs show/hide their sub-tabs by clicking
  // (accordion). Default: the active section's sub-list is open.
  const [openSections, setOpenSections] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    for (const item of nav) {
      if (item.sub && item.match(location.pathname)) initial[item.path] = true;
    }
    return initial;
  });

  const toggleSection = (path: string): void => {
    setOpenSections((prev) => ({ ...prev, [path]: !prev[path] }));
  };

  /** Parent click: toggles the sub-list WITHOUT navigating — the selected
   *  sub-tab (from the current location) stays saved/highlighted. */
  const onParentClick = (item: NavItem) => (e: MouseEvent<HTMLAnchorElement>): void => {
    if (!item.sub) {
      go(item.path)(e);
      return;
    }
    e.preventDefault();
    toggleSection(item.path);
  };

  const iconChip = (active: boolean): string =>
    `flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-all duration-150 ${
      active ? 'bg-primary/15 text-primary' : 'bg-muted/50 text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary'
    }`;

  return (
    <>
      {/* Logo — click navigates home (v3 item 21); start side = left EN / right AR */}
      <a
        href="/"
        onClick={go('/')}
        title={t('nav.backHome')}
        className={`flex items-center gap-2.5 px-3 py-4 transition-all duration-150 hover:opacity-90 active:scale-[0.98] ${
          collapsed ? 'justify-center px-0' : ''
        }`}
      >
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent text-sm font-bold text-white shadow-md shadow-accent/20 transition-transform duration-150 active:scale-95">
          <HardHat className="size-4.5" />
        </div>
        {!collapsed && (
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-sm font-bold tracking-tight text-foreground">{t('app.name')}</span>
            <span className="truncate text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              {t('app.company')}
            </span>
          </div>
        )}
      </a>

      <nav className="flex-1 overflow-y-auto px-2 py-2">
        <div className="flex flex-col gap-1">
          {nav.map((item) => {
            const active = item.match(location.pathname);
            const open = openSections[item.path] ?? false;
            return (
              <div key={item.path}>
                <a
                  href={item.path}
                  onClick={onParentClick(item)}
                  title={collapsed ? item.label : undefined}
                  className={`${itemBase} ${itemClass(active)} ${collapsed ? 'justify-center px-0' : ''}`}
                >
                  <span className={iconChip(active)}>{item.icon}</span>
                  {!collapsed && <span className="truncate">{item.label}</span>}
                  {!collapsed && item.sub && (
                    <ChevronDown
                      className={`ms-auto size-3.5 shrink-0 text-muted-foreground/60 transition-transform duration-150 ${
                        open ? 'rotate-180' : ''
                      }`}
                    />
                  )}
                  {active && !collapsed && (
                    <span className="absolute start-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-full bg-accent" />
                  )}
                </a>
                {!collapsed && open && item.sub && (
                  <div className="ms-5 mt-1 flex flex-col gap-0.5 border-s border-border/60 ps-2">
                    {item.sub.map((s) => (
                      <Fragment key={s.path}>
                        {s.group && (
                          <div className="px-2.5 pb-0.5 pt-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                            {s.group}
                          </div>
                        )}
                        <a
                          href={s.path}
                          onClick={go(s.path)}
                          className={`${itemBase} rounded-lg px-2.5 py-1.5 text-[13px] ${
                            s.match(location.pathname)
                              ? 'bg-primary/10 font-medium text-primary'
                              : 'text-muted-foreground hover:bg-accent/70 hover:text-foreground hover:translate-x-0.5'
                          }`}
                        >
                          <span className="shrink-0">{s.icon}</span>
                          <span className="truncate">{s.label}</span>
                        </a>
                      </Fragment>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {dock && dock.length > 0 && (
          <div className="mt-4 border-t border-border/60 pt-3">
            <div className="flex flex-col gap-1">
              {dock.map((d) => {
                const active = location.pathname === d.path;
                return (
                  <a
                    key={d.path}
                    href={d.path}
                    onClick={go(d.path)}
                    title={collapsed ? d.label : undefined}
                    className={`${itemBase} ${itemClass(active)} ${collapsed ? 'justify-center px-0' : ''}`}
                  >
                    <span className={iconChip(active)}>{d.icon}</span>
                    {!collapsed && <span className="truncate">{d.label}</span>}
                  </a>
                );
              })}
            </div>
          </div>
        )}

        <div className="mt-4 border-t border-border/60 pt-3">
          {!collapsed && (
            <div className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
              {t('nav.settings')}
            </div>
          )}
          <div className="flex flex-col gap-1">
            {system.map((item) => {
              const active = item.match(location.pathname);
              return (
                <a
                  key={item.path}
                  href={item.path}
                  onClick={go(item.path)}
                  title={collapsed ? item.label : undefined}
                  className={`${itemBase} ${itemClass(active)} ${collapsed ? 'justify-center px-0' : ''}`}
                >
                  <span className={iconChip(active)}>{item.icon}</span>
                  {!collapsed && <span className="truncate">{item.label}</span>}
                </a>
              );
            })}
          </div>
        </div>
      </nav>

      {/* Bottom: language/theme + user */}
      <div className="border-t border-border/60 px-3 py-3">
        <div className={`flex items-center gap-1 ${collapsed ? 'flex-col' : 'justify-between px-1'}`}>
          <LanguageSwitcher collapsed={collapsed} />
          <ThemeToggle dark={dark} onChange={toggleTheme} />
        </div>
        <div
          role="button"
          tabIndex={0}
          onClick={onProfile}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onProfile?.();
            }
          }}
          title={collapsed ? t('nav.myAccount') : undefined}
          className={`mt-3 flex w-full cursor-pointer items-center gap-2.5 rounded-xl border border-border/60 bg-card/60 px-2.5 py-2 text-start transition-all duration-150 hover:border-primary/40 hover:bg-accent/60 active:scale-[0.98] ${
            collapsed ? 'justify-center' : ''
          }`}
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-bold text-white shadow-md transition-transform duration-150 active:scale-95">
            {user?.username?.slice(0, 2).toUpperCase() ?? 'DV'}
          </div>
          {!collapsed && (
            <>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-foreground">
                  {user ? userDisplayName(user, lang) : ''}
                </div>
                <div className="truncate text-[11px] capitalize text-muted-foreground">
                  {user?.role === 'admin' || user?.role === 'dev' ? t('users.admin') : t('users.member')}
                </div>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  logout();
                }}
                className="shrink-0 rounded-lg p-1.5 text-muted-foreground transition-all duration-150 hover:bg-destructive/10 hover:text-destructive active:scale-90"
                title={t('common.logout')}
              >
                <LogOut className="size-4" />
              </button>
            </>
          )}
        </div>
      </div>
    </>
  );
}