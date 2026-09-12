import { type ReactNode } from 'react';
import { useI18n } from '@/lib/i18n';
import { Button } from '@/components/ui/button';

interface LanguageSwitcherProps {
  /** Collapsed sidebar rail — compact square buttons instead of text (ticket 100). */
  collapsed?: boolean;
}

export function LanguageSwitcher({ collapsed = false }: LanguageSwitcherProps): ReactNode {
  const { lang, setLang, t } = useI18n();
  if (collapsed) {
    return (
      <div className="flex flex-col items-center gap-1">
        <Button
          type="button"
          size="icon-xs"
          variant={lang === 'en' ? 'default' : 'ghost'}
          title={t('lang.en')}
          aria-label={t('lang.en')}
          onClick={() => setLang('en')}
          className="text-[11px] font-semibold"
        >
          EN
        </Button>
        <Button
          type="button"
          size="icon-xs"
          variant={lang === 'ar' ? 'default' : 'ghost'}
          title={t('lang.ar')}
          aria-label={t('lang.ar')}
          onClick={() => setLang('ar')}
          className="text-[11px] font-semibold"
        >
          ع
        </Button>
      </div>
    );
  }
  return (
    <div className="flex gap-1">
      <Button
        type="button"
        size="sm"
        variant={lang === 'en' ? 'default' : 'outline'}
        onClick={() => setLang('en')}
      >
        EN
      </Button>
      <Button
        type="button"
        size="sm"
        variant={lang === 'ar' ? 'default' : 'outline'}
        onClick={() => setLang('ar')}
      >
        العربية
      </Button>
    </div>
  );
}
