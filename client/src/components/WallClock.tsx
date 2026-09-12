import { useEffect, useState, type ReactNode } from 'react';
import { useI18n } from '@/lib/i18n';

export const H24_KEY = 'odv_clock_24h';

/**
 * Global header clock (ticket 088) — bigger, lives in the top header on every
 * page. The 12/24 preference moved to Settings (same localStorage key).
 * Formats via Intl so no hardcoded day/month names are needed.
 */
export function WallClock(): ReactNode {
  const { lang } = useI18n();
  const [now, setNow] = useState(() => new Date());
  const [h24, setH24] = useState(() => localStorage.getItem(H24_KEY) !== '0');

  useEffect(() => {
    const id = window.setInterval(() => {
      setNow(new Date());
      // Same-tab live sync for Settings → Display toggle (storage event only fires cross-tab)
      setH24(localStorage.getItem(H24_KEY) !== '0');
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  // Re-read the preference when it changes (Settings writes the same key).
  useEffect(() => {
    const onStorage = (): void => setH24(localStorage.getItem(H24_KEY) !== '0');
    window.addEventListener('storage', onStorage);
    // Custom same-tab event dispatched by SettingsPage
    window.addEventListener('odv:clock', onStorage as EventListener);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('odv:clock', onStorage as EventListener);
    };
  }, []);

  const locale = lang === 'ar' ? 'ar-EG' : 'en-GB';
  const time = new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: !h24,
  }).format(now);
  const date = new Intl.DateTimeFormat(locale, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(now);

  return (
    <div className="flex flex-col items-end leading-none" role="group" aria-label="clock">
      <span className="text-2xl font-bold tabular-nums tracking-tight text-foreground">{time}</span>
      <span className="text-[11px] text-muted-foreground">{date}</span>
    </div>
  );
}