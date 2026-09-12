import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useI18n } from '@/lib/i18n';
import { openWallFullPanel } from '@/lib/report';
import { Button } from '@/components/ui/button';
import { AppIcon } from '@/icons/AppIcon';

/** Hidden print page (ticket 114) — opens the standalone Total Requests panel
 *  in a new tab. Reached via /wall-print; the report is generated client-side
 *  with all records + metadata and a FULL REQUESTS PANEL EXPORT button. */
export function WallPrintPage(): ReactNode {
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  const open = useCallback(async (): Promise<void> => {
    setBusy(true);
    setError('');
    try {
      await openWallFullPanel({
        title: t('wall.totalRequests'),
        stats: { total: 0, byStatus: {}, byCategory: {}, byBucket: {} },
        meta: { categories: [], statuses: [], zones: [], floors: [] },
        lang,
      });
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [t, lang]);

  useEffect(() => {
    void open();
  }, [open]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 text-center shadow-sm">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-accent text-white shadow-md">
          <AppIcon name="printer" className="size-6" />
        </div>
        <h1 className="text-lg font-semibold text-foreground">{t('wall.totalRequests')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t('wall.metaTotalSub')}
        </p>

        {busy && (
          <div className="mt-4 flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <AppIcon name="loader" className="size-4 animate-spin" />
            {t('common.loading')}
          </div>
        )}

        {done && !busy && (
          <div className="mt-4 rounded-lg border border-success/30 bg-success/10 px-3 py-2 text-sm text-success">
            {t('wall.printReport')}
          </div>
        )}

        {error && (
          <div className="mt-4 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          <Button onClick={() => void open()} disabled={busy} className="gap-1.5">
            <AppIcon name="printer" className="size-4" />
            {t('wall.printReport')}
          </Button>
          <Button variant="outline" onClick={() => navigate('/')} className="gap-1.5">
            <AppIcon name="close" className="size-4" />
            {t('nav.backHome')}
          </Button>
        </div>
      </div>
    </div>
  );
}
