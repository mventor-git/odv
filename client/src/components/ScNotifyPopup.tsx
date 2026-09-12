import { type ReactNode } from 'react';
import { useI18n } from '@/lib/i18n';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AppIcon } from '@/icons/AppIcon';

/** SC notification popup (ticket 112) — appears when the scheduled date+time
 *  is reached. Shows Print (→ PrintPromptPopup) or Delegate (→ ScScheduler). */
export function ScNotifyPopup({
  open,
  onPrint,
  onDelegate,
  onClose,
}: {
  open: boolean;
  onPrint: () => void;
  onDelegate: () => void;
  onClose: () => void;
}): ReactNode {
  const { t } = useI18n();

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent showCloseButton={false} className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AppIcon name="latest" className="size-5 text-accent" />
            {t('form.scPrintOrDelegate')}
          </DialogTitle>
        </DialogHeader>
        <div className="-mt-1 flex flex-col gap-3 px-6 pb-6">
          <Button onClick={onPrint} className="gap-1.5 py-3 text-base">
            <AppIcon name="printer" className="size-5" />
            {t('form.scPrint')}
          </Button>
          <Button onClick={onDelegate} variant="outline" className="gap-1.5 py-3 text-base">
            <AppIcon name="latest" className="size-5" />
            {t('form.scDelegate')}
          </Button>
          <Button variant="ghost" size="sm" onClick={onClose}>
            {t('form.cancel')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}