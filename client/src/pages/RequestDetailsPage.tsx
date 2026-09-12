import { type ReactNode } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useI18n } from '@/lib/i18n';
import { Button } from '@/components/ui/button';
import { RequestCardBody } from '@/components/RequestCardBody';
import { ArrowLeft } from 'lucide-react';

/** Card-styled request page (deep links land here) — same card as the modal. */
export function RequestDetailsPage(): ReactNode {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { category = '', requestNo = '' } = useParams<{ category: string; requestNo: string }>();
  const [searchParams] = useSearchParams();
  const edit = searchParams.get('edit') === '1';

  return (
    <div className="mx-auto flex max-w-[930px] flex-col gap-3">
      <Button variant="ghost" size="sm" className="self-start gap-1.5" onClick={() => navigate(-1)}>
        <ArrowLeft className="size-4" />
        {t('details.back')}
      </Button>
      <RequestCardBody
        category={category}
        requestNo={requestNo}
        initialEditMode={edit}
        expandToPage={false}
      />
    </div>
  );
}