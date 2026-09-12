import { type ReactNode } from 'react';
import { useI18n } from '@/lib/i18n';
import type { DcRecord } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { StatusBadge } from '@/components/StatusBadge';
import { padRequestNo, padRevisionNo } from '@/lib/format';
import { AlertTriangle, Trash2 } from 'lucide-react';

interface DeleteConfirmDialogProps {
  open: boolean;
  record: DcRecord | null;
  onClose: () => void;
  onConfirm: () => void;
}

/** Caution + metadata delete confirmation — "Move to Trash" (ticket 031). */
export function DeleteConfirmDialog({
  open,
  record,
  onClose,
  onConfirm,
}: DeleteConfirmDialogProps): ReactNode {
  const { t } = useI18n();
  if (!record) return null;

  const meta: Array<{ label: string; value: string }> = [
    { label: t('field.category'), value: record.category },
    { label: t('field.requestNo'), value: padRequestNo(record.requestNo) },
    { label: t('field.revisionNo'), value: padRevisionNo(record.revisionNo) },
    { label: t('field.status'), value: record.status },
    { label: t('field.zone'), value: record.zone || '—' },
    { label: t('field.floor'), value: record.floor || '—' },
    { label: t('field.member'), value: record.engineer || '—' },
    { label: t('field.fork'), value: record.fork || '—' },
    { label: t('field.sentDate'), value: record.sentDate || '—' },
    { label: t('field.replyDate'), value: record.replyDate || '—' },
  ];

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <Trash2 className="size-5" />
            {t('trash.moveToTrash')}
          </DialogTitle>
        </DialogHeader>

        <div className="-mt-1 flex flex-col gap-4 px-6 pb-6">
          <div className="flex items-start gap-3 rounded-xl border border-warning/40 bg-warning/10 p-3 dark:border-warning/40 dark:bg-warning/10">
            <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-600 dark:text-amber-400" />
            <div className="text-sm text-warning dark:text-amber-200">
              {t('trash.caution')}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <StatusBadge status={record.status} />
            <span className="font-mono text-lg font-bold text-foreground">
              {padRequestNo(record.requestNo)}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-xl border border-border/70 bg-card p-4">
            {meta.map((m) => (
              <div key={m.label} className="flex flex-col gap-0.5">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {m.label}
                </span>
                <span className="truncate text-sm text-foreground">{m.value}</span>
              </div>
            ))}
            {record.description && (
              <div className="col-span-2 flex flex-col gap-0.5">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {t('field.description')}
                </span>
                <span className="line-clamp-3 text-sm text-foreground">{record.description}</span>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>
              {t('form.cancel')}
            </Button>
            <Button variant="destructive" className="gap-1.5" onClick={onConfirm}>
              <Trash2 className="size-4" />
              {t('trash.moveToTrash')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}