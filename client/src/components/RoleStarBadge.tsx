import type { ReactNode } from 'react';
import { Star } from 'lucide-react';
import { starClass } from '@/lib/format';

/** Star badge next to member names (ticket 097). The star value ('gold' /
 *  'white' / '') comes from the roles table in the database — the client
 *  only maps the DB value to a cosmetic class. */
export function RoleStarBadge({ star, title }: { star?: string; title?: string }): ReactNode | null {
  const cls = starClass(star);
  if (!cls) return null;
  return (
    <span
      className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full ${cls}`}
      title={title}
    >
      <Star className="size-2.5 fill-current" />
    </span>
  );
}