import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { Button } from '@/components/ui/button';
import { FolderOpen, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';

/** Admin/dev: choose the scan watch-folder where scans land. Persists to
 *  app_settings.SCANS_WATCH_DIR. */
export function ScanWatchFolder(): ReactNode {
  const { t } = useI18n();
  const [dir, setDir] = useState('');
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (): Promise<void> => {
    try {
      const r = await api<{ dir: string }>('/api/scans/watch-folder');
      setDir(r.dir ?? '');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const browse = useCallback(async (): Promise<void> => {
    setBusy(true);
    setError('');
    setSaved(false);
    try {
      const r = await api<{ ok: boolean; dir?: string; current?: string; cancelled?: boolean }>('/api/scans/pick-folder', {
        method: 'POST',
      });
      if (r.ok && r.dir) {
        setDir(r.dir);
        setSaved(true);
      } else if (r.cancelled) {
        // user cancelled the server dialog — keep current
      } else if (r.current) {
        setDir(r.current);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, []);

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        {t('scan.subtitle')}
      </p>

      <div className="flex flex-col gap-1 rounded-xl border border-border/70 bg-muted/20 p-3">
        <label className="text-xs font-medium text-muted-foreground">{t('scan.watchFolder')}:</label>
        <code className="truncate rounded bg-card px-2 py-1 text-sm text-foreground">{dir || '—'}</code>
      </div>

      {saved && (
        <div className="flex items-center gap-2 rounded-lg border border-success/40 bg-success/10 px-3 py-2 text-sm text-success">
          <CheckCircle2 className="size-4 shrink-0" />
          {t('scan.savedWatch')}
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <AlertCircle className="size-4 shrink-0" />
          {error}
        </div>
      )}

      <div className="flex gap-2">
        <Button variant="outline" className="gap-1.5" disabled={busy} onClick={() => void browse()}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : <FolderOpen className="size-4" />}
          {t('scan.browse')}
        </Button>
      </div>
    </div>
  );
}
