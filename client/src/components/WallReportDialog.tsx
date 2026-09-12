import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useI18n, buildExportStrings } from '@/lib/i18n';
import { api } from '@/lib/api';
import { sound } from '@/lib/sound';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { FileCode2, FileText, FolderOpen, Layers, Loader2, Square } from 'lucide-react';

interface WallReportDialogProps {
  open: boolean;
  onClose: () => void;
  /** Open directly in the Full (Export) mode — used by the wall Total card. */
  initialMode?: 'summary' | 'full';
}

type Mode = 'summary' | 'full';
type SummaryFormat = 'html' | 'md' | 'both';
type ExportMode = 'html' | 'zip';
interface ClusterOption {
  code: string;
  name: string;
  project_name: string;
  is_default: number;
}

/** Wall dashboard export (v3 item 26 + ticket 132/133) — two modes:
 *  1. Wall summary (HTML / MD / both) via /api/reports/wall.
 *  2. Full panel (all requests) — "Export": pick a Cluster, then HTML-only
 *     (single self-contained file) or HTML + ZIP (folder `<projId>-<cluster>-
 *     requestslog-<ts>` + hidden deps/ fonts, works offline on any PC). */
export function WallReportDialog({ open, onClose, initialMode = 'summary' }: WallReportDialogProps): ReactNode {
  const { t, lang } = useI18n();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [format, setFormat] = useState<SummaryFormat>('html');
  const [exportMode, setExportMode] = useState<ExportMode>('html');
  const [clusters, setClusters] = useState<ClusterOption[]>([]);
  const [cluster, setCluster] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number; stage: string } | null>(null);
  const [files, setFiles] = useState<string[]>([]);
  const [cancelled, setCancelled] = useState(false);
  const [error, setError] = useState('');
  const pollRef = useRef<number | null>(null);
  const jobRef = useRef<string | null>(null);

  useEffect(() => {
    if (!open) return;
    // Stop any polling when the dialog closes.
    if (pollRef.current) { window.clearInterval(pollRef.current); pollRef.current = null; }
    setCancelled(false); setFiles([]); setProgress(null); setError('');
    jobRef.current = null;
    api<{ clusters: ClusterOption[] }>('/api/clusters')
      .then((r) => {
        const list = r.clusters ?? [];
        setClusters(list);
        const def = list.find((c) => c.is_default === 1) ?? list[0];
        if (def) setCluster((prev) => prev || def.code);
      })
      .catch(() => undefined);
  }, [open]);

  const stopJob = async (): Promise<void> => {
    const id = jobRef.current;
    if (!id) return;
    try { await api(`/api/reports/wall/full-panel/job/${id}/cancel`, { method: 'POST' }); } catch { /* ignore */ }
  };

  // Download a directly-streamed report (summary /wall) into the browser.
  const downloadStream = async (body: Record<string, unknown>, suffix: string): Promise<void> => {
    const token = localStorage.getItem('odv_token') ?? '';
    const res = await fetch('/api/reports/wall', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      let msg = t('wall.reportError');
      try { const j = await res.json(); if (j?.error) msg = String(j.error); } catch { /* ignore */ }
      throw new Error(msg);
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `wall-report-${Date.now()}.${suffix}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  };

  // Poll the full-panel export job until it finishes.
  const startPolling = (id: string): void => {
    jobRef.current = id;
    if (pollRef.current) window.clearInterval(pollRef.current);
    pollRef.current = window.setInterval(() => {
      void (async () => {
        try {
          const s = await api<{ status: string; files: string[]; error: string; copied: number; total: number; stage: string }>(`/api/reports/wall/full-panel/job/${id}`);
          setProgress({ done: s.copied, total: s.total, stage: s.stage });
          if (s.status === 'done') {
            if (pollRef.current) window.clearInterval(pollRef.current);
            pollRef.current = null;
            setFiles(s.files ?? []);
            setBusy(false);
            sound.success();
          } else if (s.status === 'cancelled') {
            if (pollRef.current) window.clearInterval(pollRef.current);
            pollRef.current = null;
            setBusy(false);
            setCancelled(true);
          } else if (s.status === 'error') {
            if (pollRef.current) window.clearInterval(pollRef.current);
            pollRef.current = null;
            setBusy(false);
            setError(s.error || t('wall.reportError'));
            sound.error();
          }
        } catch {
          // transient poll error — keep trying
        }
      })();
    }, 1200);
  };

  const run = async (): Promise<void> => {
    setBusy(true);
    setError('');
    setFiles([]);
    setCancelled(false);
    setProgress(null);
    try {
      if (mode === 'summary') {
        // Summary: server streams a download directly to the browser.
        const suffix = format === 'md' ? 'md' : format === 'both' ? 'zip' : 'html';
        await downloadStream({ format }, suffix);
        setBusy(false);
        sound.success();
      } else {
        // Full panel: folder picker first (server), then a cancellable job.
        const res = await api<{ ok?: boolean; jobId?: string; baseName?: string; cancelled?: boolean; error?: string }>('/api/reports/wall/full-panel', {
          method: 'POST',
          body: { cluster, mode: exportMode, lang, strings: buildExportStrings() },
        });
        if (res.cancelled) {
          setBusy(false);
          setCancelled(true);
        } else if (res.ok && res.jobId) {
          startPolling(res.jobId);
        } else {
          setBusy(false);
          setError(res.error ?? t('wall.reportError'));
          sound.error();
        }
      }
    } catch (err) {
      setBusy(false);
      setError(err instanceof Error ? err.message : String(err));
      sound.error();
    }
  };

  const modeBtn = (m: Mode, label: string, icon: ReactNode): ReactNode => (
    <button
      type="button"
      onClick={() => setMode(m)}
      className={`flex flex-1 flex-col items-center gap-2 rounded-xl border p-4 text-sm font-medium transition-all ${
        mode === m
          ? 'border-primary bg-primary/10 text-primary shadow-sm'
          : 'border-border/70 text-muted-foreground hover:border-primary/40 hover:text-foreground'
      }`}
    >
      {icon}
      {label}
    </button>
  );

  const formatBtn = (f: SummaryFormat, label: string, icon: ReactNode): ReactNode => (
    <button
      type="button"
      onClick={() => setFormat(f)}
      className={`flex flex-1 flex-col items-center gap-2 rounded-xl border p-4 text-sm font-medium transition-all ${
        format === f
          ? 'border-primary bg-primary/10 text-primary shadow-sm'
          : 'border-border/70 text-muted-foreground hover:border-primary/40 hover:text-foreground'
      }`}
    >
      {icon}
      {label}
    </button>
  );

  const stageLabel = (s?: string): string => {
    if (s === 'read') return t('wall.stageRead');
    if (s === 'copy') return t('wall.stageCopy');
    if (s === 'build') return t('wall.stageBuild');
    if (s === 'compress') return t('wall.stageCompress');
    if (s === 'done') return t('wall.reportSaved');
    return t('wall.reportPicking');
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileCode2 className="size-5 text-primary" />
            {t('wall.reportTitle')}
          </DialogTitle>
        </DialogHeader>

        <div className="-mt-1 flex flex-col gap-4 px-6 pb-6">
          <div className="flex gap-2">
            {modeBtn('summary', t('wall.reportSummary'), <FileText className="size-5" />)}
            {modeBtn('full', t('wall.reportFullPanel'), <Layers className="size-5" />)}
          </div>

          {mode === 'summary' ? (
            <>
              <p className="text-sm text-muted-foreground">{t('wall.reportHint')}</p>
              <div className="flex gap-2">
                {formatBtn('html', t('wall.reportHtml'), <FileCode2 className="size-5" />)}
                {formatBtn('md', t('wall.reportMd'), <FileText className="size-5" />)}
                {formatBtn('both', t('wall.reportBoth'), <FolderOpen className="size-5" />)}
              </div>
            </>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">{t('wall.reportFullHint')}</p>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-muted-foreground">{t('wall.reportCluster')}</label>
                <Select value={cluster} onChange={(e) => setCluster(e.target.value)}>
                  <option value="">{t('records.filters')}</option>
                  {clusters.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.code} — {c.project_name || c.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setExportMode('html')}
                  className={`flex flex-1 flex-col items-center gap-2 rounded-xl border p-4 text-sm font-medium transition-all ${
                    exportMode === 'html'
                      ? 'border-primary bg-primary/10 text-primary shadow-sm'
                      : 'border-border/70 text-muted-foreground hover:border-primary/40 hover:text-foreground'
                  }`}
                >
                  <FileCode2 className="size-5" />
                  {t('wall.reportHtmlOnly')}
                </button>
                <button
                  type="button"
                  onClick={() => setExportMode('zip')}
                  className={`flex flex-1 flex-col items-center gap-2 rounded-xl border p-4 text-sm font-medium transition-all ${
                    exportMode === 'zip'
                      ? 'border-primary bg-primary/10 text-primary shadow-sm'
                      : 'border-border/70 text-muted-foreground hover:border-primary/40 hover:text-foreground'
                  }`}
                >
                  <FolderOpen className="size-5" />
                  {t('wall.reportHtmlZip')}
                </button>
              </div>
            </>
          )}

          {busy && (
            <div className="flex flex-col gap-2 rounded-xl border border-border/70 bg-muted/40 p-3">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                {progress?.stage ? stageLabel(progress.stage) : t('wall.reportPicking')}
                {mode === 'full' && jobRef.current && (
                  <Button size="sm" variant="outline" className="ms-auto gap-1.5 text-destructive hover:text-destructive" onClick={() => void stopJob()}>
                    <Square className="size-3.5 fill-current" />
                    {t('wall.stop')}
                  </Button>
                )}
              </div>
              {progress?.stage === 'copy' && progress.total > 0 && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="shrink-0">{t('wall.pdfCount')}: {progress.done} / {progress.total}</span>
                  <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                    <span
                      className="block h-full rounded-full bg-primary transition-all"
                      style={{ width: `${Math.min(100, (progress.done / progress.total) * 100)}%` }}
                    />
                  </span>
                </div>
              )}
            </div>
          )}

          {cancelled && !busy && (
            <div className="rounded-xl border border-border/70 bg-muted/40 p-3 text-sm text-muted-foreground">
              {t('wall.reportCancelled')}
            </div>
          )}

          {error && !busy && <div className="text-sm text-destructive">{error}</div>}

          {files.length > 0 && !busy && (
            <div className="flex flex-col gap-2 rounded-xl border border-success/40 bg-success/10 p-3 dark:border-success/40 dark:bg-success/10">
              <div className="text-sm font-medium text-success dark:text-success">{t('wall.reportSaved')}</div>
              {files.map((f) => (
                <div key={f} className="flex items-center justify-between gap-2 text-xs">
                  <span className="truncate font-mono text-muted-foreground" title={f}>
                    {f.split(/[\\/]/).pop()}
                  </span>
                </div>
              ))}
              <span className="text-[11px] text-muted-foreground">{t('wall.reportSavedHint')}</span>
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>
              {t('form.cancel')}
            </Button>
            <Button onClick={() => void run()} disabled={busy || (mode === 'full' && !cluster)} className="gap-1.5">
              <FolderOpen className="size-4" />
              {t('wall.reportCreate')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
