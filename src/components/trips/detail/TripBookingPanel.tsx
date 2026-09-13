'use client';

import Image from 'next/image';
import Link from 'next/link';
import type { ComponentType } from 'react';
import { BOOKING_STATUS, quantityLabel, UNIT_PRICE_LABEL } from '@/components/providers/bookingVocabulary';
import { Button, ButtonLink } from '@/components/ui/Button';
import { BedIcon, CarIcon, SuitcaseIcon } from '@/components/ui/icons';
import { LoadingBlock, Skeleton } from '@/components/ui/Skeleton';
import { ErrorState, InlineNotice } from '@/components/ui/States';
import { StatusPill } from '@/components/ui/StatusPill';
import { formatDate } from '@/lib/format/dates';
import { describeCost } from '@/lib/format/money';
import { isTrustedImageUrl } from '@/lib/media/trusted';
import type { RecommendedOffer, RecommendedOfferKind, TripBookingRecommendations } from '@/types/domain';

const GROUPS: Array<{ kind: RecommendedOfferKind; title: string; description: string; Icon: ComponentType<{ size?: number }> }> = [
  { kind: 'stay', title: 'Where to stay', description: 'Rooms for your dates and group.', Icon: BedIcon },
  { kind: 'package', title: 'Or book it all as a package', description: 'The stay, a car and a guide together, from one operator.', Icon: SuitcaseIcon },
  { kind: 'cab', title: 'Cabs', description: 'A transfer and a car with driver, timed to your days.', Icon: CarIcon },
];

function suggestionLabel(offer: RecommendedOffer) {
  const { suggested, service } = offer;
  const when = suggested.date ? formatDate(suggested.date) : suggested.dayNumber ? `Day ${suggested.dayNumber}` : null;
  return [
    offer.kind === 'stay' && when ? `Check-in ${when}` : when,
    suggested.timeSlot,
    quantityLabel(service.unit, suggested.quantity, suggested.nights),
    offer.kind === 'package' && service.packageDetails ? `${service.packageDetails.days} days` : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

function OfferCard({ offer, canBook, onBook, Icon }: { offer: RecommendedOffer; canBook: boolean; onBook: () => void; Icon: ComponentType<{ size?: number }> }) {
  const unitPrice = describeCost(offer.service.price);
  const total = describeCost(offer.estimatedTotal);
  const status = offer.booking ? BOOKING_STATUS[offer.booking.status] : null;
  const image = offer.image && isTrustedImageUrl(offer.image.url) ? offer.image : null;

  return (
    <li className="surface-card grid content-start overflow-hidden">
      {image && (
        <div className="relative aspect-[16/7] bg-navy">
          <Image src={image.url} alt={image.alt} fill sizes="(min-width: 1024px) 30vw, (min-width: 768px) 45vw, 100vw" unoptimized={!image.url.startsWith('/')} className="object-cover" />
        </div>
      )}
      <div className="grid gap-3 p-4">
        <div className="flex items-start gap-3">
          <span aria-hidden="true" className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-[var(--tone-accent-bg)] text-terracotta">
            <Icon size={20} />
          </span>
          <div className="grid min-w-0 flex-1 gap-0.5">
            <h5 className="font-semibold leading-snug">{offer.service.name}</h5>
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.875rem] text-[var(--text-muted)]">
              <Link href={`/businesses/${offer.provider.providerId}`} className="underline-offset-4 hover:underline">
                {offer.provider.name}
              </Link>
            </p>
          </div>
          {status && <StatusPill tone={status.tone}>{status.label}</StatusPill>}
        </div>

        {offer.reasons.length > 0 && (
          <ul className="grid gap-1 text-[0.9375rem]">
            {offer.reasons.map((reason) => (
              <li key={reason.code} className="flex items-start gap-2">
                <span aria-hidden="true" className="mt-2 size-1.5 shrink-0 rounded-full bg-terracotta" />
                {reason.label}
              </li>
            ))}
          </ul>
        )}

        <p className="text-[0.875rem] text-[var(--text-muted)]">{suggestionLabel(offer)}</p>

        <div className="flex flex-wrap items-end justify-between gap-3 border-t border-[var(--hairline)] pt-3">
          <p className="grid">
            <span className="text-[1.125rem] font-semibold">{total.label}</span>
            {unitPrice.status !== 'unavailable' && (
              <span className="text-[0.8125rem] text-[var(--text-muted)]">
                {total.status === 'estimate' ? 'Estimate · ' : ''}
                {unitPrice.label} {UNIT_PRICE_LABEL[offer.service.unit]}
              </span>
            )}
          </p>
          {offer.booking ? (
            <ButtonLink href={`/bookings?booking=${offer.booking.bookingId}`} variant="secondary" size="sm">
              View booking
            </ButtonLink>
          ) : canBook ? (
            <Button variant="accent" size="sm" onClick={onBook}>
              Book
            </Button>
          ) : null}
        </div>
      </div>
    </li>
  );
}

interface TripBookingPanelProps {
  recommendations: TripBookingRecommendations | undefined;
  isPending: boolean;
  error: unknown;
  onRetry: () => void;
  canBook: boolean;
  onBook: (offer: RecommendedOffer) => void;
}

/** Optional bookings matched to the plan: a stay, a package and cabs. */
export function TripBookingPanel({ recommendations, isPending, error, onRetry, canBook, onBook }: TripBookingPanelProps) {
  const offers = recommendations?.offers ?? [];

  return (
    <section id="book-this-plan" aria-labelledby="book-this-plan-title" className="grid scroll-mt-[calc(var(--nav-height)+5rem)] gap-5 border-t border-[var(--hairline)] pt-8">
      <div className="grid gap-1">
        <p className="label text-[var(--text-subtle)]">Optional</p>
        <h3 id="book-this-plan-title" className="text-[1.375rem] font-semibold tracking-[-0.02em]">
          Book stays, a package or cabs
        </h3>
        <p className="max-w-2xl text-[var(--text-muted)]">Matched to this plan’s dates, group and stops. Book only the parts you want, or none of them.</p>
      </div>

      {isPending ? (
        <LoadingBlock label="Loading booking suggestions" className="grid gap-3 md:grid-cols-2">
          <Skeleton className="h-52 w-full rounded-[1.25rem]" />
          <Skeleton className="h-52 w-full rounded-[1.25rem]" />
        </LoadingBlock>
      ) : error ? (
        <ErrorState error={error} compact onRetry={onRetry} />
      ) : (
        <>
          {(recommendations?.notes.length ?? 0) > 0 && (
            <InlineNotice tone="info">
              <ul className="grid gap-1">
                {recommendations!.notes.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            </InlineNotice>
          )}
          {offers.length > 0 && !canBook && <InlineNotice tone="neutral">Only the trip’s owner and editors can book for this trip.</InlineNotice>}
          {offers.length === 0 ? (
            <p className="text-[var(--text-muted)]">There’s nothing to book for this plan right now.</p>
          ) : (
            GROUPS.map(({ kind, title, description, Icon }) => {
              const group = offers.filter((offer) => offer.kind === kind);
              if (group.length === 0) return null;
              return (
                <div key={kind} className="grid gap-3">
                  <div>
                    <h4 className="text-[1.0625rem] font-semibold">{title}</h4>
                    <p className="text-[0.9375rem] text-[var(--text-muted)]">{description}</p>
                  </div>
                  <ul className="grid gap-3 md:grid-cols-2">
                    {group.map((offer) => (
                      <OfferCard key={offer.offerId} offer={offer} canBook={canBook} onBook={() => onBook(offer)} Icon={Icon} />
                    ))}
                  </ul>
                </div>
              );
            })
          )}
        </>
      )}
    </section>
  );
}
