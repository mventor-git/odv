import { type ReactNode } from 'react';
import { useI18n } from '@/lib/i18n';
import { openFileInTab } from '@/lib/files';
import { Database, FileScan } from 'lucide-react';

interface FileLinkProps {
  recordId: number;
  hyperlink: string;
  label?: string;
}

/** Opens the record's file through the authenticated server endpoint (blob URL).
 *  Glassy PDF/DATA icon chip (ticket 024) — the label becomes the tooltip. */
export function FileLink({ recordId, hyperlink, label }: FileLinkProps): ReactNode {
  const { t } = useI18n();
  if (!hyperlink) {
    return <span className="text-muted-foreground">—</span>;
  }
  const isData = label === 'DATA';
  return (
    <button
      onClick={() => {
        void openFileInTab(recordId).catch((err) =>
          window.alert(err instanceof Error ? err.message : String(err)),
        );
      }}
      title={label ?? t('form.openFile')}
      className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border backdrop-blur-md transition-all hover:scale-105 ${
        isData
          ? 'border-border bg-muted text-muted-foreground hover:bg-muted/80 dark:border-border dark:text-muted-foreground'
          : 'border-accent/40 bg-accent/10 text-accent hover:bg-accent/20 dark:border-accent/40 dark:text-accent'
      }`}
    >
      {isData ? <Database className="size-3.5" /> : <FileScan className="size-3.5" />}
    </button>
  );
}