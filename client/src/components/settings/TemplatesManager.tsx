import { useEffect, useState, type ReactNode } from 'react';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { TemplateMapEditor } from '@/components/TemplateMapEditor';
import {
  Upload, Loader2, FileText, Map as MapIcon, ChevronRight, ChevronDown,
  FolderOpen, Tag, AlertTriangle,
} from 'lucide-react';

interface DomainCat {
  code: string;
  nameEn: string;
  nameAr: string;
  kind: string; // request | ncr | order_log
  forksJson: string;
  hasChecklist: number;
  hasCycle: number;
  hasTemplate: number;
  hasTable: number;
}

interface TemplateInfo {
  category: string;
  versions: number;
  latestVersion: number | null;
  latestFile: string | null;
  sheets: string[];
  hasTable: boolean;
}

interface MappingRow {
  id: number;
  category: string;
  fork: string;
  versionNo: number;
  isActive: number;
}

interface ForkNode {
  code: string;
  versions: Array<{ id: number; versionNo: number; isActive: boolean }>;
}

interface CatNode {
  code: string;
  name: string;
  kind: string;
  forks: ForkNode[];
  latestVersion: number | null;
  latestFile: string | null;
  sheets: number;
  hasTable: boolean;
}

/** Settings → Templates tree (ticket 110 + redesign). DB-driven, no hardcoding.
 *  Root nodes = categories (from /api/domain/categories). Expanding shows the
 *  admin-configured forks. Actions live on the category node. SO (order_log) is
 *  greyed/no-template; NCR carries a kind badge. Mapping versions per fork. */
export function TemplatesManager(): ReactNode {
  const { t, lang } = useI18n();
  const [cats, setCats] = useState<CatNode[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [mappingCat, setMappingCat] = useState<string | null>(null);
  const [uploading, setUploading] = useState<string | null>(null);
  const [err, setErr] = useState('');

  const load = (): void => {
    // Structure: categories + forks from the DB domain registry (wizard source).
    api<DomainCat[]>('/api/domain/categories').then((domainCats) => {
      // Enrich with template status per category.
      api<TemplateInfo[]>('/api/templates').then((tmpl) => {
        const tmplByCat = new Map(tmpl.map((t) => [t.category, t]));
        // Enrich with per-fork mapping versions.
        api<MappingRow[]>('/api/mappers').then((mappers) => {
          const forkMap = new Map<string, ForkNode[]>();
          for (const m of mappers) {
            const list = forkMap.get(m.category) ?? [];
            let forkNode = list.find((f) => f.code === m.fork);
            if (!forkNode) {
              forkNode = { code: m.fork || '', versions: [] };
              list.push(forkNode);
            }
            forkNode.versions.push({ id: m.id, versionNo: m.versionNo, isActive: m.isActive === 1 });
            forkMap.set(m.category, list);
          }
          const buildNode = (c: DomainCat): CatNode => {
            const info = tmplByCat.get(c.code);
            let forks: string[] = [];
            try { forks = JSON.parse(c.forksJson) as string[]; } catch { forks = []; }
            const forkNodes = (forks.length ? forks : ['']).map((code) => {
              const found = (forkMap.get(c.code) ?? []).find((f) => f.code === code);
              return { code, versions: found?.versions ?? [] };
            });
            return {
              code: c.code,
              name: lang === 'ar' ? c.nameAr || c.nameEn : c.nameEn,
              kind: c.kind,
              forks: forkNodes,
              latestVersion: info?.latestVersion ?? null,
              latestFile: info?.latestFile ?? null,
              sheets: info?.sheets?.length ?? 0,
              hasTable: info?.hasTable ?? false,
            };
          };
          // SO is an order log (no template/forks) — greyed node; keep it last.
          const soCat = domainCats.find((c) => c.code === 'SO');
          const body = domainCats.filter((c) => c.code !== 'SO').map(buildNode);
          if (soCat) body.push(buildNode(soCat));
          setCats(body);
        }).catch(() => setCats([]));
      }).catch(() => setCats([]));
    }).catch(() => setCats([]));
  };

  useEffect(() => { load(); }, []);

  const toggle = (code: string): void => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code); else next.add(code);
      return next;
    });
  };

  const upload = async (code: string): Promise<void> => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.xlsx,.xlsm,.xls';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      setUploading(code);
      setErr('');
      try {
        const buf = new Uint8Array(await file.arrayBuffer());
        let bin = '';
        const CHUNK = 0x8000;
        for (let i = 0; i < buf.length; i += CHUNK) bin += String.fromCharCode(...buf.subarray(i, i + CHUNK));
        const base64 = btoa(bin);
        await api('/api/templates/upload', { method: 'POST', body: { category: code, filename: file.name, contentBase64: base64 } });
        load();
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
      } finally {
        setUploading(null);
      }
    };
    input.click();
  };

  const activateVersion = async (id: number, category: string): Promise<void> => {
    try {
      await api('/api/mappers/publish', {
        method: 'POST',
        body: { category, mapping: { activateId: id } },
      });
      load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  };

  const kindBadge = (kind: string): ReactNode | null => {
    if (kind === 'ncr') {
      return (
        <span className="inline-flex items-center gap-1 rounded bg-warning/15 px-1.5 py-0.5 text-[10px] font-bold uppercase text-warning">
          <AlertTriangle className="size-2.5" />
          {t('wizard.kindNcr')}
        </span>
      );
    }
    if (kind === 'order_log') {
      return (
        <span className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[10px] font-bold uppercase text-muted-foreground">
          <Tag className="size-2.5" />
          {t('wizard.kindOrderLog')}
        </span>
      );
    }
    return null;
  };

  if (mappingCat) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <Label className="font-mono text-sm font-bold">{mappingCat}</Label>
          <Button size="sm" variant="outline" onClick={() => setMappingCat(null)}>{t('wizard.back')}</Button>
        </div>
        <TemplateMapEditor category={mappingCat} onSaved={() => load()} />
        <div className="flex justify-end pt-2">
          <Button variant="outline" size="sm" onClick={() => setMappingCat(null)}>{t('wizard.back')}</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">{t('settings.templatesHint')}</p>
      {err && <div className="text-sm text-destructive">{err}</div>}
      <div className="flex flex-col gap-2">
        {cats.length === 0 && <div className="text-sm text-muted-foreground">—</div>}
        {cats.map((c) => {
          const isLog = c.kind === 'order_log';
          const isOpen = expanded.has(c.code);
          return (
            <div key={c.code} className="overflow-hidden rounded-lg border border-border/60 bg-card">
              {/* Category row */}
              <div className={`flex flex-wrap items-center gap-2 p-2.5 ${isLog ? 'opacity-60' : ''}`}>
                <button
                  type="button"
                  onClick={() => toggle(c.code)}
                  className="flex items-center gap-1 text-muted-foreground transition-colors hover:text-foreground"
                  aria-label={isOpen ? 'Collapse' : 'Expand'}
                  disabled={c.forks.length === 0}
                >
                  {isOpen ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                </button>
                <span className="font-mono text-sm font-bold min-w-16">{c.code}</span>
                {kindBadge(c.kind)}
                <span className="text-sm text-muted-foreground">{c.name}</span>
                <span className="flex-1" />
                <span className="max-w-[40%] truncate text-xs text-muted-foreground">
                  {c.latestFile ? (
                    <>
                      <span className="inline-flex items-center gap-1"><FileText className="size-3" />{c.latestFile} · v{c.latestVersion}</span>
                      <span className="text-[10px]">
                        · {t('wizard.sheetsDetected').replace('{n}', String(c.sheets))}
                        {c.hasTable && ` · ${t('wizard.tableDetected')}`}
                      </span>
                    </>
                  ) : (
                    <span className="italic text-muted-foreground/70">{isLog ? t('wizard.noTemplate') : t('wizard.noTemplate')}</span>
                  )}
                </span>
                {!isLog && (
                  <div className="flex gap-1.5">
                    <Button size="sm" variant="outline" className="gap-1" onClick={() => void upload(c.code)} disabled={uploading === c.code}>
                      {uploading === c.code ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />}
                      {t('wizard.uploadTemplate')}
                    </Button>
                    {c.latestFile && (
                      <Button size="sm" className="gap-1" onClick={() => setMappingCat(c.code)}>
                        <MapIcon className="size-3.5" />
                        {t('wizard.mapCategory')}
                      </Button>
                    )}
                  </div>
                )}
              </div>

              {/* Forks */}
              {c.forks.length > 0 && (
                <div className={`border-t border-border/40 bg-muted/20 px-4 py-1.5 ${isOpen ? '' : 'hidden'}`}>
                  {c.forks.length === 1 && c.forks[0].code === '' && c.forks[0].versions.length === 0 ? (
                    <div className="flex items-center gap-1.5 py-1 text-xs text-muted-foreground">
                      <FolderOpen className="size-3" />
                      {t('wizard.noTemplateForCat')}
                    </div>
                  ) : (
                    <div className="flex flex-col">
                      <div className="px-1 py-0.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                        <span className="inline-flex items-center gap-1"><FolderOpen className="size-3" />{t('field.fork')}s</span>
                      </div>
                      {c.forks.map((f) => {
                        const active = f.versions.find((v) => v.isActive);
                        const hasHistory = f.versions.length > 1;
                        return (
                          <div key={f.code || '__none'} className="flex flex-wrap items-center gap-2 border-b border-border/30 py-1.5 last:border-0">
                            <span className="font-mono text-xs font-semibold text-foreground">{f.code || '—'}</span>
                            <span className="flex-1" />
                            {f.versions.length === 0 ? (
                              <span className="text-[11px] italic text-muted-foreground">{t('wizard.noTemplate')}</span>
                            ) : (
                              <>
                                <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${active ? 'bg-success/15 text-success' : 'bg-muted text-muted-foreground'}`}>
                                  {active ? `v${active.versionNo} · ${t('settings.mappingActive')}` : `v${f.versions[f.versions.length - 1].versionNo}`}
                                </span>
                                {hasHistory && !active && (
                                  <Button size="sm" variant="outline" className="h-6 text-[10px]" onClick={() => void activateVersion(f.versions[f.versions.length - 1].id, c.code)}>
                                    {t('settings.mappingActivate')}
                                  </Button>
                                )}
                              </>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
