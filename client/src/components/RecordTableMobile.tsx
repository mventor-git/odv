import { type ReactNode } from 'react';
import { useI18n } from '@/lib/i18n';
import { StatusBadge } from '@/components/StatusBadge';
import { FileLink } from '@/components/FileLink';
import { padRequestNo, padRevisionNo } from '@/lib/format';
import type { RecordGroup } from '@/components/RecordTable';

interface MobileProps {
  groups: RecordGroup[];
  hasRevisions: boolean;
  catName: (code: string) => string;
  onOpen?: (category: string, requestNo: string, revisionId?: number) => void;
}

/** Mobile card list — one tappable glassy card per request group (ticket 036/037). */
export function RecordTableMobile({ groups, hasRevisions, catName, onOpen }: MobileProps): ReactNode {
  const { t } = useI18n();
  if (groups.length === 0) {
    return (
      <div className="rounded-lg border border-border/60 bg-card p-8 text-center text-muted-foreground">
        {t('records.noResults')}
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      {groups.map((g) => {
        const latest = g.rows[g.rows.length - 1];
        return (
            <button
            key={g.key}
            onClick={() => onOpen?.(g.category, g.requestNo, latest.id)}
            className="group/card flex flex-col gap-2 rounded-2xl border border-border bg-card/80 p-4 text-start shadow-sm backdrop-blur-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-lg hover:border-accent/30 hover:bg-card active:scale-[0.99]"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-base font-bold text-foreground">
                {padRequestNo(g.requestNo)}
              </span>
              <StatusBadge status={latest.status} />
            </div>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
              <span className="rounded bg-muted px-1.5 py-0.5 font-semibold uppercase tracking-wide">
                {catName(g.category)}
              </span>
              {hasRevisions && (
                <span>
                  {g.rows.length} {t('cc.revisions')}
                </span>
              )}
              {latest.zone && <span>· {latest.zone}</span>}
              {latest.floor && <span>· {latest.floor}</span>}
            </div>
            {latest.description && (
              <div className="line-clamp-2 text-sm text-muted-foreground">{latest.description}</div>
            )}
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span className="truncate">{latest.engineer || ''}</span>
              <span className="flex shrink-0 items-center gap-2">
                <span className="font-mono">{padRevisionNo(latest.revisionNo)}</span>
                {latest.hyperlink.trim() && (
                  <span onClick={(e) => e.stopPropagation()}>
                    <FileLink recordId={latest.id} hyperlink={latest.hyperlink} label="PDF" />
                  </span>
                )}
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}