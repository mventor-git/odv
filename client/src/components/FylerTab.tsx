import { useState, type ReactNode } from 'react';
import { useI18n } from '@/lib/i18n';
import { Button } from '@/components/ui/button';
import { PdfViewer } from '@/components/PdfViewer';
import { AppIcon } from '@/icons/AppIcon';

/** Fyler tab (ticket 112) — the live fyler PDF in an embedded viewer with
 *  Edit / View buttons, plus a drag-drop zone to attach PDFs. */
export function FylerTab({
  fylerUrl,
  busy,
  error,
  attachmentsCount,
  onRefresh,
  onOpenFull,
  onEdit,
  onDropFiles,
}: {
  fylerUrl: string;
  busy: boolean;
  error: string;
  attachmentsCount: number;
  onRefresh: () => void;
  onOpenFull: () => void;
  onEdit: () => void;
  onDropFiles: (files: FileList) => void;
}): ReactNode {
  const { t } = useI18n();
  const [dragOver, setDragOver] = useState(false);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-semibold text-foreground">{t('form.fylerLive')}</span>
        <div className="flex items-center gap-1.5">
          <Button size="sm" variant="outline" className="gap-1.5" onClick={onRefresh} disabled={busy}>
            {busy ? <AppIcon name="loader" className="size-3.5 animate-spin" /> : <AppIcon name="printer" className="size-3.5" />}
            {t('form.fylerView')}
          </Button>
          <Button size="sm" className="gap-1.5" onClick={onOpenFull}>
            <AppIcon name="file" className="size-3.5" />
            {t('form.popupPdf')}
            {attachmentsCount > 0 ? ` (${attachmentsCount})` : ''}
          </Button>
          <Button size="sm" variant="outline" className="gap-1.5" onClick={onEdit}>
            <AppIcon name="edit" className="size-3.5" />
            {t('form.fylerEdit')}
          </Button>
        </div>
      </div>

      {error && <div className="text-xs text-destructive">{error}</div>}

      {fylerUrl ? (
        <PdfViewer src={fylerUrl} recordId={0} />
      ) : (
        <div className="flex h-40 items-center justify-center rounded-xl border border-dashed border-border/60 bg-muted/20 text-sm text-muted-foreground">
          {t('form.fylerLive')}…
        </div>
      )}

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (e.dataTransfer.files?.length) onDropFiles(e.dataTransfer.files);
        }}
        className={`flex items-center justify-center gap-2 rounded-xl border-2 border-dashed p-4 text-sm transition-all ${
          dragOver
            ? 'border-primary/60 bg-primary/5 text-primary'
            : 'border-border/60 bg-muted/10 text-muted-foreground'
        }`}
      >
        <AppIcon name="file" className="size-5" />
        {t('form.fylerDragDrop')}
      </div>
    </div>
  );
}