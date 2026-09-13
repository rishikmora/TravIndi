'use client';

import Link from 'next/link';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Field, Select, TextArea, TextInput } from '@/components/ui/Field';
import { MinusIcon, PlusIcon } from '@/components/ui/icons';
import { ErrorState, InlineNotice } from '@/components/ui/States';
import { StatusPill } from '@/components/ui/StatusPill';
import { useNow } from '@/hooks/useNow';
import { isApiError } from '@/lib/api/errors';
import { useAuth } from '@/lib/auth/provider';
import { formatDate, formatDuration } from '@/lib/format/dates';
import { describeCost } from '@/lib/format/money';
import { useBooking, useCreateBooking, useQuote } from '@/lib/query/hooks/bookings';
import { useTrips } from '@/lib/query/hooks/trips';
import { bookingMachine, type BookingFlowEvent, type BookingFlowState } from '@/lib/state/machine';
import { announce } from '@/lib/ui/toast';
import type { Booking, BookingQuote, Service } from '@/types/domain';
import { BOOKING_STATUS, quantityLabel, UNIT_PRICE_LABEL, UNIT_QUANTITY_LABEL } from './bookingVocabulary';
import { TicketQr } from './TicketQr';

const isoLocal = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const localDate = (offsetDays: number) => {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return isoLocal(d);
};

const addDays = (date: string, days: number) => {
  const d = new Date(`${date}T00:00:00`);
  d.setDate(d.getDate() + days);
  return isoLocal(d);
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const eventFor = (booking: Booking): BookingFlowEvent =>
  booking.status === 'processing' ? 'ACCEPTED_PROCESSING' : booking.status === 'confirmed' ? 'CONFIRMED' : booking.status === 'payment_pending' ? 'PAYMENT_PENDING' : 'FAILED';

/** Details to open the sheet with, e.g. matched to an itinerary. The traveller can change all of them. */
export interface BookingDraft {
  date?: string | null;
  timeSlot?: string | null;
  quantity?: number;
  nights?: number | null;
  tripId?: string | null;
}

interface BookingSheetProps {
  service: Service;
  providerName: string;
  open: boolean;
  onClose: () => void;
  initial?: BookingDraft;
}

function Stepper({ label, hint, value, min, max, onChange }: { label: string; hint?: string; value: number; min: number; max: number; onChange: (value: number) => void }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="grid">
        <span className="font-medium">{label}</span>
        {hint && <span className="text-[0.8125rem] text-[var(--text-muted)]">{hint}</span>}
      </span>
      <div role="group" aria-label={label} className="flex items-center gap-1 rounded-full p-1 ring-1 ring-inset ring-[var(--hairline-strong)]">
        <button type="button" aria-label="Fewer" disabled={value <= min} onClick={() => onChange(value - 1)} className="tap-target inline-flex items-center justify-center rounded-full disabled:opacity-40">
          <MinusIcon size={16} />
        </button>
        <output aria-live="polite" className="w-8 text-center font-semibold tabular-nums">
          {value}
        </output>
        <button type="button" aria-label="More" disabled={value >= max} onClick={() => onChange(value + 1)} className="tap-target inline-flex items-center justify-center rounded-full disabled:opacity-40">
          <PlusIcon size={16} />
        </button>
      </div>
    </div>
  );
}

function SummaryRow({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-[var(--text-muted)]">{term}</dt>
      <dd className="text-right font-medium">{children}</dd>
    </div>
  );
}

/** SELECT → REVIEW → CONFIRM → RESULT. "Confirmed" is shown only when the backend says so. */
export function BookingSheet({ service, providerName, open, onClose, initial }: BookingSheetProps) {
  const now = useNow();
  const { user, status: authStatus } = useAuth();
  const trips = useTrips(authStatus === 'authenticated');
  const quote = useQuote();
  const create = useCreateBooking();
  const [state, setState] = useState<BookingFlowState>('selecting');
  const [date, setDate] = useState(localDate(1));
  const [timeSlot, setTimeSlot] = useState('09:00');
  const [quantity, setQuantity] = useState(1);
  const [nights, setNights] = useState(1);
  const [tripId, setTripId] = useState('');
  const [current, setCurrent] = useState<BookingQuote | null>(null);
  const [contactName, setContactName] = useState('');
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [bookingId, setBookingId] = useState<string | null>(null);
  const booking = useBooking(bookingId);
  const clientBookingId = useRef('');
  const send = (event: BookingFlowEvent) => setState((s) => bookingMachine.next(s, event));

  const unit = service.unit;
  const isStay = unit === 'room_night';
  const pkg = service.packageDetails;
  const maxQuantity = service.capacity ?? 20;

  useEffect(() => {
    if (!open) return;
    setState('selecting');
    setCurrent(null);
    setBookingId(null);
    quote.reset();
    create.reset();
    setContactName(user?.displayName ?? '');
    setDate(initial?.date && initial.date >= localDate(0) ? initial.date : localDate(1));
    setTimeSlot(initial?.timeSlot ?? '09:00');
    setQuantity(clamp(initial?.quantity ?? 1, 1, maxQuantity));
    setNights(clamp(initial?.nights ?? 1, 1, 30));
    const active = trips.data?.find((t) => t.status === 'active' || t.status === 'ready');
    setTripId(initial?.tripId ?? active?.tripId ?? '');
    // Reset only when the sheet opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (state !== 'processing' || !booking.data || booking.data.status === 'processing') return;
    send(eventFor(booking.data));
    announce(`Booking ${BOOKING_STATUS[booking.data.status].label.toLowerCase()}.`, 'assertive');
  }, [state, booking.data]);

  const requestQuote = () => {
    send('REQUEST_QUOTE');
    quote.mutate(
      { serviceId: service.serviceId, date, timeSlot: isStay || pkg ? null : timeSlot, quantity, nights: isStay ? nights : null, tripId: tripId || null },
      {
        onSuccess: (result) => {
          setCurrent(result);
          // A new idempotency key per reviewed quote; retries of this submission reuse it.
          clientBookingId.current = crypto.randomUUID();
          send('QUOTE_READY');
        },
        onError: () => send('QUOTE_FAILED'),
      },
    );
  };

  const confirm = () => {
    if (!current) return;
    send(state === 'error' ? 'RETRY' : 'CONFIRM');
    create.mutate(
      { quoteId: current.quoteId, clientBookingId: clientBookingId.current, tripId: tripId || null, contactName: contactName.trim(), contactPhone: phone.trim() || null, notes: notes.trim() || null },
      {
        onSuccess: (created) => {
          setBookingId(created.bookingId);
          send(eventFor(created));
        },
        onError: () => send('SUBMIT_ERROR'),
      },
    );
  };

  const price = current ? describeCost(current.price) : null;
  const unitPrice = describeCost(service.price);
  const quoteMinutes = current && now ? Math.max(0, Math.round((Date.parse(current.expiresAt) - now) / 60_000)) : null;
  const result = booking.data;
  const busy = state === 'quoting' || state === 'submitting';
  const dateLabel = isStay ? 'Check-in' : pkg ? 'Start date' : unit === 'vehicle' ? 'Pickup date' : 'Date';

  let footer: ReactNode = null;
  if (state === 'selecting' || state === 'quoting') {
    footer = (
      <>
        <Button variant="secondary" onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button variant="navy" onClick={requestQuote} loading={state === 'quoting'} disabled={!date || date < localDate(0) || authStatus !== 'authenticated'}>
          Check price and availability
        </Button>
      </>
    );
  } else if (state === 'reviewing' || state === 'submitting' || state === 'error') {
    footer = (
      <>
        <Button variant="secondary" onClick={() => send('EDIT')} disabled={state === 'submitting'}>
          Change details
        </Button>
        <Button variant="accent" onClick={confirm} loading={state === 'submitting'} disabled={contactName.trim().length < 2}>
          {state === 'error' ? 'Try again' : 'Confirm booking'}
        </Button>
      </>
    );
  } else {
    footer = (
      <Button variant="navy" onClick={onClose}>
        Done
      </Button>
    );
  }

  return (
    <Dialog open={open} onClose={onClose} variant="sheet" title={service.name} description={providerName} dismissible={!busy} footer={footer}>
      <div aria-live="polite" className="grid gap-5 pb-2">
        {authStatus !== 'authenticated' && (
          <InlineNotice tone="info" title="Sign in to book" action={<Link href="/login" className="font-semibold text-[var(--link)] underline">Sign in</Link>}>
            Bookings are linked to your account so you can see tickets and changes.
          </InlineNotice>
        )}

        {(state === 'selecting' || state === 'quoting') && (
          <>
            {unitPrice.status !== 'unavailable' && (
              <p className="text-[0.9375rem] text-[var(--text-muted)]">
                <span className="font-semibold text-[var(--text)]">{unitPrice.label}</span> {UNIT_PRICE_LABEL[unit]}
                {unitPrice.status === 'estimate' && ' (estimate)'}
              </p>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={dateLabel}>
                {(control) => <TextInput {...control} type="date" min={localDate(0)} value={date} onChange={(e) => setDate(e.target.value)} />}
              </Field>
              {isStay ? (
                <div className="grid content-end pb-3 text-[0.9375rem] text-[var(--text-muted)]">
                  <span>
                    Check-out <span className="font-medium text-[var(--text)]">{date ? formatDate(addDays(date, nights)) : '—'}</span>
                  </span>
                </div>
              ) : pkg ? null : (
                <Field label={unit === 'vehicle' ? 'Pickup time' : 'Start time'}>
                  {(control) => <TextInput {...control} type="time" step={900} value={timeSlot} onChange={(e) => setTimeSlot(e.target.value)} />}
                </Field>
              )}
            </div>
            {isStay && <Stepper label="Nights" value={nights} min={1} max={30} onChange={setNights} />}
            <Stepper label={UNIT_QUANTITY_LABEL[unit]} hint={unit === 'vehicle' ? service.highlights[0] : undefined} value={quantity} min={1} max={maxQuantity} onChange={setQuantity} />
            {pkg && (
              <div className="grid gap-2 rounded-2xl bg-[var(--tone-neutral-bg)] p-4">
                <p className="font-semibold">
                  {pkg.days} days · {pkg.nights} {pkg.nights === 1 ? 'night' : 'nights'}
                </p>
                <ul className="grid gap-1 text-[0.9375rem]">
                  {pkg.includes.map((line) => (
                    <li key={line} className="flex items-start gap-2">
                      <span aria-hidden="true" className="mt-2 size-1.5 shrink-0 rounded-full bg-terracotta" />
                      {line}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {(trips.data?.length ?? 0) > 0 && (
              <Field label="Add to a trip" optional>
                {(control) => (
                  <Select {...control} value={tripId} onChange={(e) => setTripId(e.target.value)}>
                    <option value="">Not part of a trip</option>
                    {trips.data!.map((trip) => (
                      <option key={trip.tripId} value={trip.tripId}>
                        {trip.title}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
            )}
            {quote.error ? (
              isApiError(quote.error) && (quote.error.kind === 'validation' || quote.error.kind === 'conflict') ? (
                <InlineNotice tone="warning">{quote.error.message}</InlineNotice>
              ) : (
                <ErrorState error={quote.error} context="booking.quote" compact />
              )
            ) : null}
          </>
        )}

        {(state === 'reviewing' || state === 'submitting' || state === 'error') && current && price && (
          <>
            <dl className="grid gap-3 rounded-2xl bg-[var(--tone-neutral-bg)] p-4">
              <SummaryRow term={isStay ? 'Check-in' : 'When'}>
                {formatDate(current.date)}
                {current.timeSlot ? ` · ${current.timeSlot}` : ''}
              </SummaryRow>
              {isStay && current.nights && <SummaryRow term="Check-out">{formatDate(addDays(current.date, current.nights))}</SummaryRow>}
              <SummaryRow term={isStay ? 'Rooms and nights' : UNIT_QUANTITY_LABEL[unit]}>{quantityLabel(unit, current.quantity, current.nights)}</SummaryRow>
              {pkg && (
                <SummaryRow term="Package">
                  {pkg.days} days · {pkg.nights} {pkg.nights === 1 ? 'night' : 'nights'}
                </SummaryRow>
              )}
              {service.durationMinutes && !isStay && <SummaryRow term="Duration">{formatDuration(service.durationMinutes)}</SummaryRow>}
              <div className="flex justify-between gap-3 border-t border-[var(--hairline)] pt-3">
                <dt className="text-[var(--text-muted)]">{price.status === 'estimate' ? 'Estimated price' : 'Price'}</dt>
                <dd className="text-right">
                  <span className="text-[1.25rem] font-semibold">{price.label}</span>
                  {unit !== 'group' && unitPrice.status !== 'unavailable' && (
                    <span className="block text-[0.8125rem] text-[var(--text-muted)]">
                      {unitPrice.label} {UNIT_PRICE_LABEL[unit]}
                    </span>
                  )}
                  {price.status === 'estimate' && <span className="block text-[0.8125rem] text-[var(--text-muted)]">Final price confirmed by the provider</span>}
                </dd>
              </div>
            </dl>
            {current.payment.required && !current.payment.supported && (
              <InlineNotice tone="warning" title="Payment is made directly to the provider">
                Online payment isn’t available in TravIndi yet. Your booking will show as payment pending until you pay them.
              </InlineNotice>
            )}
            {current.cancellationPolicy && <p className="text-[0.875rem] text-[var(--text-muted)]">{current.cancellationPolicy}</p>}
            {quoteMinutes !== null && <p className="text-[0.8125rem] text-[var(--text-subtle)]">{quoteMinutes > 0 ? `This price is held for about ${quoteMinutes} more min.` : 'This price has expired. Change details to get a new one.'}</p>}
            <div className="grid gap-4">
              <Field label="Name for the booking">
                {(control) => <TextInput {...control} autoComplete="name" value={contactName} onChange={(e) => setContactName(e.target.value)} />}
              </Field>
              <Field label="Phone" optional hint="Shared with the provider only for this booking.">
                {(control) => <TextInput {...control} type="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />}
              </Field>
              <Field label="Notes for the provider" optional>
                {(control) => <TextArea {...control} maxLength={500} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. two seniors — please keep a gentle pace" />}
              </Field>
            </div>
            {state === 'error' && <ErrorState error={create.error} context="booking.create" compact politeness="assertive" />}
            {state === 'error' && <p className="text-[0.875rem] text-[var(--text-muted)]">Trying again is safe — it won’t create a second booking.</p>}
          </>
        )}

        {state === 'processing' && (
          <div role="status" className="grid justify-items-center gap-3 py-6 text-center">
            <span aria-hidden="true" className="size-9 animate-spin rounded-full border-4 border-teal border-t-transparent" />
            <StatusPill tone="info">Processing</StatusPill>
            <p className="font-semibold">Waiting for {providerName} to confirm</p>
            <p className="text-[var(--text-muted)]">You can close this — we’ll update your bookings when they reply.</p>
          </div>
        )}

        {(state === 'confirmed' || state === 'payment_pending' || state === 'failed') && result && (
          <div className="grid gap-4">
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill tone={BOOKING_STATUS[result.status].tone}>{BOOKING_STATUS[result.status].label}</StatusPill>
              {result.confirmationCode && <span className="font-mono text-[0.9375rem]">{result.confirmationCode}</span>}
            </div>
            <p className="text-[1.0625rem]">{result.failureReason ?? BOOKING_STATUS[result.status].description}</p>
            {result.ticket && <TicketQr ticket={result.ticket} />}
            <Link href={`/bookings?booking=${result.bookingId}`} className="justify-self-start font-semibold text-[var(--link)] underline underline-offset-4">
              View in your bookings
            </Link>
          </div>
        )}
      </div>
    </Dialog>
  );
}
