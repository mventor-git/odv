import { useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { SidebarContent } from '@/components/SidebarContent';
import { WallReportDialog } from '@/components/WallReportDialog';
import { buildNav, buildSystemNav } from '@/lib/nav';
import { Activity, FileCode2, Menu, MoreHorizontal, Plus, ScanLine, Sparkles, Table2 } from 'lucide-react';
import { AppIcon } from '@/icons/AppIcon';
import { useNotifyBadge } from '@/lib/useNotifyBadge';

function MobileNotifyIcon(): React.ReactNode {
  const { t } = useI18n();
  const { user } = useAuth();
  const { count, items, open, setOpen, remove } = useNotifyBadge();
  const canDelete = user?.role === 'admin' || user?.role === 'dev';
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground shadow-sm"
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
          <div className="absolute end-0 top-full z-50 mt-2 flex max-h-80 w-64 flex-col overflow-hidden rounded-xl border border-border bg-card shadow-xl">
            <div className="flex items-center justify-between border-b border-border/60 bg-muted/20 px-3 py-2">
              <span className="text-sm font-semibold">{t('nav.notifications')}</span>
              <a href="/vault" onClick={() => setOpen(false)} className="text-xs text-accent hover:underline">{t('nav.openVault') + ' →'}</a>
            </div>
            <div className="flex-1 overflow-y-auto">
              {items.length === 0 ? (
                <div className="p-4 text-center text-sm text-muted-foreground">{t('nav.noNotifications')}</div>
              ) : (
                items.slice(0, 10).map((n) => (
                  <div key={n.id} className="group/notify relative flex w-full items-center gap-1 border-b border-border/40 px-3 py-2 text-start hover:bg-accent/10">
                    <button onClick={() => { setOpen(false); window.location.href = '/vault'; }} className="flex min-w-0 flex-1 flex-col gap-1 text-start">
                      <span className="truncate text-sm font-medium">{n.title || n.target}</span>
                      <span className="truncate text-xs text-muted-foreground">{n.target}</span>
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

interface MobileShellProps {
  dark: boolean;
  toggleTheme: () => void;
  children: ReactNode;
}

/** Mobile shell — top bar + hamburger drawer with the same sidebar content (ticket 037). */
export function MobileShell({ dark, toggleTheme, children }: MobileShellProps): ReactNode {
  const { t } = useI18n();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [overflowOpen, setOverflowOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);

  const go =
    (path: string) =>
    (e: React.MouseEvent<HTMLAnchorElement>): void => {
      e.preventDefault();
      navigate(path);
      setDrawerOpen(false);
    };

  const nav = buildNav(t);
  const system = buildSystemNav(t);
  const activeSection = nav.find((n) => n.match(location.pathname));

  return (
    <div className="app-bg flex min-h-screen flex-col">
      {/* Ambient background — always running (ticket 075) + blueprint grid (ticket 065) */}
      <div className="ambient-bg" aria-hidden="true">
        <div className="blueprint-grid" />
        <div className="ambient-blob ambient-blob-1" />
        <div className="ambient-blob ambient-blob-2" />
        <div className="ambient-blob ambient-blob-3" />
      </div>
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border/60 bg-background/80 px-3 backdrop-blur-md">
        <div className="flex min-w-0 items-center gap-2">
          <button
            onClick={() => setDrawerOpen(true)}
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            aria-label="Menu"
          >
            <Menu className="size-5" />
          </button>
          <h1 className="truncate text-base font-semibold tracking-tight text-foreground">
            {activeSection?.label ?? ''}
          </h1>
        </div>
        <div className="flex shrink-0 items-center gap-1">
        <MobileNotifyIcon />
        <button
          onClick={() => navigate('/requests/new')}
          className="inline-flex items-center gap-1 rounded-lg bg-accent px-2.5 py-1.5 text-sm font-medium text-white shadow-md shadow-accent/20 transition-colors hover:bg-accent/90"
          aria-label={t('records.new')}
        >
          <Plus className="size-4" />
        </button>
        {/* Overflow menu — the rest of the quick actions (ticket 088) */}
        <div className="relative">
          <button
            onClick={() => setOverflowOpen((o) => !o)}
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            aria-label={t('nav.more')}
          >
            <MoreHorizontal className="size-5" />
          </button>
          {overflowOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setOverflowOpen(false)} />
              <div className="absolute end-0 top-full z-50 mt-1 flex w-44 flex-col gap-0.5 rounded-xl border border-border/70 bg-card p-1.5 shadow-xl">
                <button
                  onClick={() => { setOverflowOpen(false); navigate('/requests/scan'); }}
                  className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-foreground transition-colors hover:bg-accent"
                >
                  <ScanLine className="size-4" />
                  {t('wall.logScan')}
                </button>
                <button
                  onClick={() => { setOverflowOpen(false); navigate('/requests'); }}
                  className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-foreground transition-colors hover:bg-accent"
                >
                  <Table2 className="size-4" />
                  {t('wall.openRecords')}
                </button>
                <button
                  onClick={() => { setOverflowOpen(false); setReportOpen(true); }}
                  className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-foreground transition-colors hover:bg-accent"
                >
                  <FileCode2 className="size-4" />
                  {t('wall.createReport')}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
      </header>

      <main className="relative z-10 min-w-0 flex-1 p-3">{children}</main>

      <WallReportDialog open={reportOpen} onClose={() => setReportOpen(false)} />

      {drawerOpen && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/40" onClick={() => setDrawerOpen(false)} />
          <aside className="absolute inset-y-0 start-0 flex w-[16rem] flex-col border-e border-border/60 bg-sidebar shadow-2xl">
            <SidebarContent
              nav={nav}
              system={system}
              go={go}
              user={user}
              logout={logout}
              dark={dark}
              toggleTheme={toggleTheme}
              location={location}
              dock={[
                {
                  path: '/activity',
                  label: t('nav.activity'),
                  icon: <Activity className="size-4" />,
                },
                {
                  path: '/latest',
                  label: t('nav.latest'),
                  icon: <Sparkles className="size-4" />,
                },
              ]}
              onProfile={() => navigate('/settings?page=accounts')}
            />
          </aside>
        </div>
      )}
    </div>
  );
}