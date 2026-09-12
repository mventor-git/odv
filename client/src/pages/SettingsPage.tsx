import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { useAuth } from '@/lib/auth';
import type { Meta } from '@/lib/types';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { RefManagerCard } from '@/components/RefManagerCard';
import { SoundToggle } from '@/components/SoundToggle';
import { UsersManager } from '@/components/settings/UsersManager';
import { TemplatesManager } from '@/components/settings/TemplatesManager';
import { ScanWatchFolder } from '@/components/settings/ScanWatchFolder';
import { ClustersManager } from '@/components/settings/ClustersManager';
import {
  Clock3,
  Contact,
  DatabaseBackup,
  FileSpreadsheet,
  HardHat,
  Image as ImageIcon,
  Layers,
  Loader2,
  Network,
  Save,
  ScanLine,
  UserPlus,
  Users,
  Volume2,
} from 'lucide-react';

export const DEFAULT_CATEGORY_KEY = 'odv_default_category';
export const DEFAULT_REQUEST_KEY = 'odv_default_request';

export interface DefaultRequest {
  category: string;
  fork: string;
}

export function getDefaultRequest(): DefaultRequest {
  try {
    const raw = localStorage.getItem(DEFAULT_REQUEST_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<DefaultRequest>;
      return { category: parsed.category ?? '', fork: parsed.fork ?? '' };
    }
  } catch {
    // fall through to legacy key
  }
  // Backward compat: the old setting stored a plain category string.
  return { category: localStorage.getItem(DEFAULT_CATEGORY_KEY) ?? '', fork: '' };
}

export function getDefaultCategory(): string {
  return getDefaultRequest().category;
}

interface CompanyForm {
  name: string;
  projectId: string;
  projectName: string;
  workingArea: string;
  consultant: string;
  owner: string;
  ownerDelegate: string;
}

type SettingsPageKey =
  | 'identity'
  | 'members'
  | 'accounts'
  | 'default'
  | 'display'
  | 'sounds'
  | 'roles'
  | 'clusters'
  | 'templates'
  | 'backups'
  | 'scans';

/** Monolith Settings (ticket 098) — one page, a sub-page for every section.
 *  The active sub-page lives in the URL (?page=…) so it survives refresh. */
export function SettingsPage(): ReactNode {
  const { t } = useI18n();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin' || user?.role === 'dev';
  const [params, setParams] = useSearchParams();
  const [meta, setMeta] = useState<Meta | null>(null);
  const [defValue, setDefValue] = useState(getDefaultRequest());
  const [saved, setSaved] = useState(false);
  const [clock24, setClock24] = useState(() => localStorage.getItem('odv_clock_24h') !== '0');
  const [company, setCompany] = useState<CompanyForm>({
    name: '',
    projectId: '',
    projectName: '',
    workingArea: 'Cluster 12',
    consultant: '',
    owner: '',
    ownerDelegate: '',
  });
  // Logos: company + consultant + owner (ticket 133).
  const [hasLogo, setHasLogo] = useState(false);
  const [logoPreview, setLogoPreview] = useState('');
  const [logoDataUrl, setLogoDataUrl] = useState('');
  const [hasConsultantLogo, setHasConsultantLogo] = useState(false);
  const [consLogoPreview, setConsLogoPreview] = useState('');
  const [consLogoDataUrl, setConsLogoDataUrl] = useState('');
  const [hasOwnerLogo, setHasOwnerLogo] = useState(false);
  const [ownerLogoPreview, setOwnerLogoPreview] = useState('');
  const [ownerLogoDataUrl, setOwnerLogoDataUrl] = useState('');
  // Working Area is a cluster list (ticket 133).
  const [clusters, setClusters] = useState<Array<{ code: string; name: string }>>([]);
  const [companyBusy, setCompanyBusy] = useState(false);
  const [companyMsg, setCompanyMsg] = useState('');
  const [companyErr, setCompanyErr] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const consFileRef = useRef<HTMLInputElement>(null);
  const ownerFileRef = useRef<HTMLInputElement>(null);

  const [backupInfo, setBackupInfo] = useState<{ date: string | null; count: number } | null>(null);
  const [backupBusy, setBackupBusy] = useState(false);
  const [backupMsg, setBackupMsg] = useState('');

  const loadBackup = useCallback((): void => {
    if (user?.role !== 'admin') return;
    api<{ date: string | null; count: number }>('/api/settings/backup')
      .then(setBackupInfo)
      .catch(() => undefined);
  }, [user?.role]);

  useEffect(() => {
    api<Meta>('/api/meta').then(setMeta).catch(() => undefined);
    api<CompanyForm & { hasLogo: boolean; hasConsultantLogo: boolean; hasOwnerLogo: boolean }>('/api/settings/company')
      .then((c) => {
        setCompany({
          name: c.name ?? '',
          projectId: c.projectId ?? '',
          projectName: c.projectName ?? '',
          workingArea: c.workingArea || 'Cluster 12',
          consultant: c.consultant ?? '',
          owner: c.owner ?? '',
          ownerDelegate: c.ownerDelegate ?? '',
        });
        setHasLogo(c.hasLogo === true);
        setHasConsultantLogo(c.hasConsultantLogo === true);
        setHasOwnerLogo(c.hasOwnerLogo === true);
      })
      .catch(() => undefined);
    api<{ clusters: Array<{ code: string; name: string }> }>('/api/clusters')
      .then((r) => setClusters(r.clusters ?? []))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    loadBackup();
  }, [loadBackup]);

  const onBackup = async (): Promise<void> => {
    setBackupBusy(true);
    setBackupMsg('');
    try {
      await api('/api/settings/backup', { method: 'POST' });
      soundSuccess();
      setBackupMsg(t('settings.backupDone'));
      loadBackup();
    } catch (err) {
      setBackupMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setBackupBusy(false);
    }
  };

  const defForks = useMemo(() => {
    const cat = meta?.categories.find((c) => c.code === defValue.category);
    return cat ? cat.forks : [];
  }, [meta, defValue.category]);

  const changeDefault = (next: DefaultRequest): void => {
    setDefValue(next);
    if (next.category) localStorage.setItem(DEFAULT_REQUEST_KEY, JSON.stringify(next));
    else localStorage.removeItem(DEFAULT_REQUEST_KEY);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  const changeDefaultCategory = (category: string): void => {
    const cat = meta?.categories.find((c) => c.code === category);
    const fork = cat?.forks.includes(defValue.fork) ? defValue.fork : '';
    changeDefault({ category, fork });
  };

  const onLogoFile = (
    files: FileList | null,
    which: 'company' | 'consultant' | 'owner',
  ): void => {
    const file = files?.[0];
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/svg+xml'].includes(file.type)) {
      setCompanyErr(t('settings.logoType'));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result ?? '');
      if (which === 'consultant') { setConsLogoDataUrl(dataUrl); setConsLogoPreview(dataUrl); }
      else if (which === 'owner') { setOwnerLogoDataUrl(dataUrl); setOwnerLogoPreview(dataUrl); }
      else { setLogoDataUrl(dataUrl); setLogoPreview(dataUrl); }
      setCompanyErr('');
    };
    reader.readAsDataURL(file);
  };

  const saveCompany = async (): Promise<void> => {
    setCompanyBusy(true);
    setCompanyErr('');
    setCompanyMsg('');
    try {
      await api('/api/settings/company', {
        method: 'POST',
        body: { ...company, logoDataUrl, consultantLogoDataUrl: consLogoDataUrl, ownerLogoDataUrl: ownerLogoDataUrl },
      });
      setHasLogo(true);
      setLogoDataUrl('');
      setHasConsultantLogo(true);
      setConsLogoDataUrl('');
      setHasOwnerLogo(true);
      setOwnerLogoDataUrl('');
      setCompanyMsg(t('settings.saved'));
      soundSuccess();
    } catch (err) {
      setCompanyErr(err instanceof Error ? err.message : String(err));
    } finally {
      setCompanyBusy(false);
    }
  };

  const soundSuccess = (): void => {
    // Smooth success chime (ticket 075) — lazy import keeps this page light.
    void import('@/lib/sound').then((m) => m.sound.success());
  };

  const setCompanyField = (key: keyof CompanyForm, value: string): void =>
    setCompany((prev) => ({ ...prev, [key]: value }));

  /** Sub-pages — admin-only entries appear only for admins. */
  const pages = useMemo<Array<{ key: SettingsPageKey; label: string; icon: ReactNode }>>(() => {
    const list: Array<{ key: SettingsPageKey; label: string; icon: ReactNode; adminOnly?: boolean }> = [
      { key: 'identity', label: t('settings.identityTitle'), icon: <HardHat className="size-4" /> },
      { key: 'members', label: t('settings.members'), icon: <Users className="size-4" />, adminOnly: true },
      { key: 'accounts', label: t('settings.accounts'), icon: <UserPlus className="size-4" />, adminOnly: true },
      { key: 'default', label: t('settings.defaultRequest'), icon: <Layers className="size-4" /> },
      { key: 'display', label: t('settings.display'), icon: <Clock3 className="size-4" /> },
      { key: 'sounds', label: t('settings.sounds'), icon: <Volume2 className="size-4" /> },
      { key: 'roles', label: t('settings.roles'), icon: <Contact className="size-4" /> },
      { key: 'clusters', label: t('settings.clusters'), icon: <Network className="size-4" />, adminOnly: true },
      { key: 'templates', label: t('settings.templates'), icon: <FileSpreadsheet className="size-4" />, adminOnly: true },
      { key: 'backups', label: t('settings.backup'), icon: <DatabaseBackup className="size-4" />, adminOnly: true },
      { key: 'scans', label: t('settings.scanWatch'), icon: <ScanLine className="size-4" />, adminOnly: true },
    ];
    return list.filter((p) => !p.adminOnly || isAdmin);
  }, [t, isAdmin]);

  const pageParam = params.get('page');
  const active: SettingsPageKey = pages.some((p) => p.key === pageParam)
    ? (pageParam as SettingsPageKey)
    : 'identity';

  const setPage = (key: SettingsPageKey): void => setParams({ page: key });

  /** Section shell — same visual language as the old collapsible sections. */
  const section = (icon: ReactNode, title: string, body: ReactNode): ReactNode => (
    <div className="glass-surface overflow-hidden rounded-2xl">
      <div className="flex items-center gap-3 px-5 py-4">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
          {icon}
        </span>
        <span className="text-sm font-semibold text-foreground">{title}</span>
      </div>
      <div className="border-t border-border/60 px-5 pb-5 pt-4">{body}</div>
    </div>
  );

  let content: ReactNode;
  switch (active) {
    case 'members':
      content = <UsersManager view="members" />;
      break;
    case 'accounts':
      content = <UsersManager view="accounts" />;
      break;
    case 'default':
      content = section(
        <Layers className="size-4" />,
        t('settings.defaultRequest'),
        <div className="flex flex-col gap-2">
          <Label>{t('field.category')}</Label>
          <Select value={defValue.category} onChange={(e) => changeDefaultCategory(e.target.value)}>
            <option value="">—</option>
            {meta?.categories.map((c) => (
              <option key={c.code} value={c.code}>
                {c.code} — {c.name}
              </option>
            ))}
          </Select>
          {defForks.length > 0 && (
            <>
              <Label>{t('settings.defaultFork')}</Label>
              <Select
                value={defValue.fork}
                onChange={(e) => changeDefault({ category: defValue.category, fork: e.target.value })}
              >
                <option value="">—</option>
                {defForks.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </Select>
            </>
          )}
          <p className="text-xs text-muted-foreground">
            {t('settings.defaultRequestHint')}
            {saved && <span className="ms-2 font-medium text-success">✓ {t('settings.saved')}</span>}
          </p>
        </div>,
      );
      break;
    case 'display':
      content = section(
        <Clock3 className="size-4" />,
        t('settings.display'),
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">{t('settings.displayHint')}</p>
          <div className="flex overflow-hidden rounded-md border border-border/70 text-xs font-semibold leading-none">
            <button
              type="button"
              onClick={() => { setClock24(false); localStorage.setItem('odv_clock_24h', '0'); window.dispatchEvent(new Event('odv:clock')); }}
              className={`px-3 py-1.5 transition-colors ${
                !clock24 ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent hover:text-foreground'
              }`}
            >
              {t('wall.hour12')}
            </button>
            <button
              type="button"
              onClick={() => { setClock24(true); localStorage.setItem('odv_clock_24h', '1'); window.dispatchEvent(new Event('odv:clock')); }}
              className={`px-3 py-1.5 transition-colors ${
                clock24 ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent hover:text-foreground'
              }`}
            >
              {t('wall.hour24')}
            </button>
          </div>
        </div>,
      );
      break;
    case 'sounds':
      content = section(
        <Volume2 className="size-4" />,
        t('settings.sounds'),
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">{t('settings.soundsHint')}</p>
          <SoundToggle />
        </div>,
      );
      break;
    case 'roles':
      content = section(
        <Contact className="size-4" />,
        t('settings.roles'),
        <>
          <p className="mb-3 text-xs text-muted-foreground">{t('settings.refHint')}</p>
          <RefManagerCard kind="roles" title={t('settings.roles')} t={t} />
        </>,
      );
      break;
    case 'clusters':
      content = section(
        <Network className="size-4" />,
        t('settings.clusters'),
        <ClustersManager />,
      );
      break;
    case 'templates':
      content = section(
        <FileSpreadsheet className="size-4" />,
        t('settings.templates'),
        <TemplatesManager />,
      );
      break;
    case 'scans':
      content = section(
        <ScanLine className="size-4" />,
        t('settings.scanWatch'),
        <ScanWatchFolder />,
      );
      break;
    case 'backups':
      content = section(
        <DatabaseBackup className="size-4" />,
        t('settings.backup'),
        <div className="flex flex-col gap-3">
          <p className="text-xs text-muted-foreground">{t('settings.backupHint')}</p>
          <div className="flex flex-wrap items-center gap-3">
            <Button size="sm" onClick={() => void onBackup()} disabled={backupBusy} className="gap-1.5">
              {backupBusy ? <Loader2 className="size-4 animate-spin" /> : <DatabaseBackup className="size-4" />}
              {backupBusy ? t('settings.backupRunning') : t('settings.backupNow')}
            </Button>
            <span className="text-xs text-muted-foreground">
              {t('settings.backupLast')}:{' '}
              <span className="font-medium text-foreground">
                {backupInfo?.date ?? t('settings.backupNone')}
              </span>
              {backupInfo && backupInfo.count > 0 && (
                <span className="ms-2">· {backupInfo.count} {t('settings.backupCount')}</span>
              )}
            </span>
          </div>
          {backupMsg && <span className="text-xs text-success">{backupMsg}</span>}
        </div>,
      );
      break;
    default:
      // Project Identity — fancy header (not the word "Company")
      content = (
        <div className="glass-surface overflow-hidden rounded-2xl">
          <div className="relative overflow-hidden bg-accent px-6 py-6 text-white">
            <div className="absolute -end-8 -top-10 h-36 w-36 rounded-full bg-white/10 blur-2xl" />
            <div className="absolute -bottom-12 start-1/3 h-32 w-32 rounded-full bg-white/10 blur-2xl" />
            <div className="relative flex items-center gap-4">
              <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/15 shadow-lg backdrop-blur-md">
                <HardHat className="size-7" />
              </span>
              <div>
                <div className="text-xl font-bold tracking-tight">{t('settings.identityTitle')}</div>
                <div className="text-sm text-white/80">{t('settings.identitySubtitle')}</div>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-4 p-6">
            {!isAdmin && (
              <p className="text-xs text-muted-foreground">{t('settings.adminOnly')}</p>
            )}

            {/* Logos — company + consultant + owner (ticket 133). 1:2 rectangle preview */}
            <div className="flex flex-wrap gap-6">
              {[
                {
                  kind: 'company' as const, label: t('settings.logoCompany'),
                  preview: logoPreview, has: hasLogo, src: '/api/settings/company/logo?kind=company',
                  ref: fileRef, dataUrl: logoDataUrl, onPick: (f: FileList | null) => onLogoFile(f, 'company'),
                },
                {
                  kind: 'consultant' as const, label: t('settings.logoConsultant'),
                  preview: consLogoPreview, has: hasConsultantLogo, src: '/api/settings/company/logo?kind=consultant',
                  ref: consFileRef, dataUrl: consLogoDataUrl, onPick: (f: FileList | null) => onLogoFile(f, 'consultant'),
                },
                {
                  kind: 'owner' as const, label: t('settings.logoOwner'),
                  preview: ownerLogoPreview, has: hasOwnerLogo, src: '/api/settings/company/logo?kind=owner',
                  ref: ownerFileRef, dataUrl: ownerLogoDataUrl, onPick: (f: FileList | null) => onLogoFile(f, 'owner'),
                },
              ].map((l) => (
                <div key={l.kind} className="flex flex-col gap-2">
                  <div className="flex h-24 w-48 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border/70 bg-muted/30">
                    {l.preview ? (
                      <img src={l.preview} alt={l.label} className="h-full w-full object-contain" />
                    ) : l.has ? (
                      <img src={l.src} alt={l.label} className="h-full w-full object-contain" />
                    ) : (
                      <span className="flex flex-col items-center gap-1 text-[11px] text-muted-foreground">
                        <ImageIcon className="size-5" />
                        {t('settings.logoEmpty')}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-medium text-foreground">{l.label}</span>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={!isAdmin}
                      onClick={() => l.ref.current?.click()}
                      className="gap-1.5"
                    >
                      <ImageIcon className="size-4" />
                      {t('settings.logoUpload')}
                    </Button>
                    <input
                      ref={l.ref}
                      type="file"
                      accept="image/png,image/jpeg,image/svg+xml"
                      className="hidden"
                      onChange={(e) => l.onPick(e.target.files)}
                    />
                  </div>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground">{t('settings.logoHint')}</p>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>{t('settings.identityName')}</Label>
                <Input
                  value={company.name}
                  disabled={!isAdmin}
                  placeholder={t('settings.identityNamePh')}
                  onChange={(e) => setCompanyField('name', e.target.value)}
                />
              </div>
              <div>
                <Label>{t('settings.identityProjectId')}</Label>
                <Input
                  value={company.projectId}
                  disabled={!isAdmin}
                  placeholder={t('settings.identityProjectIdPh')}
                  onChange={(e) => setCompanyField('projectId', e.target.value)}
                />
              </div>
              <div>
                <Label>{t('settings.identityProject')}</Label>
                <Input
                  value={company.projectName}
                  disabled={!isAdmin}
                  placeholder={t('settings.identityProjectPh')}
                  onChange={(e) => setCompanyField('projectName', e.target.value)}
                />
              </div>
              <div>
                <Label>{t('settings.identityArea')}</Label>
                <Select
                  value={company.workingArea}
                  disabled={!isAdmin}
                  onChange={(e) => setCompanyField('workingArea', e.target.value)}
                >
                  <option value="">{t('records.filters')}</option>
                  {clusters.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.code} — {c.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label>{t('settings.identityConsultant')}</Label>
                <Input
                  value={company.consultant}
                  disabled={!isAdmin}
                  placeholder={t('settings.identityConsultantPh')}
                  onChange={(e) => setCompanyField('consultant', e.target.value)}
                />
              </div>
              <div>
                <Label>{t('settings.identityOwner')}</Label>
                <Input
                  value={company.owner}
                  disabled={!isAdmin}
                  placeholder={t('settings.identityOwnerPh')}
                  onChange={(e) => setCompanyField('owner', e.target.value)}
                />
              </div>
              <div>
                <Label>{t('settings.identityDelegate')}</Label>
                <Input
                  value={company.ownerDelegate}
                  disabled={!isAdmin}
                  placeholder={t('settings.identityDelegatePh')}
                  onChange={(e) => setCompanyField('ownerDelegate', e.target.value)}
                />
              </div>
            </div>

            {companyErr && <div className="text-sm text-destructive">{companyErr}</div>}
            {companyMsg && <div className="text-sm text-success">{companyMsg}</div>}

            {isAdmin && (
              <div className="flex justify-end">
                <Button onClick={() => void saveCompany()} disabled={companyBusy} className="gap-1.5">
                  {companyBusy ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                  {t('settings.apply')}
                </Button>
              </div>
            )}
          </div>
        </div>
      );
      break;
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 lg:flex-row lg:items-start lg:gap-6">
      {/* Sub-page rail — horizontal chips on phones, vertical list on desktop */}
      <aside className="shrink-0 lg:w-60">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">{t('settings.title')}</h1>
        <nav className="mt-3 flex gap-1 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0">
          {pages.map((p) => {
            const isActive = active === p.key;
            return (
              <button
                key={p.key}
                type="button"
                onClick={() => setPage(p.key)}
                className={`flex shrink-0 items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium transition-all duration-150 active:scale-[0.98] lg:w-full ${
                  isActive
                    ? 'bg-accent/10 text-primary shadow-sm shadow-accent/10'
                    : 'text-muted-foreground hover:bg-accent/70 hover:text-foreground'
                }`}
              >
                <span
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-colors ${
                    isActive ? 'bg-primary/15 text-primary' : 'bg-muted/50 text-muted-foreground'
                  }`}
                >
                  {p.icon}
                </span>
                <span className="whitespace-nowrap">{p.label}</span>
              </button>
            );
          })}
        </nav>
      </aside>

      <section className="min-w-0 flex-1">{content}</section>
    </div>
  );
}
