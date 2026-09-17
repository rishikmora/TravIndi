'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { FreshnessBadge } from '@/components/ui/FreshnessBadge';
import { CheckIcon } from '@/components/ui/icons';
import { ErrorState, InlineNotice } from '@/components/ui/States';
import { StatusPill } from '@/components/ui/StatusPill';
import { useTranslation } from '@/i18n/react';
import { getTranslator } from '@/i18n/runtime';
import { isApiError } from '@/lib/api/errors';
import { formatLocalTime } from '@/lib/format/dates';
import { useAcceptAdaptation, useRejectAdaptation } from '@/lib/query/hooks/trips';
import { adaptationMachine, type AdaptationUiEvent, type AdaptationUiState } from '@/lib/state/machine';
import { announce } from '@/lib/ui/toast';
import type { AdaptationProposal, Itinerary } from '@/types/domain';
import { cn } from '@/utils/cn';
import { ChangeDiff } from './ChangeDiff';
import { ImpactSummary } from './ImpactSummary';
import { eventFreshness, headlineSwap } from './vocabulary';

interface AdaptationReviewProps {
  tripId: string;
  proposal: AdaptationProposal | null;
  currentVersion: number | null;
  onClose: () => void;
}

function ItemPanel({ label, tone, title, time, note }: { label: string; tone: 'current' | 'recommended'; title: string; time: string | null; note?: string | null }) {
  return (
    <div className={cn('grid content-start gap-1 rounded-2xl p-4', tone === 'recommended' ? 'bg-[var(--tone-success-bg)] ring-2 ring-teal' : 'bg-[var(--tone-neutral-bg)]')}>
      <p className="label text-[var(--text-subtle)]">{label}</p>
      <p className="text-[1.0625rem] font-semibold leading-snug">{title}</p>
      {time && <p className="text-[0.875rem] tabular-nums text-[var(--text-muted)]">{time}</p>}
      {note && <p className="text-[0.875rem] text-[var(--text-muted)]">{note}</p>}
    </div>
  );
}

export function AdaptationReview({ tripId, proposal, currentVersion, onClose }: AdaptationReviewProps) {
  const { t } = useTranslation();
  const [state, setState] = useState<AdaptationUiState>('reviewing');
  const [choice, setChoice] = useState<string>('recommended');
  const [result, setResult] = useState<{ proposal: AdaptationProposal; itinerary: Itinerary } | null>(null);
  const [error, setError] = useState<unknown>(null);
  const accept = useAcceptAdaptation(tripId);
  const reject = useRejectAdaptation(tripId);
  const send = (event: AdaptationUiEvent) => setState((current) => adaptationMachine.next(current, event));

  // Start fresh whenever a different proposal is shown.
  const [shownProposalId, setShownProposalId] = useState(proposal?.proposalId);
  if (shownProposalId !== proposal?.proposalId) {
    setShownProposalId(proposal?.proposalId);
    setState('reviewing');
    setChoice('recommended');
    setResult(null);
    setError(null);
  }

  if (!proposal) return <Dialog open={false} onClose={onClose} title="" />;

  const { current, recommended } = headlineSwap(proposal);
  const alternatives = proposal.alternatives ?? [];
  const alternative = alternatives.find((a) => a.alternativeId === choice) ?? null;
  const busy = state === 'applying' || state === 'rejecting';
  const range = (ref: typeof current) => (ref?.startTime ? [formatLocalTime(ref.startTime), formatLocalTime(ref.endTime)].filter(Boolean).join('–') : null);

  const apply = () => {
    send('ACCEPT');
    setError(null);
    accept.mutate(
      { proposalId: proposal.proposalId, basedOnVersion: currentVersion ?? proposal.basedOnVersion, alternativeId: alternative?.alternativeId ?? null },
      {
        onSuccess: (response) => {
          setResult(response);
          send('APPLY_SUCCEEDED');
          announce(getTranslator()('adaptation.review.announceApplied', { version: response.itinerary.version }), 'assertive');
        },
        onError: (caught) => {
          setError(caught);
          if (isApiError(caught) && caught.kind === 'conflict') {
            send(caught.code === 'proposal_expired' ? 'EXPIRED' : 'VERSION_CONFLICT');
          } else {
            send('APPLY_FAILED');
          }
        },
      },
    );
  };

  const keepCurrent = () => {
    send('KEEP_CURRENT');
    setError(null);
    reject.mutate(proposal.proposalId, {
      onSuccess: () => {
        send('REJECT_SUCCEEDED');
        announce(getTranslator()('adaptation.review.announceKept'));
      },
      onError: (caught) => {
        setError(caught);
        send('APPLY_FAILED');
      },
    });
  };

  const titles: Partial<Record<AdaptationUiState, string>> = {
    reviewing: proposal.title ?? t('adaptation.review.titles.reviewing'),
    applying: t('adaptation.review.titles.applying'),
    rejecting: t('adaptation.review.titles.rejecting'),
    applied: result ? t('adaptation.review.titles.applied', { version: result.itinerary.version }) : t('adaptation.review.titles.appliedGeneric'),
    kept_current: t('adaptation.review.titles.kept'),
    conflict: t('adaptation.review.titles.conflict'),
    expired: t('adaptation.review.titles.expired'),
    failed: t('adaptation.review.titles.failed'),
  };

  const footer =
    state === 'reviewing' || busy ? (
      <>
        <Button variant="secondary" onClick={keepCurrent} disabled={busy} loading={state === 'rejecting'}>
          {t('adaptation.review.keepCurrent')}
        </Button>
        <Button variant="accent" onClick={apply} disabled={busy} loading={state === 'applying'}>
          {alternative ? t('adaptation.review.applyOption') : t('adaptation.review.apply')}
        </Button>
      </>
    ) : (
      <Button variant="navy" onClick={onClose}>
        {state === 'applied' ? t('adaptation.review.viewUpdated') : t('common.actions.close')}
      </Button>
    );

  return (
    <Dialog open onClose={onClose} variant="sheet" size="lg" dismissible={!busy} title={titles[state] ?? t('adaptation.review.titles.fallback')} footer={footer}>
      <div aria-live="polite" className="grid gap-6 pb-2">
        {(state === 'reviewing' || busy) && (
          <>
            <section aria-labelledby="what-happened" className="grid gap-2">
              <h3 id="what-happened" className="label text-[var(--text-subtle)]">
                {t('adaptation.review.whatChanged')}
              </h3>
              <p className="text-[1.0625rem] leading-relaxed">{proposal.event?.summary ?? proposal.summary}</p>
              {proposal.event && <FreshnessBadge freshness={eventFreshness(proposal)} />}
            </section>

            {current && (
              <section aria-label={t('adaptation.review.currentAndRecommended')} className="grid gap-3 sm:grid-cols-2">
                <ItemPanel label={t('adaptation.review.current')} tone="current" title={current.title} time={range(current)} />
                {alternative ? (
                  <ItemPanel label={t('adaptation.review.recommended')} tone="recommended" title={alternative.title} time={null} note={alternative.summary} />
                ) : recommended ? (
                  <ItemPanel label={t('adaptation.review.recommended')} tone="recommended" title={recommended.title} time={range(recommended)} />
                ) : null}
              </section>
            )}

            <section aria-labelledby="why-title" className="grid gap-2">
              <h3 id="why-title" className="label text-[var(--text-subtle)]">
                {t('adaptation.review.why')}
              </h3>
              <ul className="grid gap-1.5">
                {(alternative?.reasons ?? proposal.reasons ?? []).map((reason) => (
                  <li key={reason.code} className="flex items-start gap-2">
                    <CheckIcon size={16} className="mt-1 shrink-0 text-teal" aria-hidden="true" />
                    {reason.label}
                  </li>
                ))}
              </ul>
              {proposal.confidence && (
                <p className="text-[0.875rem] text-[var(--text-muted)]">
                  {t('adaptation.review.howSure', { level: t(`adaptation.review.confidence.${proposal.confidence}`) })}
                </p>
              )}
            </section>

            <section aria-labelledby="impact-title" className="grid gap-2">
              <h3 id="impact-title" className="label text-[var(--text-subtle)]">
                {t('adaptation.review.impact')}
              </h3>
              <ImpactSummary impact={alternative ? alternative.impactSummary : proposal.impactSummary} />
            </section>

            {alternatives.length > 0 && (
              <fieldset className="grid gap-2">
                <legend className="label mb-2 text-[var(--text-subtle)]">{t('adaptation.review.chooseAnother')}</legend>
                {[
                  { id: 'recommended', title: recommended ? t('adaptation.review.goTo', { title: recommended.title }) : t('adaptation.review.recommendedChange'), summary: proposal.summary }, ...alternatives.map((a) => ({ id: a.alternativeId, title: a.title, summary: a.summary }))].map((option) => (
                  <label
                    key={option.id}
                    className={cn('flex cursor-pointer items-start gap-3 rounded-2xl p-3 ring-1 ring-inset', choice === option.id ? 'bg-[var(--tone-neutral-bg)] ring-[var(--color-navy)]' : 'ring-[var(--hairline-strong)]')}
                  >
                    <input type="radio" name="adaptation-option" value={option.id} checked={choice === option.id} onChange={() => setChoice(option.id)} className="mt-1 size-4 accent-[var(--color-navy)]" disabled={busy} />
                    <span className="grid gap-0.5">
                      <span className="font-medium">{option.title}</span>
                      <span className="text-[0.875rem] text-[var(--text-muted)]">{option.summary}</span>
                    </span>
                  </label>
                ))}
              </fieldset>
            )}

            {!alternative && (
              <details className="rounded-2xl p-3 ring-1 ring-inset ring-[var(--hairline)]">
                <summary className="cursor-pointer font-medium">{t('adaptation.review.seeEveryChange')}</summary>
                <ChangeDiff changes={proposal.changes} className="mt-4" />
              </details>
            )}

            {Boolean(error) && state === 'reviewing' && <ErrorState error={error} context="adaptation.reject" compact politeness="assertive" />}
            <p className="text-[0.8125rem] text-[var(--text-muted)]">{t('adaptation.review.nothingUntilChoose')}</p>
          </>
        )}

        {state === 'applied' && result && (
          <>
            <div className="flex items-center gap-3 rounded-2xl bg-[var(--tone-success-bg)] p-4">
              <CheckIcon size={22} className="shrink-0 text-[var(--tone-success-fg)]" aria-hidden="true" />
              <div>
                <p className="font-semibold">{t('adaptation.review.updatedTitle')}</p>
                <p className="text-[0.9375rem] text-[var(--text-muted)]">{t('adaptation.review.versionKept', { version: result.proposal.basedOnVersion })}</p>
              </div>
              <StatusPill tone="success" className="ml-auto">
                {t('adaptation.review.appliedPill')}
              </StatusPill>
            </div>
            <ChangeDiff changes={alternative ? proposal.changes.filter((c) => c.changeType !== 'added') : result.proposal.changes} />
          </>
        )}

        {state === 'kept_current' && (
          <InlineNotice tone="success" title={t('adaptation.review.nothingChanged')}>
            {t('adaptation.review.keptBody')}
          </InlineNotice>
        )}

        {state === 'conflict' && (
          <InlineNotice tone="warning" title={t('adaptation.review.nothingApplied')}>
            {t('adaptation.review.conflictBody')}
          </InlineNotice>
        )}

        {state === 'expired' && (
          <InlineNotice tone="neutral" title={t('adaptation.review.nothingChanged')}>
            {t('adaptation.review.expiredBody')}
          </InlineNotice>
        )}

        {state === 'failed' && <ErrorState error={error} context="adaptation.accept" compact politeness="assertive" />}
      </div>
    </Dialog>
  );
}
