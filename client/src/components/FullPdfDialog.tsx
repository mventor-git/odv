import { useState, type ReactNode } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { useI18n } from '@/lib/i18n';
import { getToken } from '@/lib/api';
import { PdfViewer } from '@/components/PdfViewer';
import { PrintDialog, type PrintPage } from '@/components/PrintDialog';
import type { AttachmentPage } from '@/components/AttachmentEngine';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Loader2, Paperclip, Printer } from 'lucide-react';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

const PDF_HEADERS = { httpHeaders: { Authorization: `Bearer ${getToken() ?? ''}` } };

/** "Show the full Request PDF" (ticket 092) — the generated fyler in the
 *  embedded viewer + the arranged attachments; one unified Print button
 *  prints fyler + attachments collated (A4/A3 auto, 1-3 copies). */
export function FullPdfDialog({
  open,
  onClose,
  fylerUrl,
  fylerRecordId,
  attachments,
}: {
  open: boolean;
  onClose: () => void;
  fylerUrl: string;
  fylerRecordId: number;
  attachments: AttachmentPage[];
}): ReactNode {
  const { t } = useI18n();
  const [printOpen, setPrintOpen] = useState(false);
  const [printPages, setPrintPages] = useState<PrintPage[]>([]);
  const [busy, setBusy] = useState(false);

  const renderDocPages = async (url: string, rotate: number): Promise<PrintPage[]> => {
    const doc = await pdfjsLib.getDocument({ url, ...PDF_HEADERS }).promise;
    const pages: PrintPage[] = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const viewport = page.getViewport({ scale: 2, rotation: rotate });
      const canvas = document.createElement('canvas');
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      await page.render({ canvasContext: canvas.getContext('2d')!, viewport }).promise;
      const maxDim = Math.max(viewport.width, viewport.height);
      const landscape = viewport.width > viewport.height;
      const size: PrintPage['size'] = maxDim > 1000 ? (landscape ? 'a3l' : 'a3p') : landscape ? 'a4l' : 'a4p';
      pages.push({ img: canvas.toDataURL('image/jpeg', 0.92), size });
    }
    return pages;
  };

  /** Print the fyler + every attachment page, collated in their arranged
   *  order, through the unified PrintDialog (ticket 092). */
  const printFull = async (): Promise<void> => {
    setBusy(true);
    try {
      const pages: PrintPage[] = [];
      pages.push(...(await renderDocPages(fylerUrl, 0)));
      for (const a of attachments) {
        const recordId = a.id.split('-')[0];
        try {
          pages.push(...(await renderDocPages(`/api/files/${recordId}`, a.rotation)));
        } catch {
          // attachment PDF unavailable — skip it, keep the rest
        }
      }
      setPrintPages(pages);
      setPrintOpen(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Printer className="size-5 text-primary" />
            {t('form.showFullPdf')}
          </DialogTitle>
        </DialogHeader>
        <div className="-mt-1 flex flex-col gap-3 px-6 pb-6">
          <PdfViewer src={fylerUrl} recordId={fylerRecordId} />

          {attachments.length > 0 && (
            <div className="flex flex-col gap-1.5 rounded-xl border border-border/70 bg-muted/30 p-3">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                <Paperclip className="size-3.5" />
                {t('attachments.title')} ({attachments.length})
              </div>
              <div className="flex flex-wrap gap-1.5">
                {attachments.map((a) => (
                  <span
                    key={a.id}
                    className="rounded-md bg-primary/10 px-2 py-1 text-[11px] font-medium text-primary"
                    title={a.description}
                  >
                    {a.source} · {a.size}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>
              {t('form.cancel')}
            </Button>
            <Button onClick={() => void printFull()} disabled={busy} className="gap-1.5">
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Printer className="size-4" />}
              {t('form.printFull')}
            </Button>
          </div>
        </div>
      </DialogContent>

      <PrintDialog
        open={printOpen}
        title={t('form.printFull')}
        pages={printPages}
        onClose={() => setPrintOpen(false)}
      />
    </Dialog>
  );
}