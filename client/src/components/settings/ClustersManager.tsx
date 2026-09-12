import { useEffect, useState, type ReactNode } from 'react';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2, Plus, Trash2, Building2, MapPin, ChevronDown, ChevronRight, Save } from 'lucide-react';

interface ClusterZone {
  code: string;
  name: string;
  nameAr: string;
  cluster: string;
}
interface ClusterFloor {
  name: string;
  nameAr: string;
  cluster: string;
}
interface Cluster {
  code: string;
  name: string;
  project_name: string;
  project_name_ar: string;
  working_area: string;
  consultant: string;
  owner: string;
  owner_delegate: string;
  logo_ext: string;
  custom_metadata: unknown[];
  is_default: number;
  zones: ClusterZone[];
  floors: ClusterFloor[];
  recordCount: number;
}

interface Draft {
  name: string;
}

/** Settings -> Clusters (ticket 131): clusters are projects. Each cluster owns
 *  its project metadata and a tree of zones + floors. */
export function ClustersManager(): ReactNode {
  const { t } = useI18n();
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [newOpen, setNewOpen] = useState(false);
  const [newCode, setNewCode] = useState('');
  const [newName, setNewName] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState('');

  const load = (): void => {
    api<{ clusters: Cluster[] }>('/api/clusters')
      .then((r) => {
        setClusters(r.clusters ?? []);
        setErr('');
      })
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  };

  useEffect(() => {
    load();
  }, []);

  const draftOf = (c: Cluster): Draft => ({
    name: c.name,
  });

  const setDraft = (code: string, patch: Partial<Draft>): void => {
    setDrafts((prev) => ({ ...prev, [code]: { ...(prev[code] ?? {}), ...patch } }));
  };

  const ensureDraft = (code: string): void => {
    setDrafts((prev) => (prev[code] ? prev : { ...prev, [code]: draftOf(clusters.find((c) => c.code === code)!) }));
  };

  const toggle = (code: string): void => {
    if (!expanded.has(code)) ensureDraft(code);
    setExpanded((prev) => {
      const n = new Set(prev);
      if (n.has(code)) n.delete(code);
      else n.add(code);
      return n;
    });
  };

  const run = async (key: string, fn: () => Promise<void>): Promise<void> => {
    setBusy(key);
    setErr('');
    try {
      await fn();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy('');
    }
  };

  const saveMeta = (code: string) =>
    run(`save-${code}`, async () => {
      await api(`/api/clusters/${code}`, { method: 'PATCH', body: drafts[code] });
      load();
    });

  const addCluster = () =>
    run('add', async () => {
      await api('/api/clusters', {
        method: 'POST',
        body: { code: newCode.trim(), name: newName.trim() },
      });
      setNewOpen(false);
      setNewCode('');
      setNewName('');
      load();
    });

  const delCluster = (code: string) =>
    run(`del-${code}`, async () => {
      await api(`/api/clusters/${code}`, { method: 'DELETE' });
      load();
    });

  const addZone = (code: string, zcode: string, zname: string) =>
    run(`zz-${code}`, async () => {
      await api(`/api/clusters/${code}/zones`, { method: 'POST', body: { code: zcode, name: zname } });
      load();
    });

  const detachZone = (code: string, zcode: string) =>
    run(`z-${code}-${zcode}`, async () => {
      await api(`/api/clusters/${code}/zones/${zcode}`, { method: 'DELETE' });
      load();
    });

  const addFloor = (code: string, fname: string, far: string) =>
    run(`ff-${code}`, async () => {
      await api(`/api/clusters/${code}/floors`, { method: 'POST', body: { name: fname, nameAr: far } });
      load();
    });

  const detachFloor = (code: string, name: string) =>
    run(`f-${code}-${name}`, async () => {
      await api(`/api/clusters/${code}/floors/${name}`, { method: 'DELETE' });
      load();
    });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">{t('settings.clustersHint')}</p>
        <Button size="sm" onClick={() => setNewOpen((v) => !v)} className="gap-1.5">
          <Plus className="size-4" />
          {t('settings.addCluster')}
        </Button>
      </div>

      {err && <div className="text-sm text-destructive">{err}</div>}

      {newOpen && (
        <Card>
          <CardContent className="p-4">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div>
                <Label>{t('field.code')}</Label>
                <Input value={newCode} onChange={(e) => setNewCode(e.target.value)} placeholder="CL13" />
              </div>
              <div>
                <Label>{t('settings.clusterName')}</Label>
                <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Cluster 13" />
              </div>
            </div>
            <div className="mt-3 flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setNewOpen(false)}>
                {t('form.cancel')}
              </Button>
              <Button size="sm" onClick={addCluster} disabled={busy === 'add' || !newCode.trim()} className="gap-1.5">
                {busy === 'add' ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
                {t('settings.addCluster')}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {clusters.map((c) => {
        const open = expanded.has(c.code);
        const d = drafts[c.code] ?? draftOf(c);
        const busyKey = busy === `save-${c.code}` || busy === `del-${c.code}`;
        return (
          <Card key={c.code}>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => toggle(c.code)}
                  className="flex min-w-0 flex-1 items-center gap-2 text-start"
                >
                  {open ? <ChevronDown className="size-4 shrink-0 text-muted-foreground" /> : <ChevronRight className="size-4 shrink-0 text-muted-foreground" />}
                  <Building2 className="size-4 shrink-0 text-primary" />
                  <span className="font-mono text-sm font-bold">{c.code}</span>
                  <span className="truncate text-sm text-foreground">
                    {c.project_name || c.name || '—'}
                    {c.is_default ? <span className="ms-2 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold text-primary">{t('settings.defaultCluster')}</span> : null}
                  </span>
                </button>
                <span className="text-xs text-muted-foreground">
                  {c.zones.length} {t('settings.zones').toLowerCase()} · {c.floors.length} {t('settings.floors').toLowerCase()} · {c.recordCount} {t('settings.recordsInCluster')}
                </span>
                {!c.is_default && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    onClick={() => delCluster(c.code)}
                    disabled={busyKey}
                    title={t('settings.deleteCluster')}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                )}
              </div>

              {open && (
                <div className="mt-4 flex flex-col gap-4">
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <div>
                      <Label>{t('settings.clusterName')}</Label>
                      <Input value={d.name} onChange={(e) => setDraft(c.code, { name: e.target.value })} />
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <Button size="sm" onClick={() => saveMeta(c.code)} disabled={busy === `save-${c.code}`} className="gap-1.5">
                      {busy === `save-${c.code}` ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                      {t('form.save')}
                    </Button>
                  </div>
                  <ZoneFloorTree c={c} busy={busy} addZone={addZone} detachZone={detachZone} addFloor={addFloor} detachFloor={detachFloor} />
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}

      {clusters.length === 0 && !err && (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">{t('settings.noClusters')}</CardContent>
        </Card>
      )}
    </div>
  );
}

/** Per-cluster zones + floors tree with add/detach. */
function ZoneFloorTree(props: {
  c: Cluster;
  busy: string;
  addZone: (code: string, zcode: string, zname: string) => void;
  detachZone: (code: string, zcode: string) => void;
  addFloor: (code: string, fname: string, far: string) => void;
  detachFloor: (code: string, name: string) => void;
}): ReactNode {
  const { t } = useI18n();
  const { c, busy } = props;
  const [zoneCode, setZoneCode] = useState('');
  const [zoneName, setZoneName] = useState('');
  const [floorName, setFloorName] = useState('');
  const [floorAr, setFloorAr] = useState('');

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <div className="rounded-xl border border-border/70 p-3">
        <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
          <MapPin className="size-4 text-primary" />
          {t('settings.zones')} <span className="text-muted-foreground">({c.zones.length})</span>
        </div>
        <div className="flex max-h-40 flex-col gap-1 overflow-y-auto">
          {c.zones.length === 0 && <div className="text-xs text-muted-foreground">{t('settings.noZones')}</div>}
          {c.zones.map((z) => (
            <div key={z.code} className="flex items-center justify-between gap-2 rounded-md bg-muted/40 px-2 py-1 text-xs">
              <span className="font-mono font-semibold">{z.code}</span>
              <span className="min-w-0 flex-1 truncate text-muted-foreground">{z.name}</span>
              <button type="button" className="text-destructive hover:text-destructive" onClick={() => props.detachZone(c.code, z.code)}>
                <Trash2 className="size-3.5" />
              </button>
            </div>
          ))}
        </div>
        <div className="mt-2 flex gap-2">
          <Input className="h-8 text-xs" placeholder={t('field.code')} value={zoneCode} onChange={(e) => setZoneCode(e.target.value)} />
          <Input className="h-8 text-xs" placeholder={t('settings.zoneName')} value={zoneName} onChange={(e) => setZoneName(e.target.value)} />
          <Button size="sm" className="shrink-0" onClick={() => props.addZone(c.code, zoneCode.trim(), zoneName.trim())} disabled={!zoneCode.trim() || busy === `zz-${c.code}`}>
            <Plus className="size-4" />
          </Button>
        </div>
      </div>

      <div className="rounded-xl border border-border/70 p-3">
        <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
          <Building2 className="size-4 text-primary" />
          {t('settings.floors')} <span className="text-muted-foreground">({c.floors.length})</span>
        </div>
        <div className="flex max-h-40 flex-col gap-1 overflow-y-auto">
          {c.floors.length === 0 && <div className="text-xs text-muted-foreground">{t('settings.noFloors')}</div>}
          {c.floors.map((f) => (
            <div key={f.name} className="flex items-center justify-between gap-2 rounded-md bg-muted/40 px-2 py-1 text-xs">
              <span className="font-semibold">{f.name}</span>
              <span className="min-w-0 flex-1 truncate text-muted-foreground">{f.nameAr}</span>
              <button type="button" className="text-destructive hover:text-destructive" onClick={() => props.detachFloor(c.code, f.name)}>
                <Trash2 className="size-3.5" />
              </button>
            </div>
          ))}
        </div>
        <div className="mt-2 flex gap-2">
          <Input className="h-8 text-xs" placeholder={t('settings.floorName')} value={floorName} onChange={(e) => setFloorName(e.target.value)} />
          <Input className="h-8 text-xs" placeholder={t('settings.floorAr')} value={floorAr} onChange={(e) => setFloorAr(e.target.value)} />
          <Button size="sm" className="shrink-0" onClick={() => props.addFloor(c.code, floorName.trim(), floorAr.trim())} disabled={!floorName.trim() || busy === `ff-${c.code}`}>
            <Plus className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
