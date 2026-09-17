'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { AlertIcon, RouteIcon, WalkIcon } from '@/components/ui/icons';
import { StatusPill } from '@/components/ui/StatusPill';
import { useTranslation } from '@/i18n/react';
import { formatLocalTime } from '@/lib/format/dates';
import { describeCost } from '@/lib/format/money';
import type { ItineraryItem } from '@/types/domain';
import { cn } from '@/utils/cn';
import { ITEM_STATUS, stepFreeLabel, travelLegLabel, WALKING_LABEL } from './itemVocabulary';

/** Booking state for items that have a recommended service, such as a stay or a transfer. */
export interface ItemBookingAction {
  booked?: boolean;
  bookingId?: string | null;
  onBook?: () => void;
}

export function ItineraryItemCard({ item, onOpen, isLast, booking }: { item: ItineraryItem; onOpen: () => void; isLast: boolean; booking?: ItemBookingAction }) {
  const { t } = useTranslation();
  const status = ITEM_STATUS[item.status];
  const cost = describeCost(item.cost);
  const leg = travelLegLabel(item.travelFromPrevious);
  const done = item.status === 'done' || item.status === 'skipped';

  return (
    <li className="relative grid grid-cols-[4.5rem_1fr] gap-3 sm:grid-cols-[5.5rem_1fr] sm:gap-5">
      <div className="pt-4 text-right">
        <p className={cn('font-semibold tabular-nums', done && 'text-[var(--text-muted)]')}>{formatLocalTime(item.startTime) ?? '—'}</p>
        {item.endTime && <p className="text-[0.8125rem] tabular-nums text-[var(--text-subtle)]">{formatLocalTime(item.endTime)}</p>}
      </div>
      <div className="relative pb-4">
        <span aria-hidden="true" className={cn('absolute -left-[0.9rem] top-5 size-2.5 rounded-full ring-4 ring-[var(--surface)] sm:-left-[1.4rem]', item.status === 'changed' ? 'bg-teal' : done ? 'bg-[var(--hairline-strong)]' : 'bg-brass')} />
        {!isLast && <span aria-hidden="true" className="absolute -left-[0.6rem] top-8 h-full w-px bg-[var(--hairline)] sm:-left-[1.1rem]" />}
        {leg && (
          <p className="mb-2 flex items-center gap-1.5 text-[0.8125rem] text-[var(--text-subtle)]">
            <RouteIcon size={14} aria-hidden="true" />
            {leg}
          </p>
        )}
        <article className={cn('surface-card grid gap-2 p-4', item.status === 'changed' && 'ring-2 ring-teal', done && 'opacity-80')}>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="grid gap-0.5">
              <h4 className="text-[1.0625rem] font-semibold leading-snug">
                <button type="button" onClick={onOpen} className="text-left underline-offset-4 hover:underline">
                  {item.title}
                </button>
              </h4>
              <p className="text-[0.875rem] text-[var(--text-muted)]">{item.category}</p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {status && <StatusPill tone={status.tone}>{status.label}</StatusPill>}
            </div>
          </div>

          {item.reasons[0] && <p className="text-[0.9375rem] text-[var(--text)]">{item.reasons[0].label}</p>}

          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[0.8125rem] text-[var(--text-muted)]">
            {item.accessibility?.walkingLevel && (
              <li className="inline-flex items-center gap-1">
                <WalkIcon size={14} aria-hidden="true" />
                {WALKING_LABEL[item.accessibility.walkingLevel]}
              </li>
            )}
            {item.accessibility && item.kind !== 'meal' && <li>{stepFreeLabel(item.accessibility.stepFree)}</li>}
            <li className={cn(cost.status === 'unavailable' && 'italic')}>
              {cost.label}
              {cost.status === 'estimate' && <span className="not-italic"> {t('itinerary.item.estimate')}</span>}
            </li>
          </ul>

          {item.safetyNote && (
            <p className="flex items-start gap-1.5 rounded-xl bg-[var(--tone-warning-bg)] px-3 py-2 text-[0.875rem]">
              <AlertIcon size={16} className="mt-0.5 shrink-0 text-[var(--tone-warning-fg)]" aria-hidden="true" />
              {item.safetyNote}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <button type="button" onClick={onOpen} className="rounded-full text-[0.875rem] font-semibold text-[var(--link)] underline-offset-4 hover:underline" aria-label={t('itinerary.item.whyLabel', { title: item.title })}>
              {t('itinerary.item.whyThis')}
            </button>
            {booking?.booked ? (
              <Link href={booking.bookingId ? `/bookings?booking=${booking.bookingId}` : '/bookings'} className="rounded-full" aria-label={t('itinerary.item.bookedLabel', { title: item.title })}>
                <StatusPill tone="success">{t('itinerary.item.booked')}</StatusPill>
              </Link>
            ) : booking?.onBook ? (
              <Button variant="secondary" size="sm" onClick={booking.onBook}>
                {item.kind === 'stay' ? t('itinerary.item.bookStay') : t('itinerary.item.bookCab')}
              </Button>
            ) : null}
          </div>
        </article>
      </div>
    </li>
  );
}
