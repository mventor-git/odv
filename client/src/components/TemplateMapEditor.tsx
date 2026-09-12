import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { XlsxPreview } from '@/components/XlsxPreview';
import { Loader2, Save, TestTube2, Trash2 } from 'lucide-react';

interface Merge { r1: number; c1: number; r2: number; c2: number; }
interface GridResp { rows: string[][]; merges: Merge[]; }

/** Record fields the mapper binds to template cells (ticket 108). */
const FIELD_DEFS: Array<{ key: string; labelKey: 'field.code' | 'field.revisionNo' | 'field.description' | 'field.sentDate' | 'field.zone' | 'field.floor' | 'field.member' | 'field.status'; optional?: boolean }> = [
  { key: 'code', labelKey: 'field.code' },
  { key: 'revisionNo', labelKey: 'field.revisionNo' },
  { key: 'description', labelKey: 'field.description' },
  { key: 'sentDate', labelKey: 'field.sentDate' },
  { key: 'zone', labelKey: 'field.zone' },
  { key: 'floor', labelKey: 'field.floor' },
  { key: 'member', labelKey: 'field.member' },
  { key: 'status', labelKey: 'field.status', optional: true },
];

const DOC_FIELDS = ['doc', 'version', 'description', 'code'];

const DOC_FIELD_LABEL: Record<string, 'wizard.docField_doc' | 'wizard.docField_version' | 'wizard.docField_description' | 'wizard.docField_code'> = {
  doc: 'wizard.docField_doc',
  version: 'wizard.docField_version',
  description: 'wizard.docField_description',
  code: 'wizard.docField_code',
};

interface TemplateMapEditorProps {
  category: string;
  onSaved?: () => void;
}

/** Form-list assign mapper — no programming needed (ticket 108):
 *  pick a field → type a cell (e.g. A14) or click the preview grid.
 *  Table config (start/max/kodCol/keepFrom) + column mapping for the
 *  document mini-table. Save as a new mapping version, Test with a fake record. */
export function TemplateMapEditor({ category, onSaved }: TemplateMapEditorProps): ReactNode {
  const { t } = useI18n();
  const [grid, setGrid] = useState<GridResp>({ rows: [], merges: [] });
  const [cells, setCells] = useState<Record<string, string>>({});
  const [table, setTable] = useState<{ start: number; max: number; keepFrom: number; kodCol: string; columns: Record<string, string> }>({
    start: 16, max: 7, keepFrom: 20, kodCol: '', columns: {},
  });
  const [activeField, setActiveField] = useState('code');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [sheet, setSheet] = useState('');
  // Per-fork mapping (mventor-ticket-130): the category may have forks; each
  // fork stores its own mapping. Default '' = category-wide mapping.
  const [forks, setForks] = useState<string[]>([]);
  const [fork, setFork] = useState('');

  useEffect(() => {
    setForks([]);
    setFork('');
    // Fetch the category's forks from the DB domain registry (no hardcoding).
    api<Array<{ code: string; forksJson: string }>>('/api/domain/categories').then((rows) => {
      const cat = rows.find((c) => c.code === category);
      let f: string[] = [];
      try { f = JSON.parse(cat?.forksJson ?? '[]') as string[]; } catch { f = []; }
      setForks(f);
      if (f.length > 0) setFork(f.length === 1 ? f[0] : '');
    }).catch(() => undefined);
    api<GridResp>(`/api/templates/${encodeURIComponent(category)}/grid`).then(setGrid).catch(() => undefined);
    api<{ sheets?: Array<{ name: string }> }>(`/api/templates/${encodeURIComponent(category)}/inspect`).then((r) => {
      if (r.sheets?.[0]) setSheet(r.sheets[0].name);
    }).catch(() => undefined);
  }, [category]);

  const selectedRefs = useMemo(() => Object.values(cells).filter(Boolean), [cells]);

  const setCell = (field: string, ref: string): void => {
    setCells((prev) => ({ ...prev, [field]: ref.toUpperCase() }));
  };

  const setColMap = (col: string, field: string): void => {
    setTable((prev) => ({ ...prev, columns: { ...prev.columns, [col.toUpperCase()]: field } }));
  };

  const removeColMap = (col: string): void => {
    setTable((prev) => {
      const cols = { ...prev.columns };
      delete cols[col.toUpperCase()];
      return { ...prev, columns: cols };
    });
  };

  const validate = (): string | null => {
    for (const f of FIELD_DEFS) {
      if (!f.optional && !cells[f.key]) return `${t(f.labelKey)}: ${t('wizard.missingCode')}`;
    }
    const used = Object.values(cells).filter(Boolean);
    if (new Set(used).size !== used.length) return t('wizard.duplicateCell');
    if (table.kodCol) {
      const kod = table.kodCol.toUpperCase();
      if (Object.keys(table.columns).some((c) => c.toUpperCase() === kod)) return t('wizard.kodColConflict');
    }
    if (table.start >= table.keepFrom) return t('wizard.startKeepFrom');
    return null;
  };

  const saveMapping = async (): Promise<void> => {
    const v = validate();
    if (v) { setErr(v); return; }
    setBusy(true);
    setErr('');
    setMsg('');
    try {
      await api('/api/mappers/publish', {
        method: 'POST',
        body: {
          category,
          fork,
          mapping: { category, sheet, cells, table },
        },
      });
      setMsg(t('wizard.mappingSaved'));
      onSaved?.();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const runTest = async (): Promise<void> => {
    setBusy(true);
    setErr('');
    setMsg('');
    try {
      const res = await api<{ ok: boolean; pdf?: string; error?: string }>('/api/fyler', {
        method: 'POST',
        body: {
          category,
          fork,
          requestNo: '9999',
          revisionNo: '00',
          description: t('wizard.testDescription'),
          sentDate: new Date().toISOString().slice(0, 10),
          status: 'P',
          documents: [{ doc: 'TEST-DOC', version: 'A', description: 'Test', code: '' }],
        },
      });
      if (res.ok && res.pdf) {
        setMsg(t('wizard.testOk'));
        window.open(`/api/fyler/view?path=${encodeURIComponent(res.pdf)}`, '_blank');
      } else {
        setErr(res.error ?? t('wizard.testFail'));
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const inputCls = 'h-8 w-full rounded-md border border-border bg-card px-2 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

  return (
    <div className="flex flex-col gap-4">
      {msg && <div className="text-sm text-success">{msg}</div>}
      {err && <div className="text-sm text-destructive">{err}</div>}

      {forks.length > 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-card p-2">
          <Label className="text-xs font-medium">{t('field.fork')}</Label>
          <select
            className="h-8 rounded-md border border-border bg-card px-2 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            value={fork}
            onChange={(e) => setFork(e.target.value)}
            title={t('wizard.mapForkHint')}
          >
            <option value="">{t('wizard.mapAllForks')}</option>
            {forks.map((f) => (
              <option key={f} value={f}>{f}</option>
            ))}
          </select>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {/* LEFT — field list + table config */}
        <div className="flex flex-col gap-3 rounded-xl border border-border/70 bg-card p-3">
          <Label className="text-sm font-semibold">{t('wizard.mappingFields')}</Label>
          <div className="flex flex-col gap-1.5">
            {FIELD_DEFS.map((f) => (
              <div key={f.key} className={`flex items-center gap-2 rounded-lg border p-1.5 transition-colors ${activeField === f.key ? 'border-accent/40 bg-accent/5' : 'border-border/50'}`}>
                <button type="button" onClick={() => setActiveField(f.key)} className="min-w-0 flex-1 text-start text-xs font-medium text-foreground">
                  {t(f.labelKey)}
                  {f.optional && <span className="ms-1 text-[9px] text-muted-foreground">({t('field.optional')})</span>}
                </button>
                <Input
                  className={`${inputCls} w-24 font-mono`}
                  value={cells[f.key] ?? ''}
                  placeholder="A14"
                  onChange={(e) => setCell(f.key, e.target.value)}
                  onFocus={() => setActiveField(f.key)}
                />
              </div>
            ))}
          </div>

          {/* Table config */}
          <div className="mt-2 flex flex-col gap-2 rounded-lg border border-border/50 p-2">
            <Label className="text-xs font-semibold">{t('wizard.tableConfig')}</Label>
            <div className="grid grid-cols-2 gap-2">
              <div><Label className="text-[10px]">{t('wizard.tableStart')}</Label><Input type="number" className={inputCls} value={table.start} onChange={(e) => setTable({ ...table, start: Number(e.target.value) })} /></div>
              <div><Label className="text-[10px]">{t('wizard.tableMax')}</Label><Input type="number" className={inputCls} value={table.max} onChange={(e) => setTable({ ...table, max: Number(e.target.value) })} /></div>
              <div><Label className="text-[10px]">{t('wizard.tableKeepFrom')}</Label><Input type="number" className={inputCls} value={table.keepFrom} onChange={(e) => setTable({ ...table, keepFrom: Number(e.target.value) })} /></div>
              <div><Label className="text-[10px]">{t('wizard.tableKodCol')}</Label><Input className={`${inputCls} font-mono`} value={table.kodCol} placeholder="I" onChange={(e) => setTable({ ...table, kodCol: e.target.value.toUpperCase() })} /></div>
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-[10px]">{t('wizard.tableColumns')}</Label>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(table.columns).map(([col, field]) => (
                  <span key={col} className="flex items-center gap-1 rounded-md border border-border/50 bg-muted/30 px-1.5 py-0.5 text-[10px]">
                    <span className="font-mono font-bold">{col}</span> → {t(DOC_FIELD_LABEL[field] ?? 'wizard.docField_doc')}
                    <button onClick={() => removeColMap(col)} className="text-destructive/70 hover:text-destructive"><Trash2 className="size-3" /></button>
                  </span>
                ))}
                <select
                  className="h-6 rounded border border-border/50 bg-card text-[10px]"
                  value=""
                  onChange={(e) => { if (e.target.value) { const next = 'ABCDEFGHI'[Object.keys(table.columns).length] ?? 'J'; setColMap(next, e.target.value); } }}
                >
                  <option value="">{t('wizard.addTableCol')}</option>
                  {DOC_FIELDS.map((f) => <option key={f} value={f}>{t(DOC_FIELD_LABEL[f] ?? 'wizard.docField_doc')}</option>)}
                </select>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 pt-1">
            <Button size="sm" className="gap-1" onClick={() => void saveMapping()} disabled={busy}>
              {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
              {t('wizard.saveMapping')}
            </Button>
            <Button size="sm" variant="outline" className="gap-1" onClick={() => void runTest()} disabled={busy}>
              <TestTube2 className="size-3.5" />
              {t('wizard.testMapping')}
            </Button>
          </div>
        </div>

        {/* RIGHT — Xlsx preview */}
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs text-muted-foreground">
            {t('wizard.mappingPreview')} {sheet && <span className="ms-1 font-mono">· {sheet}</span>}
          </Label>
          <XlsxPreview
            rows={grid.rows}
            merges={grid.merges}
            selected={selectedRefs}
            onPick={(ref) => setCell(activeField, ref)}
          />
          <p className="text-[10px] text-muted-foreground">{t('wizard.mappingHint')}</p>
        </div>
      </div>
    </div>
  );
}