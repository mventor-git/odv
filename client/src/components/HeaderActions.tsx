import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useI18n } from '@/lib/i18n';
import { WallClock } from '@/components/WallClock';
import { WallReportDialog } from '@/components/WallReportDialog';
import { FileCode2, Plus, ScanLine, Table2 } from 'lucide-react';

/** Global header quick actions (ticket 088) — icon-only with tooltips, next
 *  to the +New Request button. No duplicates anywhere else in the app. */
export function HeaderActions(): ReactNode {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [reportOpen, setReportOpen] = useState(false);

  const iconBtn =
    'inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-all duration-150 hover:bg-accent hover:text-foreground active:scale-90';

  return (
    <>
      <div className="flex items-center gap-1.5">
        <button
          onClick={() => navigate('/requests/new')}
          className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white shadow-md shadow-accent/20 transition-all duration-150 hover:bg-accent/90 active:scale-95"
        >
          <Plus className="size-4" />
          {t('records.new')}
        </button>
        <span className="mx-1 h-6 w-px bg-border/70" aria-hidden="true" />
        <button
          onClick={() => navigate('/requests/scan')}
          className={iconBtn}
          title={t('wall.logScan')}
          aria-label={t('wall.logScan')}
        >
          <ScanLine className="size-4.5" />
        </button>
        <button
          onClick={() => navigate('/requests')}
          className={iconBtn}
          title={t('wall.openRecords')}
          aria-label={t('wall.openRecords')}
        >
          <Table2 className="size-4.5" />
        </button>
        <button
          onClick={() => setReportOpen(true)}
          className={iconBtn}
          title={t('wall.createReport')}
          aria-label={t('wall.createReport')}
        >
          <FileCode2 className="size-4.5" />
        </button>
        <span className="mx-1 h-6 w-px bg-border/70" aria-hidden="true" />
        <WallClock />
      </div>
      <WallReportDialog open={reportOpen} onClose={() => setReportOpen(false)} />
    </>
  );
}