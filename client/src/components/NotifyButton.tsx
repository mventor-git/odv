import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { useAuth } from '@/lib/auth';
import { sound } from '@/lib/sound';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Expand } from 'lucide-react';
import { TableMaker, type NotifyTable } from '@/components/TableMaker';
import { AppIcon } from '@/icons/AppIcon';

interface NotifyButtonProps {
  /** The element this notify is attached to (e.g. "IR STR-0001"). */
  target: string;
  /** Small variant for dense rows. */
  small?: boolean;
}

interface Draft {
  title: string;
  body: string;
  notifyDate: string;
  toUser: string;
  table: NotifyTable | null;
}

const EMPTY_DRAFT: Draft = { title: '', body: '', notifyDate: '', toUser: '', table: null };

/**
 * Floating notify icon (ticket 073 round 2) — attached to elements across the
 * app (NOT settings/users/legacy). Clicking it EXPANDS the icon into a note
 * near the icon; click-away closes it; the user's unsent draft is kept per
 * user + element until they send it. Draggable note (080) + dynamic table
 * maker with "Check Table" chip in the small view (082).
 */
export function NotifyButton({ target, small = false }: NotifyButtonProps): ReactNode {
  const { t } = useI18n();
  const { user } = useAuth();
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [drag, setDrag] = useState<{ startX: number; startY: number; origTop: number; origLeft: number } | null>(null);
  const [users, setUsers] = useState<Array<{ username: string }>>([]);
  const [form, setForm] = useState<Draft>(EMPTY_DRAFT);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  const draftKey = `odv_notify_draft_${user?.username ?? 'anon'}_${target}`;
  const posKey = `odv_notify_pos_${user?.username ?? 'anon'}_${target}`;

  const loadPos = useCallback((): { top: number; left: number } | null => {
    try {
      const raw = localStorage.getItem(posKey);
      if (!raw) return null;
      const p = JSON.parse(raw) as { top?: number; left?: number };
      if (typeof p.top !== 'number' || typeof p.left !== 'number') return null;
      return { top: p.top, left: p.left };
    } catch {
      return null;
    }
  }, [posKey]);

  const savePos = useCallback(
    (p: { top: number; left: number }): void => {
      try {
        localStorage.setItem(posKey, JSON.stringify(p));
      } catch {
        // storage unavailable — position just won't persist
      }
    },
    [posKey],
  );

  const loadDraft = useCallback((): Draft => {
    try {
      const raw = localStorage.getItem(draftKey);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<Draft>;
        return {
          ...EMPTY_DRAFT,
          ...parsed,
          table: parsed.table && Array.isArray(parsed.table.headers) ? (parsed.table as NotifyTable) : null,
        };
      }
    } catch {
      // corrupted draft — start fresh
    }
    return EMPTY_DRAFT;
  }, [draftKey]);

  const saveDraft = useCallback(
    (d: Draft): void => {
      try {
        localStorage.setItem(draftKey, JSON.stringify(d));
      } catch {
        // storage unavailable — draft just won't persist
      }
    },
    [draftKey],
  );

  const clearDraft = useCallback((): void => {
    try {
      localStorage.removeItem(draftKey);
    } catch {
      // ignore
    }
  }, [draftKey]);

  useEffect(() => {
    if (open && users.length === 0) {
      api<Array<{ username: string }>>('/api/auth/users')
        .then(setUsers)
        .catch(() => undefined);
    }
  }, [open, users.length]);

  /** Open the note near the icon (clamped to the viewport) — or at the
   *  user's saved position for this element when one exists (ticket 080).
   *  Always ensures a position so the note is renderable and closable. */
  const openNote = (): void => {
    const saved = loadPos();
    if (saved) {
      setPos(saved);
    } else {
      const rect = btnRef.current?.getBoundingClientRect();
      const noteW = 320; // w-80
      const noteH = 300;
      if (rect) {
        let left = rect.right - noteW;
        left = Math.max(8, Math.min(left, window.innerWidth - noteW - 8));
        let top = rect.top - noteH - 8;
        if (top < 8) top = rect.bottom + 8;
        setPos({ top, left });
      } else {
        // Fallback center so the note is never unrendered/unclosable
        setPos({
          top: Math.max(8, window.innerHeight / 2 - noteH / 2),
          left: Math.max(8, window.innerWidth / 2 - noteW / 2),
        });
      }
    }
    setForm(loadDraft());
    setSent(false);
    setError('');
    setOpen(true);
  };

  const closeNote = (): void => {
    // Keep the draft — the user's unsent data stays until they send it.
    setDrag(null);
    setOpen(false);
    setExpanded(false);
  };

  // Escape closes both small and expanded notes
  useEffect(() => {
    if (!open && !expanded) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        if (expanded) setExpanded(false);
        else closeNote();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, expanded]);

  const send = useCallback(async (): Promise<void> => {
    if (!form.title && !form.body && !form.table) return;
    setBusy(true);
    setError('');
    try {
      const payload = {
        title: form.title,
        body: form.body,
        notifyDate: form.notifyDate,
        toUser: form.toUser,
        target,
        table: form.table,
      };
      await api('/api/notify', { method: 'POST', body: payload });
      sound.success();
      clearDraft();
      setSent(true);
      setForm(EMPTY_DRAFT);
      setTimeout(() => {
        setOpen(false);
        setSent(false);
      }, 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      sound.error();
    } finally {
      setBusy(false);
    }
  }, [form, target, clearDraft]);

  const setField = (key: keyof Draft, value: string): void => {
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      saveDraft(next);
      return next;
    });
  };

  const setTable = (table: NotifyTable): void => {
    setForm((prev) => {
      const next = { ...prev, table };
      saveDraft(next);
      return next;
    });
  };

  const hasTable = !!form.table && form.table.headers.length > 0;

  /** Shared fields: title, body, date, toUser. */
  const fields = (
    <div className="flex flex-col gap-2">
      <Input
        value={form.title}
        placeholder={t('vault.titlePh')}
        onChange={(e) => setField('title', e.target.value)}
      />
      <textarea
        value={form.body}
        placeholder={t('vault.bodyPh')}
        onChange={(e) => setField('body', e.target.value)}
        className={`w-full resize-none rounded-lg border border-border/70 bg-card/60 px-2.5 py-1.5 text-sm text-foreground outline-none transition-colors focus:border-primary ${
          expanded ? 'h-28' : 'h-20'
        }`}
      />
      <div className="grid grid-cols-2 gap-2">
        <Input
          type="date"
          value={form.notifyDate}
          onChange={(e) => setField('notifyDate', e.target.value)}
        />
        <Select value={form.toUser} onChange={(e) => setField('toUser', e.target.value)}>
          <option value="">{t('vault.everyone')}</option>
          {users.map((u) => (
            <option key={u.username} value={u.username}>
              {u.username}
            </option>
          ))}
        </Select>
      </div>
    </div>
  );

  /** Send button shared by the small + expanded views. */
  const sendBtn = (
    <Button
      size="sm"
      onClick={() => void send()}
      disabled={busy || (!form.title && !form.body && !hasTable)}
      className="gap-1.5 self-end"
    >
      {busy ? <AppIcon name="loader" className="size-4 animate-spin" /> : <AppIcon name="send" className="size-4" />}
      {t('vault.send')}
    </Button>
  );

  return (
    <>
      {/* The floating icon — clicking it expands into the note */}
      <button
        ref={btnRef}
        type="button"
        onClick={openNote}
        title={t('vault.addNotify')}
        className={`notify-float inline-flex items-center justify-center rounded-full border border-border/70 bg-card/80 text-muted-foreground shadow-sm backdrop-blur-md transition-all duration-200 hover:scale-110 hover:border-primary/50 hover:text-primary active:scale-95 ${
          small ? 'h-7 w-7' : 'h-8 w-8'
        } ${open ? 'notify-float-open border-primary/60 text-primary' : ''}`}
      >
        <AppIcon name="bell" className={small ? 'size-3.5' : 'size-4'} />
      </button>

      {/* Click-away backdrop + the note near the icon */}
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={closeNote} aria-hidden="true" />
          <div
            className="notify-note fixed z-50 w-80 rounded-2xl border border-border/70 bg-card/95 p-4 shadow-2xl backdrop-blur-xl"
            style={pos ? { top: pos.top, left: pos.left } : { top: 80, left: Math.max(8, window.innerWidth / 2 - 160) }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drag handle (ticket 080) — drag the note anywhere; position
                is saved per element + user on release. */}
            <div
              className="mb-2 flex cursor-grab touch-none select-none items-center justify-between gap-2 active:cursor-grabbing"
              onPointerDown={(e) => {
                // Don't start drag when clicking the action buttons
                const target = e.target as HTMLElement;
                if (target.closest('button')) return;
                if (!pos) return;
                e.preventDefault();
                (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                setDrag({ startX: e.clientX, startY: e.clientY, origTop: pos.top, origLeft: pos.left });
              }}
              onPointerMove={(e) => {
                if (!drag) return;
                e.preventDefault();
                const noteW = 320;
                const noteH = 300;
                // Keep inside app borders (sidebar + header) so note is never hidden
                const sidebarW = 16; // collapsed rail minimal, visible area start
                const headerH = 56;
                const left = Math.max(sidebarW + 8, Math.min(e.clientX - drag.startX + drag.origLeft, window.innerWidth - noteW - 8));
                const top = Math.max(headerH + 8, Math.min(e.clientY - drag.startY + drag.origTop, window.innerHeight - noteH - 8));
                setPos({ top, left });
              }}
              onPointerUp={(e) => {
                if (!drag) return;
                (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
                const noteW = 320;
                const noteH = 300;
                const sidebarW = 16;
                const headerH = 56;
                const left = Math.max(sidebarW + 8, Math.min(e.clientX - drag.startX + drag.origLeft, window.innerWidth - noteW - 8));
                const top = Math.max(headerH + 8, Math.min(e.clientY - drag.startY + drag.origTop, window.innerHeight - noteH - 8));
                savePos({ top, left });
                setPos({ top, left });
                setDrag(null);
              }}
              onPointerCancel={() => setDrag(null)}
            >
              <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-primary">
                <AppIcon name="bell" className="size-3.5" />
                {t('vault.addNotify')}
              </span>
              <div className="flex items-center gap-1">
                <AppIcon name="gripVertical" className="size-4 text-muted-foreground/60" />
                <button
                  type="button"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => { e.stopPropagation(); setExpanded(true); }}
                  title={t('vault.expand')}
                  className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  <Expand className="size-4" />
                </button>
                <button
                  type="button"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => { e.stopPropagation(); closeNote(); }}
                  title={t('form.cancel')}
                  className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground hover:bg-destructive/10 hover:text-destructive"
                >
                  <AppIcon name="x" className="size-4" />
                </button>
              </div>
            </div>

            <div className="mt-2 truncate rounded-lg bg-muted/50 px-2 py-1 font-mono text-[11px] text-muted-foreground">
              {target}
            </div>

            {sent ? (
              <div className="py-6 text-center text-sm text-success">{t('vault.sent')}</div>
            ) : (
              <div className="mt-2 flex flex-col gap-2">
                {fields}
                {error && <div className="text-xs text-destructive">{error}</div>}
                {/* Check Table chip (ticket 082) — visible when a table was
                    saved; clicking opens the bigger expanded view. */}
                {hasTable && (
                  <button
                    type="button"
                    onClick={() => setExpanded(true)}
                    className="flex items-center justify-between gap-2 rounded-lg border border-primary/40 bg-primary/10 px-2.5 py-1.5 text-xs font-semibold text-primary transition-colors hover:bg-primary/20 active:scale-[0.98]"
                  >
                    <span className="flex items-center gap-1.5">
                      <AppIcon name="table" className="size-3.5" />
                      {t('vault.checkTable')}
                    </span>
                    <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide">
                      {form.table!.headers.length}✕{form.table!.rows.length}
                    </span>
                  </button>
                )}
                {sendBtn}
              </div>
            )}
          </div>
        </>
      )}

      {/* Expanded full view — BIGGER (ticket 082) with the dynamic table maker */}
      <Dialog open={expanded} onOpenChange={(o) => { if (!o) setExpanded(false); }}>
        <DialogContent className="max-h-[92vh] w-[min(95vw,720px)] max-w-none overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sm">
              <AppIcon name="bell" className="size-4 text-primary" />
              {t('vault.addNotify')} — {target}
            </DialogTitle>
          </DialogHeader>
          <div className="-mt-1 flex flex-col gap-4 px-6 pb-6">
            {sent ? (
              <div className="py-6 text-center text-sm text-success">{t('vault.sent')}</div>
            ) : (
              <>
                {fields}
                {error && <div className="text-xs text-destructive">{error}</div>}
                <div className="h-px bg-border/70" />
                {/* Dynamic table maker — headers + values, Save Table (ticket 082) */}
                <TableMaker value={form.table} onSave={setTable} />
                <div className="flex justify-end">{sendBtn}</div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}