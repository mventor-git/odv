import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { useAuth } from '@/lib/auth';
import { sound } from '@/lib/sound';
import { userDisplayName } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { NotifyButton } from '@/components/NotifyButton';
import { RequestCard } from '@/components/RequestCard';
import { openChecklistHtml, type ChecklistSection } from '@/lib/checklistReport';
import { CalendarDays, FileCode2, Loader2, RefreshCw } from 'lucide-react';

interface ChecklistResponse {
  date: string;
  total: number;
  sections: ChecklistSection[];
  cycles: Array<{
    category: string;
    name: string;
    nameAr: string;
    steps: Array<{ name: string; nameAr: string; hint: string }>;
  }>;
}

interface CompanyInfo {
  name: string;
  projectName: string;
  workingArea: string;
  hasLogo: boolean;
}

interface MetaCategory {
  code: string;
  name: string;
  nameAr: string;
}

/** Checklist tab (ticket 071) — pick a date → day card → per-category
 *  sections → A4 Landscape checklist HTML (printable, metadata header). */
export function ChecklistPage(): ReactNode {
  const { t, lang } = useI18n();
  const { user } = useAuth();
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'made'>('all');
  const [data, setData] = useState<ChecklistResponse | null>(null);
  const [company, setCompany] = useState<CompanyInfo | null>(null);
  const [logoDataUrl, setLogoDataUrl] = useState('');
  const [catNames, setCatNames] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [card, setCard] = useState<{ category: string; requestNo: string; revisionId?: number } | null>(null);

  const load = useCallback(async (): Promise<void> => {
    if (!date) return;
    setBusy(true);
    setError('');
    try {
      const res = await api<ChecklistResponse>(
        `/api/checklist?date=${encodeURIComponent(date)}&status=${statusFilter}`,
      );
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [date, statusFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    api<{ categories: MetaCategory[] }>('/api/meta')
      .then((m) => {
        const map: Record<string, string> = {};
        for (const c of m.categories) map[c.code] = lang === 'ar' ? c.nameAr : c.name;
        setCatNames(map);
      })
      .catch(() => undefined);
  }, [lang]);

  useEffect(() => {
    api<CompanyInfo>('/api/settings/company')
      .then((c) => {
        setCompany(c);
        if (c.hasLogo) {
          fetch('/api/settings/company/logo', { headers: { Authorization: `Bearer ${localStorage.getItem('odv_token') ?? ''}` } })
            .then((r) => (r.ok ? r.blob() : null))
            .then((blob) => {
              if (!blob) return;
              const reader = new FileReader();
              reader.onload = () => setLogoDataUrl(String(reader.result ?? ''));
              reader.readAsDataURL(blob);
            })
            .catch(() => undefined);
        }
      })
      .catch(() => undefined);
  }, []);

  const openHtml = (): void => {
    if (!data) return;
    const createdBy = user ? userDisplayName(user, lang) : '';
    openChecklistHtml({
      date: data.date,
      sections: data.sections,
      total: data.total,
      logoDataUrl,
      siteName: company?.name,
      projectName: company?.projectName,
      workingArea: company?.workingArea,
      createdBy,
      lang,
      strings: {
        title: t('checklist.reportTitle'),
        date: t('checklist.reportDate'),
        by: t('checklist.reportBy'),
        is: t('checklist.reportIs'),
        totalRequests: t('checklist.reportTotal'),
        print: t('checklist.reportPrint'),
        empty: t('checklist.reportEmpty'),
        popupBlocked: t('checklist.reportPopup'),
      },
    });
    sound.success();
  };

  const catName = (code: string): string => catNames[code] ?? code;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">{t('checklist.title')}</h1>
          <p className="text-sm text-muted-foreground">{t('checklist.subtitle')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={() => void load()} className="gap-1.5">
            <RefreshCw className="size-4" />
            {t('scan.refresh')}
          </Button>
          <Button onClick={openHtml} disabled={!data || data.total === 0} className="gap-1.5">
            <FileCode2 className="size-4" />
            {t('checklist.openHtml')}
          </Button>
        </div>
      </div>

      {/* Date picker + status filter */}
      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 p-4">
          <div>
            <Label>{t('checklist.date')}</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-44" />
          </div>
          <div>
            <Label>{t('checklist.status')}</Label>
            <Select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as 'all' | 'pending' | 'made')}
              className="w-40"
            >
              <option value="all">{t('checklist.all')}</option>
              <option value="pending">{t('checklist.pending')}</option>
              <option value="made">{t('checklist.made')}</option>
            </Select>
          </div>
          {busy && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
        </CardContent>
      </Card>

      {error && <div className="text-sm text-destructive">{error}</div>}

      {/* Day card */}
      {data && (
        <div className="glass-card flex flex-wrap items-center gap-4 rounded-2xl p-5">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-accent text-white shadow-lg">
            <CalendarDays className="size-6" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-lg font-bold text-foreground">{data.date}</div>
            <div className="text-sm text-muted-foreground">
              {t('checklist.total')}: {data.total} · {t('checklist.sections')}: {data.sections.length}
            </div>
          </div>
        </div>
      )}

      {/* Per-category sections — rows clickable → request card (ticket 094) */}
      {data && data.sections.length === 0 && (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">{t('checklist.empty')}</CardContent>
        </Card>
      )}
      {data?.sections.map((s) => (
        <div key={s.category} className="glass-surface overflow-hidden rounded-xl">
          <div className="border-b border-border/60 bg-primary/10 px-4 py-2 text-sm font-bold text-primary">
            {catName(s.category)}
            <span className="ms-2 text-xs font-medium text-muted-foreground">{s.items.length}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <tbody>
                {s.items.map((row, i) => (
                  <tr
                    key={`${row.code}-${i}`}
                    onClick={() => setCard({ category: row.category, requestNo: row.requestNo })}
                    className="cursor-pointer border-b border-border/40 transition-colors last:border-0 hover:bg-primary/5"
                  >
                    <td className="w-10 px-3 py-2 text-center text-muted-foreground">{i + 1}</td>
                    <td className="px-3 py-2 font-mono text-xs">{row.code}</td>
                    <td className="w-16 px-3 py-2 text-center font-mono">{row.requestNo}</td>
                    <td className="px-3 py-2">{row.description || '—'}</td>
                    <td className="w-28 px-3 py-2 text-center tabular-nums">{row.sentDate}</td>
                    <td className="w-10 px-2 py-2 text-center" onClick={(e) => e.stopPropagation()}>
                      <NotifyButton target={row.code} small />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      <RequestCard
        open={card !== null}
        category={card?.category ?? ''}
        requestNo={card?.requestNo ?? ''}
        initialViewId={card?.revisionId}
        onClose={() => setCard(null)}
      />
    </div>
  );
}