import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TemplateMapEditor } from '@/components/TemplateMapEditor';
import { Plus, Trash2, Upload, Download, Check, ChevronRight, ChevronLeft, Loader2, FileText, FolderOpen } from 'lucide-react';

interface CustomField {
  key_en: string;
  key_ar: string;
  value_en: string;
  value_ar: string;
}

interface ZoneRow {
  code: string;
  name: string;
  nameAr: string;
  cluster: string;
}

interface CategoryForm {
  code: string;
  nameEn: string;
  nameAr: string;
  descriptionEn: string;
  descriptionAr: string;
  kind: 'request' | 'ncr' | 'order_log';
  hasTable: boolean;
  hasChecklist: boolean;
  forks: Array<{ code: string; name: string }>;
}

/** Step 1: Project Metadata */
function MetadataStep({
  customFields,
  setCustomFields,
}: {
  customFields: CustomField[];
  setCustomFields: (v: CustomField[]) => void;
}): ReactNode {
  const { t } = useI18n();
  const addField = () => {
    setCustomFields([...customFields, { key_en: '', key_ar: '', value_en: '', value_ar: '' }]);
  };
  const setField = (i: number, patch: Partial<CustomField>) => {
    setCustomFields(customFields.map((f, idx) => (idx === i ? { ...f, ...patch } : f)));
  };
  const removeField = (i: number) => {
    setCustomFields(customFields.filter((_, idx) => idx !== i));
  };
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">{t('wizard.projectMetadataHint')}</p>
      <div className="flex flex-col gap-2">
        <Label>{t('wizard.addCustomField')}</Label>
        {customFields.map((f, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2 rounded-lg border border-border/60 bg-card p-2">
            <Input className="w-36 h-8 text-xs" value={f.key_en} placeholder={t('wizard.customFieldKey')} onChange={(e) => setField(i, { key_en: e.target.value })} />
            <Input className="w-36 h-8 text-xs" value={f.key_ar} placeholder={t('wizard.customFieldKeyAr')} onChange={(e) => setField(i, { key_ar: e.target.value })} />
            <Input className="w-36 h-8 text-xs" value={f.value_en} placeholder={t('wizard.customFieldValue')} onChange={(e) => setField(i, { value_en: e.target.value })} />
            <Input className="w-36 h-8 text-xs" value={f.value_ar} placeholder={t('wizard.customFieldValueAr')} onChange={(e) => setField(i, { value_ar: e.target.value })} />
            <Button size="icon" variant="ghost" className="text-destructive size-8" onClick={() => removeField(i)}>
              <Trash2 className="size-3.5" />
            </Button>
          </div>
        ))}
        <Button size="sm" variant="outline" className="gap-1 self-start" onClick={addField}>
          <Plus className="size-3.5" />
          {t('wizard.addCustomField')}
        </Button>
      </div>
    </div>
  );
}

/** Step 2: Zones (import + manual add) */
function ZonesStep({
  onComplete,
  onBack,
}: {
  onComplete: () => void;
  onBack: () => void;
}): ReactNode {
  const { t } = useI18n();
  const [zones, setZones] = useState<ZoneRow[]>([]);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [nameAr, setNameAr] = useState('');
  const [cluster, setCluster] = useState('CL12');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const addZone = () => {
    if (!code.trim()) { setErr(t('wizard.missingCode')); return; }
    if (zones.some((z) => z.code === code.trim().toUpperCase())) { setErr(t('wizard.duplicateCode')); return; }
    setZones([...zones, { code: code.trim().toUpperCase(), name: name.trim() || code.trim(), nameAr: nameAr.trim(), cluster: cluster.trim() || 'CL12' }]);
    setCode(''); setName(''); setNameAr(''); setCluster('CL12');
    setErr('');
  };

  const removeZone = (i: number) => {
    setZones(zones.filter((_, idx) => idx !== i));
  };

  const handleImport = async () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.xlsx';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      setBusy(true);
      setErr('');
      try {
        const buf = new Uint8Array(await file.arrayBuffer());
        // Chunked base64 — safe for large xlsx files (String.fromCharCode spread overflows the stack).
        let bin = '';
        const CHUNK = 0x8000;
        for (let i = 0; i < buf.length; i += CHUNK) {
          bin += String.fromCharCode(...buf.subarray(i, i + CHUNK));
        }
        const base64 = btoa(bin);
        const res = await api<{ zones: ZoneRow[]; total: number }>('/api/setup/zones/parse', {
          method: 'POST',
          body: { fileBase64: base64 },
        });
        if (res.zones?.length) {
          setZones((prev) => {
            const existing = new Set(prev.map((z) => z.code));
            const fresh = res.zones.filter((z) => !existing.has(z.code));
            return [...prev, ...fresh];
          });
          setMsg(t('wizard.importResult').replace('{total}', String(res.total)).replace('{added}', String(res.zones.length)).replace('{updated}', '0'));
        }
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(false);
      }
    };
    input.click();
  };

  const handleExport = async () => {
    // Generate the example xlsx server-side and download it.
    try {
      const token = localStorage.getItem('odv_token');
      const res = await fetch('/api/setup/zones/example', {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error('Failed to generate example');
      const buf = await res.arrayBuffer();
      const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'zones-example.xlsx';
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setErr('Failed to generate example');
    }
  };

  const apply = async () => {
    if (zones.length === 0) { setErr('Add at least one zone'); return; }
    setBusy(true);
    setErr('');
    try {
      const res = await api<{ ok: boolean }>('/api/setup/zones/import', {
        method: 'POST',
        body: { zones },
      });
      if (res.ok) onComplete();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">{t('wizard.zonesHint')}</p>

      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" className="gap-1" onClick={handleExport} disabled={busy}>
          <Download className="size-3.5" />
          {t('wizard.downloadExample')}
        </Button>
        <Button size="sm" variant="outline" className="gap-1" onClick={handleImport} disabled={busy}>
          <Upload className="size-3.5" />
          {t('wizard.importZones')}
        </Button>
      </div>

      <div className="flex flex-wrap items-end gap-2 rounded-lg border border-border/60 bg-muted/30 p-3">
        <div>
          <Label className="text-xs">{t('wizard.zoneCode')}</Label>
          <Input className="h-8 w-24" value={code} onChange={(e) => setCode(e.target.value)} placeholder="A" />
        </div>
        <div>
          <Label className="text-xs">{t('wizard.zoneName')}</Label>
          <Input className="h-8 w-32" value={name} onChange={(e) => setName(e.target.value)} placeholder="Zone A" />
        </div>
        <div>
          <Label className="text-xs">{t('wizard.zoneNameAr')}</Label>
          <Input className="h-8 w-32" value={nameAr} onChange={(e) => setNameAr(e.target.value)} placeholder="منطقة أ" />
        </div>
        <div>
          <Label className="text-xs">{t('wizard.zoneCluster')}</Label>
          <Input className="h-8 w-24" value={cluster} onChange={(e) => setCluster(e.target.value)} placeholder="CL12" />
        </div>
        <Button size="sm" variant="outline" className="gap-1 h-8" onClick={addZone}>
          <Plus className="size-3.5" />
          {t('wizard.addZone')}
        </Button>
      </div>

      {msg && <div className="text-sm text-success">{msg}</div>}
      {err && <div className="text-sm text-destructive">{err}</div>}

      <div className="flex flex-col gap-1.5 max-h-48 overflow-y-auto">
        {zones.length === 0 && <div className="text-sm text-muted-foreground">—</div>}
        {zones.map((z, i) => (
          <div key={i} className="flex items-center gap-2 rounded-lg border border-border/60 bg-card px-2.5 py-1.5 text-sm">
            <span className="font-mono font-bold w-12">{z.code}</span>
            <span className="text-muted-foreground flex-1">{z.name}</span>
            {z.nameAr && <span className="text-muted-foreground w-24 text-xs">{z.nameAr}</span>}
            <span className="text-xs text-muted-foreground w-16">{z.cluster}</span>
            <Button size="icon" variant="ghost" className="text-destructive size-7" onClick={() => removeZone(i)}>
              <Trash2 className="size-3.5" />
            </Button>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2 pt-2">
        <Button variant="outline" size="sm" onClick={onBack}><ChevronLeft className="size-3.5" />{t('wizard.back')}</Button>
        <Button className="gap-1" onClick={apply} disabled={busy || zones.length === 0}>
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
          {t('wizard.next')}
        </Button>
      </div>
    </div>
  );
}

/** Step 3: Categories */
function CategoriesStep({
  onComplete,
  onBack,
  onCategories,
}: {
  onComplete: () => void;
  onBack: () => void;
  onCategories: (cats: Array<{ code: string; forks: Array<{ code: string }> }>) => void;
}): ReactNode {
  const { t } = useI18n();
  const [categories, setCategories] = useState<Array<CategoryForm & { saved: boolean }>>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<CategoryForm>({
    code: '', nameEn: '', nameAr: '', descriptionEn: '', descriptionAr: '',
    kind: 'request', hasTable: false, hasChecklist: true, forks: [],
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  // Load any categories already on the server to prevent duplicate-POST 409 errors
  // when categories exist from a prior run. If none exist, the UI shows an empty
  // "add your first category" state — no hardcoded categories.
  useEffect(() => {
    api<Array<{ code: string; nameEn: string; nameAr: string; kind: string; forksJson: string }>>('/api/domain/categories')
      .then((rows) => {
        const existing = rows.map((r) => ({
          code: r.code,
          nameEn: r.nameEn,
          nameAr: r.nameAr,
          descriptionEn: '',
          descriptionAr: '',
          kind: r.kind as 'request' | 'ncr' | 'order_log',
          hasTable: false,
          hasChecklist: true,
          forks: JSON.parse(r.forksJson || '[]').map((f: { code: string; name: string }) => ({ code: f.code, name: f.name || '' })),
          saved: true,
        }));
        setCategories(existing);
      })
      .catch(() => {
        setCategories([]);
      });
  }, []);

  const addCategory = async () => {
    if (!form.code.trim()) { setErr(t('wizard.missingCode')); return; }
    const code = form.code.trim().toUpperCase();
    if (categories.some((c) => c.code === code)) { setErr(t('wizard.duplicateCode')); return; }
    setBusy(true);
    setErr('');
    try {
      await api('/api/domain/categories', {
        method: 'POST',
        body: {
          code,
          nameEn: form.nameEn || code,
          nameAr: form.nameAr || '',
          descriptionEn: form.descriptionEn,
          descriptionAr: form.descriptionAr,
          kind: form.kind,
          hasTable: form.hasTable,
          hasChecklist: form.hasChecklist,
          forks: form.forks.map((f) => ({ code: f.code })),
        },
      });
      setCategories([...categories, { ...form, code, saved: true }]);
      setShowForm(false);
      setForm({ code: '', nameEn: '', nameAr: '', descriptionEn: '', descriptionAr: '', kind: 'request', hasTable: false, hasChecklist: true, forks: [] });
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const deleteCategory = async (code: string) => {
    setBusy(true);
    try {
      await api(`/api/domain/categories/${code}`, { method: 'DELETE' });
      setCategories(categories.filter((c) => c.code !== code));
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const addFork = (catIdx: number) => {
    setCategories(categories.map((c, i) => 
      i === catIdx ? { ...c, forks: [...c.forks, { code: '', name: '' }] } : c
    ));
  };

  const setFork = (catIdx: number, forkIdx: number, code: string) => {
    setCategories(categories.map((c, i) =>
      i === catIdx ? { ...c, forks: c.forks.map((f, j) => j === forkIdx ? { ...f, code: code.toUpperCase(), name: code.toUpperCase() } : f) } : c
    ));
  };

  const removeFork = (catIdx: number, forkIdx: number) => {
    setCategories(categories.map((c, i) =>
      i === catIdx ? { ...c, forks: c.forks.filter((_, j) => j !== forkIdx) } : c
    ));
  };

  const inputCls = 'h-8 w-full rounded-md border border-border bg-card px-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">{t('wizard.categoriesHint')}</p>

      {err && <div className="text-sm text-destructive">{err}</div>}

      {categories.map((c, ci) => (
        <div key={c.code} className="rounded-lg border border-border/60 bg-card p-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="font-mono font-bold">{c.code}</span>
              {c.kind === 'ncr' && <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">{t('wizard.defaultNcr')}</span>}
              {c.kind === 'order_log' && <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{t('wizard.logOnly')}</span>}
              {c.forks.length > 0 && <span className="text-xs text-muted-foreground">{c.forks.map((f) => f.code).join(', ')}</span>}
            </div>
            {c.kind !== 'ncr' && (
              <Button size="icon" variant="ghost" className="text-destructive size-7" onClick={() => void deleteCategory(c.code)} disabled={busy}>
                <Trash2 className="size-3.5" />
              </Button>
            )}
          </div>
          {/* Forks sub-section */}
          <div className="mt-2 flex flex-wrap gap-1.5">
            {c.forks.map((f, fi) => (
              <div key={fi} className="flex items-center gap-1 rounded-md border border-border/50 bg-muted/30 px-1.5 py-0.5">
                <Input className="w-20 h-6 text-xs" value={f.code} onChange={(e) => setFork(ci, fi, e.target.value)} placeholder="CODE" />
                <button onClick={() => removeFork(ci, fi)} className="text-destructive/70 hover:text-destructive"><Trash2 className="size-3" /></button>
              </div>
            ))}
            <Button size="sm" variant="ghost" className="h-6 text-xs gap-1" onClick={() => addFork(ci)}>
              <Plus className="size-3" />{t('wizard.addFork')}
            </Button>
          </div>
        </div>
      ))}

      {showForm ? (
        <div className="rounded-lg border border-border/60 bg-card p-3 flex flex-col gap-2">
          <div className="grid grid-cols-2 gap-2">
            <div><Label className="text-xs">{t('wizard.categoryCode')}</Label><Input className="h-8" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} /></div>
            <div><Label className="text-xs">{t('wizard.categoryNameEn')}</Label><Input className="h-8" value={form.nameEn} onChange={(e) => setForm({ ...form, nameEn: e.target.value })} /></div>
            <div><Label className="text-xs">{t('wizard.categoryNameAr')}</Label><Input className="h-8" value={form.nameAr} onChange={(e) => setForm({ ...form, nameAr: e.target.value })} /></div>
            <div><Label className="text-xs">{t('wizard.categoryKind')}</Label>
              <select className={`${inputCls} h-8`} value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as 'request' | 'ncr' | 'order_log' })}>
                <option value="request">{t('wizard.kindRequest')}</option>
                <option value="ncr">{t('wizard.kindNcr')}</option>
                <option value="order_log">{t('wizard.kindOrderLog')}</option>
              </select>
            </div>
            <div className="col-span-2"><Label className="text-xs">{t('wizard.categoryDesc')}</Label><Input className="h-8" value={form.descriptionEn} onChange={(e) => setForm({ ...form, descriptionEn: e.target.value })} /></div>
          </div>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-1.5 text-sm cursor-pointer">
              <input type="checkbox" checked={form.hasTable} onChange={(e) => setForm({ ...form, hasTable: e.target.checked })} />
              {t('wizard.categoryHasTable')}
            </label>
            <label className="flex items-center gap-1.5 text-sm cursor-pointer">
              <input type="checkbox" checked={form.hasChecklist} onChange={(e) => setForm({ ...form, hasChecklist: e.target.checked })} />
              {t('wizard.categoryHasChecklist')}
            </label>
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => void addCategory()} disabled={busy} className="gap-1">
              {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
              {t('wizard.addCategory')}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setShowForm(false)}>{t('wizard.back')}</Button>
          </div>
        </div>
      ) : (
        <Button size="sm" variant="outline" className="gap-1 self-start" onClick={() => setShowForm(true)}>
          <Plus className="size-3.5" />
          {t('wizard.addCategory')}
        </Button>
      )}

      <div className="flex items-center gap-2 pt-2">
        <Button variant="outline" size="sm" onClick={onBack}><ChevronLeft className="size-3.5" />{t('wizard.back')}</Button>
        <Button className="gap-1" onClick={() => { onCategories(categories.map((c) => ({ code: c.code, forks: c.forks }))); onComplete(); }} disabled={categories.length === 0}>
          {t('wizard.next')}<ChevronRight className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}

/** Step 4: Forks Summary */
function ForksSummary({
  categories,
  onBack,
  onFinish,
}: {
  categories: Array<{ code: string; forks: Array<{ code: string }> }>;
  onBack: () => void;
  onFinish: () => void;
}): ReactNode {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">{t('wizard.forksHint')}</p>
      <div className="flex flex-col gap-2">
        {categories.map((c) => (
          <div key={c.code} className="flex items-center gap-2 rounded-lg border border-border/60 bg-card px-3 py-2 text-sm">
            <span className="font-mono font-bold min-w-20">{c.code}</span>
            {c.forks.length > 0 ? (
              <span className="text-muted-foreground">{c.forks.map((f) => f.code).join(', ')}</span>
            ) : (
              <span className="text-xs text-muted-foreground italic">No forks</span>
            )}
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2 pt-2">
        <Button variant="outline" size="sm" onClick={onBack}><ChevronLeft className="size-3.5" />{t('wizard.back')}</Button>
        <Button className="gap-1" onClick={() => {
          setBusy(true);
          api('/api/setup/complete', { method: 'POST' }).then(() => onFinish()).catch(() => onFinish()).finally(() => setBusy(false));
        }} disabled={busy}>
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
          {t('wizard.finish')}
        </Button>
      </div>
    </div>
  );
}

/** Step 5: Select Xlsx per category (ticket 108) — upload, versioned, inspect. */
function SelectXlsxStep({
  onComplete,
  onBack,
}: {
  onComplete: () => void;
  onBack: () => void;
}): ReactNode {
  const { t } = useI18n();
  const [cats, setCats] = useState<Array<{ category: string; versions: number; latestVersion: number | null; latestFile: string | null }>>([]);
  const [inspected, setInspected] = useState<Record<string, { sheets: number; hasTable: boolean }>>({});
  const [uploading, setUploading] = useState<string | null>(null);
  const [err, setErr] = useState('');

  const load = () => {
    api<Array<{ category: string; versions: number; latestVersion: number | null; latestFile: string | null }>>('/api/templates')
      .then(async (rows) => {
        const meta = await api<{ categories: Array<{ code: string; kind: string }> }>('/api/meta').catch(() => ({ categories: [] }));
        const kindByCode = new Map(meta.categories.map((c) => [c.code, c.kind]));
        setCats(rows.filter((r) => {
          const kind = kindByCode.get(r.category);
          return kind !== 'ncr' && kind !== 'order_log';
        }));
        rows.forEach((r) => {
          if (r.latestVersion && r.latestFile) {
            void api<{ sheets: Array<{ name: string }>; hasTable: boolean }>(`/api/templates/${encodeURIComponent(r.category)}/inspect`).then((ins) => {
              setInspected((prev) => ({ ...prev, [r.category]: { sheets: ins.sheets?.length ?? 0, hasTable: ins.hasTable } }));
            }).catch(() => undefined);
          }
        });
      })
      .catch(() => setCats([]));
  };

  useEffect(() => { load(); }, []);

  const upload = async (category: string) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.xlsx,.xlsm,.xls';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      setUploading(category);
      setErr('');
      try {
        const buf = new Uint8Array(await file.arrayBuffer());
        let bin = '';
        const CHUNK = 0x8000;
        for (let i = 0; i < buf.length; i += CHUNK) bin += String.fromCharCode(...buf.subarray(i, i + CHUNK));
        const base64 = btoa(bin);
        await api('/api/templates/upload', {
          method: 'POST',
          body: { category, filename: file.name, contentBase64: base64 },
        });
        load();
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
      } finally {
        setUploading(null);
      }
    };
    input.click();
  };

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">{t('wizard.selectXlsxHint')}</p>
      {err && <div className="text-sm text-destructive">{err}</div>}
      <div className="flex flex-col gap-2">
        {cats.length === 0 && <div className="text-sm text-muted-foreground">—</div>}
        {cats.map((c) => (
          <div key={c.category} className="flex flex-wrap items-center gap-2 rounded-lg border border-border/60 bg-card p-2.5">
            <span className="font-mono text-sm font-bold min-w-16">{c.category}</span>
            {c.latestFile ? (
              <span className="flex-1 text-xs text-muted-foreground">
                <span className="flex items-center gap-1"><FileText className="size-3" />{c.latestFile} · v{c.latestVersion}</span>
                {inspected[c.category] && (
                  <span className="text-[10px]">
                    · {t('wizard.sheetsDetected').replace('{n}', String(inspected[c.category].sheets))}
                    {inspected[c.category].hasTable && ` · ${t('wizard.tableDetected')}`}
                  </span>
                )}
              </span>
            ) : (
              <span className="flex-1 text-xs text-muted-foreground italic">{t('wizard.noTemplate')}</span>
            )}
            <Button size="sm" variant="outline" className="gap-1" onClick={() => void upload(c.category)} disabled={uploading === c.category}>
              {uploading === c.category ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />}
              {t('wizard.uploadTemplate')}
            </Button>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2 pt-2">
        <Button variant="outline" size="sm" onClick={onBack}><ChevronLeft className="size-3.5" />{t('wizard.back')}</Button>
        <Button className="gap-1 ms-auto" onClick={onComplete} disabled={cats.length === 0}>
          {t('wizard.next')}<ChevronRight className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}

/** Step 6: Template Map — pick a category with an uploaded template and open the
 *  shared TemplateMapEditor to bind cells to record fields. The form-list assign
 *  mapper is no-programming — click the preview grid to assign cells. */
function TemplateMapStep({
  onComplete,
  onBack,
}: {
  onComplete: () => void;
  onBack: () => void;
}): ReactNode {
  const { t } = useI18n();
  const [cats, setCats] = useState<Array<{ category: string; latestVersion: number | null; latestFile: string | null }>>([]);
  const [mappingCat, setMappingCat] = useState<string | null>(null);

  const load = () => {
    api<Array<{ category: string; versions: number; latestVersion: number | null; latestFile: string | null }>>('/api/templates')
      .then(async (rows) => {
        const meta = await api<{ categories: Array<{ code: string; kind: string }> }>('/api/meta').catch(() => ({ categories: [] }));
        const kindByCode = new Map(meta.categories.map((c) => [c.code, c.kind]));
        setCats(
          rows
            .filter((r) => {
              const kind = kindByCode.get(r.category);
              return kind !== 'ncr' && kind !== 'order_log' && r.latestFile != null;
            })
            .map((r) => ({ category: r.category, latestVersion: r.latestVersion, latestFile: r.latestFile })),
        );
      })
      .catch(() => setCats([]));
  };

  useEffect(() => { load(); }, []);

  if (mappingCat) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <Label className="font-mono text-sm font-bold">{mappingCat}</Label>
          <Button size="sm" variant="outline" onClick={() => setMappingCat(null)}>{t('wizard.back')}</Button>
        </div>
        <TemplateMapEditor category={mappingCat} onSaved={load} />
        <div className="flex items-center gap-2 pt-2">
          <Button variant="outline" size="sm" onClick={() => setMappingCat(null)}><ChevronLeft className="size-3.5" />{t('wizard.back')}</Button>
          <Button className="gap-1 ms-auto" onClick={onComplete}>
            {t('wizard.next')}<ChevronRight className="size-3.5" />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">{t('wizard.mapStepHint')}</p>
      <div className="flex flex-col gap-2">
        {cats.length === 0 && <div className="text-sm text-muted-foreground">{t('wizard.noTemplate')}</div>}
        {cats.map((c) => (
          <div key={c.category} className="flex flex-wrap items-center gap-2 rounded-lg border border-border/60 bg-card p-2.5">
            <span className="font-mono text-sm font-bold min-w-16">{c.category}</span>
            <span className="flex-1 text-xs text-muted-foreground">
              <span className="flex items-center gap-1"><FileText className="size-3" />{c.latestFile} · v{c.latestVersion}</span>
            </span>
            <Button size="sm" className="gap-1" onClick={() => setMappingCat(c.category)}>
              {t('wizard.mapCategory')}
            </Button>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2 pt-2">
        <Button variant="outline" size="sm" onClick={onBack}><ChevronLeft className="size-3.5" />{t('wizard.back')}</Button>
        <Button className="gap-1 ms-auto" onClick={onComplete}>
          {t('wizard.next')}<ChevronRight className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}

/** Step 7: Scans folder (ticket 109) — server folder picker, Xerox status display only. */
function ScansStep({
  onComplete,
  onBack,
}: {
  onComplete: () => void;
  onBack: () => void;
}): ReactNode {
  const { t } = useI18n();
  const [dir, setDir] = useState('');
  const [xeroxInstalled, setXeroxInstalled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    api<{ dir: string; xeroxInstalled: boolean }>('/api/scans/watch-folder')
      .then((r) => { setDir(r.dir); setXeroxInstalled(r.xeroxInstalled); })
      .catch(() => undefined);
  }, []);

  const pick = async () => {
    setBusy(true);
    setErr('');
    try {
      const res = await api<{ ok: boolean; cancelled?: boolean; dir?: string; current: string }>('/api/scans/pick-folder', { method: 'POST' });
      if (res.ok && res.dir) setDir(res.dir);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">{t('wizard.scansHint')}</p>
      {err && <div className="text-sm text-destructive">{err}</div>}
      <div className="rounded-lg border border-border/60 bg-card p-3 flex flex-col gap-2">
        <Label className="text-xs">{t('wizard.currentFolder')}</Label>
        <div className="flex items-center gap-2">
          <code className="flex-1 truncate rounded-md bg-muted/40 px-2 py-1.5 text-xs">{dir || '…'}</code>
          <Button size="sm" variant="outline" className="gap-1" onClick={() => void pick()} disabled={busy}>
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : <FolderOpen className="size-3.5" />}
            {t('wizard.pickFolder')}
          </Button>
        </div>
        <div className="flex items-center gap-2 pt-1 text-xs text-muted-foreground">
          <span className="font-semibold">{t('wizard.xeroxStatus')}:</span>
          <span className={xeroxInstalled ? 'text-success' : 'text-warning'}>
            {xeroxInstalled ? t('wizard.xeroxInstalled') : t('wizard.xeroxMissing')}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-2 pt-2">
        <Button variant="outline" size="sm" onClick={onBack}><ChevronLeft className="size-3.5" />{t('wizard.back')}</Button>
        <Button className="gap-1 ms-auto" onClick={onComplete}>
          {t('wizard.next')}<ChevronRight className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}

/** Step 8: Users (existing method) + Future Concrete card (ticket 109). */
function UsersStep({
  onComplete,
  onBack,
}: {
  onComplete: () => void;
  onBack: () => void;
}): ReactNode {
  const { t } = useI18n();
  const [users, setUsers] = useState<Array<{ username: string; name: string; role: string }>>([]);
  const [roles, setRoles] = useState<Array<{ name: string; nameAr: string }>>([]);
  const [username, setUsername] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    api<Array<{ name: string; nameAr: string }>>('/api/ref/roles').then(setRoles).catch(() => undefined);
    api<Array<{ username: string }>>('/api/auth/users?all=1').then((r) => {
      setUsers(r.map((u) => ({ username: u.username, name: '', role: '' })));
    }).catch(() => undefined);
  }, []);

  const addUser = async () => {
    if (!username.trim() || !name.trim()) return;
    setBusy(true);
    setErr('');
    try {
      await api('/api/auth/users', {
        method: 'POST',
        body: { username: username.trim(), firstName: name.trim(), secondName: '', jobRole: role },
      });
      setUsers((prev) => [...prev, { username: username.trim(), name: name.trim(), role }]);
      setUsername(''); setName(''); setRole('');
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const inputCls = 'h-8 w-full rounded-md border border-border bg-card px-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">{t('wizard.usersHint')}</p>
      {err && <div className="text-sm text-destructive">{err}</div>}

      <div className="flex flex-wrap items-end gap-2 rounded-lg border border-border/60 bg-muted/30 p-3">
        <div><Label className="text-xs">{t('wizard.userUsername')}</Label><Input className={`${inputCls} w-36`} value={username} onChange={(e) => setUsername(e.target.value)} /></div>
        <div><Label className="text-xs">{t('wizard.userName')}</Label><Input className={`${inputCls} w-44`} value={name} onChange={(e) => setName(e.target.value)} /></div>
        <div><Label className="text-xs">{t('wizard.userRole')}</Label>
          <select className={`${inputCls} w-40`} value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="">—</option>
            {roles.map((r) => <option key={r.name} value={r.name}>{r.name}</option>)}
          </select>
        </div>
        <Button size="sm" className="gap-1 h-8" onClick={() => void addUser()} disabled={busy}>
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
          {t('wizard.addUser')}
        </Button>
      </div>

      <div className="flex flex-col gap-1.5 max-h-44 overflow-y-auto">
        {users.length === 0 && <div className="text-sm text-muted-foreground">—</div>}
        {users.map((u) => (
          <div key={u.username} className="flex items-center gap-2 rounded-lg border border-border/60 bg-card px-2.5 py-1.5 text-sm">
            <span className="font-mono font-bold text-foreground">{u.username}</span>
            {u.name && <span className="text-muted-foreground">{u.name}</span>}
            {u.role && <span className="text-xs text-muted-foreground">· {u.role}</span>}
            <span className="ms-auto rounded bg-warning/15 px-1.5 py-0.5 text-[10px] font-medium text-warning">{t('wizard.userPending')}</span>
          </div>
        ))}
      </div>

      {/* Future Concrete card — not editable */}
      <div className="rounded-xl border border-dashed border-border/60 bg-muted/20 p-4">
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-warning/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-warning">{t('wizard.concreteSoon')}</span>
          <span className="text-sm font-semibold text-foreground">Concrete / Cement / Masonry</span>
        </div>
        <p className="mt-1.5 text-xs text-muted-foreground">{t('wizard.concreteHint')}</p>
      </div>

      <div className="flex items-center gap-2 pt-2">
        <Button variant="outline" size="sm" onClick={onBack}><ChevronLeft className="size-3.5" />{t('wizard.back')}</Button>
        <Button className="gap-1 ms-auto" onClick={onComplete}>
          {t('wizard.finish')}<Check className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}

/** Main setup wizard page */
export function SetupWizardPage(): ReactNode {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [customFields, setCustomFields] = useState<CustomField[]>([]);
  const [categories, setCategories] = useState<Array<{ code: string; forks: Array<{ code: string }> }>>([]);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const saveMetadata = async () => {
    setSaving(true);
    setErr('');
    try {
      await api('/api/settings/metadata', {
        method: 'POST',
        body: { customMetadata: customFields.filter((f) => f.key_en || f.key_ar) },
      });
      setStep(2);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  // Load existing metadata on mount
  useEffect(() => {
    api<{ custom_metadata?: CustomField[] }>('/api/settings/meta').then((res) => {
      if (res.custom_metadata) setCustomFields(res.custom_metadata);
    }).catch(() => undefined);
  }, []);

  const STEPS = [
    { n: 1, label: t('wizard.step1') },
    { n: 2, label: t('wizard.step2') },
    { n: 3, label: t('wizard.step3') },
    { n: 4, label: t('wizard.step4') },
    { n: 5, label: t('wizard.step5') },
    { n: 6, label: t('wizard.step6') },
    { n: 7, label: t('wizard.step7') },
    { n: 8, label: t('wizard.step8') },
  ];

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5 p-5">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold text-foreground">{t('wizard.title')}</h1>
        <p className="text-sm text-muted-foreground">{t('wizard.subtitle')}</p>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-2">
        {STEPS.map((s, i) => (
          <div key={s.n} className="flex items-center gap-2">
            {i > 0 && <span className="h-px w-6 bg-border/70" aria-hidden="true" />}
            <span className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
              step === s.n ? 'bg-primary text-primary-foreground shadow-sm' :
              step > s.n ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
            }`}>
              <span className="flex h-4 w-4 items-center justify-center rounded-full bg-white/20 text-[10px]">
                {step > s.n ? '✓' : s.n}
              </span>
              {s.label}
            </span>
          </div>
        ))}
      </div>

      {err && <div className="text-sm text-destructive">{err}</div>}

      <Card>
        <CardHeader><CardTitle className="text-base">{STEPS.find((s) => s.n === step)?.label}</CardTitle></CardHeader>
        <CardContent>
          {step === 1 && (
            <div className="flex flex-col gap-4">
              <MetadataStep customFields={customFields} setCustomFields={setCustomFields} />
              <div className="flex justify-end">
                <Button className="gap-1" onClick={() => void saveMetadata()} disabled={saving}>
                  {saving ? <Loader2 className="size-3.5 animate-spin" /> : null}
                  {t('wizard.next')}<ChevronRight className="size-3.5" />
                </Button>
              </div>
            </div>
          )}
          {step === 2 && <ZonesStep onComplete={() => setStep(3)} onBack={() => setStep(1)} />}
          {step === 3 && (
            <CategoriesStep
              onCategories={setCategories}
              onComplete={() => setStep(4)}
              onBack={() => setStep(2)}
            />
          )}
          {step === 4 && (
            <ForksSummary
              categories={categories}
              onBack={() => setStep(3)}
              onFinish={() => setStep(5)}
            />
          )}
          {step === 5 && (
            <SelectXlsxStep
              onComplete={() => setStep(6)}
              onBack={() => setStep(4)}
            />
          )}
          {step === 6 && (
            <TemplateMapStep
              onComplete={() => setStep(7)}
              onBack={() => setStep(5)}
            />
          )}
          {step === 7 && (
            <ScansStep
              onComplete={() => setStep(8)}
              onBack={() => setStep(6)}
            />
          )}
          {step === 8 && (
            <UsersStep
              onComplete={async () => {
                try {
                  await api('/api/setup/complete', { method: 'POST' });
                } catch { /* zone latch already passed */ }
                navigate('/');
                window.location.reload();
              }}
              onBack={() => setStep(7)}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}