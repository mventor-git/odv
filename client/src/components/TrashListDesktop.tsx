import { type ReactNode } from 'react';
import type { DcRecord } from '@/lib/types';
import { useI18n } from '@/lib/i18n';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { StatusBadge } from '@/components/StatusBadge';
import { padRequestNo, padRevisionNo } from '@/lib/format';
import { RotateCcw, Trash2 } from 'lucide-react';

type TKey = Parameters<ReturnType<typeof useI18n>['t']>[0];

interface Props {
  rows: DcRecord[];
  isAdmin: boolean;
  t: (key: TKey) => string;
  timeLabel: (iso: string) => string;
  onRestore: (r: DcRecord) => void;
  onPurge: (r: DcRecord) => void;
}

/** Desktop trash table (ticket 037 split). */
export function TrashListDesktop({ rows, isAdmin, t, timeLabel, onRestore, onPurge }: Props): ReactNode {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t('field.requestNo')}</TableHead>
          <TableHead>{t('field.category')}</TableHead>
          <TableHead>{t('field.revisionNo')}</TableHead>
          <TableHead>{t('field.status')}</TableHead>
          <TableHead>{t('field.description')}</TableHead>
          <TableHead>{t('trash.trashedAt')}</TableHead>
          <TableHead className="text-end">{t('records.actions')}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={r.id}>
            <TableCell className="font-mono font-semibold text-foreground">
              {padRequestNo(r.requestNo)}
            </TableCell>
            <TableCell className="text-muted-foreground">{r.category}</TableCell>
            <TableCell className="font-mono text-muted-foreground">
              {padRevisionNo(r.revisionNo)}
            </TableCell>
            <TableCell>
              <StatusBadge status={r.status} />
            </TableCell>
            <TableCell className="max-w-[16rem] truncate text-muted-foreground">
              {r.description || '—'}
            </TableCell>
            <TableCell className="text-muted-foreground">{timeLabel(r.deletedAt ?? '')}</TableCell>
            <TableCell className="text-end">
              {isAdmin ? (
                <div className="flex justify-end gap-1">
                  <Button size="sm" variant="outline" className="gap-1" onClick={() => onRestore(r)}>
                    <RotateCcw className="size-3.5" />
                    {t('trash.restore')}
                  </Button>
                  <Button size="sm" variant="destructive" className="gap-1" onClick={() => onPurge(r)}>
                    <Trash2 className="size-3.5" />
                    {t('trash.deleteForever')}
                  </Button>
                </div>
              ) : (
                <span className="text-xs text-muted-foreground">{t('users.adminOnly')}</span>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}