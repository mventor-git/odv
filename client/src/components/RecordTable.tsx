import { useMemo, type ReactNode } from 'react';
import type { DcRecord, Meta } from '@/lib/types';
import { requestNoSortKey, revisionSortKey } from '@/lib/format';
import { useIsMobile } from '@/lib/useIsMobile';
import { RecordTableDesktop } from '@/components/RecordTableDesktop';
import { RecordTableMobile } from '@/components/RecordTableMobile';

export interface RecordGroup {
  key: string;
  category: string;
  requestNo: string;
  rows: DcRecord[];
}

interface RecordTableProps {
  records: DcRecord[];
  meta: Meta | null;
  /** Selected category code — the table renders THAT category's own columns. */
  category?: string;
  /** Open the request card (category + request no. + optional revision to preselect). */
  onOpen?: (category: string, requestNo: string, revisionId?: number) => void;
}

/**
 * Record list — desktop gets the grouped table, mobile gets tappable cards
 * (separate code paths, ticket 037). View-only: editing lives in the
 * request card (tickets 077).
 */
export function RecordTable({
  records,
  meta,
  category,
  onOpen,
}: RecordTableProps): ReactNode {
  const isMobile = useIsMobile();

  const catName = (code: string): string =>
    meta?.categories.find((c) => c.code === code)?.name ?? code;

  const cols = useMemo(() => {
    if (!category) return null;
    return meta?.categories.find((c) => c.code === category)?.columns ?? null;
  }, [category, meta]);
  const hasRevisions = cols?.includes('revisionNo') ?? true;

  /** Group records by (category + request no.) — revisions live under their request. */
  const groups = useMemo<RecordGroup[]>(() => {
    const map = new Map<string, RecordGroup>();
    for (const r of records) {
      const key = r.requestNo ? `${r.category}|${r.requestNo}` : `__id__${r.id}`;
      let g = map.get(key);
      if (!g) {
        g = { key, category: r.category, requestNo: r.requestNo, rows: [] };
        map.set(key, g);
      }
      g.rows.push(r);
    }
    const arr = [...map.values()];
    for (const g of arr) {
      g.rows.sort((a, b) => revisionSortKey(a.revisionNo) - revisionSortKey(b.revisionNo));
    }
    arr.sort((a, b) => {
      const ka = requestNoSortKey(a.requestNo);
      const kb = requestNoSortKey(b.requestNo);
      return ka[0] === kb[0] ? ka[1] - kb[1] : ka[0].localeCompare(kb[0]);
    });
    return arr;
  }, [records]);

  if (isMobile) {
    return (
      <RecordTableMobile
        groups={groups}
        hasRevisions={hasRevisions}
        catName={catName}
        onOpen={onOpen}
      />
    );
  }
  return (
    <RecordTableDesktop
      groups={groups}
      meta={meta}
      category={category}
      onOpen={onOpen}
      hasRevisions={hasRevisions}
      catName={catName}
    />
  );
}