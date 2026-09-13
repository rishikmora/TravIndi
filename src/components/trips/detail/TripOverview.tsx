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
  const trip = useTrip(tripId);
  const itinerary = useItinerary(tripId);
  const adaptations = useAdaptations(tripId);
  const reject = useRejectAdaptation(tripId);
  const pending = usePendingProposal(adaptations.data);
  const [reviewing, setReviewing] = useState<AdaptationProposal | null>(null);

  if (trip.isPending || !trip.data) {
    return (
      <LoadingBlock label="Loading trip overview" className="grid gap-4 md:grid-cols-2">
        <Skeleton className="h-40 w-full rounded-[1.25rem]" />
        <Skeleton className="h-40 w-full rounded-[1.25rem]" />
      </LoadingBlock>
    );
  }

  const t = trip.data;
  const plan = itinerary.data;
  const upcoming = plan && now ? nextUp(plan, now) : null;
  const chips = intentChips(t.intent);

  const actions = [
    { href: `/trips/${tripId}/itinerary`, label: 'Itinerary', detail: plan ? `Version ${plan.version}` : 'Not built yet', icon: RouteIcon },
    { href: `/trips/${tripId}/chat`, label: 'Trip chat', detail: t.unreadMessages ? `${t.unreadMessages} unread` : 'Up to date', icon: MessageIcon },
    { href: `/location-sharing?trip=${tripId}`, label: 'Share location', detail: 'Choose who and for how long', icon: LocateIcon },
    { href: `/trips/${tripId}/safety`, label: 'Safety', detail: 'Help nearby and advisories', icon: ShieldIcon },
    { href: `/trips/${tripId}/bookings`, label: 'Bookings', detail: 'Tickets and confirmations', icon: TicketIcon },
  ];

  return (
    <div className="grid gap-10">
      {pending && (
        <TravelUpdateBanner
          proposal={pending}
          canReview={t.permissions.canReviewAdaptations}
          onReview={() => setReviewing(pending)}
          keeping={reject.isPending}
          onKeepCurrent={() => reject.mutate(pending.proposalId, { onSuccess: () => toast.success('Kept your current plan') })}
        />
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <section aria-labelledby="next-up-title" className="surface-card grid content-start gap-3 p-5">
          <h2 id="next-up-title" className="label text-[var(--text-subtle)]">
            Next up
          </h2>
          {upcoming ? (
            <>
              <p className="text-[0.9375rem] text-[var(--text-muted)]">
                Day {upcoming.day.dayNumber} · {formatLocalTime(upcoming.item.startTime)}
              </p>
              <p className="text-[1.5rem] font-semibold leading-tight tracking-[-0.02em]">{upcoming.item.title}</p>
              {upcoming.item.travelFromPrevious && <p className="text-[0.9375rem] text-[var(--text-muted)]">{travelLegLabel(upcoming.item.travelFromPrevious)} from your previous stop</p>}
              {upcoming.item.reasons[0] && <p>{upcoming.item.reasons[0].label}</p>}
              <ButtonLink href={`/trips/${tripId}/itinerary`} variant="navy" size="sm" className="mt-1 justify-self-start">
                Open today’s plan
              </ButtonLink>
            </>
          ) : plan ? (
            <p className="text-[var(--text-muted)]">
              {t.status === 'completed'
                ? 'This trip is complete.'
                : t.startDate && now && t.startDate > new Date(now).toISOString().slice(0, 10)
                  ? `Your trip starts ${formatDate(t.startDate)}.`
                  : 'Nothing else is planned for today.'}
            </p>
          ) : (
            <div className="grid gap-3">
              <p className="text-[var(--text-muted)]">There’s no itinerary for this trip yet.</p>
              <ButtonLink href={`/trips/${tripId}/itinerary`} variant="accent" size="sm" className="justify-self-start">
                Build itinerary
              </ButtonLink>
            </div>
          )}
        </section>

        <nav aria-label="Trip tools" className="grid content-start gap-2">
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
        <Section title="Travellers" level={2} id="travellers" action={<Link href={`/trips/${tripId}/people`} className="text-[0.9375rem] font-semibold text-[var(--link)] underline-offset-4 hover:underline">Manage</Link>}>
          <ul className="surface-card grid divide-y divide-[var(--hairline)]">
            {t.members.map((member) => (
              <li key={member.userId} className="flex items-center gap-3 p-3.5">
                <Avatar name={member.displayName} src={member.avatarUrl} presence={member.presence} decorative />
                <div className="grid min-w-0 flex-1">
                  <span className="truncate font-medium">{member.displayName}</span>
                  <span className="text-[0.8125rem] capitalize text-[var(--text-muted)]">{member.role}</span>
                </div>
                {member.locationShareId && (
                  <Link href={`/location-sharing/view?share=${member.locationShareId}`} className="rounded-full">
                    <StatusPill tone="live">Sharing location</StatusPill>
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </Section>

        <div className="grid content-start gap-8">
          {plan && <BudgetSummary budget={plan.budget} />}
          {chips.length > 0 && (
            <Section title="Trip details" level={2} id="details">
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
