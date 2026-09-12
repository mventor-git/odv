import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { useI18n } from '@/lib/i18n';
import { getToken } from '@/lib/api';
import { PrintDialog, type PrintPage } from '@/components/PrintDialog';
import type { AttachmentPage } from '@/components/AttachmentEngine';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AppIcon } from '@/icons/AppIcon';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

const PDF_HEADERS = { httpHeaders: { Authorization: `Bearer ${getToken() ?? ''}` } };

/** Printing popup (ticket 112) — "Print 1 Test Copy" / "Print 3 Copies"→"Print 2 Copies" / "Redit".
 *  Prints collated REQUEST with A3 as A3s and A4 as A4s. Popup stays until the user closes it. */
export function PrintPromptPopup({
  open,
  onClose,
  fylerUrl,
  attachments,
  onRedit,
}: {
  open: boolean;
  onClose: () => void;
  fylerUrl: string;
  attachments: AttachmentPage[];
  onRedit: () => void;
}): ReactNode {
  const { t } = useI18n();
  const [tested, setTested] = useState(false);
  const [printOpen, setPrintOpen] = useState(false);
  const [printCopies, setPrintCopies] = useState(1);
  const [pages, setPages] = useState<PrintPage[]>([]);
  const [busy, setBusy] = useState(false);
  const pagesRef = useRef(false);

  const renderDocPages = useCallback(async (url: string, rotate: number): Promise<PrintPage[]> => {
    try {
      const doc = await pdfjsLib.getDocument({ url, ...PDF_HEADERS }).promise;
      const result: PrintPage[] = [];
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
        result.push({ img: canvas.toDataURL('image/jpeg', 0.92), size });
      }
      return result;
    } catch {
      return [];
    }
  }, []);

  useEffect(() => {
    if (!open || !fylerUrl || pagesRef.current) return;
    pagesRef.current = true;
    setBusy(true);
    void (async () => {
      const allPages: PrintPage[] = [];
      allPages.push(...(await renderDocPages(fylerUrl, 0)));
      for (const a of attachments) {
        const recordId = a.id.split('-')[0];
        allPages.push(...(await renderDocPages(`/api/files/${recordId}`, a.rotation)));
      }
      setPages(allPages);
      setBusy(false);
    })();
    return () => { pagesRef.current = false; };
  }, [open, fylerUrl, attachments, renderDocPages]);

  const printCopy = (n: number): void => {
    setPrintCopies(n);
    setPrintOpen(true);
  };

  const a4 = pages.filter((p) => p.size.startsWith('a4')).length;
  const a3 = pages.filter((p) => p.size.startsWith('a3')).length;

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AppIcon name="printer" className="size-5 text-primary" />
              {t('form.printFull')}
            </DialogTitle>
          </DialogHeader>
          <div className="-mt-1 flex flex-col gap-4 px-6 pb-6">
            <div className="rounded-xl border border-border/70 bg-muted/30 p-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">{t('pdf.pages')}</span>
                <span className="font-medium text-foreground">{pages.length}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">{t('form.printA4')}</span>
                <span className="font-medium text-foreground">{a4}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">{t('form.printA3')}</span>
                <span className="font-medium text-foreground">{a3}</span>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <Button
                onClick={() => { printCopy(1); setTested(true); }}
                disabled={busy || pages.length === 0}
                variant={tested ? 'outline' : 'default'}
                className="gap-1.5"
              >
                <AppIcon name="printer" className="size-4" />
                {t('form.print1Test')}
              </Button>
              <Button
                onClick={() => printCopy(tested ? 2 : 3)}
                disabled={busy || pages.length === 0}
                variant="default"
                className="gap-1.5"
              >
                <AppIcon name="printer" className="size-4" />
                {tested ? t('form.print2Copies') : t('form.print3Copies')}
              </Button>
              <Button
                onClick={() => { onRedit(); }}
                variant="outline"
                className="gap-1.5"
              >
                <AppIcon name="edit" className="size-4" />
                {t('form.redit')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <PrintDialog
        open={printOpen}
        title={t('form.printFull')}
        pages={pages}
        initialCopies={printCopies}
        onClose={() => setPrintOpen(false)}
      />
    </>
  );
}