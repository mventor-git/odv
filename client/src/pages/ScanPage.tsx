import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { sound } from '@/lib/sound';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { CheckCircle2, FileImage, FileText, Loader2, RefreshCw, ScanLine, XCircle } from 'lucide-react';

interface ScanItem {
  name: string;
  size: number;
  modifiedAt: string;
}

interface ScanMeta {
  kind: 'tiff' | 'pdf';
  pages?: number;
}

interface PendingRecord {
  id: number;
  category: string;
  requestNo: string;
  revisionNo: string;
  description: string;
  floor: string;
  zone: string;
  engineer: string;
  status: string;
}

/** Scan intake (ticket 067) — watch-folder gallery with TIFF/PDF preview,
 *  Add Metadata (attach a scan to a PENDING request, picking it from a labeled
 *  list: request no. + revision + description + floor + member). */
export function ScanPage(): ReactNode {
  const { t } = useI18n();
  const [items, setItems] = useState<ScanItem[]>([]);
  const [dir, setDir] = useState('');
  const [pending, setPending] = useState<PendingRecord[]>([]);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<ScanItem | null>(null);
  const [scanMeta, setScanMeta] = useState<ScanMeta | null>(null);
  const [page, setPage] = useState(1);
  const [picking, setPicking] = useState(false);
  const [attachedName, setAttachedName] = useState('');
  const [attaching, setAttaching] = useState<string | null>(null);
  const [grading, setGrading] = useState<PendingRecord | null>(null);
  const [gradeStatus, setGradeStatus] = useState('');
  const [gradeDate, setGradeDate] = useState(() => new Date().toISOString().slice(0, 10));

  const load = useCallback(async (): Promise<void> => {
    setError('');
    try {
      const res = await api<{ items: ScanItem[]; dir: string }>('/api/scans');
      setItems(res.items);
      setDir(res.dir);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  const loadPending = useCallback(async (): Promise<void> => {
    try {
      const r = await api<{ items: PendingRecord[]; total: number }>('/api/records?status=P&limit=200');
      setPending(r.items ?? []);
    } catch {
      setPending([]);
    }
  }, []);

  useEffect(() => {
    void load();
    void loadPending();
  }, [load, loadPending]);

  const openScan = async (item: ScanItem): Promise<void> => {
    setSelected(item);
    setPage(1);
    setScanMeta(null);
    setPicking(false);
    setAttachedName('');
    setError('');
    try {
      const m = await api<ScanMeta>(`/api/scans/${encodeURIComponent(item.name)}/meta`);
      setScanMeta(m);
    } catch {
      setScanMeta({ kind: 'pdf' });
    }
  };

  const cancelPick = (): void => {
    setPicking(false);
    setGrading(null);
    setGradeStatus('');
    setError('');
  };

  const attach = async (recId: number, status: string, replyDate: string): Promise<void> => {
    if (!selected) return;
    setAttaching(String(recId));
    setError('');
    try {
      await api(`/api/scans/${encodeURIComponent(selected.name)}/attach`, {
        method: 'POST',
        body: { recordId: recId, status, replyDate },
      });
      sound.success();
      setAttachedName(String(recId));
      setGrading(null);
      setAttaching(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setAttaching(null);
      sound.error();
    }
  };

  const sizeLabel = (n: number): string =>
    n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">{t('scan.title')}</h1>
          <p className="text-sm text-muted-foreground">{t('scan.subtitle')}</p>
        </div>
        <Button variant="outline" onClick={() => void load()} className="gap-1.5">
          <RefreshCw className="size-4" />
          {t('scan.refresh')}
        </Button>
      </div>

      {dir && (
        <p className="text-xs text-muted-foreground">
          {t('scan.watchFolder')}: <span className="font-mono">{dir}</span>
        </p>
      )}

      {error && <div className="flex items-center gap-2 text-sm text-destructive"><XCircle className="size-4 shrink-0" />{error}</div>}

      {items.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent text-white shadow-lg shadow-accent/20">
              <ScanLine className="size-7" />
            </div>
            <div className="text-sm text-muted-foreground">{t('scan.empty')}</div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {items.map((item) => (
            <button
              key={item.name}
              type="button"
              onClick={() => void openScan(item)}
              className="glass-card flex flex-col gap-2 rounded-2xl p-4 text-start transition-all hover:-translate-y-0.5"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
                  {item.name.toLowerCase().endsWith('.pdf') ? <FileText className="size-4.5" /> : <FileImage className="size-4.5" />}
                </span>
                <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{sizeLabel(item.size)}</span>
              </div>
              <span className="truncate font-mono text-xs text-foreground" title={item.name}>{item.name}</span>
              <span className="text-[10px] text-muted-foreground">{new Date(item.modifiedAt).toLocaleString()}</span>
            </button>
          ))}
        </div>
      )}

      {/* Scan viewer + Add Metadata (attach to a pending request) */}
      <Dialog open={selected !== null} onOpenChange={(o) => { if (!o) { setSelected(null); setPicking(false); } }}>
        <DialogContent className="h-[min(94vh,900px)] w-[min(96vw,1000px)] max-h-none max-w-none overflow-y-auto sm:max-w-none">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 font-mono text-sm">
              <ScanLine className="size-4 text-primary" />
              {selected?.name}
            </DialogTitle>
          </DialogHeader>

          {selected && (
            <div className="-mt-1 flex flex-col gap-4 px-6 pb-6">
              {scanMeta?.kind === 'tiff' ? (
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-center rounded-xl border border-border/70 bg-muted/20 p-2">
                    <img
                      src={`/api/scans/${encodeURIComponent(selected.name)}/preview/${page}`}
                      alt={selected.name}
                      className="max-h-[55vh] rounded-md bg-white object-contain shadow-md"
                    />
                  </div>
                  <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                    <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>←</Button>
                    <span className="tabular-nums">{page} / {scanMeta.pages ?? 1}</span>
                    <Button size="sm" variant="outline" disabled={page >= (scanMeta.pages ?? 1)} onClick={() => setPage((p) => Math.min(scanMeta.pages ?? 1, p + 1))}>→</Button>
                  </div>
                </div>
              ) : (
                <iframe src={`/api/scans/${encodeURIComponent(selected.name)}/file`} title={selected.name} className="h-[55vh] w-full rounded-xl border border-border/70 bg-white" />
              )}

              <div className="flex flex-wrap items-center gap-2">
                {!picking && !attachedName && (
                  <Button size="sm" onClick={() => { setPicking(true); setError(''); }} className="gap-1.5">
                    <ScanLine className="size-4" />
                    {t('scan.addMetadata')}
                  </Button>
                )}
                {attachedName && <span className="flex items-center gap-1.5 text-xs text-success"><CheckCircle2 className="size-4" />{t('scan.attached')}</span>}
              </div>

              {picking && grading === null && (
                <div className="flex flex-col gap-3 rounded-xl border border-border/70 bg-card p-4">
                  <div className="text-sm font-medium text-foreground">{t('scan.attachHint')}</div>
                  {pending.length === 0 ? (
                    <div className="py-6 text-center text-sm text-muted-foreground">{t('scan.noPending')}</div>
                  ) : (
                    <div className="flex max-h-[46vh] flex-col gap-2 overflow-y-auto pr-1">
                      {pending.map((r) => {
                        const b = attaching === String(r.id);
                        return (
                          <button
                            key={r.id}
                            type="button"
                            disabled={!!attaching}
                            onClick={() => { setGrading(r); setGradeStatus(''); setGradeDate(new Date().toISOString().slice(0, 10)); }}
                            className="flex items-center gap-3 rounded-xl border border-border/70 bg-muted/20 px-3 py-2 text-start transition-all hover:-translate-y-0.5 hover:border-primary/50 disabled:opacity-60"
                          >
                            <span className="min-w-0 flex-1">
                              <span className="flex items-center gap-2">
                                <span className="truncate font-mono text-sm font-semibold text-foreground">{r.category}-{r.requestNo}</span>
                                <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">rev {r.revisionNo}</span>
                              </span>
                              <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">{r.description || '—'}</span>
                              <span className="mt-0.5 flex flex-wrap gap-x-3 text-[10px] text-muted-foreground">
                                {r.floor && <span>{r.floor}</span>}
                                {r.engineer && <span>{r.engineer}</span>}
                              </span>
                            </span>
                            {b && <Loader2 className="size-4 shrink-0 animate-spin" />}
                          </button>
                        );
                      })}
                    </div>
                  )}
                  <div className="flex justify-end">
                    <Button variant="outline" size="sm" onClick={cancelPick}>{t('scan.cancel')}</Button>
                  </div>
                </div>
              )}

              {/* Grade card (ticket 136): pick Status (A/B/C/D/Canceled) + reply date, then confirm */}
              {picking && grading && (
                <div className="flex flex-col gap-3 rounded-xl border border-primary/40 bg-accent/5 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm font-semibold text-foreground">
                      {grading.category}-{grading.requestNo} <span className="text-muted-foreground">rev {grading.revisionNo}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => { setGrading(null); setGradeStatus(''); }}
                      className="text-xs text-muted-foreground hover:text-foreground"
                    >
                      {t('scan.cancel')}
                    </button>
                  </div>
                  <div className="text-xs text-muted-foreground">{t('scan.gradeHint')}</div>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                      {t('field.status')}
                      <select
                        value={gradeStatus}
                        onChange={(e) => setGradeStatus(e.target.value)}
                        className="h-9 w-full rounded-md border border-border/60 bg-card px-2 text-sm text-foreground"
                      >
                        <option value="">—</option>
                        <option value="A">A</option>
                        <option value="B">B</option>
                        <option value="C">C</option>
                        <option value="D">D</option>
                        <option value="Canceled">Canceled</option>
                      </select>
                    </label>
                    <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                      {grading.category === 'NCR' ? t('field.replyByContractorDate') : t('field.replyDate')}
                      <input
                        type="date"
                        value={gradeDate}
                        onChange={(e) => setGradeDate(e.target.value)}
                        className="h-9 w-full rounded-md border border-border/60 bg-card px-2 text-sm text-foreground"
                      />
                    </label>
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" size="sm" onClick={() => { setGrading(null); setGradeStatus(''); }}>
                      {t('scan.cancel')}
                    </Button>
                    <Button
                      size="sm"
                      disabled={!gradeStatus || !!attaching}
                      onClick={() => void attach(grading.id, gradeStatus, gradeDate)}
                      className="gap-1.5"
                    >
                      {attaching === String(grading.id) ? <Loader2 className="size-4 animate-spin" /> : null}
                      {t('scan.confirmGrade')}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
