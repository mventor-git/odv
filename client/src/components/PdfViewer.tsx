import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { useI18n } from '@/lib/i18n';
import { api, getToken } from '@/lib/api';
import { downloadFile } from '@/lib/files';
import { PrintDialog, type PrintPage } from '@/components/PrintDialog';
import {
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  RotateCw,
  Printer,
  Download,
  ExternalLink,
  MoveHorizontal,
  MoveVertical,
} from 'lucide-react';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

interface PdfViewerProps {
  /** Authenticated PDF URL (e.g. /api/files/:id). */
  src: string;
  /** Record id — used for the "Open in Default App" server call. */
  recordId: number;
  /** Optional node shown in place of the load error (e.g. a "log scanned PDF"
   *  button) when the PDF cannot be loaded. */
  fallback?: ReactNode;
}

const MIN_SCALE = 0.5;
const MAX_SCALE = 3;

/** Per-page rotation persistence (ticket 074) — localStorage keyed by record. */
function readRotations(recordId: number): Record<string, number> {
  try {
    const raw = localStorage.getItem(`odv_pdf_rot_${recordId}`);
    return raw ? (JSON.parse(raw) as Record<string, number>) : {};
  } catch {
    return {};
  }
}

function saveRotation(recordId: number, page: number, rot: number): void {
  try {
    const map = readRotations(recordId);
    map[String(page)] = rot;
    localStorage.setItem(`odv_pdf_rot_${recordId}`, JSON.stringify(map));
  } catch {
    // storage unavailable — rotation just won't persist
  }
}

export function PdfViewer({ src, recordId, fallback }: PdfViewerProps): ReactNode {
  const { t } = useI18n();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [doc, setDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [pageNum, setPageNum] = useState(1);
  const [numPages, setNumPages] = useState(0);
  const [scale, setScale] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [fitMode, setFitMode] = useState<'width' | 'height'>('width');
  const [printOpen, setPrintOpen] = useState(false);
  const [printPages, setPrintPages] = useState<PrintPage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const renderPage = useCallback(
    async (pageNumber: number, s: number, rot: number): Promise<void> => {
      if (!doc || !canvasRef.current) return;
      const page = await doc.getPage(pageNumber);
      const viewport = page.getViewport({ scale: s, rotation: rot });
      const canvas = canvasRef.current;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.floor(viewport.width * dpr);
      canvas.height = Math.floor(viewport.height * dpr);
      canvas.style.width = `${Math.floor(viewport.width)}px`;
      canvas.style.height = `${Math.floor(viewport.height)}px`;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      await page.render({ canvasContext: ctx, viewport }).promise;
    },
    [doc],
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    setDoc(null);
    setPageNum(1);
    setScale(1);
    pdfjsLib
      .getDocument({
        url: src,
        // pdf.js fetches with its own client — carry the JWT explicitly.
        httpHeaders: { Authorization: `Bearer ${getToken() ?? ''}` },
      })
      .promise.then((d) => {
        if (cancelled) return;
        setDoc(d);
        setNumPages(d.numPages);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [src]);

  // Per-page rotation (ticket 074): load the saved rotation for the current
  // page whenever the page or the document changes.
  useEffect(() => {
    if (!doc) return;
    setRotation(readRotations(recordId)[String(pageNum)] ?? 0);
  }, [doc, pageNum, recordId]);

  useEffect(() => {
    if (doc) void renderPage(pageNum, scale, rotation);
  }, [doc, pageNum, scale, rotation, renderPage]);

  const fitWidth = useCallback((): void => {
    if (!doc || !containerRef.current) return;
    void doc.getPage(pageNum).then((p) => {
      const vp = p.getViewport({ scale: 1, rotation });
      const avail = (containerRef.current?.clientWidth ?? 600) - 24;
      const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, avail / vp.width));
      setScale(next);
    });
  }, [doc, pageNum, rotation]);

  const fitHeight = useCallback((): void => {
    if (!doc || !containerRef.current) return;
    void doc.getPage(pageNum).then((p) => {
      const vp = p.getViewport({ scale: 1, rotation });
      const avail = (containerRef.current?.clientHeight ?? 600) - 24;
      const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, avail / vp.height));
      setScale(next);
    });
  }, [doc, pageNum, rotation]);

  // Auto-fit on load (scanned A3s must be visible without manual zoom) and
  // re-fit on page change only when the page overflows the container.
  useEffect(() => {
    if (!doc) return;
    void doc.getPage(pageNum).then((p) => {
      const vp = p.getViewport({ scale: scale, rotation });
      const avail = (containerRef.current?.clientWidth ?? 600) - 24;
      if (vp.width > avail) {
        const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, avail / vp.width));
        setScale(next);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, pageNum]);

  /** Fit toggle (ticket 074 refinement): applies the current mode and flips
   *  to the other mode for the next click. */
  const toggleFit = useCallback((): void => {
    if (fitMode === 'width') {
      fitWidth();
      setFitMode('height');
    } else {
      fitHeight();
      setFitMode('width');
    }
  }, [fitMode, fitWidth, fitHeight]);

  const rotate = useCallback(
    (dir: 1 | -1): void => {
      setRotation((r) => {
        const next = (r + dir * 90 + 360) % 360;
        saveRotation(recordId, pageNum, next);
        return next;
      });
    },
    [recordId, pageNum],
  );

  /** Unified print (ticket 092): render all pages, auto-detect A4/A3, open
   *  the shared PrintDialog (copies + collated order). */
  const openPrint = useCallback(async (): Promise<void> => {
    if (!doc) return;
    const pages: PrintPage[] = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const viewport = page.getViewport({ scale: 2 });
      const canvas = document.createElement('canvas');
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      await page.render({ canvasContext: canvas.getContext('2d')!, viewport }).promise;
      // A3 portrait max dim ≈ 1191pt; A4 landscape max dim ≈ 842pt — so
      // maxDim > 1000 reliably separates A3 from A4 in any orientation.
      const maxDim = Math.max(viewport.width, viewport.height);
      const landscape = viewport.width > viewport.height;
      const size: PrintPage['size'] = maxDim > 1000 ? (landscape ? 'a3l' : 'a3p') : landscape ? 'a4l' : 'a4p';
      pages.push({ img: canvas.toDataURL('image/jpeg', 0.92), size });
    }
    setPrintPages(pages);
    setPrintOpen(true);
  }, [doc]);

  const openDefault = useCallback(async (): Promise<void> => {
    setNotice('');
    try {
      await api(`/api/files/${recordId}/open`);
      setNotice(t('pdf.openedDefault'));
    } catch (err) {
      setNotice(t('pdf.openDefaultError'));
      window.alert(err instanceof Error ? err.message : String(err));
    }
  }, [recordId, t]);

  const toolbarBtn =
    'inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40 disabled:pointer-events-none';

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-border/70 bg-card shadow-sm">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-1 border-b border-border/60 bg-muted/40 px-2 py-1.5">
        <button className={toolbarBtn} disabled={!doc || pageNum <= 1} onClick={() => setPageNum((p) => Math.max(1, p - 1))} title={t('pdf.page')}>
          <ChevronLeft className="size-4" />
        </button>
        <span className="px-0.5 text-xs tabular-nums text-muted-foreground">
          {pageNum} / {numPages || '—'}
        </span>
        <button className={toolbarBtn} disabled={!doc || pageNum >= numPages} onClick={() => setPageNum((p) => Math.min(numPages, p + 1))} title={t('pdf.page')}>
          <ChevronRight className="size-4" />
        </button>
        <span className="mx-1 h-4 w-px bg-border/70" />
        <button className={toolbarBtn} disabled={!doc} onClick={() => setScale((s) => Math.max(MIN_SCALE, +(s - 0.15).toFixed(2)))} title={t('pdf.zoomOut')}>
          <ZoomOut className="size-4" />
        </button>
        <span className="w-10 text-center text-xs tabular-nums text-muted-foreground">{Math.round(scale * 100)}%</span>
        <button className={toolbarBtn} disabled={!doc} onClick={() => setScale((s) => Math.min(MAX_SCALE, +(s + 0.15).toFixed(2)))} title={t('pdf.zoomIn')}>
          <ZoomIn className="size-4" />
        </button>
        <button
          className={toolbarBtn}
          disabled={!doc}
          onClick={toggleFit}
          title={fitMode === 'width' ? t('pdf.fitWidth') : t('pdf.fitHeight')}
        >
          {fitMode === 'width' ? <MoveHorizontal className="size-4" /> : <MoveVertical className="size-4" />}
        </button>
        <span className="mx-1 h-4 w-px bg-border/70" />
        <button className={toolbarBtn} disabled={!doc} onClick={() => rotate(-1)} title={t('pdf.rotateLeft')}>
          <RotateCcw className="size-4" />
        </button>
        <button className={toolbarBtn} disabled={!doc} onClick={() => rotate(1)} title={t('pdf.rotateRight')}>
          <RotateCw className="size-4" />
        </button>
        <span className="mx-1 h-4 w-px bg-border/70" />
        <button className={toolbarBtn} disabled={!doc} onClick={() => void openPrint()} title={t('pdf.print')}>
          <Printer className="size-4" />
        </button>
        <button
          className={toolbarBtn}
          disabled={!doc}
          onClick={() => {
            void downloadFile(recordId).catch((err) =>
              window.alert(err instanceof Error ? err.message : String(err)),
            );
          }}
          title={t('pdf.download')}
        >
          <Download className="size-4" />
        </button>
        <button className={toolbarBtn} disabled={!doc} onClick={() => void openDefault()} title={t('pdf.openDefault')}>
          <ExternalLink className="size-4" />
        </button>
      </div>

      {/* Canvas area */}
      <div ref={containerRef} className="flex max-h-[78vh] min-h-[420px] items-start justify-center overflow-auto bg-muted/20 p-3">
        {loading && <div className="py-16 text-sm text-muted-foreground">{t('common.loading')}</div>}
        {error && fallback && <div className="flex w-full items-center justify-center py-10">{fallback}</div>}
        {error && !fallback && <div className="py-16 text-sm text-destructive">{t('pdf.loadError')}: {error}</div>}
        {!loading && !error && (
          <canvas ref={canvasRef} className="rounded-sm bg-white shadow-md" />
        )}
      </div>

      {notice && <div className="border-t border-border/60 px-3 py-1.5 text-xs text-muted-foreground">{notice}</div>}

      <PrintDialog
        open={printOpen}
        title={t('pdf.print')}
        pages={printPages}
        onClose={() => setPrintOpen(false)}
      />
    </div>
  );
}