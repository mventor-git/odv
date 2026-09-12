import { type ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { STATUS_STYLES } from '@/data/display';

export function StatusBadge({ status }: { status: string }): ReactNode {
  return (
    <Badge className={STATUS_STYLES[status] ?? 'border-border bg-muted text-muted-foreground dark:border-border dark:bg-muted dark:text-muted-foreground'}>
      {status}
    </Badge>
  );
}
