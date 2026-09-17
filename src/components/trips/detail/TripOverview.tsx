'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Section } from '@/components/app/PageShell';
import { Avatar } from '@/components/ui/Avatar';
import { ButtonLink } from '@/components/ui/Button';
import { LocateIcon, MessageIcon, RouteIcon, ShieldIcon, TicketIcon } from '@/components/ui/icons';
import { LoadingBlock, Skeleton } from '@/components/ui/Skeleton';
import { StatusPill } from '@/components/ui/StatusPill';
import { useNow } from '@/hooks/useNow';
import { useTranslation } from '@/i18n/react';
import { getTranslator } from '@/i18n/runtime';
import { formatDate, formatLocalTime } from '@/lib/format/dates';
import { useAdaptations, useItinerary, useRejectAdaptation, useTrip } from '@/lib/query/hooks/trips';
import { toast } from '@/lib/ui/toast';
import type { AdaptationProposal, Itinerary } from '@/types/domain';
import { AdaptationReview } from '../adaptation/AdaptationReview';
import { TravelUpdateBanner } from '../adaptation/TravelUpdateBanner';
import { usePendingProposal } from '../adaptation/usePendingProposal';
import { intentChips } from '../plan/intent';
import { BudgetSummary } from './BudgetSummary';
import { travelLegLabel } from './itemVocabulary';

function nextUp(plan: Itinerary, now: number) {
  const d = new Date(now);
  const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const clock = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  const day = plan.days.find((x) => x.date === today);
  if (!day) return null;
  const item = day.items.find((i) => i.status !== 'done' && i.status !== 'skipped' && (i.endTime ?? i.startTime ?? '00:00') >= clock);
  return item ? { day, item } : null;
}

export function TripOverview({ tripId }: { tripId: string }) {
  const now = useNow();
  const { t } = useTranslation();
  const trip = useTrip(tripId);
  const itinerary = useItinerary(tripId);
  const adaptations = useAdaptations(tripId);
  const reject = useRejectAdaptation(tripId);
  const pending = usePendingProposal(adaptations.data);
  const [reviewing, setReviewing] = useState<AdaptationProposal | null>(null);

  if (trip.isPending || !trip.data) {
    return (
      <LoadingBlock label={t('trips.overview.loading')} className="grid gap-4 md:grid-cols-2">
        <Skeleton className="h-40 w-full rounded-[1.25rem]" />
        <Skeleton className="h-40 w-full rounded-[1.25rem]" />
      </LoadingBlock>
    );
  }

  const data = trip.data;
  const plan = itinerary.data;
  const upcoming = plan && now ? nextUp(plan, now) : null;
  const chips = intentChips(data.intent);

  const actions = [
    {
      href: `/trips/${tripId}/itinerary`,
      label: t('trips.overview.tools.itinerary'),
      detail: plan ? t('trips.frame.version', { version: plan.version }) : t('trips.overview.tools.notBuilt'),
      icon: RouteIcon,
    },
    {
      href: `/trips/${tripId}/chat`,
      label: t('trips.overview.tools.chat'),
      detail: data.unreadMessages ? t('trips.card.unread', { count: data.unreadMessages }) : t('trips.overview.tools.upToDate'),
      icon: MessageIcon,
    },
    { href: `/location-sharing?trip=${tripId}`, label: t('trips.overview.tools.share'), detail: t('trips.overview.tools.shareDetail'), icon: LocateIcon },
    { href: `/trips/${tripId}/safety`, label: t('trips.overview.tools.safety'), detail: t('trips.overview.tools.safetyDetail'), icon: ShieldIcon },
    { href: `/trips/${tripId}/bookings`, label: t('trips.overview.tools.bookings'), detail: t('trips.overview.tools.bookingsDetail'), icon: TicketIcon },
  ];

  return (
    <div className="grid gap-10">
      {pending && (
        <TravelUpdateBanner
          proposal={pending}
          canReview={data.permissions.canReviewAdaptations}
          onReview={() => setReviewing(pending)}
          keeping={reject.isPending}
          onKeepCurrent={() => reject.mutate(pending.proposalId, { onSuccess: () => toast.success(getTranslator()('adaptation.toasts.kept')) })}
        />
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <section aria-labelledby="next-up-title" className="surface-card grid content-start gap-3 p-5">
          <h2 id="next-up-title" className="label text-[var(--text-subtle)]">
            {t('trips.overview.nextUp')}
          </h2>
          {upcoming ? (
            <>
              <p className="text-[0.9375rem] text-[var(--text-muted)]">
                {t('trips.overview.dayTime', { day: upcoming.day.dayNumber, time: formatLocalTime(upcoming.item.startTime) ?? '' })}
              </p>
              <p className="text-[1.5rem] font-semibold leading-tight tracking-[-0.02em]">{upcoming.item.title}</p>
              {upcoming.item.travelFromPrevious && (
                <p className="text-[0.9375rem] text-[var(--text-muted)]">{t('trips.overview.fromPrevious', { leg: travelLegLabel(upcoming.item.travelFromPrevious) ?? '' })}</p>
              )}
              {upcoming.item.reasons[0] && <p>{upcoming.item.reasons[0].label}</p>}
              <ButtonLink href={`/trips/${tripId}/itinerary`} variant="navy" size="sm" className="mt-1 justify-self-start">
                {t('trips.overview.openToday')}
              </ButtonLink>
            </>
          ) : plan ? (
            <p className="text-[var(--text-muted)]">
              {data.status === 'completed'
                ? t('trips.overview.complete')
                : data.startDate && now && data.startDate > new Date(now).toISOString().slice(0, 10)
                  ? t('trips.overview.startsOn', { date: formatDate(data.startDate) ?? data.startDate })
                  : t('trips.overview.nothingToday')}
            </p>
          ) : (
            <div className="grid gap-3">
              <p className="text-[var(--text-muted)]">{t('trips.overview.noItinerary')}</p>
              <ButtonLink href={`/trips/${tripId}/itinerary`} variant="accent" size="sm" className="justify-self-start">
                {t('trips.overview.buildItinerary')}
              </ButtonLink>
            </div>
          )}
        </section>

        <nav aria-label={t('trips.overview.toolsLabel')} className="grid content-start gap-2">
          {actions.map((action) => (
            <Link key={action.href} href={action.href} className="surface-card flex items-center gap-3 p-3.5 transition-colors hover:bg-[var(--surface-sunken)]">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[var(--tone-accent-bg)] text-[var(--tone-accent-fg)]">
                <action.icon size={20} />
              </span>
              <span className="grid">
                <span className="font-semibold">{action.label}</span>
                <span className="text-[0.875rem] text-[var(--text-muted)]">{action.detail}</span>
              </span>
            </Link>
          ))}
        </nav>
      </div>

      <div className="grid gap-8 lg:grid-cols-2">
        <Section
          title={t('trips.overview.travellers')}
          level={2}
          id="travellers"
          action={
            <Link href={`/trips/${tripId}/people`} className="text-[0.9375rem] font-semibold text-[var(--link)] underline-offset-4 hover:underline">
              {t('trips.overview.manage')}
            </Link>
          }
        >
          <ul className="surface-card grid divide-y divide-[var(--hairline)]">
            {data.members.map((member) => (
              <li key={member.userId} className="flex items-center gap-3 p-3.5">
                <Avatar name={member.displayName} src={member.avatarUrl} presence={member.presence} decorative />
                <div className="grid min-w-0 flex-1">
                  <span className="truncate font-medium">{member.displayName}</span>
                  <span className="text-[0.8125rem] text-[var(--text-muted)]">{t(`trips.people.roles.${member.role}.label`)}</span>
                </div>
                {member.locationShareId && (
                  <Link href={`/location-sharing/view?share=${member.locationShareId}`} className="rounded-full">
                    <StatusPill tone="live">{t('trips.people.sharingLocation')}</StatusPill>
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </Section>

        <div className="grid content-start gap-8">
          {plan && <BudgetSummary budget={plan.budget} />}
          {chips.length > 0 && (
            <Section title={t('trips.overview.details')} level={2} id="details">
              <ul className="flex flex-wrap gap-2">
                {chips.map((chip) => (
                  <li key={chip.id} className="rounded-full bg-[var(--surface-raised)] px-3 py-1.5 text-[0.875rem] ring-1 ring-inset ring-[var(--hairline)]">
                    <span className="sr-only">{chip.kind}: </span>
                    {chip.label}
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </div>
      </div>

      {reviewing && <AdaptationReview tripId={tripId} proposal={reviewing} currentVersion={plan?.version ?? null} onClose={() => setReviewing(null)} />}
    </div>
  );
}
