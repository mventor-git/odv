import { type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from '@/lib/i18n';

export function NotFoundPage(): ReactNode {
  const { t } = useI18n();
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-20 text-muted-foreground">
      <div className="text-4xl">404</div>
      <div>{t('common.notFound')}</div>
      <Link to="/" className="text-sm text-accent hover:underline dark:text-accent">
        {t('nav.dashboard')}
      </Link>
    </div>
  );
}
