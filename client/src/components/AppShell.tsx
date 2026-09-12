import { useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { SidebarContent } from '@/components/SidebarContent';
import { HeaderActions } from '@/components/HeaderActions';
import { buildNav, buildSystemNav } from '@/lib/nav';
import { Activity, PanelLeftClose, PanelLeftOpen, Sparkles } from 'lucide-react';
import { AppIcon } from '@/icons/AppIcon';
import { useNotifyBadge } from '@/lib/useNotifyBadge';

function HeaderNotifyIcon(): React.ReactNode {
  const { t } = useI18n();
  const { user } = useAuth();
  const { count, items, open, setOpen, remove } = useNotifyBadge();
  const canDelete = user?.role === 'admin' || user?.role === 'dev';
  return (
    <div className="relative">
      <button
        onClick={() => {
          const willOpen = !open;
          setOpen(willOpen);
          if (willOpen && count > 0) {
            window.dispatchEvent(new Event('odv:vault-open'));
          }
        }}
        className="relative inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground shadow-sm transition-all hover:-translate-y-0.5 hover:border-accent/30 hover:text-accent hover:shadow-md active:scale-95"
        title={t('nav.notifications')}
        aria-label={t('nav.notifications')}
      >
        <AppIcon name="bell" className="size-4" />
        {count > 0 && (
          <span className="absolute -end-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold leading-none text-white">
            {count > 9 ? '9+' : count}
          </span>
        )}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute end-0 top-full z-50 mt-2 flex max-h-80 w-80 flex-col overflow-hidden rounded-xl border border-border bg-card shadow-xl">
            <div className="flex items-center justify-between border-b border-border/60 bg-muted/20 px-3 py-2">
              <span className="text-sm font-semibold text-foreground">{t('nav.notifications')}</span>
              <a href="/vault" onClick={() => setOpen(false)} className="text-xs font-medium text-accent hover:underline">{t('nav.openVault') + ' →'}</a>
            </div>
            <div className="flex-1 overflow-y-auto">
              {items.length === 0 ? (
                <div className="p-4 text-center text-sm text-muted-foreground">{t('nav.noNotifications')}</div>
              ) : (
                items.slice(0, 10).map((n) => (
                  <div
                    key={n.id}
                    className="group/notify relative flex w-full items-center gap-1 border-b border-border/40 px-3 py-2 text-start transition-colors hover:bg-accent/10"
                  >
                    <button
                      onClick={() => { setOpen(false); window.dispatchEvent(new CustomEvent('odv:openNotify', { detail: n })); window.location.href = '/vault'; }}
                      className="flex min-w-0 flex-1 flex-col gap-1 text-start"
                      title={n.target}
                    >
                      <span className="truncate text-sm font-medium text-foreground">{n.title || n.target || 'Notify'}</span>
                      <span className="truncate text-xs text-muted-foreground">{n.target} · {n.from_user}</span>
                    </button>
                    {canDelete && (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); void remove(n.id); }}
                        className="shrink-0 rounded-md p-1 text-muted-foreground opacity-0 transition-all hover:bg-destructive/10 hover:text-destructive group-hover/notify:opacity-100"
                        title={t('nav.delete')}
                        aria-label={t('nav.delete')}
                      >
                        <AppIcon name="delete" className="size-3.5" />
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

interface AppShellProps {
  dark: boolean;
  toggleTheme: () => void;
  children: ReactNode;
}

/** Desktop shell — collapsible sidebar (icon rail when collapsed) + content. */
export function AppShell({ dark, toggleTheme, children }: AppShellProps): ReactNode {
  const { t } = useI18n();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem('odv_sidebar_collapsed') === '1',
  );

  const toggleCollapsed = (): void => {
    setCollapsed((c) => {
      localStorage.setItem('odv_sidebar_collapsed', c ? '0' : '1');
      return !c;
    });
  };

  const go =
    (path: string) =>
    (e: React.MouseEvent<HTMLAnchorElement>): void => {
      e.preventDefault();
      navigate(path);
    };

  const nav = buildNav(t);
  const system = buildSystemNav(t);
  const activeSection = nav.find((n) => n.match(location.pathname));

  const dock = [
    { path: '/activity', label: t('nav.activity'), icon: <Activity className="size-4" /> },
    { path: '/latest', label: t('nav.latest'), icon: <Sparkles className="size-4" /> },
  ];

  return (
    <div className="app-bg flex min-h-screen">
      {/* Ambient background — always running (ticket 075) + blueprint grid (ticket 065) */}
      <div className="ambient-bg" aria-hidden="true">
        <div className="blueprint-grid" />
        <div className="ambient-blob ambient-blob-1" />
        <div className="ambient-blob ambient-blob-2" />
        <div className="ambient-blob ambient-blob-3" />
      </div>
      <aside
        className={`sticky top-0 z-10 flex h-screen shrink-0 flex-col border-e border-border/60 bg-sidebar transition-[width] duration-200 ease-out ${
          collapsed ? 'w-16' : 'w-[13.5rem]'
        }`}
      >
        <SidebarContent
          nav={nav}
          system={system}
          go={go}
          user={user}
          logout={logout}
          dark={dark}
          toggleTheme={toggleTheme}
          location={location}
          dock={dock}
          collapsed={collapsed}
          onProfile={() => navigate('/settings?page=accounts')}
        />
        <button
          onClick={toggleCollapsed}
          className="absolute -end-3 top-1/2 z-10 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full border border-border/70 bg-card text-muted-foreground shadow-md transition-all duration-150 hover:bg-accent hover:text-foreground active:scale-90"
          aria-label={collapsed ? t('nav.expand') : t('nav.collapse')}
          title={collapsed ? t('nav.expand') : t('nav.collapse')}
        >
          {collapsed ? <PanelLeftOpen className="size-3.5" /> : <PanelLeftClose className="size-3.5" />}
        </button>
      </aside>

      <div className="relative z-10 flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border/60 bg-background/80 px-6 backdrop-blur-md">
          <h1 className="text-lg font-semibold tracking-tight text-foreground">
            {activeSection?.label ?? ''}
          </h1>
          <div className="flex items-center gap-2">
            <HeaderNotifyIcon />
            <HeaderActions />
          </div>
        </header>
        <main className="min-w-0 flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}