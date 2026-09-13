'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { SparkleIcon } from '@/components/ui/icons';
import { EmptyState, ErrorState, InlineNotice } from '@/components/ui/States';
import { isApiError } from '@/lib/api/errors';
import { useGenerationJob, useStartGeneration } from '@/lib/query/hooks/trips';
import { GenerationProgress } from '../plan/GenerationProgress';

/** Shown when a trip has no itinerary yet: build one in place, with semantic progress. */
export function GenerateForTrip({ tripId, canEdit, destinationName }: { tripId: string; canEdit: boolean; destinationName?: string | null }) {
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
            Try again
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="surface-card grid gap-4 p-2">
      <EmptyState
        icon={<SparkleIcon />}
        title="No itinerary yet"
        description={canEdit ? 'Your trip details are saved. Build a day-by-day plan when you’re ready.' : 'The trip owner hasn’t built an itinerary yet.'}
        action={
          canEdit ? (
            <Button variant="accent" onClick={run} loading={start.isPending}>
              Build itinerary
            </Button>
          ) : undefined
        }
      />
      {refusal ? (
        <InlineNotice tone="warning" title="We need a little more first" className="mx-4 mb-4">
          {refusal}
        </InlineNotice>
      ) : start.error ? (
        <ErrorState error={start.error} context="trip.generate" compact className="mx-4 mb-4" onRetry={run} />
      ) : null}
    </div>
  );
}
