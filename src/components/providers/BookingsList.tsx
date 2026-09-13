'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { TicketIcon } from '@/components/ui/icons';
import { LoadingBlock, Skeleton } from '@/components/ui/Skeleton';
import { EmptyState, ErrorState } from '@/components/ui/States';
import { StatusPill } from '@/components/ui/StatusPill';
import { formatDate } from '@/lib/format/dates';
import { describeCost } from '@/lib/format/money';
import { useBookings, useCancelBooking } from '@/lib/query/hooks/bookings';
import { toast } from '@/lib/ui/toast';
import type { Booking } from '@/types/domain';
import { cn } from '@/utils/cn';
import { BOOKING_STATUS, quantityLabel, UNIT_QUANTITY_LABEL } from './bookingVocabulary';
import { TicketQr } from './TicketQr';

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

function BookingCard({ booking, highlighted, onTicket, onCancel }: { booking: Booking; highlighted: boolean; onTicket: () => void; onCancel: () => void }) {
  const status = BOOKING_STATUS[booking.status];
  const price = describeCost(booking.price);
  const cancellable = ['processing', 'confirmed', 'payment_pending'].includes(booking.status) && booking.date >= today();
  const providerHref = booking.provider.providerType === 'guide' ? `/guides/${booking.provider.providerId}` : `/businesses/${booking.provider.providerId}`;

  return (
    <li id={`booking-${booking.bookingId}`} className={cn('surface-card grid scroll-mt-32 gap-3 p-5', highlighted && 'ring-2 ring-terracotta')}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-0.5">
          <h3 className="text-[1.0625rem] font-semibold">{booking.serviceName}</h3>
          <p className="flex flex-wrap items-center gap-2 text-[0.9375rem] text-[var(--text-muted)]">
            <Link href={providerHref} className="underline-offset-4 hover:underline">
              {booking.provider.name}
            </Link>
            {booking.provider.verified && <StatusPill tone="success">Verified</StatusPill>}
          </p>
        </div>
        <StatusPill tone={status.tone}>{status.label}</StatusPill>
      </div>
      <dl className="grid gap-2 text-[0.9375rem] sm:grid-cols-3">
        <div>
          <dt className="label text-[var(--text-subtle)]">{booking.unit === 'room_night' ? 'Check-in' : 'When'}</dt>
          <dd>
            {formatDate(booking.date)}
            {booking.timeSlot ? ` · ${booking.timeSlot}` : ''}
          </dd>
        </div>
        <div>
          <dt className="label text-[var(--text-subtle)]">{booking.unit === 'room_night' ? 'Stay' : UNIT_QUANTITY_LABEL[booking.unit]}</dt>
          <dd>{quantityLabel(booking.unit, booking.quantity, booking.nights)}</dd>
        </div>
        <div>
          <dt className="label text-[var(--text-subtle)]">Price</dt>
          <dd>
            {price.label}
            {price.status === 'estimate' && ' (estimate)'}
          </dd>
        </div>
      </dl>
      <p className="text-[0.875rem] text-[var(--text-muted)]">{booking.failureReason ?? status.description}</p>
      <div className="flex flex-wrap items-center gap-2">
        {booking.ticket && (
          <Button variant="navy" size="sm" onClick={onTicket}>
            <TicketIcon size={16} />
            Show ticket
          </Button>
        )}
        {booking.confirmationCode && <span className="font-mono text-[0.875rem] text-[var(--text-muted)]">Ref {booking.confirmationCode}</span>}
        {cancellable && (
          <Button variant="subtle" size="sm" onClick={onCancel} className="ml-auto">
            Cancel booking
          </Button>
        )}
      </div>
    </li>
  );
}

export function BookingsList({ tripId = null, highlightId = null }: { tripId?: string | null; highlightId?: string | null }) {
  const bookings = useBookings(tripId);
  const cancel = useCancelBooking();
  const [ticketFor, setTicketFor] = useState<Booking | null>(null);
  const [cancelling, setCancelling] = useState<Booking | null>(null);

  useEffect(() => {
    if (highlightId && bookings.data) document.getElementById(`booking-${highlightId}`)?.scrollIntoView({ block: 'center' });
  }, [highlightId, bookings.data]);

  if (bookings.isPending) {
    return (
      <LoadingBlock label="Loading bookings" className="grid gap-3">
        <Skeleton className="h-36 w-full rounded-[1.25rem]" />
        <Skeleton className="h-36 w-full rounded-[1.25rem]" />
      </LoadingBlock>
    );
  }
  if (bookings.isError) return <ErrorState error={bookings.error} onRetry={() => void bookings.refetch()} retrying={bookings.isFetching} />;
  if (bookings.data.length === 0) {
    return (
      <EmptyState
        icon={<TicketIcon />}
        title="No bookings yet"
        description="Book stays, cabs, packages and guides from a trip’s itinerary or a provider’s profile. Confirmations and tickets appear here."
        action={
          <ButtonLink href="/guides" variant="secondary">
            Find a local guide
          </ButtonLink>
        }
        className="surface-card"
      />
    );
  }

  const upcoming = bookings.data.filter((b) => b.date >= today() && b.status !== 'cancelled' && b.status !== 'failed').sort((a, b) => a.date.localeCompare(b.date));
  const other = bookings.data.filter((b) => !upcoming.includes(b));

  const list = (title: string, items: Booking[]) =>
    items.length > 0 && (
      <section className="grid gap-3" aria-label={title}>
        <h2 className="text-[1.25rem] font-semibold">{title}</h2>
        <ul className="grid gap-3">
          {items.map((booking) => (
            <BookingCard key={booking.bookingId} booking={booking} highlighted={booking.bookingId === highlightId} onTicket={() => setTicketFor(booking)} onCancel={() => setCancelling(booking)} />
          ))}
        </ul>
      </section>
    );

  return (
    <div className="grid gap-10">
      {list('Upcoming', upcoming)}
      {list('Past and closed', other)}

      <Dialog open={Boolean(ticketFor)} onClose={() => setTicketFor(null)} title={ticketFor?.serviceName ?? 'Ticket'} description={ticketFor ? `${formatDate(ticketFor.date)}${ticketFor.timeSlot ? ` · ${ticketFor.timeSlot}` : ''} · ${ticketFor.provider.name}` : undefined}>
        {ticketFor?.ticket && (
          <div className="grid justify-items-center gap-3 pb-4">
            <TicketQr ticket={ticketFor.ticket} />
            <p className="text-center text-[0.875rem] text-[var(--text-muted)]">Show this to {ticketFor.provider.name}. They can check the code on TravIndi’s verify page.</p>
          </div>
        )}
      </Dialog>

      <Dialog
        open={Boolean(cancelling)}
        onClose={() => setCancelling(null)}
        title="Cancel this booking?"
        description={cancelling ? `${cancelling.serviceName} with ${cancelling.provider.name} on ${formatDate(cancelling.date)}.` : undefined}
        dismissible={!cancel.isPending}
        footer={
          <>
            <Button variant="secondary" onClick={() => setCancelling(null)} disabled={cancel.isPending}>
              Keep booking
            </Button>
            <Button
              variant="danger"
              loading={cancel.isPending}
              onClick={() =>
                cancelling &&
                cancel.mutate(cancelling.bookingId, {
                  onSuccess: () => {
                    toast.success('Booking cancelled');
                    setCancelling(null);
                  },
                })
              }
            >
              Cancel booking
            </Button>
          </>
        }
      >
        {cancel.error ? <ErrorState error={cancel.error} context="booking.create" compact /> : <p className="text-[0.9375rem] text-[var(--text-muted)]">Check the provider’s cancellation policy for any refund. TravIndi doesn’t take payments.</p>}
      </Dialog>
    </div>
  );
}
