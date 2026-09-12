import { useState, type ReactNode } from 'react';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AppIcon } from '@/icons/AppIcon';

/** SC scheduler (ticket 112) — date+time picker that creates a self-notification
 *  via POST /api/notify/sc-schedule. When the date+time is reached, the client
 *  shows a popup to Print or Delegate. */
export function ScScheduler({
  open,
  target,
  onClose,
  onScheduled,
}: {
  open: boolean;
  target: string;
  onClose: () => void;
  onScheduled: () => void;
}): ReactNode {
  const { t } = useI18n();
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [time, setTime] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const schedule = async (): Promise<void> => {
    if (!date || !time) {
      setError(t('field.required'));
      return;
    }
    const timeOk = /^\d{2}:\d{2}$/.test(time);
    if (!timeOk) {
      setError(t('vault.notifyTime'));
      return;
    }
    setBusy(true);
    setError('');
    try {
      await api('/api/notify/sc-schedule', {
        method: 'POST',
        body: {
          date,
          time,
          target,
          title: t('form.scNotifyTitle'),
          body: t('form.scNotifyBody'),
        },
      });
      setDone(true);
      onScheduled();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AppIcon name="latest" className="size-5 text-accent" />
            {t('form.scSchedule')}
          </DialogTitle>
        </DialogHeader>
        <div className="-mt-1 flex flex-col gap-4 px-6 pb-6">
          {done ? (
            <div className="rounded-xl border border-success/30 bg-success/10 p-4 text-center text-sm text-success">
              {t('form.scScheduled')}
            </div>
          ) : (
            <>
              <div className="flex flex-col gap-2">
                <Label>{t('field.sentDate')}</Label>
                <Input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label>{t('form.scNotifyTime')}</Label>
                <Input
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                />
              </div>
              {error && <div className="text-xs text-destructive">{error}</div>}
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={onClose}>
                  {t('form.cancel')}
                </Button>
                <Button onClick={() => void schedule()} disabled={busy} className="gap-1.5">
                  {busy ? <AppIcon name="loader" className="size-4 animate-spin" /> : <AppIcon name="send" className="size-4" />}
                  {t('form.scSchedule')}
                </Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}