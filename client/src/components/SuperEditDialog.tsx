import { useState, type ReactNode } from 'react';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { MultiChipSelect } from '@/components/MultiChipSelect';
import { AppIcon } from '@/icons/AppIcon';
import type { Meta } from '@/lib/types';

/** Super Edit dialog (ticket 112) — admin-only batch edit of zone/floor/engineer/
 *  description/sentDate for ALL revisions of the same request no. */
export function SuperEditDialog({
  open,
  recordId,
  meta,
  requestMembers,
  initialValues,
  onClose,
  onSaved,
}: {
  open: boolean;
  recordId: number;
  meta: Meta | null;
  requestMembers: Array<{ name: string; role: string; executive?: boolean; star?: string }>;
  initialValues: { zone: string; floor: string; engineer: string; description: string; sentDate: string };
  onClose: () => void;
  onSaved: () => void;
}): ReactNode {
  const { t } = useI18n();
  const [values, setValues] = useState(initialValues);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const setValue = (key: keyof typeof initialValues, value: string): void => {
    setValues((prev) => ({ ...prev, [key]: value }));
  };

  const save = async (): Promise<void> => {
    setBusy(true);
    setError('');
    try {
      await api(`/api/records/${recordId}/super-edit`, {
        method: 'POST',
        body: values,
      });
      setDone(true);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const inputCls =
    'h-9 w-full rounded-md border border-border bg-card px-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AppIcon name="edit" className="size-5 text-accent" />
            {t('form.superEditTitle')}
          </DialogTitle>
        </DialogHeader>
        <div className="-mt-1 flex flex-col gap-4 px-6 pb-6">
          {done ? (
            <div className="rounded-xl border border-success/30 bg-success/10 p-4 text-center text-sm text-success">
              {t('form.superEditSuccess')}
            </div>
          ) : (
            <>
              <p className="text-xs text-muted-foreground">{t('form.superEditHint')}</p>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label>{t('field.zone')}</Label>
                  <MultiChipSelect
                    listBox
                    options={(meta?.zones ?? []).map((z) => ({ value: z.code, label: `${z.code} — ${z.name}` }))}
                    value={values.zone}
                    onChange={(v) => setValue('zone', v)}
                  />
                </div>
                <div>
                  <Label>{t('field.floor')}</Label>
                  <MultiChipSelect
                    listBox
                    options={(meta?.floors ?? []).map((f) => ({ value: f, label: f }))}
                    value={values.floor}
                    onChange={(v) => setValue('floor', v)}
                  />
                </div>
                <div>
                  <Label>{t('field.member')}</Label>
                  <Select
                    value={values.engineer}
                    onChange={(e) => setValue('engineer', e.target.value)}
                    className="h-9"
                  >
                    <option value="">{t('field.optional')}</option>
                    {requestMembers.map((e) => (
                      <option key={e.name} value={e.name}>
                        {e.name}
                        {e.star || e.executive ? ' ★' : ''}
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <Label>{t('field.sentDate')}</Label>
                  <Input
                    type="date"
                    value={values.sentDate}
                    onChange={(e) => setValue('sentDate', e.target.value)}
                  />
                </div>
                <div className="sm:col-span-2">
                  <Label>{t('field.description')}</Label>
                  <textarea
                    className={`${inputCls} min-h-[80px] py-2`}
                    value={values.description}
                    onChange={(e) => setValue('description', e.target.value)}
                  />
                </div>
              </div>

              {error && <div className="text-xs text-destructive">{error}</div>}

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={onClose}>
                  {t('form.cancel')}
                </Button>
                <Button onClick={() => void save()} disabled={busy} className="gap-1.5">
                  {busy ? <AppIcon name="loader" className="size-4 animate-spin" /> : <AppIcon name="edit" className="size-4" />}
                  {t('form.superEditSave')}
                </Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}