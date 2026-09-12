import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { useAuth } from '@/lib/auth';
import { sound } from '@/lib/sound';
import type { Category, DcRecord, Meta, RecordsResponse } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { padRequestNo, padRevisionNo, floorDisplay, zoneDisplay } from '@/lib/format';
import { MultiChipSelect } from '@/components/MultiChipSelect';
import { AttachmentEngine, type AttachmentPage } from '@/components/AttachmentEngine';
import { FullPdfDialog } from '@/components/FullPdfDialog';
import { StatusChoiceModal } from '@/components/StatusChoiceModal';
import { PrintPromptPopup } from '@/components/PrintPromptPopup';
import { ScScheduler } from '@/components/ScScheduler';
import { ScNotifyPopup } from '@/components/ScNotifyPopup';
import { SuperEditDialog } from '@/components/SuperEditDialog';
import { FylerTab } from '@/components/FylerTab';
import * as pdfjsLib from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { AppIcon } from '@/icons/AppIcon';
import { Paperclip } from 'lucide-react';
import { ChevronRight, Plus, Trash2 } from 'lucide-react';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

/** Modular: which categories have a document table is DB-driven (has_table) — no hardcoding. */

interface DocRow {
  no: number;
  doc: string;
  description: string;
  version: string;
  code: string;
}

interface NextInfo {
  requestNo: string;
  revisionNo: string;
  held: Array<{
    id: number;
    requestNo: string;
    revisionNo: string;
    parentId?: number | null;
    parentHyperlink?: string;
  }>;
}

const EMPTY_VALUES = {
  zone: '',
  floor: '',
  engineer: '',
  description: '',
  sentDate: '',
};

/** Smart record creation (ticket 034) — step wizard (ticket 091) + request
 *  making module (ticket 112): two tabs (Search / Fyler), live fyler, temp
 *  save, P/SC status choice, printing popup, SC scheduling via notify. */
export function RecordFormPage(): ReactNode {
  const { t, lang } = useI18n();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const reviseFromId = searchParams.get('reviseFrom');
  const [meta, setMeta] = useState<Meta | null>(null);
  const [requestMembers, setrequestMembers] = useState<Array<{ name: string; role: string; executive?: boolean; star?: string }>>([]);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [category, setCategory] = useState('');
  const [fork, setFork] = useState('');
  const [mode, setMode] = useState<'fresh' | 'pp'>('fresh');
  const [next, setNext] = useState<NextInfo | null>(null);
  const [heldId, setHeldId] = useState<number | null>(null);
  const [values, setValues] = useState(EMPTY_VALUES);
  const [documents, setDocuments] = useState<DocRow[]>([]);
  const [attachmentsOpen, setAttachmentsOpen] = useState(false);
  const [attachments, setAttachments] = useState<AttachmentPage[]>([]);
  const [fullPdfOpen, setFullPdfOpen] = useState(false);
  const [fylerUrl, setFylerUrl] = useState('');
  const [ncrList, setNcrList] = useState<Array<{ id: number; requestNo: string; status: string }>>([]);
  const [ncrId, setNcrId] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [fylerBusy, setFylerBusy] = useState(false);
  const [fylerErr, setFylerErr] = useState('');
  // ticket 112 — tabs + status/printing/scheduling/super-edit flow
  const [activeTab, setActiveTab] = useState<'search' | 'fyler'>('search');
  const [showStatusChoice, setShowStatusChoice] = useState(false);
  const [showPrintPrompt, setShowPrintPrompt] = useState(false);
  const [showScScheduler, setShowScScheduler] = useState(false);
  const [showScNotify, setShowScNotify] = useState(false);
  const [scNotifyId, setScNotifyId] = useState<number | null>(null);
  const [superEditOpen, setSuperEditOpen] = useState(false);
  const [createdId, setCreatedId] = useState<number | null>(null);
  const [savedLabel, setSavedLabel] = useState('');

  useEffect(() => {
    api<Meta>('/api/meta').then(setMeta).catch(() => undefined);
    api<Array<{ name: string; role: string }>>('/api/ref/members?scope=request')
      .then(setrequestMembers)
      .catch(() => undefined);
  }, []);

  const categoryDef: Category | undefined = useMemo(
    () => meta?.categories.find((c) => c.code === category),
    [meta, category],
  );
  const forks = categoryDef?.forks ?? [];

  const loadNext = useCallback(async (cat: string, fk: string): Promise<void> => {
    if (!cat) {
      setNext(null);
      return;
    }
    try {
      const params = new URLSearchParams({ category: cat });
      if (fk) params.set('fork', fk);
      const res = await api<NextInfo>(`/api/records/next?${params.toString()}`);
      setNext(res);
      setHeldId(null);
      setMode('fresh');
    } catch {
      setNext(null);
    }
  }, []);

  useEffect(() => {
    void loadNext(category, fork);
  }, [category, fork, loadNext]);

  // NCR: the "new record" is a reply to an existing NCR (ticket 070).
  useEffect(() => {
    if (categoryDef?.kind !== 'ncr') return;
    api<RecordsResponse>(`/api/records?category=${encodeURIComponent(category)}&limit=100`)
      .then((r) => {
        setNcrList(r.items.map((x) => ({ id: x.id, requestNo: x.requestNo, status: x.status })));
        setNcrId(null);
      })
      .catch(() => setNcrList([]));
  }, [category]);

  const changeCategory = (code: string): void => {
    setCategory(code);
    setFork('');
    setValues(EMPTY_VALUES);
    setDocuments([]);
    setAttachments(loadTemp(code));
    setActiveTab('search');
    setCreatedId(null);
    setSavedLabel('');
    const cat = meta?.categories.find((c) => c.code === code);
    setStep((cat?.forks?.length ?? 0) > 0 ? 2 : 3);
  };

  const changeFork = (fk: string): void => {
    setFork(fk);
    setStep(3);
  };

  const goBack = (): void => {
    setStep((s) => {
      if (s === 3) return forks.length > 0 ? 2 : 1;
      return 1;
    });
  };

  const held = next?.held ?? [];
  const selectedHeld = held.find((h) => h.id === heldId) ?? null;
  const selectedNcr = ncrList.find((n) => n.id === ncrId) ?? null;
  const isNcr = categoryDef?.kind === 'ncr';
  const requestNo =
    isNcr
      ? (selectedNcr?.requestNo ?? '')
      : mode === 'pp' && selectedHeld
        ? selectedHeld.requestNo
        : (next?.requestNo ?? '');
  const revisionNo = isNcr ? '00' : mode === 'pp' && selectedHeld ? selectedHeld.revisionNo : '00';
  // PP default attachment: the old (parent) request's PDF (ticket 067).
  const ppDefaultSource =
    mode === 'pp' && selectedHeld?.parentId && selectedHeld.parentHyperlink
      ? { recordId: selectedHeld.parentId, label: padRequestNo(selectedHeld.requestNo) }
      : null;

  // PP helper — when a held PP is selected, copy old metadata; only description+sentDate remain editable
  const isPP = mode === 'pp' && !!selectedHeld;
  useEffect(() => {
    if (!isPP || !selectedHeld) return;
    void api<{ zone: string; floor: string; engineer: string; fork: string; sentDate: string; description: string }>(`/api/records/${selectedHeld.id}`)
      .then((r) => {
        const rec = r as unknown as { zone: string; floor: string; engineer: string; fork: string; sentDate: string; description: string };
        setValues({
          zone: rec.zone ?? '',
          floor: rec.floor ?? '',
          engineer: rec.engineer ?? '',
          description: rec.description ?? '',
          sentDate: rec.sentDate ?? '',
        });
        if (rec.fork && rec.fork !== fork) setFork(rec.fork);
      })
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPP, selectedHeld?.id]);

  // Modular revise — Get Approved with A opens creation with old metadata (reviseFrom)
  useEffect(() => {
    if (!reviseFromId || !meta) return;
    void api<DcRecord>(`/api/records/${reviseFromId}`)
      .then((rec) => {
        // Set category/fork from the source record, then jump to step 3
        setCategory(rec.category);
        setFork(rec.fork ?? '');
        setStep(3);
        // Pre-fill values from that record — user edits as needed for the new revision
        setValues({
          zone: rec.zone ?? '',
          floor: rec.floor ?? '',
          engineer: rec.engineer ?? '',
          description: rec.description ?? '',
          sentDate: rec.sentDate ?? new Date().toISOString().slice(0, 10),
        });
        setAttachments(loadTemp(rec.category));
        // Load next numbers for that category/fork so requestNo updates
        void loadNext(rec.category, rec.fork ?? '');
      })
      .catch(() => undefined);
  }, [reviseFromId, meta, loadNext]);

  const setValue = (key: keyof typeof EMPTY_VALUES, value: string): void => {
    setValues((prev) => ({ ...prev, [key]: value }));
  };

  const addDoc = (): void => {
    setDocuments((prev) => [
      ...prev,
      { no: prev.length + 1, doc: '', description: '', version: revisionNo, code: '' },
    ]);
  };
  const setDoc = (idx: number, key: keyof DocRow, value: string): void => {
    setDocuments((prev) => prev.map((d, i) => (i === idx ? { ...d, [key]: value } : d)));
  };
  const removeDoc = (idx: number): void => {
    setDocuments((prev) => prev.filter((_, i) => i !== idx).map((d, i) => ({ ...d, no: i + 1 })));
  };

  // ---- Temp save (potato PCs, ticket 112) — lightweight references only,
  // no full PDFs in memory. Survives tab switches, Edit, and form re-open.
  const tempKey = (cat: string): string => `odv_temp_attachments_${cat || 'none'}`;
  const loadTemp = (cat: string): AttachmentPage[] => {
    try {
      const raw = localStorage.getItem(tempKey(cat));
      if (!raw) return [];
      const arr = JSON.parse(raw) as AttachmentPage[];
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  };
  const persistTemp = useCallback((pages: AttachmentPage[]): void => {
    try {
      const light = pages.map(({ thumb: _thumb, ...rest }) => rest);
      localStorage.setItem(tempKey(category), JSON.stringify(light));
    } catch {
      // storage unavailable — temp save just won't persist across re-opens
    }
  }, [category]);

  const handleAttachmentsChange = useCallback((pages: AttachmentPage[]): void => {
    setAttachments(pages);
    persistTemp(pages);
  }, [persistTemp]);

  // Drop PDFs onto the fyler section (ticket 112) — same thumb logic as the engine.
  const onDropFiles = async (files: FileList): Promise<void> => {
    const next = [...attachments];
    for (const file of Array.from(files)) {
      const id = `upload-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
      let thumb: string | undefined;
      if (isPdf) {
        try {
          const d = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
          const page = await d.getPage(1);
          const viewport = page.getViewport({ scale: 0.3 });
          const canvas = document.createElement('canvas');
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            await page.render({ canvasContext: ctx, viewport }).promise;
            thumb = canvas.toDataURL('image/jpeg', 0.7);
          }
        } catch {
          thumb = undefined;
        }
      } else {
        thumb = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.readAsDataURL(file);
        });
      }
      next.push({ id, source: file.name, page: 1, size: 'A4', rotation: 0, thumb });
    }
    handleAttachmentsChange(next);
  };

  // ---- Fyler (ticket 112): generate the real request PDF via SUPER-SILENT
  // Excel COM. `generateFyler(true)` opens the popup; the live effect calls it
  // debounced as the metadata is filled.
  const generateFyler = async (openAfter: boolean): Promise<void> => {
    if (!category || !requestNo) return;
    setFylerBusy(true);
    setFylerErr('');
    try {
      const res = await api<{ ok: boolean; pdf: string }>('/api/fyler', {
        method: 'POST',
        body: {
          category,
          fork,
          requestNo,
          revisionNo,
          description: values.description,
          sentDate: values.sentDate,
          zone: values.zone,
          floor: values.floor,
          status: 'P',
          documents,
        },
      });
      setFylerUrl(`/api/fyler/view?path=${encodeURIComponent(res.pdf)}`);
      if (openAfter) setFullPdfOpen(true);
    } catch (err) {
      setFylerErr(err instanceof Error ? err.message : String(err));
    } finally {
      setFylerBusy(false);
    }
  };

  // Live fyler (preferred): debounced generation when the metadata is filled.
  useEffect(() => {
    if (!category || !requestNo || !values.description.trim()) return;
    if (isPP) return; // PP mode shows "Get Approval" instead of the fyler
    const timer = setTimeout(() => void generateFyler(false), 1200);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, fork, requestNo, revisionNo, values.description, values.zone, values.floor, values.sentDate, values.engineer, documents, isPP]);

  // ---- Save & proceed (ticket 112): NCR replies commit directly; everything
  // else requires the P/SC status choice before the save completes.
  const commit = async (choice: 'P' | 'SC'): Promise<void> => {
    setShowStatusChoice(false);
    setBusy(true);
    setError('');
    try {
      let id: number | null = null;
      if (mode === 'pp' && selectedHeld) {
        const res = await api<DcRecord>(`/api/records/${selectedHeld.id}`, {
          method: 'PATCH',
          body: { ...values, documents, status: choice },
        });
        id = res.id;
      } else {
        const res = await api<DcRecord>('/api/records', {
          method: 'POST',
          body: { category, requestNo, revisionNo, fork, ...values, documents, status: choice },
        });
        id = res.id;
      }
      setCreatedId(id);
      setSavedLabel(choice);
      sound.success();
      if (choice === 'P') setShowPrintPrompt(true);
      else setShowScScheduler(true);
    } catch (err) {
      sound.error();
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const save = async (): Promise<void> => {
    if (isNcr && selectedNcr) {
      // The NCR "new record" is a reply — a revision named 00 on the existing NCR.
      setBusy(true);
      setError('');
      try {
        await api(`/api/records/${selectedNcr.id}/revision`, { method: 'POST' });
        navigate('/requests');
        sound.success();
      } catch (err) {
        sound.error();
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setBusy(false);
      }
      return;
    }
    // All other categories: P/SC modal is required before the save completes.
    setShowStatusChoice(true);
  };

  // ---- SC notify popup (ticket 112): poll for due SC self-notifications while
  // the form is open, then offer Print or Delegate.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const check = async (): Promise<void> => {
      try {
        const res = await api<{ items: Array<{ id: number; notifyDate: string; target: string; status: string }> }>('/api/notify?scope=mine');
        const now = Date.now();
        const due = res.items.find((n) => {
          if (n.status !== 'active') return false;
          if (!n.notifyDate || !n.notifyDate.includes(' ')) return false;
          const ts = new Date(n.notifyDate.replace(' ', 'T')).getTime();
          return !Number.isNaN(ts) && ts <= now;
        });
        if (due && !cancelled) {
          setScNotifyId(due.id);
          setShowScNotify(true);
        }
      } catch {
        // poll failure — try again next tick
      }
    };
    void check();
    const id = setInterval(() => void check(), 30000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [user]);

  const markScNotified = async (id: number): Promise<void> => {
    try {
      await api(`/api/notify/${id}/notified`, { method: 'POST' });
    } catch {
      // ignore
    }
  };
  const scPrint = (): void => {
    if (scNotifyId != null) void markScNotified(scNotifyId);
    setShowScNotify(false);
    setShowPrintPrompt(true);
  };
  const scDelegate = (): void => {
    if (scNotifyId != null) void markScNotified(scNotifyId);
    setShowScNotify(false);
    setShowScScheduler(true);
  };

  // ---- Super edit ^ (admin only, ticket 112): batch-edit metadata for all
  // revisions of this request no.
  const superEditRecordId = createdId ?? (reviseFromId ? Number(reviseFromId) : null) ?? (mode === 'pp' && selectedHeld ? selectedHeld.id : null);
  const canSuperEdit = (user?.role === 'admin' || user?.role === 'dev') && superEditRecordId != null;

  const inputCls =
    'h-9 w-full rounded-md border border-border bg-card px-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

  const tabBtn = (tab: 'search' | 'fyler'): string =>
    `flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
      activeTab === tab ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
    }`;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-foreground">{t('records.new')}</h1>
      </div>

      {/* Step indicator (ticket 091) */}
      <div className="flex items-center gap-2">
        {[
          { n: 1, label: t('form.wizardCategory'), done: step > 1 || (step === 1 && category !== '') },
          { n: 2, label: t('form.wizardFork'), show: forks.length > 0, done: step > 2 },
          { n: 3, label: t('form.wizardCreate'), done: false },
        ]
          .filter((s) => s.show !== false)
          .map((s, i) => (
            <div key={s.n} className="flex items-center gap-2">
              {i > 0 && <span className="h-px w-6 bg-border/70" aria-hidden="true" />}
              <span
                className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                  step === s.n
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : s.done
                      ? 'bg-primary/10 text-primary'
                      : 'bg-muted text-muted-foreground'
                }`}
              >
                <span className="flex h-4 w-4 items-center justify-center rounded-full bg-white/20 text-[10px]">
                  {s.done ? '✓' : s.n}
                </span>
                {s.label}
              </span>
            </div>
          ))}
      </div>

      {/* Step 1 — Category (visual cards) */}
      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle>{t('form.wizardCategory')}</CardTitle>
            <p className="text-xs text-muted-foreground">{t('form.pickCategory')}</p>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {meta?.categories
                .filter((c) => c.kind !== 'order_log') // modular: order_log categories are log-only, not creatable here
                .map((c) => (
                  <button
                    key={c.code}
                    type="button"
                    onClick={() => changeCategory(c.code)}
                    className={`glass-card flex flex-col gap-1.5 rounded-2xl p-4 text-start transition-all hover:-translate-y-0.5 active:scale-[0.98] ${
                      category === c.code ? 'ring-2 ring-primary/50 shadow-[0_8px_40px_-8px_rgba(99,102,241,0.5)]' : ''
                    }`}
                  >
                    <span className="font-mono text-xl font-bold tracking-wide text-foreground">{c.code}</span>
                    <span className="text-sm font-medium text-foreground">{c.name}</span>
                    <span className="truncate text-[11px] text-muted-foreground">{c.description}</span>
                  </button>
                ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 2 — Fork (only when the category has forks) */}
      {step === 2 && (
        <Card>
          <CardHeader>
            <CardTitle>{t('form.wizardFork')}</CardTitle>
            <p className="text-xs text-muted-foreground">{t('form.pickFork')}</p>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {forks.map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => changeFork(f)}
                  className={`glass-card flex items-center justify-between rounded-2xl p-4 text-start transition-all hover:-translate-y-0.5 active:scale-[0.98] ${
                    fork === f ? 'ring-2 ring-primary/50 shadow-[0_8px_40px_-8px_rgba(99,102,241,0.5)]' : ''
                  }`}
                >
                  <span className="font-mono text-lg font-bold tracking-wide text-foreground">{f}</span>
                  <ChevronRight className="size-4 text-primary rtl:rotate-180" />
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={goBack}>
                {t('form.back')}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 3 — Creation module */}
      {step === 3 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {t('form.wizardCreate')}
              <span className="rounded-full bg-primary/10 px-2 py-0.5 font-mono text-xs font-medium text-primary">
                {category}
                {fork ? `-${fork}` : ''}
              </span>
              {canSuperEdit && (
                <button
                  type="button"
                  onClick={() => setSuperEditOpen(true)}
                  title={t('form.superEdit')}
                  className="ms-auto inline-flex h-6 w-6 items-center justify-center rounded-md border border-border/70 bg-muted/30 text-sm font-bold text-accent transition-colors hover:bg-accent/10"
                >
                  ^
                </button>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={goBack}>
                {t('form.back')}
              </Button>
            </div>

            {category && (
              <>
              {isNcr ? (
                /* NCR lifecycle (ticket 070): pick an existing NCR → the reply is revision 00. */
                <div className="flex flex-col gap-2 border-t border-border/60 pt-4">
                  <Label>{t('form.ncrReplyTo')}</Label>
                  <Select value={String(ncrId ?? '')} onChange={(e) => setNcrId(Number(e.target.value))}>
                    <option value="">—</option>
                    {ncrList.map((n) => (
                      <option key={n.id} value={String(n.id)}>
                        {padRequestNo(n.requestNo)} — {n.status}
                      </option>
                    ))}
                  </Select>
                  <span className="text-xs text-muted-foreground">{t('form.ncrHint')}</span>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-2 border-t border-border/60 pt-4">
                  <Button
                    size="sm"
                    variant={mode === 'fresh' ? 'default' : 'outline'}
                    onClick={() => setMode('fresh')}
                  >
                    {t('form.modeFresh')}
                  </Button>
                  <Button
                    size="sm"
                    variant={mode === 'pp' ? 'default' : 'outline'}
                    disabled={held.length === 0}
                    onClick={() => setMode('pp')}
                  >
                    {t('form.modePP')}
                  </Button>
                  {mode === 'pp' && held.length === 0 && (
                    <span className="text-xs text-muted-foreground">{t('form.noHeldPP')}</span>
                  )}
                </div>
              )}

              {mode === 'pp' && held.length > 0 && (
                <div>
                  <Label>{t('form.heldPP')}</Label>
                  <Select
                    value={String(heldId ?? '')}
                    onChange={(e) => setHeldId(Number(e.target.value))}
                  >
                    <option value="">—</option>
                    {held.map((h) => (
                      <option key={h.id} value={String(h.id)}>
                        {padRequestNo(h.requestNo)} — {t('details.revision')} {padRevisionNo(h.revisionNo)}
                      </option>
                    ))}
                  </Select>
                </div>
              )}

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label>{t('field.requestNo')}</Label>
                  <div className="flex h-9 items-center rounded-md border border-dashed border-border bg-muted/30 px-2 font-mono text-sm font-bold text-foreground">
                    {padRequestNo(requestNo) || '—'}
                  </div>
                </div>
                <div>
                  <Label>{t('field.revisionNo')}</Label>
                  <div className="flex h-9 items-center rounded-md border border-dashed border-border bg-muted/30 px-2 font-mono text-sm font-bold text-foreground">
                    {padRevisionNo(revisionNo) || '—'}
                  </div>
                </div>
              </div>

              {isPP && (
                <div className="rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
                  {t('form.heldPP')}: {padRequestNo(selectedHeld!.requestNo)} rev {padRevisionNo(selectedHeld!.revisionNo)} — {lang === 'ar' ? 'يتم نسخ البيانات القديمة، فقط الوصف وتاريخ الإرسال قابلان للتغيير' : 'Old metadata is copied — only description and sent date are changeable.'}
                </div>
              )}
              <div className="grid gap-4 border-t border-border/60 pt-4 sm:grid-cols-2">
                <div className={isPP ? 'pointer-events-none opacity-60' : ''}>
                  <Label>{t('field.zone')}</Label>
                  <MultiChipSelect
                    listBox
                    options={(meta?.zones ?? []).map((z) => ({ value: z.code, label: `${z.code} — ${zoneDisplay(z, lang)}` }))}
                    value={values.zone}
                    onChange={(v) => !isPP && setValue('zone', v)}
                  />
                  {isPP && <span className="text-[11px] text-muted-foreground">{t('field.optional')} — {lang === 'ar' ? 'مقفل' : 'locked'}</span>}
                </div>
                <div className={isPP ? 'pointer-events-none opacity-60' : ''}>
                  <Label>{t('field.floor')}</Label>
                  <MultiChipSelect
                    listBox
                    options={(meta?.floors ?? []).map((f) => ({ value: f, label: floorDisplay(f, lang, meta?.floorNamesAr) }))}
                    value={values.floor}
                    onChange={(v) => !isPP && setValue('floor', v)}
                  />
                  {isPP && <span className="text-[11px] text-muted-foreground">{t('field.optional')} — {lang === 'ar' ? 'مقفل' : 'locked'}</span>}
                </div>
                <div>
                  <Label>{t('field.member')}</Label>
                  <Select value={values.engineer} onChange={(e) => !isPP && setValue('engineer', e.target.value)} disabled={isPP} className={isPP ? 'opacity-60' : ''}>
                    <option value="">{t('field.optional')}</option>
                    {requestMembers.map((e) => (
                      <option key={e.name} value={e.name}>
                        {e.name}
                        {/* ★ = executive-enabled (ticket 096) or star role */}
                        {e.star || e.executive ? ' ★' : ''}
                      </option>
                    ))}
                  </Select>
                  {isPP && <span className="text-[11px] text-muted-foreground">{lang === 'ar' ? 'مقفل' : 'locked'}</span>}
                </div>
                <div>
                  <Label>{t('field.sentDate')}</Label>
                  <Input type="date" value={values.sentDate} onChange={(e) => setValue('sentDate', e.target.value)} />
                  {isPP && <span className="text-[11px] text-success">{lang === 'ar' ? 'قابل للتغيير' : 'changeable'}</span>}
                </div>
                <div className="sm:col-span-2">
                  <Label>{t('field.description')}</Label>
                  <textarea
                    className={`${inputCls} min-h-[80px] py-2`}
                    value={values.description}
                    onChange={(e) => setValue('description', e.target.value)}
                    placeholder={isPP ? (lang === 'ar' ? 'غيّر الوصف فقط' : 'Change description only') : undefined}
                  />
                  {isPP && <span className="text-[11px] text-success">{lang === 'ar' ? 'قابل للتغيير' : 'changeable'}</span>}
                </div>
              </div>

              {(categoryDef?.hasTable ?? false) && (
                <div className="flex flex-col gap-2 border-t border-border/60 pt-4">
                  <div className="flex items-center justify-between">
                    <Label>{t('form.documents')}</Label>
                    <Button size="sm" variant="outline" className="gap-1" onClick={addDoc} disabled={documents.length >= 7}>
                      <Plus className="size-3.5" />
                      {t('form.addRow')}
                    </Button>
                  </div>
                  {documents.length === 0 && (
                    <div className="text-xs text-muted-foreground">{t('form.noDocuments')}</div>
                  )}
                  {documents.map((d, idx) => (
                    <div
                      key={idx}
                      className="grid grid-cols-2 items-center gap-2 rounded-lg border border-border/60 bg-card p-2 sm:grid-cols-[2rem_1fr_1.5fr_4rem_3rem_2rem] sm:border-0 sm:bg-transparent sm:p-0"
                    >
                      <span className="text-center text-sm font-bold text-muted-foreground">{d.no}</span>
                      <Input value={d.doc} placeholder={t('form.docName')} onChange={(e) => setDoc(idx, 'doc', e.target.value)} />
                      <Input className="col-span-2 sm:col-span-1" value={d.description} placeholder={t('form.docDescription')} onChange={(e) => setDoc(idx, 'description', e.target.value)} />
                      <Input value={d.version} placeholder={t('form.docVersion')} onChange={(e) => setDoc(idx, 'version', e.target.value)} />
                      <Input value={d.code} placeholder={t('form.docCode')} onChange={(e) => setDoc(idx, 'code', e.target.value)} />
                      <Button size="icon" variant="ghost" className="text-destructive" onClick={() => removeDoc(idx)}>
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              {/* Two tabs (ticket 112): Tab 1 = Search (attachments), Tab 2 = Fyler */}
              <div className="flex gap-1 rounded-xl bg-muted/40 p-1">
                <button type="button" className={tabBtn('search')} onClick={() => setActiveTab('search')}>
                  <AppIcon name="search" className="size-3.5" />
                  {t('form.tabSearch')}
                </button>
                <button type="button" className={tabBtn('fyler')} onClick={() => setActiveTab('fyler')}>
                  <AppIcon name="file" className="size-3.5" />
                  {t('form.tabFyler')}
                </button>
              </div>

              {activeTab === 'search' ? (
                /* Search tab — attachments module entry + temp-saved selection */
                <div className="flex flex-col gap-2">
                  <Label>{t('attachments.title')}</Label>
                  <Button variant="outline" className="gap-1.5 self-start" onClick={() => setAttachmentsOpen(true)}>
                    <Paperclip className="size-4" />
                    {t('attachments.open')}
                  </Button>
                  {attachments.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {attachments.map((a) => (
                        <span
                          key={a.id}
                          className="max-w-[16rem] truncate rounded-md bg-primary/10 px-2 py-1 text-[11px] font-medium text-primary"
                          title={a.description}
                        >
                          {a.source} · {a.size}
                        </span>
                      ))}
                    </div>
                  )}
                  <span className="text-[11px] text-muted-foreground">{t('form.tempSaveHint')}</span>
                </div>
              ) : (
                /* Fyler tab — live fyler / Get Approval for PP */
                isPP ? (
                  <div className="flex flex-col gap-3 rounded-xl border border-border/70 bg-card p-4">
                    <Label className="text-sm font-semibold">{t('form.ppGetApproval')}</Label>
                    <p className="text-xs text-muted-foreground">{t('form.ppGetApprovalHint')}</p>
                    <Button
                      className="gap-1.5 self-start"
                      onClick={() => setShowStatusChoice(true)}
                      disabled={busy || !requestNo}
                    >
                      <AppIcon name="printer" className="size-4" />
                      {t('form.ppGetApproval')}
                    </Button>
                  </div>
                ) : (
                  <FylerTab
                    fylerUrl={fylerUrl}
                    busy={fylerBusy}
                    error={fylerErr}
                    attachmentsCount={attachments.length}
                    onRefresh={() => void generateFyler(false)}
                    onOpenFull={() => {
                      if (!fylerUrl) void generateFyler(true);
                      else setFullPdfOpen(true);
                    }}
                    onEdit={() => setActiveTab('search')}
                    onDropFiles={(files) => void onDropFiles(files)}
                  />
                )
              )}
              {savedLabel && (
                <div className="rounded-lg border border-success/30 bg-success/10 px-3 py-2 text-xs text-success">
                  {t('form.tempSave')}
                </div>
              )}
            </>
            )}
          </CardContent>
        </Card>
      )}

      <AttachmentEngine
        open={attachmentsOpen}
        onClose={() => setAttachmentsOpen(false)}
        defaultSource={ppDefaultSource}
        initialAttachments={attachments}
        onAttachmentsChange={handleAttachmentsChange}
      />

      <FullPdfDialog
        open={fullPdfOpen}
        onClose={() => setFullPdfOpen(false)}
        fylerUrl={fylerUrl}
        fylerRecordId={0}
        attachments={attachments}
      />

      {error && <div className="text-sm text-destructive">{error}</div>}

      {step === 3 && (
        <div className="flex items-center gap-2 border-t border-border/60 pt-4">
          <Button
            onClick={() => void save()}
            disabled={busy || !category || !requestNo}
          >
            {isNcr ? t('form.ncrReply') : mode === 'pp' && selectedHeld ? t('form.ppGetApproval') : t('form.create')}
          </Button>
        </div>
      )}

      {/* P/SC status choice (required before save completes) */}
      <StatusChoiceModal
        open={showStatusChoice}
        statuses={meta?.statuses ?? []}
        onClose={() => setShowStatusChoice(false)}
        onChoose={(choice) => void commit(choice)}
      />

      {/* P → printing popup (1 Test / 3→2 / Redit) */}
      <PrintPromptPopup
        open={showPrintPrompt}
        onClose={() => setShowPrintPrompt(false)}
        fylerUrl={fylerUrl}
        attachments={attachments}
        onRedit={() => {
          setShowPrintPrompt(false);
          setCreatedId(null);
          setSavedLabel('');
          setActiveTab('search');
        }}
      />

      {/* SC → date+time picker via notify */}
      <ScScheduler
        open={showScScheduler}
        target={requestNo ? `${category} ${requestNo}` : category}
        onClose={() => setShowScScheduler(false)}
        onScheduled={() => undefined}
      />

      {/* SC notification popup (due) — Print or Delegate */}
      <ScNotifyPopup
        open={showScNotify}
        onPrint={scPrint}
        onDelegate={scDelegate}
        onClose={() => setShowScNotify(false)}
      />

      {/* Super edit ^ (admin only) — all revisions of the request no. */}
      {canSuperEdit && (
        <SuperEditDialog
          open={superEditOpen}
          recordId={superEditRecordId!}
          meta={meta}
          requestMembers={requestMembers}
          initialValues={values}
          onClose={() => setSuperEditOpen(false)}
          onSaved={() => undefined}
        />
      )}
    </div>
  );
}
