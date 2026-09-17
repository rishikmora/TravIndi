'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { PageShell } from '@/components/app/PageShell';
import { Button, ButtonLink } from '@/components/ui/Button';
import { ArrowLeftIcon } from '@/components/ui/icons';
import { ErrorState, InlineNotice } from '@/components/ui/States';
import { useTranslation } from '@/i18n/react';
import { useAuth } from '@/lib/auth/provider';
import { relativeTime } from '@/lib/format/freshness';
import { deleteDraft, readDraft, saveDraft } from '@/lib/offline/db';
import { useDestinations } from '@/lib/query/hooks/destinations';
import { useConsents } from '@/lib/query/hooks/profile';
import { useCreateTrip, useExtractIntent, useGenerationJob, useStartGeneration, useUpdateTrip } from '@/lib/query/hooks/trips';
import { generationMachine, type GenerationUiEvent, type GenerationUiState } from '@/lib/state/machine';
import type { IntentExtraction, TripIntent } from '@/types/domain';
import { cn } from '@/utils/cn';
import { GenerationProgress } from './GenerationProgress';
import { IntentComposer } from './IntentComposer';
import { compactIntent } from './intent';
import { IntentForm } from './IntentForm';
import { IntentReview } from './IntentReview';

type Step = 'describe' | 'review' | 'details' | 'generating';

interface Draft {
  text: string;
  intent: TripIntent;
  extraction: IntentExtraction | null;
  step: Step;
  tripId: string | null;
}

const DRAFT_KEY = 'plan-journey';
const STEPS = ['describe', 'review', 'generating'] as const;

export function PlanJourneyScreen({ initialText }: { initialText?: string }) {
  const router = useRouter();
  const { t } = useTranslation();
  const { status } = useAuth();
  const signedIn = status === 'authenticated';

  const [step, setStep] = useState<Step>('describe');
  const [text, setText] = useState(initialText ?? '');
  const [intent, setIntent] = useState<TripIntent>({});
  const [extraction, setExtraction] = useState<IntentExtraction | null>(null);
  const [answered, setAnswered] = useState<Record<string, true>>({});
  const [useProfile, setUseProfile] = useState(true);
  const [tripId, setTripId] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [generation, setGeneration] = useState<GenerationUiState>(generationMachine.initial);
  const [submitError, setSubmitError] = useState<unknown>(null);
  const [restoredAt, setRestoredAt] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const firstRender = useRef(true);

  const extract = useExtractIntent();
  const createTrip = useCreateTrip();
  const updateTrip = useUpdateTrip(tripId ?? 'pending');
  const startGeneration = useStartGeneration(tripId);
  const job = useGenerationJob(jobId);
  const destinations = useDestinations({ limit: 60 });
  const consents = useConsents(signedIn);
  const canUseProfile = signedIn && Boolean(consents.data?.find((c) => c.consentId === 'personalisation')?.granted);
  const send = useCallback((event: GenerationUiEvent) => setGeneration((state) => generationMachine.next(state, event)), []);

  const runExtract = useCallback(
    (value: string) => {
      extract.mutate(
        { text: value, useProfileDefaults: canUseProfile && useProfile },
        {
          onSuccess: (result) => {
            setIntent(result.intent);
            setExtraction(result);
            setAnswered({});
            setStep('review');
          },
        },
      );
    },
    [extract, canUseProfile, useProfile],
  );

  // Restore a saved draft, or start from text passed in from the home page.
  useEffect(() => {
    let cancelled = false;
    if (initialText && initialText.trim().length >= 3) {
      runExtract(initialText);
      return;
    }
    void readDraft<Draft>(DRAFT_KEY).then((draft) => {
      if (cancelled || !draft) return;
      setText(draft.data.text);
      setIntent(draft.data.intent);
      setExtraction(draft.data.extraction);
      setTripId(draft.data.tripId);
      setStep(draft.data.step === 'generating' ? 'review' : draft.data.step);
      setRestoredAt(draft.updatedAt);
    });
    return () => {
      cancelled = true;
    };
    // Runs once on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (step === 'generating') return;
    const timer = setTimeout(() => void saveDraft(DRAFT_KEY, { text, intent, extraction, step, tripId } satisfies Draft), 600);
    return () => clearTimeout(timer);
  }, [text, intent, extraction, step, tripId]);

  // Move focus to the new step's heading so keyboard and screen-reader users follow along.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    headingRef.current?.focus();
  }, [step]);

  // Move the progress view on once the planning job finishes.
  const jobStatus = job.data?.status;
  const [handledJob, setHandledJob] = useState<string | null>(null);
  const jobOutcome = jobStatus === 'completed' && tripId ? `completed:${tripId}` : jobStatus === 'failed' ? `failed:${jobId}` : null;
  if (jobOutcome && jobOutcome !== handledJob) {
    setHandledJob(jobOutcome);
    send(jobStatus === 'failed' ? 'JOB_FAILED' : 'JOB_COMPLETED');
  }

  useEffect(() => {
    if (jobStatus !== 'completed' || !tripId) return;
    void deleteDraft(DRAFT_KEY);
    const timer = setTimeout(() => router.push(`/trips/${tripId}`), 1600);
    return () => clearTimeout(timer);
  }, [jobStatus, tripId, router]);

  const build = async () => {
    if (!signedIn) {
      await saveDraft(DRAFT_KEY, { text, intent, extraction, step, tripId } satisfies Draft);
      router.push(`/login?next=${encodeURIComponent('/trips/new')}`);
      return;
    }
    setSubmitError(null);
    setStep('generating');
    send('SUBMIT');
    try {
      const payload = compactIntent(intent);
      let id = tripId;
      if (id) await updateTrip.mutateAsync({ intent: payload });
      else {
        const trip = await createTrip.mutateAsync({ intent: payload });
        id = trip.tripId;
        setTripId(id);
      }
      const started = await startGeneration.mutateAsync(id);
      setJobId(started.jobId);
      send('JOB_STARTED');
    } catch (error) {
      setSubmitError(error);
      send('SUBMIT_FAILED');
    }
  };

  const startOver = () => {
    setText('');
    setIntent({});
    setExtraction(null);
    setAnswered({});
    setJobId(null);
    setStep('describe');
    setRestoredAt(null);
    void deleteDraft(DRAFT_KEY);
  };

  const visibleStep = step === 'details' ? 'review' : step;
  const destinationList = destinations.data?.items ?? [];

  return (
    <PageShell width="narrow">
      <nav aria-label={t('planner.screen.progressLabel')} className="mb-6">
        <ol className="flex items-center gap-2 text-[0.8125rem]">
          {STEPS.map((s, index) => {
            const current = s === visibleStep;
            const position = STEPS.findIndex((x) => x === visibleStep);
            return (
              <li key={s} className="flex items-center gap-2">
                <span
                  aria-current={current ? 'step' : undefined}
                  className={cn(
                    'inline-flex h-7 items-center gap-1.5 rounded-full px-3 font-medium',
                    current ? 'bg-navy text-ivory' : index < position ? 'text-[var(--text)]' : 'text-[var(--text-subtle)]',
                  )}
                >
                  <span className="tabular-nums">{index + 1}</span> {t(`planner.screen.steps.${s}`)}
                </span>
                {index < STEPS.length - 1 && <span aria-hidden="true" className="h-px w-5 bg-[var(--hairline-strong)]" />}
              </li>
            );
          })}
        </ol>
      </nav>

      <h1 ref={headingRef} tabIndex={-1} className="sr-only">
        {t(`planner.screen.headings.${step}`)}
      </h1>

      {restoredAt && step !== 'generating' && (
        <InlineNotice
          tone="neutral"
          className="mb-6"
          title={t('planner.screen.restoredTitle')}
          action={
            <Button variant="ghost" size="sm" onClick={startOver}>
              {t('planner.screen.discardDraft')}
            </Button>
          }
        >
          {relativeTime(restoredAt) ? t('planner.screen.restoredWhen', { when: relativeTime(restoredAt)! }) : t('planner.screen.restoredEarlier')}
        </InlineNotice>
      )}

      {step === 'describe' && (
        <div className="grid gap-8">
          <IntentComposer
            value={text}
            onChange={setText}
            onSubmit={() => runExtract(text)}
            submitting={extract.isPending}
            error={extract.error}
            canUseProfile={canUseProfile}
            useProfile={useProfile}
            onUseProfileChange={setUseProfile}
          />
          <p className="text-[0.9375rem] text-[var(--text-muted)]">
            {t('planner.screen.preferForm')}{' '}
            <button type="button" onClick={() => setStep('details')} className="font-semibold text-[var(--link)] underline underline-offset-4">
              {t('planner.screen.fillDetails')}
            </button>
          </p>
        </div>
      )}

      {step === 'review' && (
        <IntentReview
          intent={intent}
          extraction={extraction}
          onChange={setIntent}
          answered={answered}
          onAnswered={(field) => setAnswered((current) => ({ ...current, [field]: true }))}
          destinations={destinationList}
          onEditDetails={() => setStep('details')}
          onStartOver={startOver}
          onBuild={() => void build()}
          building={generation === 'submitting'}
          signedIn={signedIn}
        />
      )}

      {step === 'details' && (
        <div className="grid gap-6">
          <div className="flex items-center justify-between gap-3">
            <Button variant="ghost" size="sm" onClick={() => setStep(extraction ? 'review' : 'describe')}>
              <ArrowLeftIcon size={16} />
              {t('common.actions.back')}
            </Button>
          </div>
          <IntentForm intent={intent} onChange={setIntent} destinations={destinationList} />
          <div className="flex flex-wrap gap-3 border-t border-[var(--hairline)] pt-6">
            <Button variant="accent" size="lg" onClick={() => setStep('review')}>
              {t('planner.screen.reviewTrip')}
            </Button>
          </div>
        </div>
      )}

      {step === 'generating' && (
        <div className="surface-card grid gap-6 p-6 md:p-8">
          <GenerationProgress job={job.data} destinationName={intent.destination} />
          {Boolean(submitError) && (
            <ErrorState error={submitError} context="trip.generate" compact politeness="assertive" onRetry={() => void build()} />
          )}
          {generation === 'ready' && tripId && (
            <div className="flex flex-wrap items-center gap-3">
              <ButtonLink href={`/trips/${tripId}`} variant="navy">
                {t('planner.screen.openItinerary')}
              </ButtonLink>
              <span className="text-[0.875rem] text-[var(--text-muted)]">{t('planner.screen.openingAutomatically')}</span>
            </div>
          )}
          {(generation === 'failed' || Boolean(submitError)) && (
            <div className="flex flex-wrap gap-3">
              {generation === 'failed' && (
                <Button variant="accent" onClick={() => void build()}>
                  {t('common.actions.tryAgain')}
                </Button>
              )}
              <Button variant="secondary" onClick={() => setStep('details')}>
                {t('planner.screen.editDetails')}
              </Button>
              {tripId && (
                <Link href={`/trips/${tripId}`} className="self-center text-[0.9375rem] font-semibold text-[var(--link)] underline underline-offset-4">
                  {t('planner.screen.goToSavedTrip')}
                </Link>
              )}
            </div>
          )}
        </div>
      )}
    </PageShell>
  );
}
