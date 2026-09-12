import { type ReactNode } from 'react';
import { useI18n } from '@/lib/i18n';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { RequestCardBody } from '@/components/RequestCardBody';

/** Modal card view for a request — metadata + PDF viewer, no full page. */
export function RequestCard({
  open,
  category,
  requestNo,
  initialViewId,
  onClose,
}: {
  open: boolean;
  category: string;
  requestNo: string;
  initialViewId?: number;
  onClose: () => void;
}): ReactNode {
  const { t } = useI18n();
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="h-[min(96vh,930px)] w-[min(95vw,930px)] max-h-none max-w-none overflow-y-auto sm:max-w-none">
        <DialogHeader>
          <DialogTitle>{t('details.title')}</DialogTitle>
        </DialogHeader>
        <RequestCardBody
          category={category}
          requestNo={requestNo}
          initialViewId={initialViewId}
          onDeleted={onClose}
        />
      </DialogContent>
    </Dialog>
  );
}