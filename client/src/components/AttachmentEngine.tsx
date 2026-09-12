import { useEffect, useRef, useState, type ReactNode } from 'react';
import { api, getToken } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import type { DcRecord, Meta, RecordsResponse } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { padRequestNo } from '@/lib/format';
import * as pdfjsLib from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import {
  ChevronLeft,
  ChevronRight,
  FileText,
  Image as ImageIcon,
  RotateCw,
  Search,
  Trash2,
  Upload,
  X,
} from 'lucide-react';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

export interface AttachmentPage {
  id: string;
  source: string;
  page: number;
  size: 'A4' | 'A3';
  rotation: 0 | 90 | 180 | 270;
  thumb?: string;
  category?: string;
  status?: string;
  description?: string;
}

/** pdf.js fetches with its own client — carry the JWT explicitly (ticket 071). */
const PDF_HEADERS = { httpHeaders: { Authorization: `Bearer ${getToken() ?? ''}` } };

interface AttachmentEngineProps {
  open: boolean;
  onClose: () => void;
  onAttachmentsChange?: (pages: AttachmentPage[]) => void;
  /** When set, this PDF is loaded and its pages become the default attachments
   *  (e.g. the old request for a PP record — ticket 067). */
  defaultSource?: { recordId: number; label: string } | null;
  /** Temp-save restore (ticket 112): attachments kept as lightweight refs —
   *  re-shown when the module re-opens after an Edit (no full PDFs in memory). */
  initialAttachments?: AttachmentPage[];
}

/** Attachments popup (ticket 066/068/071): two big side-by-side cards —
 *  full Logs-style filters + PDF viewer with draggable pages on the left,
 *  the attachments box (A4/A3 + rotate) on the right. */
export function AttachmentEngine({
  open,
  onClose,
  onAttachmentsChange,
  defaultSource,
  initialAttachments,
}: AttachmentEngineProps): ReactNode {
  const { t } = useI18n();
  const [meta, setMeta] = useState<Meta | null>(null);
  const [category, setCategory] = useState('');
  const [status, setStatus] = useState('');
  const [zone, setZone] = useState('');
  const [floor, setFloor] = useState('');
  const [fork, setFork] = useState('');
  const [engineer, setEngineer] = useState('');
  const [q, setQ] = useState('');
  const [results, setResults] = useState<DcRecord[]>([]);
  const [searching, setSearching] = useState(false);
  const [activePdf, setActivePdf] = useState<{ record: DcRecord; url: string } | null>(null);
  const [doc, setDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageThumbs, setPageThumbs] = useState<Array<{ page: number; thumb?: string }>>([]);
  const [attachments, setAttachments] = useState<AttachmentPage[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Temp-save restore: seed the box from lightweight refs when it re-opens.
  const seededRef = useRef(false);
  useEffect(() => {
    if (open && !seededRef.current) {
      seededRef.current = true;
      if (initialAttachments && initialAttachments.length > 0) {
        setAttachments(initialAttachments);
      }
    }
    if (!open) {
      seededRef.current = false;
    }
  }, [open, initialAttachments]);

  useEffect(() => {
    api<Meta>('/api/meta').then(setMeta).catch(() => undefined);
  }, []);

  const forks = meta?.categories.find((c) => c.code === category)?.forks ?? [];

  // Smart search: debounced, Logs-style filters (ticket 071).
  useEffect(() => {
    if (!open) return;
    setSearching(true);
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const params = new URLSearchParams({ limit: '50' });
          if (category) params.set('category', category);
          if (status) params.set('status', status);
          if (zone) params.set('zone', zone);
          if (floor) params.set('floor', floor);
          if (fork) params.set('fork', fork);
          if (engineer) params.set('engineer', engineer);
          if (q.trim()) params.set('q', q.trim());
          const res = await api<RecordsResponse>(`/api/records?${params.toString()}`);
          setResults(res.items.filter((r) => r.hyperlink.trim()));
        } catch {
          setResults([]);
        } finally {
          setSearching(false);
        }
      })();
    }, 300);
    return () => clearTimeout(timer);
  }, [open, category, status, zone, floor, fork, engineer, q]);

  // Default source (ticket 067): load the PDF and add ALL its pages as attachments.
  const lastDefault = useRef<string | null>(null);
  useEffect(() => {
    if (!open || !defaultSource) return;
    const key = `${defaultSource.recordId}`;
    if (lastDefault.current === key) return;
    lastDefault.current = key;
    void (async () => {
      try {
        const d = await pdfjsLib.getDocument({ url: `/api/files/${defaultSource.recordId}`, ...PDF_HEADERS }).promise;
        const pages: AttachmentPage[] = [];
        for (let p = 1; p <= Math.min(d.numPages, 30); p++) {
          const page = await d.getPage(p);
          const viewport = page.getViewport({ scale: 0.35 });
          const canvas = document.createElement('canvas');
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          const ctx = canvas.getContext('2d');
          let thumb: string | undefined;
          if (ctx) {
            await page.render({ canvasContext: ctx, viewport }).promise;
            thumb = canvas.toDataURL('image/jpeg', 0.7);
          }
          pages.push({
            id: `${defaultSource.recordId}-${p}-${Date.now()}`,
            source: `${defaultSource.label} — p.${p}`,
            page: p,
            size: 'A4',
            rotation: 0,
            thumb,
          });
        }
        setAttachments(pages);
        onAttachmentsChange?.(pages);
      } catch {
        // parent PDF unavailable — leave attachments empty
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, defaultSource?.recordId]);

  const loadPdf = async (record: DcRecord): Promise<void> => {
    const url = `/api/files/${record.id}`;
    setActivePdf({ record, url });
    setDoc(null);
    setPageThumbs([]);
    setCurrentPage(1);
    try {
      const d = await pdfjsLib.getDocument({ url, ...PDF_HEADERS }).promise;
      setDoc(d);
      const thumbs: Array<{ page: number; thumb?: string }> = [];
      for (let p = 1; p <= Math.min(d.numPages, 30); p++) {
        const page = await d.getPage(p);
        const viewport = page.getViewport({ scale: 0.25 });
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          await page.render({ canvasContext: ctx, viewport }).promise;
          thumbs.push({ page: p, thumb: canvas.toDataURL('image/jpeg', 0.7) });
        } else {
          thumbs.push({ page: p });
        }
      }
      setPageThumbs(thumbs);
    } catch {
      setDoc(null);
    }
  };

  // Render the current page into the viewer canvas.
  useEffect(() => {
    if (!doc || !canvasRef.current) return;
    let cancelled = false;
    void (async () => {
      try {
        const page = await doc.getPage(currentPage);
        const container = canvasRef.current;
        if (!container) return;
        const scale = container.clientWidth / page.getViewport({ scale: 1 }).width;
        const viewport = page.getViewport({ scale: Math.min(scale, 2.5) });
        const canvas = container;
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext('2d');
        if (ctx && !cancelled) {
          await page.render({ canvasContext: ctx, viewport }).promise;
        }
      } catch {
        // render failed — ignore
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [doc, currentPage]);

  const addPage = (page: number, thumb?: string): void => {
    if (!activePdf) return;
    const id = `${activePdf.record.id}-${page}-${Date.now()}`;
    const next = [
      ...attachments,
      {
        id,
        source: `${padRequestNo(activePdf.record.requestNo)} — p.${page}`,
        page,
        size: 'A4' as const,
        rotation: 0 as const,
        thumb,
        category: activePdf.record.category,
        status: activePdf.record.status,
        description: activePdf.record.description,
      },
    ];
    setAttachments(next);
    onAttachmentsChange?.(next);
  };

  const updateAttachment = (id: string, patch: Partial<AttachmentPage>): void => {
    const next = attachments.map((a) => (a.id === id ? { ...a, ...patch } : a));
    setAttachments(next);
    onAttachmentsChange?.(next);
  };

  const removeAttachment = (id: string): void => {
    const next = attachments.filter((a) => a.id !== id);
    setAttachments(next);
    onAttachmentsChange?.(next);
  };

  const clearAll = (): void => {
    setAttachments([]);
    setActivePdf(null);
    setDoc(null);
    setPageThumbs([]);
    setCategory('');
    setStatus('');
    setZone('');
    setFloor('');
    setFork('');
    setEngineer('');
    setQ('');
    onAttachmentsChange?.([]);
  };

  const onDrop = (e: React.DragEvent): void => {
    e.preventDefault();
    setDragOver(false);
    const data = e.dataTransfer.getData('text/plain');
    if (data) {
      const [pageStr, thumb] = data.split('|');
      const page = Number(pageStr);
      if (page && activePdf) addPage(page, thumb || undefined);
    }
  };

  const onUpload = async (files: FileList | null): Promise<void> => {
    if (!files) return;
    const next = [...attachments];
    for (const file of Array.from(files)) {
      const id = `upload-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
      let thumb: string | undefined;
      if (isPdf) {
        try {
          const d = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
          const page = await d.getPage(1);
          const viewport = page.getViewport({ scale: 0.3 });
          const canvas = document.createElement('canvas');
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            await page.render({ canvasContext: ctx, viewport }).promise;
            thumb = canvas.toDataURL('image/jpeg', 0.7);
          }
        } catch {
          thumb = undefined;
        }
      } else {
        thumb = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.readAsDataURL(file);
        });
      }
      next.push({ id, source: file.name, page: 1, size: 'A4', rotation: 0, thumb });
    }
    setAttachments(next);
    onAttachmentsChange?.(next);
  };

  const inputCls =
    'h-8 w-full rounded-md border border-border bg-card px-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-[95vw] max-h-[94vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('attachments.title')}</DialogTitle>
        </DialogHeader>

        <div className="-mt-1 grid gap-4 px-6 pb-6 xl:grid-cols-2">
          {/* LEFT — filters + results + PDF viewer with draggable pages */}
          <div className="glass-card flex flex-col gap-3 rounded-2xl p-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground">{t('attachments.source')}</h3>
              <Button size="sm" variant="outline" className="gap-1.5" onClick={() => fileRef.current?.click()}>
                <Upload className="size-3.5" />
                {t('attachments.upload')}
              </Button>
              <input
                ref={fileRef}
                type="file"
                accept="image/*,.pdf"
                multiple
                className="hidden"
                onChange={(e) => void onUpload(e.target.files)}
              />
            </div>

            <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
              <div>
                <Label>{t('field.category')}</Label>
                <Select value={category} onChange={(e) => setCategory(e.target.value)}>
                  <option value="">{t('records.filters')}</option>
                  {meta?.categories.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.code}
                    </option>
                  ))}
                </Select>
              </div>
              {forks.length > 0 && (
                <div>
                  <Label>{t('field.fork')}</Label>
                  <Select value={fork} onChange={(e) => setFork(e.target.value)}>
                    <option value="">{t('records.filters')}</option>
                    {forks.map((f) => (
                      <option key={f} value={f}>
                        {f}
                      </option>
                    ))}
                  </Select>
                </div>
              )}
              <div>
                <Label>{t('field.status')}</Label>
                <Select value={status} onChange={(e) => setStatus(e.target.value)}>
                  <option value="">{t('records.filters')}</option>
                  {meta?.statuses.map((s) => (
                    <option key={s.code} value={s.code}>
                      {s.code}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label>{t('field.zone')}</Label>
                <Select value={zone} onChange={(e) => setZone(e.target.value)}>
                  <option value="">{t('records.filters')}</option>
                  {meta?.zones.map((z) => (
                    <option key={z.code} value={z.code}>
                      {z.code}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label>{t('field.floor')}</Label>
                <Select value={floor} onChange={(e) => setFloor(e.target.value)}>
                  <option value="">{t('records.filters')}</option>
                  {meta?.floors.map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label>{t('field.member')}</Label>
                <Select value={engineer} onChange={(e) => setEngineer(e.target.value)}>
                  <option value="">{t('records.filters')}</option>
                  {meta?.categories.find((c) => c.code === category)?.forks.map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="col-span-2 md:col-span-3">
                <Label>{t('records.search')}</Label>
                <div className="relative">
                  <Search className="pointer-events-none absolute start-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={q}
                    placeholder={t('attachments.searchHint')}
                    onChange={(e) => setQ(e.target.value)}
                    className="ps-7"
                  />
                </div>
              </div>
            </div>

            <div className="flex max-h-36 flex-col gap-1 overflow-y-auto rounded-xl border border-border/60 bg-card/60 p-2">
              {searching && <div className="p-3 text-center text-sm text-muted-foreground">…</div>}
              {!searching && results.length === 0 && (
                <div className="p-3 text-center text-sm text-muted-foreground">—</div>
              )}
              {results.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => void loadPdf(r)}
                  className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-start text-sm transition-all duration-150 active:scale-[0.98] ${
                    activePdf?.record.id === r.id
                      ? 'bg-primary/15 text-primary'
                      : 'text-muted-foreground hover:bg-accent/70 hover:text-foreground'
                  }`}
                >
                  <FileText className="size-3.5 shrink-0" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{padRequestNo(r.requestNo)}</span>
                    {r.description && (
                      <span className="block truncate text-[11px] text-muted-foreground">{r.description}</span>
                    )}
                  </span>
                  <span className="shrink-0 text-xs">{r.category}</span>
                </button>
              ))}
            </div>

            {activePdf && (
              <div className="flex flex-col gap-2 rounded-xl border border-border/60 bg-card/60 p-2">
                <div className="flex items-center justify-between px-1">
                  <span className="truncate text-xs font-semibold text-foreground">
                    {padRequestNo(activePdf.record.requestNo)}
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                      disabled={!doc || currentPage <= 1}
                      className="rounded p-1 text-muted-foreground transition-all hover:text-foreground disabled:opacity-30 active:scale-90"
                      title={t('records.prev')}
                    >
                      <ChevronLeft className="size-4" />
                    </button>
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {doc ? `${currentPage} / ${doc.numPages}` : '…'}
                    </span>
                    <button
                      onClick={() => setCurrentPage((p) => (doc ? Math.min(doc.numPages, p + 1) : p))}
                      disabled={!doc || (doc ? currentPage >= doc.numPages : true)}
                      className="rounded p-1 text-muted-foreground transition-all hover:text-foreground disabled:opacity-30 active:scale-90"
                      title={t('records.next')}
                    >
                      <ChevronRight className="size-4" />
                    </button>
                    <button onClick={() => setActivePdf(null)} className="rounded p-1 text-muted-foreground hover:text-foreground">
                      <X className="size-3.5" />
                    </button>
                  </div>
                </div>

                {/* PDF viewer — drag the current page to the box */}
                <div className="flex h-[32rem] max-h-[58vh] items-center justify-center overflow-auto rounded-lg border border-border/60 bg-white p-2">
                  <canvas
                    ref={canvasRef}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData('text/plain', `${currentPage}|${pageThumbs[currentPage - 1]?.thumb ?? ''}`);
                      e.dataTransfer.effectAllowed = 'copy';
                    }}
                    className="max-h-[30rem] w-auto cursor-grab shadow-sm active:cursor-grabbing"
                    title={`${t('attachments.addPage')} ${currentPage}`}
                  />
                </div>

                {/* Thumbnail strip — click to jump, drag to add */}
                <div className="flex gap-1.5 overflow-x-auto pb-1">
                  {pageThumbs.map((p) => (
                    <button
                      key={p.page}
                      type="button"
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData('text/plain', `${p.page}|${p.thumb ?? ''}`);
                        e.dataTransfer.effectAllowed = 'copy';
                      }}
                      onClick={() => setCurrentPage(p.page)}
                      className={`relative shrink-0 overflow-hidden rounded-md border transition-all duration-150 active:scale-95 ${
                        currentPage === p.page ? 'border-primary ring-2 ring-primary/40' : 'border-border/60 hover:border-primary/50'
                      }`}
                      title={`${t('attachments.addPage')} ${p.page}`}
                    >
                      {p.thumb ? (
                        <img src={p.thumb} alt={`Page ${p.page}`} className="h-16 w-12 object-contain bg-white" />
                      ) : (
                        <div className="flex h-16 w-12 items-center justify-center bg-muted text-xs text-muted-foreground">
                          {p.page}
                        </div>
                      )}
                      <span className="absolute bottom-0 end-0 rounded bg-black/60 px-0.5 text-[9px] font-bold text-white">
                        {p.page}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* RIGHT — attachments box: drag & drop, size + rotation per page */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            className={`glass-card flex flex-col gap-3 rounded-2xl p-4 transition-all duration-150 ${
              dragOver ? 'ring-2 ring-primary/50 scale-[1.01]' : ''
            }`}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground">
                {t('attachments.box')} <span className="text-muted-foreground">({attachments.length})</span>
              </h3>
              <Button size="sm" variant="outline" onClick={clearAll} className="gap-1">
                <Trash2 className="size-3.5" />
                {t('attachments.clear')}
              </Button>
            </div>

            {attachments.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border/60 p-10 text-center">
                <ImageIcon className="size-8 text-muted-foreground/50" />
                <div className="text-sm text-muted-foreground">{t('attachments.dropHint')}</div>
              </div>
            ) : (
              <div className="grid max-h-[36rem] grid-cols-2 gap-3 overflow-y-auto sm:grid-cols-3">
                {attachments.map((a, i) => (
                  <div
                    key={a.id}
                    className="flex flex-col gap-2 rounded-xl border border-border/60 bg-card/70 p-2 animate-in fade-in slide-in-from-bottom-2"
                    style={{ animationDelay: `${Math.min(i * 40, 400)}ms` }}
                  >
                    <div className="relative overflow-hidden rounded-lg border border-border/60 bg-white">
                      {a.thumb ? (
                        <img
                          src={a.thumb}
                          alt={a.source}
                          className="h-32 w-full object-contain transition-transform duration-200"
                          style={{ transform: `rotate(${a.rotation}deg)` }}
                        />
                      ) : (
                        <div className="flex h-32 items-center justify-center bg-muted text-xs text-muted-foreground">
                          {a.source}
                        </div>
                      )}
                      <button
                        onClick={() => removeAttachment(a.id)}
                        className="absolute top-1 end-1 rounded-full bg-black/60 p-1 text-white transition-all hover:bg-destructive active:scale-90"
                        title={t('attachments.remove')}
                      >
                        <X className="size-3" />
                      </button>
                    </div>
                    <div className="truncate text-[11px] font-medium text-foreground">{a.source}</div>
                    {(a.category || a.status) && (
                      <div className="flex flex-wrap items-center gap-1 text-[10px]">
                        {a.category && (
                          <span className="rounded bg-primary/10 px-1.5 py-0.5 font-semibold text-primary">{a.category}</span>
                        )}
                        {a.status && (
                          <span className="rounded bg-muted px-1.5 py-0.5 font-medium text-muted-foreground">{a.status}</span>
                        )}
                      </div>
                    )}
                    {a.description && (
                      <div className="line-clamp-1 text-[10px] text-muted-foreground">{a.description}</div>
                    )}
                    <div className="flex items-center gap-1.5">
                      <select
                        className={`${inputCls} h-7 flex-1`}
                        value={a.size}
                        onChange={(e) => updateAttachment(a.id, { size: e.target.value as 'A4' | 'A3' })}
                        aria-label="Size"
                      >
                        <option value="A4">A4</option>
                        <option value="A3">A3</option>
                      </select>
                      <button
                        onClick={() =>
                          updateAttachment(a.id, { rotation: ((a.rotation + 90) % 360) as 0 | 90 | 180 | 270 })
                        }
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border/60 bg-card text-muted-foreground transition-all hover:text-foreground active:scale-90"
                        title={t('attachments.rotate')}
                      >
                        <RotateCw className="size-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}