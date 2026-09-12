import { type ReactNode } from 'react';
import { useI18n } from '@/lib/i18n';
import { Card, CardContent } from '@/components/ui/card';
import { Boxes, Package } from 'lucide-react';

export function CementPage(): ReactNode {
  const { t } = useI18n();

  const sections = [
    {
      key: 'concrete',
      icon: Boxes,
      title: t('cement.concrete'),
      desc: t('cement.concreteDesc'),
      accent: 'bg-muted',
    },
    {
      key: 'packed',
      icon: Package,
      title: t('cement.packed'),
      desc: t('cement.packedDesc'),
      accent: 'bg-warning',
    },
  ];

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">{t('cement.title')}</h1>
        <p className="text-sm text-muted-foreground">{t('cement.subtitle')}</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {sections.map((s) => (
          <Card key={s.key} className="overflow-hidden">
            <CardContent className="flex flex-col gap-3 p-5">
              <div className="flex items-center gap-3">
                <div
                  className={`flex h-11 w-11 items-center justify-center rounded-xl ${s.accent} text-white shadow-md`}
                >
                  <s.icon className="size-5" />
                </div>
                <div>
                  <div className="font-semibold text-foreground">{s.title}</div>
                  <div className="text-sm text-muted-foreground">{s.desc}</div>
                </div>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-dashed border-border/70 bg-muted/40 px-3 py-2.5 text-sm">
                <span className="text-muted-foreground">{t('cement.empty')}</span>
                <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                  {t('cement.comingSoon')}
                </span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}