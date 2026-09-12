import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { FileImage, FileCheck2, ExternalLink, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';

interface ScanItem {
  name: string;
  size: number;
  modifiedAt: string;
}

interface ScanAttachModalProps {
  open: boolean;
  recordId: number | null;
  requestLabel: string;
  onClose: () => void;
  onAttached: (hyperlink: string) => void;
}

function fmtSize(n: number): string {
  if (n >= 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  if (n >= 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${n} B`;
}

function fmtDate(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

function extBadge(name: string): { label: string; cls: string } {
  const e = name.toLowerCase().split('.').pop() ?? '';
  if (e === 'pdf') return { label: 'PDF', cls: 'bg-destructive/10 text-destructive' };
  if (e === 'tif' || e === 'tiff') return { label: 'TIFF', cls: 'bg-primary/10 text-primary' };
  return { label: 'IMG', cls: 'bg-warning/10 text-warning' };
}

export function ScanAttachModal({ open, recordId, requestLabel, onClose, onAttached }: ScanAttachModalProps): ReactNode {
  const { t } = useI18n();
  const [items, setItems] = useState<ScanItem[]>([]);
  const [dir, setDir] = useState('');
  const [loading, setLoading] = useState(false);
  const [busyName, setBusyName] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError('');
    try {
      const r = await api<{ items: ScanItem[]; dir: string }>('/api/scans/');
      setItems(r.items ?? []);
      setDir(r.dir ?? '');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    setDone(null);
    setError('');
    void load();
  }, [open, load]);

  const attach = useCallback(
    async (name: string): Promise<void> => {
      if (!recordId) return;
      setBusyName(name);
      setError('');
      setDone(null);
      try {
        const r = await api<{ hyperlink: string }>(`/api/scans/${encodeURIComponent(name)}/attach`, {
          method: 'POST',
          body: { recordId },
        });
        setDone(name);
        onAttached(r.hyperlink);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setBusyName(null);
      }
    },
    [recordId, onAttached],
  );

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileCheck2 className="size-5 text-primary" />
            {t('scan.logPdf')} — {requestLabel}
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-3 px-6 pb-6">
          <p className="text-sm text-muted-foreground">{t('scan.attachHint')}</p>

          {dir && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="shrink-0">{t('scan.watchFolder')}:</span>
              <code className="truncate rounded bg-muted/60 px-1.5 py-0.5">{dir}</code>
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              <AlertCircle className="size-4 shrink-0" />
              {error}
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              {t('common.loading')}
            </div>
          ) : items.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">{t('scan.noScans')}</div>
          ) : (
            <div className="flex max-h-[46vh] flex-col gap-2 overflow-y-auto pr-1">
              {items.map((it) => {
                const b = extBadge(it.name);
                const busy = busyName === it.name;
                const ok = done === it.name;
                return (
                  <div
                    key={it.name}
                    className={`flex items-center gap-3 rounded-xl border border-border/70 bg-card/60 px-3 py-2 ${ok ? 'border-success/50 bg-success/5' : ''}`}
                  >
                    <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${b.cls}`}>
                      <FileImage className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-foreground">{it.name}</div>
                      <div className="truncate text-[11px] text-muted-foreground">
                        {fmtSize(it.size)} · {fmtDate(it.modifiedAt)}
                      </div>
                    </div>
                    <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold ${b.cls}`}>{b.label}</span>
                    <a
                      href={`/api/scans/${encodeURIComponent(it.name)}/file`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                      title={t('scan.preview')}
                    >
                      <ExternalLink className="size-4" />
                    </a>
                    <Button size="sm" variant={ok ? 'outline' : 'default'} disabled={busy || !!done} onClick={() => void attach(it.name)} className="gap-1.5">
                      {busy ? <Loader2 className="size-3.5 animate-spin" /> : ok ? <CheckCircle2 className="size-3.5" /> : <FileCheck2 className="size-3.5" />}
                      {busy ? t('scan.attaching') : ok ? t('scan.attached') : t('scan.attach')}
                    </Button>
                  </div>
                );
              })}
            </div>
          )}

          <div className="flex justify-end gap-2 border-t border-border/60 pt-3">
            <Button variant="outline" onClick={onClose}>
              {t('scan.cancel')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
