import { useEffect, useState, type ReactNode } from 'react';
import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation, useParams } from 'react-router-dom';
import { I18nProvider } from '@/lib/i18n';
import { AuthProvider } from '@/lib/auth';
import { sound } from '@/lib/sound';
import { api } from '@/lib/api';
import type { DcRecord } from '@/lib/types';
import { useIsMobile } from '@/lib/useIsMobile';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { AppShell } from '@/components/AppShell';
import { MobileShell } from '@/components/MobileShell';
import { LoginPage } from '@/pages/LoginPage';
import { HomePage } from '@/pages/HomePage';
import React from 'react';
// Lazy-loaded feature chunks (V5-034: feature-loaded bundle rather than monolithic)
const ActivityPage = React.lazy(() => import('@/pages/ActivityPage.tsx').then(m => ({ default: m.ActivityPage })));
const LatestPage = React.lazy(() => import('@/pages/LatestPage.tsx').then(m => ({ default: m.LatestPage })));
const TrashPage = React.lazy(() => import('@/pages/TrashPage.tsx').then(m => ({ default: m.TrashPage })));
const RequestsPage = React.lazy(() => import('@/pages/RequestsPage.tsx').then(m => ({ default: m.RequestsPage })));
const RecordsPage = React.lazy(() => import('@/pages/RecordsPage.tsx').then(m => ({ default: m.RecordsPage })));
const StatusPage = React.lazy(() => import('@/pages/StatusPage.tsx').then(m => ({ default: m.StatusPage })));
const RequestMakingWizard = React.lazy(() => import('@/components/RequestMakingWizard.tsx').then(m => ({ default: m.RequestMakingWizard })));
const ScanPage = React.lazy(() => import('@/pages/ScanPage.tsx').then(m => ({ default: m.ScanPage })));
const RequestDetailsPage = React.lazy(() => import('@/pages/RequestDetailsPage.tsx').then(m => ({ default: m.RequestDetailsPage })));
const CementPage = React.lazy(() => import('@/pages/CementPage.tsx').then(m => ({ default: m.CementPage })));
const ChecklistPage = React.lazy(() => import('@/pages/ChecklistPage.tsx').then(m => ({ default: m.ChecklistPage })));
const HelpDocsPage = React.lazy(() => import('@/pages/HelpDocsPage.tsx').then(m => ({ default: m.HelpDocsPage })));
const VaultPage = React.lazy(() => import('@/pages/VaultPage.tsx').then(m => ({ default: m.VaultPage })));
const UsersPage = React.lazy(() => import('@/pages/UsersPage.tsx').then(m => ({ default: m.UsersPage })));
const LegacyPage = React.lazy(() => import('@/pages/LegacyPage.tsx').then(m => ({ default: m.LegacyPage })));
const SettingsPage = React.lazy(() => import('@/pages/SettingsPage.tsx').then(m => ({ default: m.SettingsPage })));
const NotFoundPage = React.lazy(() => import('@/pages/NotFoundPage.tsx').then(m => ({ default: m.NotFoundPage })));
const WallPrintPage = React.lazy(() => import('@/components/WallPrintPage.tsx').then(m => ({ default: m.WallPrintPage })));
const SetupWizardPage = React.lazy(() => import('@/pages/SetupWizardPage.tsx').then(m => ({ default: m.SetupWizardPage })));

/** Suspense fallback — quiet warm surface (V5-034) */
function PageFallback(): React.ReactNode {
  return <div className="p-8 text-sm text-muted-foreground">Loading…</div>;
}

/** Global UI sounds (ticket 075 round 2) — every interactive element plays a
 *  soft click: buttons, links, selects, inputs, checkboxes, switches, labels,
 *  menu items. The mute toggle silences everything. */
function useGlobalSounds(): void {
  useEffect(() => {
    const onClick = (e: MouseEvent): void => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      const el = target.closest(
        'button, a, select, input, textarea, label, summary, [role="button"], [role="switch"], [role="menuitem"], [role="option"]',
      );
      if (el) sound.click();
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, []);
}

function useTheme(): { dark: boolean; toggle: () => void } {
  const [dark, setDark] = useState(() => {
    const saved = localStorage.getItem('odv_theme');
    if (saved) return saved === 'dark';
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
  });

  useEffect(() => {
    // Smooth full-page transition so user sees dark↔light
    document.documentElement.classList.add('page-switching');
    const id = window.setTimeout(() => document.documentElement.classList.remove('page-switching'), 500);
    document.documentElement.classList.toggle('dark', dark);
    localStorage.setItem('odv_theme', dark ? 'dark' : 'light');
    return () => window.clearTimeout(id);
  }, [dark]);

  return {
    dark,
    toggle: () => {
      document.documentElement.classList.add('page-switching');
      window.setTimeout(() => document.documentElement.classList.remove('page-switching'), 500);
      setDark((d) => !d);
    },
  };
}

/** Desktop layout — static sidebar + dock. */
function Layout(): ReactNode {
  const { dark, toggle } = useTheme();
  return (
    <AppShell dark={dark} toggleTheme={toggle}>
      <Outlet />
    </AppShell>
  );
}

/** Mobile layout — top bar + drawer (ticket 037). */
function MobileLayout(): ReactNode {
  const { dark, toggle } = useTheme();
  return (
    <MobileShell dark={dark} toggleTheme={toggle}>
      <Outlet />
    </MobileShell>
  );
}

/**
 * Device gate (ticket 037): phones are redirected to /m/… (mobile shell),
 * desktops to /… (desktop shell). The same pages render under both.
 */
function DeviceGate({ mobile, children }: { mobile?: boolean; children: ReactNode }): ReactNode {
  const isMobile = useIsMobile();
  const location = useLocation();
  if (mobile && !isMobile) {
    const target = `${location.pathname.replace(/^\/m/, '') || '/'}${location.search}`;
    return <Navigate to={target} replace />;
  }
  if (!mobile && isMobile) {
    const target = `/m${location.pathname === '/' ? '' : location.pathname}${location.search}`;
    return <Navigate to={target} replace />;
  }
  return <>{children}</>;
}

/** Old edit route → redirect into the request card with edit mode on. */
function RecordEditRedirect(): ReactNode {
  const { id } = useParams<{ id: string }>();
  const [target, setTarget] = useState<string | null>(null);

  useEffect(() => {
    api<DcRecord>(`/api/records/${id}`)
      .then((r) =>
        setTarget(
          `/requests/${encodeURIComponent(r.category)}/${encodeURIComponent(r.requestNo)}?edit=1`,
        ),
      )
      .catch(() => setTarget('/requests'));
  }, [id]);

  if (!target) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
  return <Navigate to={target} replace />;
}

/** The same page tree under both the desktop shell and the mobile shell. */
function AppRoutes(): ReactNode {
  return (
    <>
      <Route index element={<HomePage />} />
      <Route path="activity" element={<React.Suspense fallback={<PageFallback />}><ActivityPage /></React.Suspense>} />
      <Route path="latest" element={<React.Suspense fallback={<PageFallback />}><LatestPage /></React.Suspense>} />
      <Route path="trash" element={<React.Suspense fallback={<PageFallback />}><TrashPage /></React.Suspense>} />
      <Route path="requests" element={<React.Suspense fallback={<PageFallback />}><RequestsPage /></React.Suspense>} />
      <Route path="requests/records" element={<React.Suspense fallback={<PageFallback />}><RecordsPage /></React.Suspense>} />
      <Route path="requests/recorded/:status" element={<React.Suspense fallback={<PageFallback />}><StatusPage /></React.Suspense>} />
      <Route path="requests/new" element={<React.Suspense fallback={<PageFallback />}><RequestMakingWizard /></React.Suspense>} />
      <Route path="requests/:id/edit" element={<RecordEditRedirect />} />
      <Route path="requests/scan" element={<React.Suspense fallback={<PageFallback />}><ScanPage /></React.Suspense>} />
      <Route path="requests/:category/:requestNo" element={<React.Suspense fallback={<PageFallback />}><RequestDetailsPage /></React.Suspense>} />
      <Route path="cement" element={<React.Suspense fallback={<PageFallback />}><CementPage /></React.Suspense>} />
      <Route path="checklist" element={<React.Suspense fallback={<PageFallback />}><ChecklistPage /></React.Suspense>} />
      <Route path="help" element={<React.Suspense fallback={<PageFallback />}><HelpDocsPage /></React.Suspense>} />
      <Route path="vault" element={<React.Suspense fallback={<PageFallback />}><VaultPage /></React.Suspense>} />
      <Route path="users" element={<React.Suspense fallback={<PageFallback />}><UsersPage /></React.Suspense>} />
      <Route path="legacy" element={<React.Suspense fallback={<PageFallback />}><LegacyPage /></React.Suspense>} />
      <Route path="settings" element={<React.Suspense fallback={<PageFallback />}><SettingsPage /></React.Suspense>} />
      {/* Hidden print entry (ticket 114) — opens the standalone wall panel in a new tab */}
      <Route path="wall-print" element={<React.Suspense fallback={<PageFallback />}><WallPrintPage /></React.Suspense>} />
      {/* v1 path aliases — keep old links working */}
      <Route path="records" element={<Navigate to="/requests/records" replace />} />
      <Route path="records/new" element={<Navigate to="/requests/new" replace />} />
      <Route path="records/:id/edit" element={<Navigate to="/requests/:id/edit" replace />} />
      {/* v5 canonical aliases */}
      <Route path="m/*" element={<Navigate to="/" replace />} />
      <Route path="*" element={<React.Suspense fallback={<PageFallback />}><NotFoundPage /></React.Suspense>} />
    </>
  );
}

export default function App(): ReactNode {
  useGlobalSounds();
  return (
    <I18nProvider>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            {/* First-time setup wizard (ticket 107) — standalone page, no shell */}
            <Route
              path="/setup"
              element={
                <ProtectedRoute>
                  <React.Suspense fallback={<PageFallback />}>
                    <SetupWizardPage />
                  </React.Suspense>
                </ProtectedRoute>
              }
            />
            {/* Mobile app — phones land here via the device gate */}
            <Route
              path="/m"
              element={
                <DeviceGate mobile>
                  <ProtectedRoute>
                    <MobileLayout />
                  </ProtectedRoute>
                </DeviceGate>
              }
            >
              {AppRoutes()}
            </Route>
            {/* Desktop app */}
            <Route
              element={
                <DeviceGate>
                  <ProtectedRoute>
                    <Layout />
                  </ProtectedRoute>
                </DeviceGate>
              }
            >
              {AppRoutes()}
            </Route>
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </I18nProvider>
  );
}