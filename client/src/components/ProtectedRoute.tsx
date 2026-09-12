import { useEffect, useState, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { api } from '@/lib/api';

export function ProtectedRoute({ children }: { children: ReactNode }): ReactNode {
  const { user, loading } = useAuth();
  const { t } = useI18n();
  const location = useLocation();
  // First-run wizard check (ticket 107) — redirect to /setup while zones are empty.
  const [wizard, setWizard] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!user) return;
    api<{ needsWizard: boolean }>('/api/setup/status')
      .then((r) => { if (!cancelled) setWizard(r.needsWizard); })
      .catch(() => { if (!cancelled) setWizard(false); });
    return () => { cancelled = true; };
  }, [user]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center text-muted-foreground">
        {t('common.loading')}
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  // Only admins see the wizard; engineers skip it once zones exist.
  if (wizard === true && (user.role === 'admin' || user.role === 'dev') && !location.pathname.startsWith('/setup')) {
    return <Navigate to="/setup" replace />;
  }
  return <>{children}</>;
}
