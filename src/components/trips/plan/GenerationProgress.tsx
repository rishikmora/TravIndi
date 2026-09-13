'use client';

import { useEffect } from 'react';
import { AlertIcon, CheckIcon } from '@/components/ui/icons';
import { announce } from '@/lib/ui/toast';
import type { GenerationJob, GenerationStage } from '@/types/domain';
import { cn } from '@/utils/cn';

export const GENERATION_STAGES: Array<{ id: GenerationStage; label: string; detail: string }> = [
  { id: 'understanding_trip', label: 'Understanding your trip', detail: 'Reading who’s travelling and what matters to you.' },
  { id: 'checking_destination', label: 'Checking the destination', detail: 'Opening days, distances and seasonal notes.' },
  { id: 'finding_places', label: 'Finding places that fit', detail: 'Matching places to your interests.' },
  { id: 'checking_preferences', label: 'Checking pace and access', detail: 'Walking, rest breaks, food and safety preferences.' },
  { id: 'building_itinerary', label: 'Building your day-by-day plan', detail: 'Ordering stops to keep travel time sensible.' },
  { id: 'validating_journey', label: 'Validating the journey', detail: 'Looking for timing conflicts and closures.' },
];

/**
 * Semantic progress: each stage is reported by the backend as it happens.
 * There is deliberately no percentage — we do not know how long the last step takes.
 */
export function GenerationProgress({ job, destinationName }: { job: GenerationJob | undefined; destinationName?: string | null }) {
  const done = new Set(job?.stagesCompleted ?? []);
  const failed = job?.status === 'failed';
  const current: GenerationStage | null =
    job?.status === 'completed' ? null : (job?.stage ?? (!job || job.status === 'queued' ? 'understanding_trip' : null));
  const currentLabel = GENERATION_STAGES.find((s) => s.id === current)?.label;

  useEffect(() => {
    if (job?.status === 'completed') announce('Your itinerary is ready.');
    else if (failed) announce('We couldn’t finish building your itinerary.', 'assertive');
    else if (currentLabel) announce(`${currentLabel}…`);
  }, [currentLabel, failed, job?.status]);

  return (
    <div className="grid gap-5">
      <div className="grid gap-1">
        <p className="label text-[var(--text-subtle)]">Planning{destinationName ? ` · ${destinationName}` : ''}</p>
        <h2 className="text-[1.5rem] font-semibold tracking-[-0.02em]">
          {job?.status === 'completed' ? 'Your itinerary is ready' : failed ? 'We couldn’t finish your itinerary' : 'Building your journey'}
        </h2>
      </div>
      <ol aria-label="Planning steps" className="relative grid gap-0">
        {GENERATION_STAGES.map((stage, index) => {
          const isDone = done.has(stage.id) || job?.status === 'completed';
          const isCurrent = stage.id === current;
          const isFailed = failed && isCurrent;
          return (
            <li key={stage.id} aria-current={isCurrent && !failed ? 'step' : undefined} className="relative flex gap-4 pb-5 last:pb-0">
              {index < GENERATION_STAGES.length - 1 && (
                <span aria-hidden="true" className={cn('absolute left-[0.9375rem] top-8 h-[calc(100%-1.75rem)] w-px', isDone ? 'bg-teal' : 'bg-[var(--hairline-strong)]')} />
              )}
              <span
                aria-hidden="true"
                className={cn(
                  'relative flex size-8 shrink-0 items-center justify-center rounded-full ring-1 ring-inset',
                  isDone && 'bg-teal text-white ring-teal',
                  isCurrent && !isFailed && 'bg-[var(--surface-raised)] ring-2 ring-brass',
                  isFailed && 'bg-[var(--tone-danger-bg)] text-[var(--tone-danger-fg)] ring-[var(--color-danger)]',
                  !isDone && !isCurrent && 'ring-[var(--hairline-strong)]',
                )}
              >
                {isDone ? <CheckIcon size={16} strokeWidth={2.2} /> : isFailed ? <AlertIcon size={16} /> : isCurrent ? <span className="size-3 animate-spin rounded-full border-2 border-brass border-t-transparent" /> : null}
              </span>
              <div className="grid gap-0.5 pt-1">
                <p className={cn('font-medium', !isDone && !isCurrent && 'text-[var(--text-muted)]')}>
                  {stage.label}
                  <span className="sr-only">{isDone ? ' — done' : isFailed ? ' — failed' : isCurrent ? ' — in progress' : ' — waiting'}</span>
                </p>
                {(isCurrent || isFailed) && <p className="text-[0.875rem] text-[var(--text-muted)]">{isFailed && job?.error ? job.error.message : stage.detail}</p>}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
