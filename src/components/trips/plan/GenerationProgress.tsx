'use client';

import { useEffect } from 'react';
import { AlertIcon, CheckIcon } from '@/components/ui/icons';
import { useTranslation } from '@/i18n/react';
import { getTranslator } from '@/i18n/runtime';
import { announce } from '@/lib/ui/toast';
import type { GenerationJob, GenerationStage } from '@/types/domain';
import { cn } from '@/utils/cn';

export const GENERATION_STAGES: GenerationStage[] = [
  'understanding_trip',
  'checking_destination',
  'finding_places',
  'checking_preferences',
  'building_itinerary',
  'validating_journey',
];

/**
 * Semantic progress: each stage is reported by the backend as it happens.
 * There is deliberately no percentage — we do not know how long the last step takes.
 */
export function GenerationProgress({ job, destinationName }: { job: GenerationJob | undefined; destinationName?: string | null }) {
  const { t } = useTranslation();
  const done = new Set(job?.stagesCompleted ?? []);
  const failed = job?.status === 'failed';
  const current: GenerationStage | null =
    job?.status === 'completed' ? null : (job?.stage ?? (!job || job.status === 'queued' ? 'understanding_trip' : null));

  useEffect(() => {
    const now = getTranslator();
    if (job?.status === 'completed') announce(now('planner.generation.announceReady'));
    else if (failed) announce(now('planner.generation.announceFailed'), 'assertive');
    else if (current) announce(now('planner.generation.announceStage', { stage: now(`planner.generation.stages.${current}.label`) }));
  }, [current, failed, job?.status]);

  return (
    <div className="grid gap-5">
      <div className="grid gap-1">
        <p className="label text-[var(--text-subtle)]">
          {destinationName ? t('planner.generation.planningFor', { name: destinationName }) : t('planner.generation.planning')}
        </p>
        <h2 className="text-[1.5rem] font-semibold tracking-[-0.02em]">
          {job?.status === 'completed'
            ? t('planner.generation.readyTitle')
            : failed
              ? t('planner.generation.failedTitle')
              : t('planner.generation.buildingTitle')}
        </h2>
      </div>
      <ol aria-label={t('planner.generation.stepsLabel')} className="relative grid gap-0">
        {GENERATION_STAGES.map((stage, index) => {
          const isDone = done.has(stage) || job?.status === 'completed';
          const isCurrent = stage === current;
          const isFailed = failed && isCurrent;
          return (
            <li key={stage} aria-current={isCurrent && !failed ? 'step' : undefined} className="relative flex gap-4 pb-5 last:pb-0">
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
                  {t(`planner.generation.stages.${stage}.label`)}
                  <span className="sr-only">
                    {' '}
                    {isDone
                      ? t('planner.generation.stepStatus.done')
                      : isFailed
                        ? t('planner.generation.stepStatus.failed')
                        : isCurrent
                          ? t('planner.generation.stepStatus.current')
                          : t('planner.generation.stepStatus.waiting')}
                  </span>
                </p>
                {(isCurrent || isFailed) && (
                  <p className="text-[0.875rem] text-[var(--text-muted)]">{isFailed && job?.error ? job.error.message : t(`planner.generation.stages.${stage}.detail`)}</p>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
