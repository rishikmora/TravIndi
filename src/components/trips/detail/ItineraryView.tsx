'use client';

import { type KeyboardEvent, useRef, useState } from 'react';
import { BookingSheet, type BookingDraft } from '@/components/providers/BookingSheet';
import { Button } from '@/components/ui/Button';
import { EditIcon, HistoryIcon } from '@/components/ui/icons';
import { LoadingBlock, Skeleton } from '@/components/ui/Skeleton';
import { ErrorState, InlineNotice } from '@/components/ui/States';
import { useNow } from '@/hooks/useNow';
import { useTranslation } from '@/i18n/react';
import { getTranslator } from '@/i18n/runtime';
import { isApiError } from '@/lib/api/errors';
import { formatDayHeading } from '@/lib/format/dates';
import { formatList } from '@/lib/format/list';
import { relativeTime } from '@/lib/format/freshness';
import { useTripBookingRecommendations } from '@/lib/query/hooks/bookings';
import { useAdaptations, useItinerary, useRejectAdaptation, useTrip } from '@/lib/query/hooks/trips';
import { toast } from '@/lib/ui/toast';
import type { AdaptationProposal, ItineraryItem, RecommendedOffer } from '@/types/domain';
import { cn } from '@/utils/cn';
import { AdaptationReview } from '../adaptation/AdaptationReview';
import { ReplanSheet } from '../adaptation/ReplanSheet';
import { TravelUpdateBanner } from '../adaptation/TravelUpdateBanner';
import { usePendingProposal } from '../adaptation/usePendingProposal';
import { VersionHistory } from '../adaptation/VersionHistory';
import { BudgetSummary } from './BudgetSummary';
import { GenerateForTrip } from './GenerateForTrip';
import { ItemDetailSheet } from './ItemDetailSheet';
import { ItineraryItemCard } from './ItineraryItemCard';
import { TripBookingPanel } from './TripBookingPanel';

function offerSummary(offers: RecommendedOffer[]) {
  const t = getTranslator();
  const parts = (['stay', 'package', 'cab'] as const).flatMap((kind) => {
    const count = offers.filter((offer) => offer.kind === kind).length;
    return count ? [t(`itinerary.view.offers.${kind}`, { count })] : [];
  });
  return t('itinerary.view.offersMatched', { list: formatList(parts) });
}

const localIsoDate = (ms: number) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export function ItineraryView({ tripId }: { tripId: string }) {
  const now = useNow();
  const { t } = useTranslation();
  const trip = useTrip(tripId);
  const itinerary = useItinerary(tripId);
  const adaptations = useAdaptations(tripId);
  const reject = useRejectAdaptation(tripId);
  const pending = usePendingProposal(adaptations.data);

  const [reviewing, setReviewing] = useState<AdaptationProposal | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [replanOpen, setReplanOpen] = useState(false);
  const [selected, setSelected] = useState<ItineraryItem | null>(null);
  const [chosenDay, setChosenDay] = useState<number | null>(null);
  const [booking, setBooking] = useState<{ offer: RecommendedOffer; draft: BookingDraft } | null>(null);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const recommendations = useTripBookingRecommendations(tripId, itinerary.isSuccess);

  const canReview = trip.data?.permissions.canReviewAdaptations ?? false;
  const canEdit = trip.data?.permissions.canEdit ?? false;
  const canBook = trip.data?.permissions.canBook ?? false;

  if (itinerary.isPending) {
    return (
      <LoadingBlock label={t('itinerary.view.loading')} className="grid gap-4">
        <Skeleton className="h-11 w-full" />
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-28 w-full rounded-[1.25rem]" />
        ))}
      </LoadingBlock>
    );
  }

  if (itinerary.isError) {
    if (isApiError(itinerary.error) && itinerary.error.kind === 'not_found') {
      return <GenerateForTrip tripId={tripId} canEdit={canEdit} destinationName={trip.data?.destination?.name} />;
    }
    return <ErrorState error={itinerary.error} context="trip.load" onRetry={() => void itinerary.refetch()} retrying={itinerary.isFetching} />;
  }

  const plan = itinerary.data;
  const today = now ? localIsoDate(now) : null;
  const defaultDay = plan.days.find((d) => d.date === today)?.dayNumber ?? plan.days.find((d) => d.items.some((i) => i.status !== 'done'))?.dayNumber ?? plan.days[0]?.dayNumber ?? 1;
  const activeDay = plan.days.find((d) => d.dayNumber === (chosenDay ?? defaultDay)) ?? plan.days[0];
  const offers = recommendations.data?.offers ?? [];
  const offersByService = new Map(offers.map((offer) => [offer.service.serviceId, offer]));

  const bookOffer = (offer: RecommendedOffer, overrides?: BookingDraft) =>
    setBooking({
      offer,
      draft: { date: offer.suggested.date, timeSlot: offer.suggested.timeSlot, quantity: offer.suggested.quantity, nights: offer.suggested.nights, tripId, ...overrides },
    });

  const onTabKey = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const delta = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (!delta) return;
    event.preventDefault();
    const next = (index + delta + plan.days.length) % plan.days.length;
    setChosenDay(plan.days[next]!.dayNumber);
    tabRefs.current[next]?.focus();
  };

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="grid min-w-0 content-start gap-6">
        {pending && (
          <TravelUpdateBanner
            proposal={pending}
            canReview={canReview}
            onReview={() => setReviewing(pending)}
            keeping={reject.isPending}
            onKeepCurrent={() =>
              reject.mutate(pending.proposalId, {
                onSuccess: () => toast.success(getTranslator()('adaptation.toasts.kept')),
                onError: () => toast.error(getTranslator()('adaptation.toasts.keepFailed'), getTranslator()('adaptation.toasts.keepFailedDetail')),
              })
            }
          />
        )}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-[0.9375rem] text-[var(--text-muted)]">
            <span className="font-semibold text-[var(--text)]">{t('itinerary.view.version', { version: plan.version })}</span>
            {now > 0 && ` · ${t('itinerary.view.updated', { when: relativeTime(plan.createdAt, now) ?? '' })}`}
          </p>
          <div className="flex flex-wrap gap-2">
            {canReview && (
              <Button variant="secondary" size="sm" onClick={() => setReplanOpen(true)}>
                <EditIcon size={16} />
                {t('itinerary.view.changePlan')}
              </Button>
            )}
            <Button variant="subtle" size="sm" onClick={() => setHistoryOpen(true)}>
              <HistoryIcon size={16} />
              {t('itinerary.view.history')}
            </Button>
          </div>
        </div>

        {plan.validation.status === 'warnings' && (
          <InlineNotice tone="warning" title={t('itinerary.view.worthChecking')}>
            <ul className="grid gap-1">
              {plan.validation.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </InlineNotice>
        )}

        <div role="tablist" aria-label={t('itinerary.view.daysLabel')} className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:thin]">
          {plan.days.map((day, index) => {
            const selectedTab = day.dayNumber === activeDay?.dayNumber;
            return (
              <button
                key={day.dayNumber}
                ref={(node) => {
                  tabRefs.current[index] = node;
                }}
                type="button"
                role="tab"
                id={`day-tab-${day.dayNumber}`}
                aria-selected={selectedTab}
                aria-controls="day-panel"
                tabIndex={selectedTab ? 0 : -1}
                onClick={() => setChosenDay(day.dayNumber)}
                onKeyDown={(event) => onTabKey(event, index)}
                className={cn(
                  'grid min-w-[6.5rem] shrink-0 gap-0.5 rounded-2xl px-4 py-2.5 text-left ring-1 ring-inset transition-colors',
                  selectedTab ? 'bg-navy text-ivory ring-navy' : 'bg-[var(--surface-raised)] ring-[var(--hairline-strong)] hover:bg-[var(--surface-sunken)]',
                )}
              >
                <span className="text-[0.9375rem] font-semibold">
                  {t('itinerary.view.day', { day: day.dayNumber })}
                  {day.date === today && <span className="ml-1.5 text-[0.75rem] font-medium opacity-80">· {t('itinerary.view.today')}</span>}
                </span>
                <span className={cn('text-[0.8125rem]', selectedTab ? 'text-ivory/75' : 'text-[var(--text-muted)]')}>{formatDayHeading(day.date) ?? t('itinerary.view.stops', { count: day.items.length })}</span>
              </button>
            );
          })}
        </div>

        {activeDay && (
          <section id="day-panel" role="tabpanel" aria-labelledby={`day-tab-${activeDay.dayNumber}`} className="grid gap-4">
            <div>
              <h3 className="text-[1.375rem] font-semibold tracking-[-0.02em]">{activeDay.title}</h3>
              {activeDay.summary && <p className="text-[var(--text-muted)]">{activeDay.summary}</p>}
            </div>
            {activeDay.items.length === 0 ? (
              <p className="text-[var(--text-muted)]">{t('itinerary.view.nothingPlanned')}</p>
            ) : (
              <ol className="grid">
                {activeDay.items.map((item, index) => {
                  const offer = item.booking?.serviceId ? offersByService.get(item.booking.serviceId) : undefined;
                  const booked = item.booking?.status === 'booked';
                  return (
                    <ItineraryItemCard
                      key={item.itemId}
                      item={item}
                      isLast={index === activeDay.items.length - 1}
                      onOpen={() => setSelected(item)}
                      booking={
                        booked
                          ? { booked: true, bookingId: item.booking?.bookingId ?? null }
                          : offer && canBook && item.status !== 'done' && item.status !== 'skipped'
                            ? // A transfer is booked for its own day and time; a stay uses the plan's suggestion.
                              { onBook: () => bookOffer(offer, item.kind === 'transfer' ? { date: activeDay.date, timeSlot: item.startTime } : undefined) }
                            : undefined
                      }
                    />
                  );
                })}
              </ol>
            )}
          </section>
        )}

        <TripBookingPanel
          recommendations={recommendations.data}
          isPending={recommendations.isPending}
          error={recommendations.error}
          onRetry={() => void recommendations.refetch()}
          canBook={canBook}
          onBook={(offer) => bookOffer(offer)}
        />
      </div>

      <aside className="grid content-start gap-4" aria-label={t('itinerary.view.summaryLabel')}>
        <BudgetSummary budget={plan.budget} />
        {offers.length > 0 && (
          <section className="surface-card grid gap-2 p-5">
            <h3 className="text-[1.0625rem] font-semibold">{t('itinerary.view.readyToBook')}</h3>
            <p className="text-[0.9375rem] leading-relaxed text-[var(--text-muted)]">{offerSummary(offers)}</p>
            <a href="#book-this-plan" className="justify-self-start rounded-full text-[0.9375rem] font-semibold text-[var(--link)] underline underline-offset-4">
              {t('itinerary.view.seeOffers')}
            </a>
          </section>
        )}
        <section className="surface-card grid gap-2 p-5">
          <h3 className="text-[1.0625rem] font-semibold">{t('itinerary.view.aboutPlan')}</h3>
          <p className="text-[0.9375rem] leading-relaxed text-[var(--text-muted)]">{plan.summary}</p>
          <p className="text-[0.8125rem] text-[var(--text-subtle)]">{t('itinerary.view.timesNote')}</p>
        </section>
      </aside>

      {reviewing && <AdaptationReview tripId={tripId} proposal={reviewing} currentVersion={plan.version} onClose={() => setReviewing(null)} />}
      <VersionHistory tripId={tripId} open={historyOpen} currentVersion={plan.version} onClose={() => setHistoryOpen(false)} />
      <ReplanSheet
        tripId={tripId}
        open={replanOpen}
        currentVersion={plan.version}
        days={plan.days.map((d) => d.dayNumber)}
        onClose={() => setReplanOpen(false)}
        onProposal={(proposal) => {
          setReplanOpen(false);
          setReviewing(proposal);
        }}
      />
      <ItemDetailSheet item={selected} tripId={tripId} onClose={() => setSelected(null)} />
      {booking && <BookingSheet service={booking.offer.service} providerName={booking.offer.provider.name} open onClose={() => setBooking(null)} initial={booking.draft} />}
    </div>
  );
}
