import { useEffect, useState, type ReactNode } from 'react';
import { useI18n } from '@/lib/i18n';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Loader2, Printer } from 'lucide-react';

export type PrintPageSize = 'a4p' | 'a4l' | 'a3p' | 'a3l';

export interface PrintPage {
  img: string;
  size: PrintPageSize;
}

/** Unified printing module (ticket 092) — one dialog for every print path:
 *  A4/A3 auto-detected per page, 1-3 copies, collated in order. */
export function PrintDialog({
  open,
  title,
  pages,
  onClose,
  initialCopies = 1,
}: {
  open: boolean;
  title: string;
  pages: PrintPage[];
  onClose: () => void;
  initialCopies?: number;
}): ReactNode {
  const { t } = useI18n();
  const [copies, setCopies] = useState(1);
  const [busy, setBusy] = useState(false);

  // Allow callers to preset the copy count (e.g. the P-popup's 1 Test / 3→2).
  useEffect(() => {
    if (open) setCopies(Math.min(Math.max(1, initialCopies), 3));
  }, [open, initialCopies]);

  const sizeLabel = (s: PrintPageSize): string => {
    switch (s) {
      case 'a4p': return 'A4';
      case 'a4l': return 'A4 L';
      case 'a3p': return 'A3';
      case 'a3l': return 'A3 L';
    }
  };

  const run = (): void => {
    if (pages.length === 0) return;
    setBusy(true);
    // Collate: copies × pages in order (ticket 092).
    const body = Array.from({ length: Math.min(Math.max(1, copies), 3) }, () =>
      pages
        .map((p) => `<div class="page p-${p.size}"><img src="${p.img}" alt=""></div>`)
        .join(''),
    ).join('');
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    document.body.appendChild(iframe);
    const win = iframe.contentWindow;
    if (!win) {
      setBusy(false);
      return;
    }
    win.document.write(`<!doctype html><html><head><title>${title}</title><style>
      @page a4p { size: A4 portrait; margin: 0; }
      @page a4l { size: A4 landscape; margin: 0; }
      @page a3p { size: A3 portrait; margin: 0; }
      @page a3l { size: A3 landscape; margin: 0; }
      .p-a4p { page: a4p; }
      .p-a4l { page: a4l; }
      .p-a3p { page: a3p; }
      .p-a3l { page: a3l; }
      .page { page-break-after: always; }
      .page:last-child { page-break-after: auto; }
      .page img { width: 100%; height: 100%; object-fit: contain; }
      body { margin: 0; }
    </style></head><body>${body}</body></html>`);
    win.document.close();
    win.focus();
    win.print();
    setTimeout(() => {
      document.body.removeChild(iframe);
      setBusy(false);
      onClose();
    }, 3000);
  };

  const a4 = pages.filter((p) => p.size.startsWith('a4')).length;
  const a3 = pages.filter((p) => p.size.startsWith('a3')).length;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Printer className="size-5 text-primary" />
            {t('pdf.print')}
          </DialogTitle>
        </DialogHeader>
        <div className="-mt-1 flex flex-col gap-4 px-6 pb-6">
          <div className="flex flex-col gap-1.5 rounded-xl border border-border/70 bg-muted/30 p-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">{t('pdf.pages')}</span>
              <span className="font-medium text-foreground">{pages.length}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">A4</span>
              <span className="font-medium text-foreground">{a4}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">A3</span>
              <span className="font-medium text-foreground">{a3}</span>
            </div>
            <div className="mt-1 flex flex-wrap gap-1">
              {pages.map((p, i) => (
                <span key={i} className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                  {i + 1}·{sizeLabel(p.size)}
                </span>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-muted-foreground">{t('pdf.copies')}</span>
            <div className="flex overflow-hidden rounded-md border border-border/70 text-xs font-semibold leading-none">
              {[1, 2, 3].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setCopies(n)}
                  className={`px-3 py-1.5 transition-colors ${
                    copies === n ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                  }`}
                >
                  {n}×
                </button>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>
              {t('form.cancel')}
            </Button>
            <Button onClick={run} disabled={busy || pages.length === 0} className="gap-1.5">
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Printer className="size-4" />}
              {t('pdf.print')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}