import { type ReactNode } from 'react';
import { useI18n } from '@/lib/i18n';
import type { DcRecord } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { StatusBadge } from '@/components/StatusBadge';
import { padRequestNo, padRevisionNo } from '@/lib/format';
import { AlertTriangle, Flame } from 'lucide-react';

interface PurgeConfirmDialogProps {
  open: boolean;
  record: DcRecord | null;
  /** The admin performing the purge — shown as "who purged it" (v3 item 25). */
  purgedBy: string;
  onClose: () => void;
  onConfirm: () => void;
}

/** Purge confirmation — metadata only + who purged it + metadata-file note (v3 item 25). */
export function PurgeConfirmDialog({
  open,
  record,
  purgedBy,
  onClose,
  onConfirm,
}: PurgeConfirmDialogProps): ReactNode {
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
            <Flame className="size-5" />
            {t('trash.purge')}
          </DialogTitle>
        </DialogHeader>

        <div className="-mt-1 flex flex-col gap-4 px-6 pb-6">
          <div className="flex items-start gap-3 rounded-xl border border-destructive/30/60 bg-destructive/10 p-3 dark:border-destructive/30 dark:bg-destructive/10">
            <AlertTriangle className="mt-0.5 size-5 shrink-0 text-destructive dark:text-red-400" />
            <div className="text-sm text-destructive dark:text-red-200">
              {t('trash.purgeCaution')}
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

          <div className="rounded-xl border border-border/70 bg-muted/40 p-3 text-xs text-muted-foreground">
            {t('trash.purgedBy')}: <span className="font-semibold text-foreground">{purgedBy}</span>
            <div className="mt-1">{t('trash.purgeFileNote')}</div>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>
              {t('form.cancel')}
            </Button>
            <Button variant="destructive" className="gap-1.5" onClick={onConfirm}>
              <Flame className="size-4" />
              {t('trash.purge')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}