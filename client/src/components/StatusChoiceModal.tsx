import { type ReactNode } from 'react';
import { useI18n } from '@/lib/i18n';
import type { StatusDef } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AppIcon } from '@/icons/AppIcon';

export type SaveChoice = 'P' | 'SC';

/** P/SC status modal (ticket 112) — required after Save before the record is
 *  committed. P → printing popup; SC → date+time picker. Labels are derived
 *  from the domain statuses (meta) with i18n fallbacks. */
export function StatusChoiceModal({
  open,
  statuses,
  onChoose,
  onClose,
}: {
  open: boolean;
  statuses: StatusDef[];
  onChoose: (choice: SaveChoice) => void;
  onClose: () => void;
}): ReactNode {
  const { t } = useI18n();
  const p = statuses.find((s) => s.code === 'P');
  const sc = statuses.find((s) => s.code === 'SC');

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent showCloseButton={false} className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-center">{t('form.statusChoice')}</DialogTitle>
        </DialogHeader>
        <div className="-mt-1 grid gap-3 px-6 pb-6 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => onChoose('P')}
            className="glass-card flex flex-col items-center gap-2 rounded-2xl p-6 text-center transition-all hover:-translate-y-0.5 active:scale-[0.98]"
          >
            <AppIcon name="printer" className="size-8 text-primary" />
            <span className="text-lg font-semibold text-foreground">
              {p?.code ?? 'P'} — {t('form.statusP')}
            </span>
            <span className="text-xs text-muted-foreground">{t('form.statusPDesc')}</span>
            {p?.slogan && <span className="text-[11px] text-muted-foreground/70">{p.slogan}</span>}
          </button>
          <button
            type="button"
            onClick={() => onChoose('SC')}
            className="glass-card flex flex-col items-center gap-2 rounded-2xl p-6 text-center transition-all hover:-translate-y-0.5 active:scale-[0.98]"
          >
            <AppIcon name="latest" className="size-8 text-accent" />
            <span className="text-lg font-semibold text-foreground">
              {sc?.code ?? 'SC'} — {t('form.statusSC')}
            </span>
            <span className="text-xs text-muted-foreground">{t('form.statusSCDesc')}</span>
            {sc?.slogan && <span className="text-[11px] text-muted-foreground/70">{sc.slogan}</span>}
          </button>
        </div>
        <div className="flex justify-center px-6 pb-2">
          <Button variant="ghost" size="sm" onClick={onClose}>
            {t('form.cancel')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
