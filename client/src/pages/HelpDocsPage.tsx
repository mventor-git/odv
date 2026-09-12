import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { useAuth } from '@/lib/auth';
import { sound } from '@/lib/sound';
import type { Meta } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import {
  BookOpen,
  Loader2,
  Pencil,
  Plus,
  Search,
  StickyNote,
  Trash2,
  Workflow,
  X,
} from 'lucide-react';

interface HelpNote {
  id: number;
  noteDate: string;
  note: string;
  createdBy: string;
  createdAt: string;
}

interface HelpBullet {
  id: number;
  en: string;
  ar: string;
}
interface HelpHeader {
  id: number;
  en: string;
  ar: string;
  bullets: HelpBullet[];
}
interface HelpSection {
  id: number;
  en: string;
  ar: string;
  headers: HelpHeader[];
}

type Draft = { en: string; ar: string };

/** Help Docs (ticket 072/093) — editable structured document (sections →
 *  headers → bullets, admin edits), Request Cycles, search, Notes Area. */
export function HelpDocsPage(): ReactNode {
  const { t, lang } = useI18n();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin' || user?.role === 'dev';
  const [meta, setMeta] = useState<Meta | null>(null);
  const [doc, setDoc] = useState<HelpSection[]>([]);
  const [q, setQ] = useState('');
  const [drafts, setDrafts] = useState<Record<number, Draft>>({});
  const [adding, setAdding] = useState<{ kind: 'section' | 'header' | 'bullet'; parentId: number } | null>(null);
  const [newDraft, setNewDraft] = useState<Draft>({ en: '', ar: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const refs = useRef<Record<number, HTMLElement | null>>({});

  // ---- Notes (unchanged from ticket 072) ----
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState<HelpNote[]>([]);
  const [noteText, setNoteText] = useState('');

  const loadNotes = useCallback(async (): Promise<void> => {
    setError('');
    try {
      const res = await api<{ items: HelpNote[] }>(`/api/help/notes?date=${encodeURIComponent(date)}`);
      setNotes(res.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [date]);

  const loadDoc = useCallback(async (): Promise<void> => {
    try {
      const res = await api<{ sections: HelpSection[] }>('/api/help/docs');
      setDoc(res.sections);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    api<Meta>('/api/meta').then(setMeta).catch(() => undefined);
    void loadDoc();
  }, [loadDoc]);

  useEffect(() => {
    void loadNotes();
  }, [loadNotes]);

  const addNote = async (): Promise<void> => {
    const note = noteText.trim();
    if (!note) return;
    setBusy(true);
    setError('');
    try {
      await api('/api/help/notes', { method: 'POST', body: { noteDate: date, note } });
      sound.success();
      setNoteText('');
      void loadNotes();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      sound.error();
    } finally {
      setBusy(false);
    }
  };

  const deleteNote = async (id: number): Promise<void> => {
    setError('');
    try {
      await api(`/api/help/notes/${id}`, { method: 'DELETE' });
      sound.success();
      void loadNotes();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      sound.error();
    }
  };

  // ---- Editable doc (ticket 093) ----
  const saveItem = async (id: number): Promise<void> => {
    const d = drafts[id];
    if (!d) return;
    setBusy(true);
    setError('');
    try {
      await api(`/api/help/docs/${id}`, { method: 'PATCH', body: d });
      sound.success();
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      void loadDoc();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      sound.error();
    } finally {
      setBusy(false);
    }
  };

  const deleteItem = async (id: number): Promise<void> => {
    setError('');
    try {
      await api(`/api/help/docs/${id}`, { method: 'DELETE' });
      sound.success();
      void loadDoc();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      sound.error();
    }
  };

  const addItem = async (): Promise<void> => {
    if (!adding || (!newDraft.en && !newDraft.ar)) return;
    setBusy(true);
    setError('');
    try {
      await api('/api/help/docs', {
        method: 'POST',
        body: { kind: adding.kind, parentId: adding.parentId, ...newDraft },
      });
      sound.success();
      setAdding(null);
      setNewDraft({ en: '', ar: '' });
      void loadDoc();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      sound.error();
    } finally {
      setBusy(false);
    }
  };

  // ---- Search (ticket 093) ----
  const ql = q.trim().toLowerCase();
  const matches = useMemo(() => {
    if (!ql) return new Set<number>();
    const set = new Set<number>();
    const hit = (id: number, en: string, ar: string): void => {
      if (en.toLowerCase().includes(ql) || ar.toLowerCase().includes(ql)) set.add(id);
    };
    for (const s of doc) {
      hit(s.id, s.en, s.ar);
      for (const h of s.headers) {
        hit(h.id, h.en, h.ar);
        for (const b of h.bullets) hit(b.id, b.en, b.ar);
      }
    }
    return set;
  }, [doc, ql]);

  const jump = (id: number): void => {
    refs.current[id]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  /** Highlight search matches in a text. */
  const hl = (text: string): ReactNode => {
    if (!ql) return text;
    const idx = text.toLowerCase().indexOf(ql);
    if (idx < 0) return text;
    return (
      <>
        {text.slice(0, idx)}
        <mark className="rounded bg-amber-300/60 px-0.5 text-foreground">{text.slice(idx, idx + ql.length)}</mark>
        {text.slice(idx + ql.length)}
      </>
    );
  };

  const text = (en: string, ar: string): string => (lang === 'ar' && ar ? ar : en);

  // Card view module — each card is directly editable/deletable (no top Edit toggle)
  const editControls = (id: number): ReactNode =>
    isAdmin && (
      <span className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          onClick={() => setDrafts((prev) => (prev[id] ? (() => { const n = { ...prev }; delete n[id]; return n; })() : { ...prev, [id]: { en: '', ar: '' } }))}
          className="rounded-md border border-border bg-card p-1.5 text-muted-foreground shadow-sm transition-all hover:-translate-y-0.5 hover:border-accent/30 hover:text-foreground hover:shadow-md active:scale-95"
          title={t('help.editMode')}
        >
          <Pencil className="size-3.5" />
        </button>
        <button
          type="button"
          onClick={() => void deleteItem(id)}
          className="rounded-md border border-border bg-card p-1.5 text-muted-foreground shadow-sm transition-all hover:-translate-y-0.5 hover:border-destructive/30 hover:bg-destructive/10 hover:text-destructive active:scale-95"
          title={t('records.delete')}
        >
          <Trash2 className="size-3.5" />
        </button>
      </span>
    );

  // Card view module for editing — appears as a warm card, not a plain border
  const draftInputs = (id: number, kind: string): ReactNode => {
    const d = drafts[id] ?? { en: '', ar: '' };
    return (
      <div className="flex flex-col gap-2 rounded-xl border border-accent/30 bg-card p-3 shadow-md">
        <div className="text-[11px] font-bold uppercase tracking-wide text-accent">{kind} — card view</div>
        <Input
          value={d.en}
          placeholder="English"
          onChange={(e) => setDrafts((prev) => ({ ...prev, [id]: { ...(prev[id] ?? { en: '', ar: '' }), en: e.target.value } }))}
        />
        <Input
          value={d.ar}
          placeholder="العربية"
          onChange={(e) => setDrafts((prev) => ({ ...prev, [id]: { ...(prev[id] ?? { en: '', ar: '' }), ar: e.target.value } }))}
        />
        <div className="flex gap-1.5">
          <Button size="sm" onClick={() => void saveItem(id)} disabled={busy} className="gap-1.5">
            <Pencil className="size-3.5" />
            {t('help.save')}
          </Button>
          <Button size="sm" variant="outline" onClick={() => setDrafts((prev) => { const n = { ...prev }; delete n[id]; return n; })}>
            <X className="size-3.5" />
          </Button>
        </div>
      </div>
    );
  };

  const addControls = (kind: 'section' | 'header' | 'bullet', parentId: number, label: string): ReactNode =>
    isAdmin && (
      <Button size="sm" variant="outline" className="gap-1 border-dashed hover:border-accent/40 hover:bg-accent/10 hover:text-accent" onClick={() => { setAdding({ kind, parentId }); setNewDraft({ en: '', ar: '' }); }}>
        <Plus className="size-3.5" />
        {label}
      </Button>
    );

  const addForm = (): ReactNode =>
    adding && (
      <div className="flex flex-col gap-1.5 rounded-lg border border-primary/30 bg-primary/5 p-2">
        <Input value={newDraft.en} placeholder="English" onChange={(e) => setNewDraft((p) => ({ ...p, en: e.target.value }))} />
        <Input value={newDraft.ar} placeholder="العربية" onChange={(e) => setNewDraft((p) => ({ ...p, ar: e.target.value }))} />
        <div className="flex gap-1.5">
          <Button size="sm" onClick={() => void addItem()} disabled={busy || (!newDraft.en && !newDraft.ar)}>
            {t('help.save')}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setAdding(null)}>
            <X className="size-3.5" />
          </Button>
        </div>
      </div>
    );

  const cycles = meta?.cycles ?? [];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">{t('help.title')}</h1>
          <p className="text-sm text-muted-foreground">{t('help.subtitle')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Search module (ticket 093) */}
          <div className="relative">
            <Search className="absolute start-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              placeholder={t('help.search')}
              onChange={(e) => setQ(e.target.value)}
              className="w-56 ps-8"
            />
          </div>
        </div>
      </div>

      {error && <div className="text-sm text-destructive">{error}</div>}

      {/* Editable Help document (ticket 093) */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent text-white shadow-md">
            <BookOpen className="size-3.5" />
          </span>
          <h2 className="text-sm font-bold uppercase tracking-wider text-foreground">{t('help.guideTitle')}</h2>
          <span className="h-px flex-1 from-accent/10 to-transparent" />
        </div>

        {ql && matches.size === 0 && (
          <div className="rounded-xl border border-border/70 bg-muted/30 p-4 text-center text-sm text-muted-foreground">
            {t('help.noResults')}
          </div>
        )}

        {ql && matches.size > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {doc.flatMap((s) => [
              { id: s.id, label: text(s.en, s.ar), kind: 'section' },
              ...s.headers.flatMap((h) => [
                { id: h.id, label: text(h.en, h.ar), kind: 'header' },
                ...h.bullets.map((b) => ({ id: b.id, label: text(b.en, b.ar), kind: 'bullet' })),
              ]),
            ])
              .filter((x) => matches.has(x.id))
              .slice(0, 12)
              .map((x) => (
                <button
                  key={x.id}
                  type="button"
                  onClick={() => jump(x.id)}
                  className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-primary/30 bg-primary/5 px-3 py-1 text-xs text-primary transition-colors hover:bg-primary/10"
                >
                  <span className="truncate">{x.label}</span>
                  <span className="shrink-0 rounded bg-primary/15 px-1 text-[9px] font-bold uppercase">{x.kind}</span>
                </button>
              ))}
          </div>
        )}

        <div className="flex flex-col gap-4">
          {doc.map((s) => (
            <div
              key={s.id}
              ref={(el) => { refs.current[s.id] = el; }}
              className={`glass-card flex flex-col gap-3 rounded-2xl p-5 ${matches.size > 0 && !matches.has(s.id) ? 'opacity-40' : ''}`}
            >
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-lg font-bold text-foreground">{hl(text(s.en, s.ar))}</h3>
                {editControls(s.id)}
              </div>
              {drafts[s.id] && draftInputs(s.id, 'section')}

              <div className="flex flex-col gap-3">
                {s.headers.map((h) => (
                  <div
                    key={h.id}
                    ref={(el) => { refs.current[h.id] = el; }}
                    className={`flex flex-col gap-1.5 ${matches.size > 0 && !matches.has(h.id) ? 'opacity-40' : ''}`}
                  >
                    <div className="flex items-center justify-between gap-2 border-b border-border/50 pb-1">
                      <h4 className="text-sm font-semibold text-foreground">{hl(text(h.en, h.ar))}</h4>
                      {editControls(h.id)}
                    </div>
                    {drafts[h.id] && draftInputs(h.id, 'header')}

                    <ul className="flex flex-col gap-1">
                      {h.bullets.map((b) => (
                        <li
                          key={b.id}
                          ref={(el) => { refs.current[b.id] = el; }}
                          className={`flex flex-col gap-1 ${matches.size > 0 && !matches.has(b.id) ? 'opacity-40' : ''}`}
                        >
                          <span className="flex items-start justify-between gap-2 text-sm text-muted-foreground">
                            <span className="min-w-0">
                              <span className="me-1.5 text-primary">•</span>
                              {hl(text(b.en, b.ar))}
                            </span>
                            {editControls(b.id)}
                          </span>
                          {drafts[b.id] && draftInputs(b.id, 'bullet')}
                        </li>
                      ))}
                    </ul>
                    {adding?.kind === 'bullet' && adding.parentId === h.id && addForm()}
                    {addControls('bullet', h.id, t('help.addBullet'))}
                  </div>
                ))}
                {adding?.kind === 'header' && adding.parentId === s.id && addForm()}
                {addControls('header', s.id, t('help.addHeader'))}
              </div>
            </div>
          ))}
          {adding?.kind === 'section' && addForm()}
          {addControls('section', 0, t('help.addSection'))}
        </div>
      </div>

      {/* Request Cycles — server-authoritative (ticket 071/072) */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent text-white shadow-md">
            <Workflow className="size-3.5" />
          </span>
          <h2 className="text-sm font-bold uppercase tracking-wider text-foreground">{t('checklist.cycles')}</h2>
          <span className="h-px flex-1 from-accent/10 to-transparent" />
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {cycles.map((c) => (
            <div key={c.category} className="glass-card flex flex-col gap-2 rounded-2xl p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-foreground">
                  {c.category} — {lang === 'ar' ? c.nameAr : c.name}
                </span>
              </div>
              <div className="flex flex-col gap-1">
                {c.steps.map((step, i) => (
                  <div key={step.name} className="flex items-center gap-2 text-xs">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[10px] font-bold text-primary">
                      {i + 1}
                    </span>
                    <span className="font-medium text-foreground">{lang === 'ar' ? step.nameAr : step.name}</span>
                    <span className="truncate text-muted-foreground">{step.hint}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Notes Area — users keep notes by date about the program */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-success text-white shadow-md">
            <StickyNote className="size-3.5" />
          </span>
          <h2 className="text-sm font-bold uppercase tracking-wider text-foreground">{t('help.notesTitle')}</h2>
          <span className="h-px flex-1 from-success/10 to-transparent" />
        </div>

        <Card>
          <CardContent className="flex flex-col gap-3 p-4">
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <Label>{t('checklist.date')}</Label>
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-44" />
              </div>
            </div>

            <div className="flex gap-2">
              <Input
                value={noteText}
                placeholder={t('help.notePlaceholder')}
                onChange={(e) => setNoteText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void addNote();
                }}
              />
              <Button onClick={() => void addNote()} disabled={busy || !noteText.trim()} className="gap-1.5">
                {busy ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
                {t('help.addNote')}
              </Button>
            </div>

            {notes.length === 0 ? (
              <div className="py-4 text-center text-sm text-muted-foreground">{t('help.noNotes')}</div>
            ) : (
              <div className="flex flex-col gap-2">
                {notes.map((n) => (
                  <div key={n.id} className="flex items-start gap-2 rounded-lg border border-border/60 bg-card p-3">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm text-foreground">{n.note}</div>
                      <div className="mt-0.5 text-[11px] text-muted-foreground">
                        {n.createdBy} · {new Date(n.createdAt).toLocaleString()}
                      </div>
                    </div>
                    {(n.createdBy === user?.username || isAdmin) && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="shrink-0 text-destructive"
                        onClick={() => void deleteNote(n.id)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}