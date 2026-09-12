import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import type { Category, DcRecord, Meta } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MultiChipSelect } from '@/components/MultiChipSelect';
import { AttachmentEngine, type AttachmentPage } from '@/components/AttachmentEngine';
import { FylerTab } from '@/components/FylerTab';
import { FullPdfDialog } from '@/components/FullPdfDialog';
import { StatusChoiceModal, type SaveChoice } from '@/components/StatusChoiceModal';
import { padRequestNo, padRevisionNo, floorDisplay, zoneDisplay } from '@/lib/format';
import { Paperclip, Trash2 } from 'lucide-react';
import { ChevronRight } from 'lucide-react';

/** Request Making Wizard (ticket 112): a 5-step flow that replaces the flat
 *  RecordFormPage creation module — Request → Fyler → Attachments → Template →
 *  Review. Reuses the same APIs (fyler, records, templates, mappers) and the
 *  same UI primitives. Data entered in step 1 survives navigation. */

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
}

interface TemplateCat {
  category: string;
  versions: number;
  latestVersion: number | null;
  latestFile: string | null;
  sheets: string[];
  hasTable: boolean;
}

interface Mapper {
  id: number;
  category: string;
  mappingJson: unknown;
  versionNo: number;
  isActive: number;
}

type WizardStep = 1 | 2 | 3 | 4;

const EMPTY_VALUES = { zone: '', floor: '', engineer: '', description: '', sentDate: '' };

/** Lightweight localStorage temp-save for attachments (survives step nav). */
function tempKey(cat: string): string {
  return `odv_wizard_attachments_${cat || 'none'}`;
}
function loadTemp(cat: string): AttachmentPage[] {
  try {
    const raw = localStorage.getItem(tempKey(cat));
    const arr = raw ? (JSON.parse(raw) as AttachmentPage[]) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}
function saveTemp(cat: string, pages: AttachmentPage[]): void {
  try {
    const light = pages.map(({ thumb: _thumb, ...rest }) => rest);
    localStorage.setItem(tempKey(cat), JSON.stringify(light));
  } catch {
    /* storage unavailable — skip temp save */
  }
}

export function RequestMakingWizard(): ReactNode {
  const { t, lang } = useI18n();
  const navigate = useNavigate();

  const [meta, setMeta] = useState<Meta | null>(null);
  const [step, setStep] = useState<WizardStep>(1);

  // Step 1 — request metadata
  const [category, setCategory] = useState('');
  const [fork, setFork] = useState('');
  const [values, setValues] = useState(EMPTY_VALUES);
  const [documents, setDocuments] = useState<DocRow[]>([]);
  const [requestNo, setRequestNo] = useState('');
  const [revisionNo, setRevisionNo] = useState('00');

  // Step 2 — fyler
  const [fylerUrl, setFylerUrl] = useState('');
  const [fylerBusy, setFylerBusy] = useState(false);
  const [fylerErr, setFylerErr] = useState('');

  // Step 3 — attachments
  const [attachments, setAttachments] = useState<AttachmentPage[]>([]);
  const [attachmentsOpen, setAttachmentsOpen] = useState(false);

  // Step 4 — template
  const [templates, setTemplates] = useState<TemplateCat[]>([]);
  const [mappers, setMappers] = useState<Mapper[]>([]);
  const [pickedTemplate, setPickedTemplate] = useState<string | null>(null);

  // Step 5 — review / submit
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [showStatusChoice, setShowStatusChoice] = useState(false);
  const [fullPdfOpen, setFullPdfOpen] = useState(false);

  useEffect(() => {
    api<Meta>('/api/meta').then(setMeta).catch(() => undefined);
    api<TemplateCat[]>('/api/templates').then(setTemplates).catch(() => undefined);
    api<Mapper[]>('/api/mappers').then(setMappers).catch(() => undefined);
  }, []);

  const categoryDef: Category | undefined = useMemo(
    () => meta?.categories.find((c) => c.code === category),
    [meta, category],
  );
  const forks = categoryDef?.forks ?? [];

  // Load the next request no. for the chosen category/fork.
  useEffect(() => {
    if (!category) return;
    const params = new URLSearchParams({ category });
    if (fork) params.set('fork', fork);
    api<NextInfo>(`/api/records/next?${params.toString()}`)
      .then((r) => {
        setRequestNo(r.requestNo);
        setRevisionNo(r.revisionNo);
      })
      .catch(() => undefined);
  }, [category, fork]);

  const changeCategory = (code: string): void => {
    setCategory(code);
    setFork('');
    setValues(EMPTY_VALUES);
    setDocuments([]);
    setAttachments(loadTemp(code));
    setPickedTemplate(null);
    setStep(2);
  };

  const setValue = (key: keyof typeof EMPTY_VALUES, v: string): void =>
    setValues((prev) => ({ ...prev, [key]: v }));

  const addDoc = (): void =>
    setDocuments((prev) => [...prev, { no: prev.length + 1, doc: '', description: '', version: revisionNo, code: '' }]);
  const setDoc = (idx: number, key: keyof DocRow, v: string): void =>
    setDocuments((prev) => prev.map((d, i) => (i === idx ? { ...d, [key]: v } : d)));
  const removeDoc = (idx: number): void =>
    setDocuments((prev) => prev.filter((_, i) => i !== idx).map((d, i) => ({ ...d, no: i + 1 })));

  const handleAttachmentsChange = useCallback(
    (pages: AttachmentPage[]): void => {
      setAttachments(pages);
      saveTemp(category, pages);
    },
    [category],
  );

  // ---- Fyler (reuses POST /api/fyler)
  const generateFyler = useCallback(
    async (openAfter: boolean): Promise<void> => {
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
    },
    [category, fork, requestNo, revisionNo, values, documents],
  );

  // Live fyler in step 2 once the metadata is filled.
  useEffect(() => {
    if (step !== 2 || !category || !requestNo || !values.description.trim()) return;
    const timer = setTimeout(() => void generateFyler(false), 1200);
    return () => clearTimeout(timer);
  }, [step, category, fork, requestNo, revisionNo, values, documents, generateFyler]);

  // ---- Submit (reuses RecordFormPage commit logic)
  const commit = async (choice: SaveChoice): Promise<void> => {
    setShowStatusChoice(false);
    setBusy(true);
    setError('');
    try {
      const res = await api<DcRecord>('/api/records', {
        method: 'POST',
        body: { category, requestNo, revisionNo, fork, ...values, documents, status: choice },
      });
      navigate(`/requests/${encodeURIComponent(res.category)}/${encodeURIComponent(res.requestNo)}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const stepValid = step === 1 ? !!category && !!requestNo && !!values.description.trim() : true;

  const steps: Array<{ n: WizardStep; label: string }> = [
    { n: 1, label: t('wizard.step.request') },
    { n: 2, label: t('wizard.step.fylerAttachments') },
    { n: 3, label: t('wizard.step.template') },
    { n: 4, label: t('wizard.step.review') },
  ];

  // Step 4 — applicable templates: filter by category; if fork mappers exist, prefer those.
  const applicableTemplates = useMemo(() => {
    const base = templates.filter((tp) => tp.category === category && tp.latestVersion != null);
    if (base.length === 0) return [];
    const catMappers = mappers.filter((m) => m.category === category);
    const forkMappers = catMappers.filter((m) => {
      const json = m.mappingJson as { fork?: string } | null;
      return json?.fork === fork;
    });
    if (forkMappers.length > 0) {
      const forkTemplateNames = new Set(
        forkMappers.map((m) => {
          const json = m.mappingJson as { template?: string } | null;
          return json?.template ?? category;
        }),
      );
      const filtered = base.filter((tp) => forkTemplateNames.has(tp.category));
      return filtered.length ? filtered : base;
    }
    return base;
  }, [templates, mappers, category, fork]);

  const inputCls =
    'h-9 w-full rounded-md border border-border bg-card px-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-foreground">{t('records.new')}</h1>
        <span className="rounded-full bg-primary/10 px-2 py-0.5 font-mono text-xs font-medium text-primary">
          {category}
          {fork ? `-${fork}` : ''}
        </span>
      </div>

      {/* Step indicators */}
      <div className="flex items-center gap-2">
        {steps.map((s, i) => (
          <div key={s.n} className="flex items-center gap-2">
            {i > 0 && <span className="h-px w-6 bg-border/70" aria-hidden="true" />}
            <span
              className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                step === s.n
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : step > s.n
                    ? 'bg-primary/10 text-primary'
                    : 'bg-muted text-muted-foreground'
              }`}
            >
              <span className="flex h-4 w-4 items-center justify-center rounded-full bg-white/20 text-[10px]">
                {step > s.n ? '✓' : s.n}
              </span>
              {s.label}
            </span>
          </div>
        ))}
      </div>

      {/* Step 1 — Request */}
      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle>{t('wizard.step.request')}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div>
              <Label>{t('field.category')}</Label>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {meta?.categories
                  .filter((c) => c.kind !== 'order_log')
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
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 2 — Fyler + Attachments (ONE card) */}
      {step === 2 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {t('wizard.step.fylerAttachments')}
              <span className="rounded-full bg-primary/10 px-2 py-0.5 font-mono text-xs font-medium text-primary">
                {category}
                {fork ? `-${fork}` : ''}
              </span>
            </CardTitle>
            <p className="text-xs text-muted-foreground">{t('form.fylerHint')}</p>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {forks.length > 0 && (
              <div>
                <Label>{t('field.fork')}</Label>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {forks.map((f) => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setFork(f)}
                      className={`glass-card flex items-center justify-between rounded-2xl p-4 text-start transition-all hover:-translate-y-0.5 active:scale-[0.98] ${
                        fork === f ? 'ring-2 ring-primary/50 shadow-[0_8px_40px_-8px_rgba(99,102,241,0.5)]' : ''
                      }`}
                    >
                      <span className="font-mono text-lg font-bold tracking-wide text-foreground">{f}</span>
                      <ChevronRight className="size-4 text-primary rtl:rotate-180" />
                    </button>
                  ))}
                </div>
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
              <div>
                <Label>{t('field.zone')}</Label>
                <MultiChipSelect
                  listBox
                  options={(meta?.zones ?? []).map((z) => ({ value: z.code, label: `${z.code} — ${zoneDisplay(z, lang)}` }))}
                  value={values.zone}
                  onChange={(v) => setValue('zone', v)}
                />
              </div>
              <div>
                <Label>{t('field.floor')}</Label>
                <MultiChipSelect
                  listBox
                  options={(meta?.floors ?? []).map((f) => ({ value: f, label: floorDisplay(f, lang, meta?.floorNamesAr) }))}
                  value={values.floor}
                  onChange={(v) => setValue('floor', v)}
                />
              </div>
              <div>
                <Label>{t('field.member')}</Label>
                <Input value={values.engineer} onChange={(e) => setValue('engineer', e.target.value)} placeholder={t('field.optional')} />
              </div>
              <div>
                <Label>{t('field.sentDate')}</Label>
                <Input type="date" value={values.sentDate} onChange={(e) => setValue('sentDate', e.target.value)} />
              </div>
              <div className="sm:col-span-2">
                <Label>{t('field.description')}</Label>
                <textarea className={`${inputCls} min-h-[80px] py-2`} value={values.description} onChange={(e) => setValue('description', e.target.value)} />
              </div>
            </div>

            {(categoryDef?.hasTable ?? false) && (
              <div className="flex flex-col gap-2 border-t border-border/60 pt-4">
                <div className="flex items-center justify-between">
                  <Label>{t('form.documents')}</Label>
                  <Button size="sm" variant="outline" className="gap-1" onClick={addDoc} disabled={documents.length >= 7}>
                    <ChevronRight className="size-3.5 rotate-90" />
                    {t('form.addDocument')}
                  </Button>
                </div>
                {documents.length === 0 && <div className="text-xs text-muted-foreground">{t('form.noDocuments')}</div>}
                {documents.map((d, idx) => (
                  <div key={idx} className="grid grid-cols-2 items-center gap-2 rounded-lg border border-border/60 bg-card p-2 sm:grid-cols-[2rem_1fr_1.5fr_4rem_3rem_2rem] sm:border-0 sm:bg-transparent sm:p-0">
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

            {/* Fyler + Attachments live in the same card */}
            <div className="grid gap-4 border-t border-border/60 pt-4 lg:grid-cols-2">
              <div className="flex flex-col gap-3">
                <Label>{t('wizard.step.fyler')}</Label>
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
                  onEdit={() => setStep(1)}
                  onDropFiles={() => setAttachmentsOpen(true)}
                />
              </div>
              <div className="flex flex-col gap-3">
                <Label>{t('wizard.step.attachments')}</Label>
                <Button variant="outline" className="gap-1.5 self-start" onClick={() => setAttachmentsOpen(true)}>
                  <Paperclip className="size-4" />
                  {t('attachments.open')}
                </Button>
                {attachments.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {attachments.map((a) => (
                      <span key={a.id} className="max-w-[16rem] truncate rounded-md bg-primary/10 px-2 py-1 text-[11px] font-medium text-primary" title={a.description}>
                        {a.source} · {a.size}
                      </span>
                    ))}
                  </div>
                ) : (
                  <div className="text-xs text-muted-foreground">{t('attachments.noAttachments')}</div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 3 — Template */}
      {step === 3 && (
        <Card>
          <CardHeader>
            <CardTitle>{t('wizard.step.template')}</CardTitle>
            <p className="text-xs text-muted-foreground">{t('wizard.pickTemplate')}</p>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {applicableTemplates.length === 0 ? (
              <div className="text-xs text-muted-foreground">{t('wizard.noTemplateForCat')}</div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {applicableTemplates.map((tp) => (
                  <button
                    key={tp.category}
                    type="button"
                    onClick={() => setPickedTemplate(tp.category)}
                    className={`glass-card flex flex-col gap-1.5 rounded-2xl p-4 text-start transition-all hover:-translate-y-0.5 active:scale-[0.98] ${
                      pickedTemplate === tp.category ? 'ring-2 ring-primary/50 shadow-[0_8px_40px_-8px_rgba(99,102,241,0.5)]' : ''
                    }`}
                  >
                    <span className="font-mono text-lg font-bold tracking-wide text-foreground">{tp.category}</span>
                    <span className="text-sm text-foreground">{t('wizard.templateVersion')} v{tp.latestVersion}</span>
                    <span className="truncate text-[11px] text-muted-foreground">{tp.latestFile}</span>
                  </button>
                ))}
              </div>
            )}
            {mappers.filter((m) => m.category === category).length > 0 && (
              <div className="rounded-lg border border-border/60 bg-muted/30 p-3 text-xs text-muted-foreground">
                {t('wizard.mapperCount')}: {mappers.filter((m) => m.category === category).length}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Step 4 — Review */}
      {step === 4 && (
        <Card>
          <CardHeader>
            <CardTitle>{t('wizard.reviewTitle')}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <ul className="flex flex-col gap-2 text-sm">
              <li className="rounded-lg border border-border/60 bg-card p-3">
                <div className="font-semibold text-foreground">{t('wizard.step.request')}</div>
                <div className="text-muted-foreground">
                  {t('field.category')}: {category}
                  {fork ? ` · ${t('field.fork')}: ${fork}` : ''}
                </div>
                <div className="text-muted-foreground">
                  {t('field.requestNo')}: {padRequestNo(requestNo)} · {t('field.revisionNo')}: {padRevisionNo(revisionNo)}
                </div>
                <div className="text-muted-foreground">
                  {t('field.zone')}: {values.zone || '—'} · {t('field.floor')}: {values.floor || '—'} · {t('field.member')}: {values.engineer || '—'}
                </div>
                <div className="text-muted-foreground">
                  {t('field.sentDate')}: {values.sentDate || '—'}
                </div>
                <div className="text-muted-foreground">
                  {t('field.description')}: {values.description || '—'}
                </div>
                {documents.length > 0 && (
                  <div className="text-muted-foreground">
                    {t('form.documents')}: {documents.length}
                  </div>
                )}
              </li>
              <li className="rounded-lg border border-border/60 bg-card p-3">
                <div className="font-semibold text-foreground">{t('wizard.step.fylerAttachments')}</div>
                <div className="text-muted-foreground">
                  {t('wizard.step.fyler')}: {fylerUrl ? t('form.fylerDone') : '—'} · {t('wizard.step.attachments')}: {attachments.length}
                </div>
              </li>
              <li className="rounded-lg border border-border/60 bg-card p-3">
                <div className="font-semibold text-foreground">{t('wizard.step.template')}</div>
                <div className="text-muted-foreground">{pickedTemplate ?? t('wizard.noTemplateForCat')}</div>
              </li>
            </ul>

            {/* Live fyler PDF — must be visible before Generate is enabled */}
            <div className="border-t border-border/60 pt-3">
              <Label>{t('form.fylerLive')}</Label>
              {fylerUrl ? (
                <iframe
                  title={t('form.fylerLive')}
                  src={fylerUrl}
                  className="mt-2 h-[70vh] w-full rounded-lg border border-border/60 bg-white"
                />
              ) : (
                <div className="mt-2 flex items-center gap-2 rounded-lg border border-dashed border-border bg-muted/30 p-4 text-xs text-muted-foreground">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-amber-400" />
                  {t('wizard.fylerPending')}
                </div>
              )}
            </div>

            {error && <div className="text-sm text-destructive">{error}</div>}
            {!fylerUrl && (
              <div className="text-xs text-amber-600 dark:text-amber-400">{t('wizard.fylerRequired')}</div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Navigation */}
      <div className="flex items-center justify-between border-t border-border/60 pt-4">
        <Button variant="outline" size="sm" onClick={() => setStep((s) => (s > 1 ? ((s - 1) as WizardStep) : s))} disabled={step === 1}>
          {t('wizard.back')}
        </Button>
        {step < 4 ? (
          <Button size="sm" onClick={() => setStep((s) => (s < 4 ? ((s + 1) as WizardStep) : s))} disabled={step === 1 && !stepValid}>
            {t('wizard.next')}
          </Button>
        ) : (
          <Button size="sm" onClick={() => setShowStatusChoice(true)} disabled={busy || !category || !requestNo || !fylerUrl}>
            {t('wizard.generate')}
          </Button>
        )}
      </div>

      <AttachmentEngine
        open={attachmentsOpen}
        onClose={() => setAttachmentsOpen(false)}
        initialAttachments={attachments}
        onAttachmentsChange={handleAttachmentsChange}
      />

      <FullPdfDialog open={fullPdfOpen} onClose={() => setFullPdfOpen(false)} fylerUrl={fylerUrl} fylerRecordId={0} attachments={attachments} />

      <StatusChoiceModal open={showStatusChoice} statuses={meta?.statuses ?? []} onClose={() => setShowStatusChoice(false)} onChoose={(c) => void commit(c)} />
    </div>
  );
}
