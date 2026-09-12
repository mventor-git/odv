import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';

/**
 * useState that survives refresh/resize (v3 item 18) — backed by localStorage.
 * Keys are namespaced per page: `odv_ui_<key>`.
 */
export function usePersistentState<T>(
  key: string,
  initial: T,
): [T, Dispatch<SetStateAction<T>>] {
  const storageKey = `odv_ui_${key}`;
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw !== null) return JSON.parse(raw) as T;
    } catch {
      // corrupted value — fall through to initial
    }
    return initial;
  });

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(value));
    } catch {
      // storage full/unavailable — state still works in-memory
    }
  }, [storageKey, value]);

  return [value, setValue];
}