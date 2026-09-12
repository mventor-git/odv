import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { useAuth } from '@/lib/auth';
import type { AppLog, LogsResponse } from '@/lib/types';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { NotifyButton } from '@/components/NotifyButton';
import { Activity as ActivityIcon, ScrollText, Trash2 } from 'lucide-react';

const ACTION_STYLES: Record<string, string> = {
  create: 'bg-success/10 text-success dark:bg-success/20 dark:text-success',
  delete: 'bg-destructive/10 text-destructive dark:bg-destructive/15 dark:text-destructive',
  trash: 'bg-destructive/10 text-destructive dark:bg-destructive/20 dark:text-destructive',
  restore: 'bg-success/10 text-success dark:bg-success/20 dark:text-success',
  purge: 'bg-destructive/10 text-destructive dark:bg-destructive/15 dark:text-destructive',
  revision: 'bg-accent/10 text-accent dark:bg-accent/20 dark:text-accent',
  update: 'bg-muted text-muted-foreground dark:bg-muted dark:text-muted-foreground',
};

function timeLabel(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso.replace(' ', 'T') + 'Z');
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

/** Log targets are "CATEGORY REQUESTNO" (e.g. "IR STR-0001") — parse into a
 *  request link so activity cards navigate to their source (v3 item 24). */
function targetLink(target: string): { category: string; requestNo: string } | null {
  if (!target) return null;
  const idx = target.indexOf(' ');
  if (idx <= 0) return null;
  const category = target.slice(0, idx).trim();
  const requestNo = target.slice(idx + 1).trim();
  if (!category || !requestNo) return null;
  return { category, requestNo };
}

/** Full-page Recent Activity feed (ticket 023) — cards link to their source. */
export function ActivityPage(): ReactNode {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin' || user?.role === 'dev';
  const [logs, setLogs] = useState<AppLog[]>([]);
  const [total, setTotal] = useState(0);
  const [notifyLogs, setNotifyLogs] = useState<Array<{ id: number; title: string; body: string; fromUser: string; toUser: string; status: string; createdAt: string }>>([]);
  const [logsOpen, setLogsOpen] = useState(false);

  useEffect(() => {
    api<LogsResponse>('/api/logs?limit=200')
      .then((r) => {
        setLogs(r.items);
        setTotal(r.total);
      })
      .catch(() => undefined);
  }, []);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">{t('nav.activity')}</h1>
        <p className="text-sm text-muted-foreground">
          {total} {t('records.total')}
        </p>
      </div>

      {logs.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">{t('wall.noActivity')}</CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {logs.map((log) => {
            const link = targetLink(log.target);
            const body = (
              <>
                <span
                  className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                    ACTION_STYLES[log.action] ?? ACTION_STYLES.update
                  }`}
                >
                  <ActivityIcon className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${
                        ACTION_STYLES[log.action] ?? ACTION_STYLES.update
                      }`}
                    >
                      {log.action}
                    </span>
                    <span className="text-sm font-medium text-foreground">{log.summary}</span>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {log.actor} · {timeLabel(log.createdAt)}
                  </div>
                </div>
                {link && (
                  <span onClick={(e) => e.stopPropagation()}>
                    <NotifyButton target={log.target} small />
                  </span>
                )}
              </>
            );
            return link ? (
              <button
                key={log.id}
                type="button"
                onClick={() =>
                  navigate(
                    `/requests/${encodeURIComponent(link.category)}/${encodeURIComponent(link.requestNo)}`,
                  )
                }
                title={t('activity.openSource')}
                className="glass-card flex items-start gap-3 rounded-2xl p-4 text-start transition-all hover:-translate-y-0.5 hover:ring-1 hover:ring-primary/40"
              >
                {body}
              </button>
            ) : (
              <div key={log.id} className="glass-card flex items-start gap-3 rounded-2xl p-4">
                {body}
              </div>
            );
          })}
        </div>
      )}

      {/* Hidden Trash entry — bottom of the content area, start side (left EN / right AR).
          Offset past the sidebar (13.5rem) + dock (3rem) on desktop only. */}
      <button
        onClick={() => navigate('/trash')}
        title={t('trash.title')}
        className="glass-card fixed bottom-4 start-4 z-40 flex h-11 w-11 items-center justify-center rounded-2xl text-muted-foreground transition-all hover:-translate-y-0.5 hover:text-destructive lg:start-[16.5rem]"
      >
        <Trash2 className="size-5" />
      </button>

      {/* Secret notify-logs icon (admin only) — next to the trash (v3.2) */}
      {isAdmin && (
        <button
          onClick={() => {
            api<{ items: typeof notifyLogs }>('/api/notify/logs')
              .then((r) => {
                setNotifyLogs(r.items);
                setLogsOpen(true);
              })
              .catch(() => undefined);
          }}
          title={t('vault.logs')}
          className="glass-card fixed bottom-4 start-16 z-40 flex h-11 w-11 items-center justify-center rounded-2xl text-muted-foreground transition-all hover:-translate-y-0.5 hover:text-primary lg:start-[18rem]"
        >
          <ScrollText className="size-5" />
        </button>
      )}

      {/* Admin notify logs */}
      <Dialog open={logsOpen} onOpenChange={(o) => { if (!o) setLogsOpen(false); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sm">
              <ScrollText className="size-4 text-primary" />
              {t('vault.logs')}
            </DialogTitle>
          </DialogHeader>
          <div className="-mt-1 flex max-h-[60vh] flex-col gap-2 overflow-y-auto px-6 pb-6">
            {notifyLogs.length === 0 && <div className="text-sm text-muted-foreground">—</div>}
            {notifyLogs.map((n) => (
              <div key={n.id} className="rounded-lg border border-border/60 bg-card p-3 text-xs">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-foreground">{n.title || n.body.slice(0, 60)}</span>
                  <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-bold uppercase text-muted-foreground">
                    {n.status}
                  </span>
                </div>
                <div className="mt-0.5 text-muted-foreground">
                  {n.fromUser} → {n.toUser || t('vault.everyone')} · {n.createdAt}
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}