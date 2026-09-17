'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { SparkleIcon } from '@/components/ui/icons';
import { EmptyState, ErrorState, InlineNotice } from '@/components/ui/States';
import { useTranslation } from '@/i18n/react';
import { isApiError } from '@/lib/api/errors';
import { useGenerationJob, useStartGeneration } from '@/lib/query/hooks/trips';
import { GenerationProgress } from '../plan/GenerationProgress';

/** Shown when a trip has no itinerary yet: build one in place, with semantic progress. */
export function GenerateForTrip({ tripId, canEdit, destinationName }: { tripId: string; canEdit: boolean; destinationName?: string | null }) {
  const { t } = useTranslation();
  const start = useStartGeneration(tripId);
  const [jobId, setJobId] = useState<string | null>(null);
  const job = useGenerationJob(jobId);

  const run = () => start.mutate(undefined, { onSuccess: (started) => setJobId(started.jobId) });
  const refusal = isApiError(start.error) && start.error.kind === 'validation' ? start.error.message : null;

  if (jobId) {
    return (
      <div className="surface-card grid gap-5 p-6">
        <GenerationProgress job={job.data} destinationName={destinationName} />
        {job.data?.status === 'failed' && (
          <Button variant="accent" onClick={() => { setJobId(null); run(); }} className="justify-self-start">
            {t('common.actions.tryAgain')}
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="surface-card grid gap-4 p-2">
      <EmptyState
        icon={<SparkleIcon />}
        title={t('itinerary.generate.emptyTitle')}
        description={canEdit ? t('itinerary.generate.canEdit') : t('itinerary.generate.cannotEdit')}
        action={
          canEdit ? (
            <Button variant="accent" onClick={run} loading={start.isPending}>
              {t('itinerary.generate.build')}
            </Button>
          ) : undefined
        }
      />
      {refusal ? (
        <InlineNotice tone="warning" title={t('itinerary.generate.needMore')} className="mx-4 mb-4">
          {refusal}
        </InlineNotice>
      ) : start.error ? (
        <ErrorState error={start.error} context="trip.generate" compact className="mx-4 mb-4" onRetry={run} />
      ) : null}
    </div>
  );
}
