import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import { api } from '@/lib/api';

export interface NotifyItem {
  id: number;
  title: string;
  target: string;
  from_user: string;
  status: string;
}

/** Shared notification badge state for the shells (mventor-ticket-126).
 *  Polls /api/notify?scope=mine every 60s (was 30s) plus immediate refresh on
 *  the 'odv:notify' event, and clears on 'odv:vault-open'. Both desktop
 *  and mobile shells use this so there is one poll per tab, not several.
 *  `remove` deletes a notification (Dev/Admin only — enforced server-side too). */
export function useNotifyBadge(pollMs = 60_000): {
  count: number;
  items: NotifyItem[];
  open: boolean;
  setOpen: Dispatch<SetStateAction<boolean>>;
  load: () => void;
  remove: (id: number) => Promise<void>;
} {
  const [count, setCount] = useState(0);
  const [items, setItems] = useState<NotifyItem[]>([]);
  const [open, setOpen] = useState(false);

  const load = useCallback((): void => {
    api<{ items: NotifyItem[] }>('/api/notify?scope=mine')
      .then((r) => {
        const list = Array.isArray(r.items) ? r.items : [];
        // Only count active (unread) — notified/responded are seen.
        const unread = list.filter((n) => (n.status ?? 'active') === 'active');
        setItems(unread);
        setCount(unread.length);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    load();
    const id = window.setInterval(load, pollMs);
    const onNotify = (): void => load();
    const onVaultOpen = (): void => setCount(0);
    window.addEventListener('odv:notify', onNotify);
    window.addEventListener('odv:vault-open', onVaultOpen as EventListener);
    return () => {
      window.clearInterval(id);
      window.removeEventListener('odv:notify', onNotify);
      window.removeEventListener('odv:vault-open', onVaultOpen as EventListener);
    };
  }, [load, pollMs]);

  const remove = useCallback(async (id: number): Promise<void> => {
    await api(`/api/notify/${id}`, { method: 'DELETE' });
    load();
  }, [load]);

  return { count, items, open, setOpen, load, remove };
}
