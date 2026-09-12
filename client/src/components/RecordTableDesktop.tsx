import { useMemo, type ReactNode } from 'react';
import type { DcRecord, Meta } from '@/lib/types';
import { useI18n } from '@/lib/i18n';
import { StatusBadge } from '@/components/StatusBadge';
import { FileLink } from '@/components/FileLink';
import { FIELD_LABEL_KEYS } from '@/data/display';
import { padRequestNo, padRevisionNo } from '@/lib/format';
import type { RecordGroup } from '@/components/RecordTable';

/** Fallback columns when no single category is selected (mixed view). */
const DEFAULT_COLS = [
  'requestNo', 'revisionNo', 'description', 'zone', 'floor',
  'status', 'sentDate', 'replyDate', 'hyperlink',
];

/** Column widths (colgroup) so every row aligns. Description takes the rest. */
const COL_WIDTH: Record<string, string> = {
  revisionNo: 'w-10',
  description: '',
  zone: 'w-20',
  floor: 'w-24',
  engineer: 'w-28',
  fork: 'w-28',
  status: 'w-28',
  sentDate: 'w-32',
  sentByConsultantDate: 'w-32',
  replyDate: 'w-32',
  replyByContractorDate: 'w-32',
  hyperlink: 'w-14',
  dataHyperlink: 'w-14',
};

interface DesktopProps {
  groups: RecordGroup[];
  meta: Meta | null;
  category?: string;
  onOpen?: (category: string, requestNo: string, revisionId?: number) => void;
  hasRevisions: boolean;
  catName: (code: string) => string;
}

/**
 * Desktop table view — grouped rows. View-only: editing lives in the
 * request card (View/Edit toggle removed, tickets 077).
 */
export function RecordTableDesktop({
  groups,
  meta,
  category,
  onOpen,
  hasRevisions,
  catName,
}: DesktopProps): ReactNode {
  const { t } = useI18n();

  const cols = useMemo(() => {
    if (!category) return DEFAULT_COLS;
    return meta?.categories.find((c) => c.code === category)?.columns ?? DEFAULT_COLS;
  }, [category, meta]);

  const rowCols = useMemo(() => cols.filter((c) => c !== 'requestNo' && c !== 'orderNo'), [cols]);

  const cell = (r: DcRecord, col: string): ReactNode => {
    const value = r[col as keyof DcRecord] as string;
    if (col === 'status') return <StatusBadge status={value} />;
    if (col === 'hyperlink') return <FileLink recordId={r.id} hyperlink={value} />;
    if (col === 'dataHyperlink') return <FileLink recordId={r.id} hyperlink={value} label="DATA" />;
    if (col === 'revisionNo') {
      return <span className="font-mono text-xs font-semibold text-muted-foreground">{padRevisionNo(value)}</span>;
    }
    return <span className="block truncate text-muted-foreground">{value || '—'}</span>;
  };

  return (
    <div className="flex flex-col gap-4">
      {groups.length === 0 && (
        <div className="surface-muted rounded-lg p-8 text-center text-muted-foreground">
          {t('records.noResults')}
        </div>
      )}

      {groups.length > 0 &&
        groups.map((g) => {
          const latest = g.rows[g.rows.length - 1];
          return (
          <div
            key={g.key}
            onClick={() => onOpen?.(g.category, g.requestNo, latest.id)}
            className="group/card cursor-pointer overflow-hidden rounded-xl border border-border bg-card/80 shadow-sm backdrop-blur-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-lg hover:border-accent/30 hover:bg-card"
            title={t('details.title')}
          >
            {/* Request header — bordered card title, shows this is a Request */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border/50 bg-muted/20 px-3 py-2.5">
              <span className="font-mono text-sm font-bold tracking-wide text-foreground">
                {padRequestNo(g.requestNo)}
              </span>
              <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                {catName(g.category)}
              </span>
              {hasRevisions && (
                <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                  {g.rows.length} {t('cc.revisions')}
                </span>
              )}
              <span className="ms-auto">
                <StatusBadge status={g.rows[g.rows.length - 1].status} />
              </span>
              <span className="hidden text-xs text-muted-foreground group-hover/card:text-accent sm:inline">
                {t('details.title')} →
              </span>
            </div>

            {/* Revision rows — keep column header inside card for alignment */}
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <colgroup>
                  {rowCols.map((col) => (
                    <col key={col} className={COL_WIDTH[col] ?? 'w-24'} />
                  ))}
                </colgroup>
                <thead>
                  <tr className="border-b border-border/40 bg-card/40 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {rowCols.map((col) => (
                      <th key={col} className="px-3 py-2 text-start">
                        {t(FIELD_LABEL_KEYS[col] as Parameters<typeof t>[0])}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {g.rows.map((r) => (
                    <tr
                      key={r.id}
                      onClick={() => onOpen?.(g.category, g.requestNo, r.id)}
                      className="cursor-pointer border-b border-border/30 last:border-b-0 transition-colors hover:bg-accent/[0.06] active:bg-accent/[0.10]"
                      title={t('details.title')}
                    >
                      {rowCols.map((col) => (
                        <td key={col} className="px-3 py-1.5">
                          {cell(r, col)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          );
        })
      }
    </div>
  );
}