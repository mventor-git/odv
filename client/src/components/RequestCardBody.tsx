import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import type { DcRecord, Meta, RecordsResponse } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { StatusBadge } from '@/components/StatusBadge';
import { FileLink } from '@/components/FileLink';
import { PdfViewer } from '@/components/PdfViewer';
import { DeleteConfirmDialog } from '@/components/DeleteConfirmDialog';
import { NotifyButton } from '@/components/NotifyButton';
import { ScanAttachModal } from '@/components/ScanAttachModal';
import { MultiChipSelect } from '@/components/MultiChipSelect';
import { FIELD_LABEL_KEYS } from '@/data/display';
import { floorDisplay, padRequestNo, padRevisionNo, revisionSortKey, zoneDisplay } from '@/lib/format';
import { GitBranch, ExternalLink, Maximize2, Pencil, Save, Trash2, X, ScanLine } from 'lucide-react';

/** Fallback columns when the category is unknown. */
const FALLBACK_COLS = [
  'requestNo', 'revisionNo', 'description', 'zone', 'floor', 'engineer',
  'fork', 'sentDate', 'sentByConsultantDate', 'replyDate',
  'replyByContractorDate', 'status', 'hyperlink', 'dataHyperlink',
];

const DATE_COLS = new Set([
  'sentDate', 'sentByConsultantDate', 'replyDate', 'replyByContractorDate', 'dueDate',
]);

/** Status transition laws (ticket 033) — the card's status select only offers legal moves. */
const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  PP: ['P', 'SC'],
  P: ['A', 'B', 'C', 'D', 'Skipped'],
  SC: ['P', 'PP'],
};

const inputCls =
  'h-9 w-full rounded-md border border-border/60 bg-card px-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

/**
 * The request card: header, revision selector, actions (edit in place /
 * new revision / open PDF), the selected revision's metadata grid (editable),
 * and the PDF viewer. Used in the RequestCard modal AND the details page.
 */
export function RequestCardBody({
  category,
  requestNo,
  initialViewId,
  initialEditMode = false,
  expandToPage = true,
  onDeleted,
}: {
  category: string;
  requestNo: string;
  initialViewId?: number;
  initialEditMode?: boolean;
  /** Show the "Open Page" expand action (hidden on the details page itself). */
  expandToPage?: boolean;
  /** Called after the viewed revision is deleted and the family is empty. */
  onDeleted?: () => void;
}): ReactNode {
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin' || user?.role === 'dev';
  const [meta, setMeta] = useState<Meta | null>(null);
  const [requestMembers, setrequestMembers] = useState<Array<{ name: string; role: string; executive?: boolean; star?: string }>>([]);
  const [rows, setRows] = useState<DcRecord[] | null>(null);
  const [error, setError] = useState('');
  const [viewId, setViewId] = useState<number | null>(null);
  const [editing, setEditing] = useState(initialEditMode);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);

  const loadFamily = useCallback(async (): Promise<void> => {
    const res = await api<RecordsResponse>(
      `/api/records?category=${encodeURIComponent(category)}&requestNo=${encodeURIComponent(requestNo)}&limit=50`,
    );
    setRows(res.items);
  }, [category, requestNo]);

  useEffect(() => {
    api<Meta>('/api/meta').then(setMeta).catch(() => undefined);
    api<Array<{ name: string; role: string }>>('/api/ref/members?scope=request')
      .then(setrequestMembers)
      .catch(() => undefined);
    setRows(null);
    setViewId(initialViewId ?? null);
    setEditing(initialEditMode);
    loadFamily().catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, [category, requestNo, initialViewId, initialEditMode, loadFamily]);

  const sorted = useMemo(
    () => (rows ?? []).sort((a, b) => revisionSortKey(a.revisionNo) - revisionSortKey(b.revisionNo)),
    [rows],
  );
  const latest = sorted.length > 0 ? sorted[sorted.length - 1] : undefined;
  const catDef = meta?.categories.find((c) => c.code === category);
  const cols = catDef?.columns ?? FALLBACK_COLS;
  const isB = latest?.status === 'B';
  const viewed = sorted.find((r) => r.id === viewId) ?? latest;

  const startEdit = useCallback((): void => {
    if (!viewed) return;
    const d: Record<string, string> = {};
    for (const col of cols) d[col] = String(viewed[col as keyof DcRecord] ?? '');
    d.dueDate = String(viewed.dueDate ?? '');
    setDraft(d);
    setEditing(true);
  }, [viewed, cols]);

  const cancelEdit = useCallback((): void => {
    setEditing(false);
    setDraft({});
  }, []);

  const saveEdit = useCallback(async (): Promise<void> => {
    if (!viewed) return;
    setSaving(true);
    setError('');
    try {
      await api(`/api/records/${viewed.id}`, { method: 'PATCH', body: draft });
      setEditing(false);
      setDraft({});
      await loadFamily();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }, [viewed, draft, loadFamily]);

  const newRevision = useCallback(async (): Promise<void> => {
    if (!latest) return;
    try {
      const created = await api<DcRecord>(`/api/records/${latest.id}/revision`, { method: 'POST' });
      navigate(`/requests/${created.category}/${encodeURIComponent(created.requestNo)}`);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : String(err));
    }
  }, [latest, navigate]);

  const deleteViewed = useCallback(async (): Promise<void> => {
    if (!viewed) return;
    setConfirmDelete(false);
    try {
      await api(`/api/records/${viewed.id}`, { method: 'DELETE' });
      await loadFamily();
      if (sorted.length <= 1) onDeleted?.();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : String(err));
    }
  }, [viewed, loadFamily, sorted.length, onDeleted]);

  if (!meta || rows === null) {
    return <div className="py-10 text-center text-muted-foreground">{t('common.loading')}</div>;
  }

  if (sorted.length === 0) {
    return (
      <div className="py-10 text-center text-muted-foreground">
        {t('details.notFound')} — {category} {requestNo}
      </div>
    );
  }

  const fieldValue = (r: DcRecord, col: string): ReactNode => {
    if (col === 'status') return <StatusBadge status={r.status} />;
    if (col === 'hyperlink') return <FileLink recordId={r.id} hyperlink={r.hyperlink} />;
    if (col === 'dataHyperlink') return <FileLink recordId={r.id} hyperlink={r.dataHyperlink} label="DATA" />;
    const v = r[col as keyof DcRecord] as string;
    if (col === 'requestNo') return <span className="font-mono font-semibold">{padRequestNo(v)}</span>;
    if (col === 'revisionNo') return <span className="font-mono font-semibold">{padRevisionNo(v)}</span>;
    return <span>{v || '—'}</span>;
  };

  /** Editable input for one column (edit mode). */
  const editField = (col: string): ReactNode => {
    const value = draft[col] ?? '';
    const set = (v: string): void => setDraft((prev) => ({ ...prev, [col]: v }));
    if (col === 'status') {
      const allowed = ALLOWED_TRANSITIONS[viewed?.status ?? ''];
      const options = allowed
        ? meta.statuses.filter((s) => allowed.includes(s.code))
        : meta.statuses;
      return (
        <Select className={inputCls} value={value} onChange={(e) => set(e.target.value)}>
          {options.map((s) => (
            <option key={s.code} value={s.code}>
              {s.code} — {s.slogan}
            </option>
          ))}
        </Select>
      );
    }
    if (col === 'zone') {
      return (
        <MultiChipSelect
          options={meta.zones.map((z) => ({ value: z.code, label: `${z.code} — ${zoneDisplay(z, lang)}` }))}
          value={value}
          onChange={set}
        />
      );
    }
    if (col === 'floor') {
      return (
        <MultiChipSelect
          options={meta.floors.map((f) => ({ value: f, label: floorDisplay(f, lang, meta.floorNamesAr) }))}
          value={value}
          onChange={set}
        />
      );
    }
    if (col === 'fork') {
      return (
        <Select className={inputCls} value={value} onChange={(e) => set(e.target.value)}>
          <option value="">—</option>
          {(catDef?.forks ?? []).map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </Select>
      );
    }
    if (col === 'engineer') {
      return (
        <Select className={inputCls} value={value} onChange={(e) => set(e.target.value)}>
          <option value="">—</option>
          {requestMembers.map((e) => (
            <option key={e.name} value={e.name}>
              {e.name}
              {/* ★ = executive-enabled (ticket 096) or star role */}
              {e.star || e.executive ? ' ★' : ''}
            </option>
          ))}
        </Select>
      );
    }
    if (DATE_COLS.has(col)) {
      return <input type="date" className={inputCls} value={value} onChange={(e) => set(e.target.value)} />;
    }
    if (col === 'description') {
      return (
        <textarea
          className={`${inputCls} min-h-[64px] py-1.5`}
          value={value}
          onChange={(e) => set(e.target.value)}
        />
      );
    }
    return <input className={inputCls} value={value} onChange={(e) => set(e.target.value)} />;
  };

  const scanIntake = (): ReactNode => (
    <div className="flex flex-col items-center gap-2 px-4">
      <Button variant="outline" className="gap-1.5 border-primary/50 text-primary hover:bg-accent/50 hover:text-primary" onClick={() => setScanOpen(true)}>
        <ScanLine className="size-4" />
        {t('scan.logPdf')}
      </Button>
      <span className="max-w-[260px] text-center text-[11px] text-muted-foreground">{t('scan.attachHint')}</span>
    </div>
  );

  return (
    <div className="flex flex-col gap-3">
      {/* Card header */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span className="font-mono text-xl font-bold tracking-wide text-foreground">
          {padRequestNo(requestNo)}
        </span>
        <span className="rounded bg-muted px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {catDef ? `${category} — ${catDef.name}` : category}
        </span>
        {latest && <StatusBadge status={latest.status} />}
        <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
          {sorted.length} {t('cc.revisions')}
        </span>
        {editing && (
          <span className="rounded bg-warning px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-900 animate-pulse">
            {t('details.editMode')}
          </span>
        )}
      </div>

      {/* Controls: revision selector + actions */}
      <div className="flex flex-wrap items-center gap-2">
        <Select
          className="h-8 w-auto"
          value={String(viewed?.id ?? '')}
          disabled={editing}
          onChange={(e) => setViewId(Number(e.target.value))}
        >
          {sorted.map((r) => (
            <option key={r.id} value={String(r.id)}>
              {t('details.revision')} {padRevisionNo(r.revisionNo)}
            </option>
          ))}
        </Select>
        <div className="ms-auto flex flex-wrap items-center gap-1.5">
          {/* Floating notify icon on the request element (ticket 073 round 2) */}
          {viewed && <NotifyButton target={`${category} ${requestNo}`} />}
          {editing ? (
            <>
              <Button size="sm" variant="outline" onClick={cancelEdit} disabled={saving} className="gap-1.5">
                <X className="size-3.5" />
                {t('details.revert')}
              </Button>
              <Button size="sm" onClick={() => void saveEdit()} disabled={saving} className="gap-1.5">
                <Save className="size-3.5" />
                {t('form.save')}
              </Button>
            </>
          ) : (
            <>
              {isB ? (
                <Button
                  size="sm"
                  className="gap-1.5 bg-primary text-primary-foreground shadow-sm hover:bg-primary/90"
                  onClick={() => {
                    if (!latest) return;
                    // Open creation form with this B request's metadata — user makes the A revision as a new request entry
                    navigate(`/requests/new?reviseFrom=${latest.id}`);
                  }}
                >
                  {t('cc.getApprovedA')}
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void newRevision()}
                  disabled={latest?.status === 'A'}
                  className={`gap-1.5 border shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md ${latest?.status === 'A' ? 'opacity-50 cursor-not-allowed' : 'border-border bg-card hover:border-accent/30 hover:bg-accent/10 hover:text-accent'}`}
                  title={latest?.status === 'A' ? 'Approved — no further revision' : undefined}
                >
                  <GitBranch className="size-3.5" />
                  {t('records.newRevision')}
                </Button>
              )}
              {expandToPage && (
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5"
                  title={t('details.openPage')}
                  onClick={() =>
                    navigate(
                      `/requests/${encodeURIComponent(category)}/${encodeURIComponent(requestNo)}`,
                    )
                  }
                >
                  <Maximize2 className="size-3.5" />
                  {t('details.openPage')}
                </Button>
              )}
              <Button size="sm" variant="secondary" onClick={startEdit} className="gap-1.5">
                <Pencil className="size-3.5" />
                {t('records.edit')}
              </Button>
              {isAdmin && viewed && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="gap-1.5 text-destructive hover:bg-destructive/10"
                  onClick={() => setConfirmDelete(true)}
                >
                  <Trash2 className="size-3.5" />
                  {t('records.delete')}
                </Button>
              )}
              {viewed && viewed.hyperlink.trim() && (
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5"
                  onClick={() => {
                    api(`/api/files/${viewed.id}/open`)
                      .then(() => window.alert(t('pdf.openedDefault')))
                      .catch((err) => window.alert(err instanceof Error ? err.message : String(err)));
                  }}
                >
                  <ExternalLink className="size-3.5" />
                  {t('pdf.openDefault')}
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      {error && <div className="text-sm text-destructive">{error}</div>}

      {/* Metadata grid for the viewed revision (editable in edit mode) */}
      {viewed && (
        <div className="grid gap-x-6 gap-y-3 rounded-xl border border-border/70 bg-card p-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {cols.map((col) => (
            <div key={col} className="flex flex-col gap-0.5">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {t(FIELD_LABEL_KEYS[col] as Parameters<typeof t>[0])}
              </span>
              {editing ? (
                editField(col)
              ) : (
                <span className={DATE_COLS.has(col) ? 'text-sm tabular-nums text-foreground' : 'text-sm text-foreground'}>
                  {fieldValue(viewed, col)}
                </span>
              )}
            </div>
          ))}
          {/* Due date (ticket 086) — SC reminders; editable in edit mode */}
          <div className="flex flex-col gap-0.5">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {t('field.dueDate')}
            </span>
            {editing ? (
              editField('dueDate')
            ) : (
              <span className="text-sm tabular-nums text-foreground">
                {viewed.dueDate || '—'}
              </span>
            )}
          </div>
        </div>
      )}

      {/* PDF viewer for the viewed revision — unified print (ticket 092) */}
      {viewed && viewed.hyperlink.trim() ? (
        <PdfViewer
          src={`/api/files/${viewed.id}`}
          recordId={viewed.id}
          fallback={viewed.status === 'P' ? scanIntake() : undefined}
        />
      ) : viewed && viewed.status === 'P' ? (
        <div className="flex h-44 items-center justify-center rounded-xl border border-dashed border-primary/40 bg-primary/5">
          {scanIntake()}
        </div>
      ) : (
        <div className="flex h-40 items-center justify-center rounded-xl border border-dashed border-border/70 bg-muted/20 text-sm text-muted-foreground">
          {t('pdf.noFile')}
        </div>
      )}

      <ScanAttachModal
        open={scanOpen}
        recordId={viewed?.id ?? null}
        requestLabel={viewed ? `${viewed.category}-${viewed.requestNo}` : ''}
        onClose={() => setScanOpen(false)}
        onAttached={() => { setScanOpen(false); void loadFamily(); }}
      />

      <DeleteConfirmDialog
        open={confirmDelete}
        record={viewed ?? null}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => void deleteViewed()}
      />
    </div>
  );
}