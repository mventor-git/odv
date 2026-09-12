import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

/** Role star map from the database (ticket 097): role name → star badge
 *  value ('gold' | 'white' | ''). No hardcoded role lists in the client. */
export function useRoleStarMap(): Record<string, string> {
  const [map, setMap] = useState<Record<string, string>>({});
  useEffect(() => {
    api<Array<{ name: string; star: string }>>('/api/ref/roles')
      .then((r) => {
        const m: Record<string, string> = {};
        for (const x of r) m[x.name] = x.star ?? '';
        setMap(m);
      })
      .catch(() => undefined);
  }, []);
  return map;
}