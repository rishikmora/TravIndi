import type { AvailabilityDto, BookingDto, BookingQuoteDto, NotificationDto, ServiceDto, ServiceUnit } from '@/types/api';
import { findService } from '../catalog/providers';
import { scheduleBookingOutcome } from '../effects';
import { created, fail, newId, noContent, nowIso, ok, paginate } from '../http';
import { buildBookingRecommendations, priceFor } from '../logic/offers';
import { route, type RouteDefinition } from '../router';
import type { MockState, MockStore } from '../store';
import { businessFor, guideFor } from './discovery';
import { idempotent, readNumber, readString, requireTripMember, strip, validationFailed } from './shared';

type BookingRecord = MockState['bookings'][number];

const bookingDto = (record: BookingRecord): BookingDto => strip(record);
const notificationDto = (record: MockState['notifications'][number]): NotificationDto => strip(record);

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const PHONE = /^\+?[\d\s-]{8,16}$/;
/** Services the provider must be paid for directly before confirming. */
const PAYMENT_REQUIRED = new Set(['svc_city_cab']);
const today = () => new Date().toISOString().slice(0, 10);

const UNKNOWN_AVAILABILITY: AvailabilityDto = {
  status: 'unknown',
  next_available_at: null,
  freshness: { source_kind: 'unavailable', updated_at: null, source_label: null },
};

const CAPACITY_ISSUE: Record<Exclude<ServiceUnit, 'group'>, (capacity: number) => string> = {
  person: (capacity) => `This service takes up to ${capacity} people at a time.`,
  room_night: (capacity) => `Up to ${capacity} rooms can be booked at once.`,
  vehicle: (capacity) => `Up to ${capacity} vehicles can be booked at once.`,
};

function cancellationPolicy(service: ServiceDto) {
  if (service.unit === 'room_night') return 'Free cancellation until 14:00 the day before check-in. Later changes are at the stay’s discretion.';
  if (service.package_details) return 'Free cancellation up to 7 days before the start date. After that, the operator’s own policy applies.';
  return 'Free cancellation until the day before. Same-day changes are at the provider’s discretion.';
}

function lookupService(store: MockStore, serviceId: string) {
  const base = findService(serviceId);
  if (!base) return null;
  const provider = base.provider.provider_type === 'business' ? businessFor(store, base.provider.provider_id) : guideFor(store, base.provider.provider_id);
  const service = provider?.services.find((s) => s.service_id === serviceId) ?? base.service;
  const verified = provider
    ? provider.verification.some((e) => ['identity', 'business_registration', 'credential'].includes(e.kind) && e.status === 'verified')
    : base.provider.verified;
  return { service, provider: { ...base.provider, verified }, availability: provider?.availability ?? base.availability ?? UNKNOWN_AVAILABILITY };
}

export const commerceRoutes: RouteDefinition[] = [
  route('GET', '/v1/bookings', ({ store, query, requireUser }) => {
    const userId = requireUser().user_id;
    const items = store.state.bookings
      .filter((b) => b._owner_id === userId && (!query.trip_id || b.trip_id === query.trip_id))
      .sort((a, b) => b.date.localeCompare(a.date))
      .map(bookingDto);
    return ok({ items });
  }),

  route('GET', '/v1/trips/:tripId/booking-recommendations', (ctx) => {
    const { user, trip } = requireTripMember(ctx, ctx.params.tripId!);
    const { store } = ctx;
    return ok(
      buildBookingRecommendations({
        trip,
        itinerary: store.currentItinerary(trip.trip_id),
        bookings: store.state.bookings.filter((b) => b._owner_id === user.user_id).map(bookingDto),
        today: today(),
      }),
    );
  }),

  route('POST', '/v1/bookings/quotes', (ctx) => {
    const user = ctx.requireUser();
    const { store, body } = ctx;
    const serviceId = readString(body, 'service_id', { required: true, max: 100, label: 'Service' })!;
    const date = readString(body, 'date', { required: true, max: 10, label: 'Date' })!;
    if (!ISO_DATE.test(date)) validationFailed([{ field: 'date', issue: 'Choose a valid date.' }]);
    if (date < today()) validationFailed([{ field: 'date', issue: 'Choose today or a later date.' }]);
    const quantity = readNumber(body, 'quantity', 1, 20, 'Quantity');
    if (!Number.isInteger(quantity)) validationFailed([{ field: 'quantity', issue: 'Use a whole number.' }]);
    const tripId = typeof body.trip_id === 'string' ? body.trip_id : null;
    if (tripId) requireTripMember(ctx, tripId);

    const found = lookupService(store, serviceId);
    if (!found) fail(404, 'service_not_found', 'That service is no longer listed.');
    const { service, provider, availability } = found;
    if (!service.bookable) fail(422, 'service_not_bookable', 'This provider can’t take bookings through TravIndi right now. You can still contact them directly.');
    if (availability.status === 'unavailable') fail(409, 'unavailable', 'This service isn’t available on that date.');

    const unit = service.unit;
    const nights = unit === 'room_night' ? readNumber(body, 'nights', 1, 30, 'Nights') : null;
    if (nights !== null && !Number.isInteger(nights)) validationFailed([{ field: 'nights', issue: 'Use a whole number of nights.' }]);
    // Stays have fixed check-in times; everything else starts at a chosen time.
    const timeSlot = unit === 'room_night' ? null : readString(body, 'time_slot', { max: 20, label: 'Time' });
    if (unit !== 'group' && service.capacity && quantity > service.capacity) {
      validationFailed([{ field: 'quantity', issue: CAPACITY_ISSUE[unit](service.capacity) }]);
    }
    const places = unit === 'group' ? 1 : quantity;
    const slot = store.state.availability.find((s) => s.service_id === serviceId && s.date === date && s.time_slot === timeSlot);
    if (slot && (slot.status === 'closed' || slot.booked + places > slot.capacity)) {
      fail(409, 'slot_unavailable', 'That time is fully booked. Try another time or date.');
    }

    const quote: BookingQuoteDto = {
      quote_id: newId('qte'),
      service,
      provider,
      date,
      time_slot: timeSlot,
      quantity,
      nights,
      price: priceFor(service.price, unit, quantity, nights),
      availability,
      cancellation_policy: cancellationPolicy(service),
      expires_at: new Date(Date.now() + 15 * 60_000).toISOString(),
      payment: { required: PAYMENT_REQUIRED.has(serviceId), supported: false },
    };
    store.state.quotes.push({ owner_id: user.user_id, value: quote });
    store.persist();
    return created(quote);
  }),

  route('POST', '/v1/bookings', async (ctx) => {
    const user = ctx.requireUser();
    const { store, hub, body } = ctx;
    const clientBookingId = readString(body, 'client_booking_id', { required: true, max: 100, label: 'Booking reference' })!;

    const { body: booking } = await idempotent(ctx, 'booking', clientBookingId, () => {
      const quote = store.state.quotes.find((q) => q.owner_id === user.user_id && q.value.quote_id === body.quote_id)?.value;
      if (!quote) fail(404, 'quote_not_found', 'That price quote couldn’t be found. Get a fresh quote to continue.');
      if (Date.parse(quote.expires_at) < Date.now()) fail(409, 'quote_expired', 'This price quote has expired. Get a fresh quote to continue.');
      const contactName = readString(body, 'contact_name', { required: true, min: 2, max: 60, label: 'Contact name' })!;
      const phone = readString(body, 'contact_phone', { max: 20, label: 'Phone' });
      if (phone && !PHONE.test(phone)) validationFailed([{ field: 'contact_phone', issue: 'Enter a valid phone number.' }]);
      readString(body, 'notes', { max: 500, label: 'Notes' });

      const slot = store.state.availability.find((s) => s.service_id === quote.service.service_id && s.date === quote.date && s.time_slot === quote.time_slot);
      if (slot) slot.booked += quote.service.unit === 'group' ? 1 : quote.quantity;

      const record: BookingRecord = {
        booking_id: newId('bkg'),
        client_booking_id: clientBookingId,
        trip_id: typeof body.trip_id === 'string' && store.isTripMember(user.user_id, body.trip_id) ? body.trip_id : null,
        service_id: quote.service.service_id,
        service_name: quote.service.name,
        unit: quote.service.unit,
        provider: quote.provider,
        date: quote.date,
        time_slot: quote.time_slot,
        quantity: quote.quantity,
        nights: quote.nights,
        price: quote.price,
        status: 'processing',
        confirmation_code: null,
        ticket: null,
        failure_reason: null,
        created_at: nowIso(),
        updated_at: nowIso(),
        _owner_id: user.user_id,
        _contact_name: contactName,
      };
      store.state.bookings.push(record);
      scheduleBookingOutcome(store, hub, record.booking_id, quote.payment.required);
      store.persist();
      return bookingDto(record);
    });
    return created(booking);
  }),

  route('GET', '/v1/bookings/:bookingId', ({ store, params, requireUser }) => {
    const userId = requireUser().user_id;
    const booking = store.state.bookings.find((b) => b.booking_id === params.bookingId);
    const providerId = store.providerIdFor(userId);
    if (!booking || (booking._owner_id !== userId && booking.provider.provider_id !== providerId)) {
      fail(404, 'booking_not_found', 'That booking could not be found.');
    }
    return ok(bookingDto(booking));
  }),

  route('POST', '/v1/bookings/:bookingId/cancel', ({ store, hub, params, requireUser }) => {
    const userId = requireUser().user_id;
    const booking = store.state.bookings.find((b) => b.booking_id === params.bookingId && b._owner_id === userId);
    if (!booking) fail(404, 'booking_not_found', 'That booking could not be found.');
    if (booking.status === 'cancelled' || booking.status === 'failed') fail(409, 'booking_closed', 'This booking is already closed.');
    if (booking.date < today()) fail(409, 'booking_past', 'Past bookings can’t be cancelled.');
    booking.status = 'cancelled';
    booking.updated_at = nowIso();
    hub.publish(`user:${userId}`, 'booking.updated', { booking: bookingDto(booking) });
    store.persist();
    return ok(bookingDto(booking));
  }),

  route('GET', '/v1/notifications', ({ store, query, requireUser }) => {
    const userId = requireUser().user_id;
    const items = store.state.notifications
      .filter((n) => n._user_id === userId && (query.unread_only !== 'true' || !n.read_at))
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .map(notificationDto);
    return ok(paginate(items, query.cursor, 30));
  }),

  route('POST', '/v1/notifications/read-all', ({ store, requireUser }) => {
    const userId = requireUser().user_id;
    const now = nowIso();
    store.state.notifications.forEach((n) => {
      if (n._user_id === userId && !n.read_at) n.read_at = now;
    });
    store.persist();
    return noContent();
  }),

  route('POST', '/v1/notifications/:notificationId/read', ({ store, params, requireUser }) => {
    const userId = requireUser().user_id;
    const notification = store.state.notifications.find((n) => n.notification_id === params.notificationId && n._user_id === userId);
    if (!notification) fail(404, 'notification_not_found', 'That notification could not be found.');
    notification.read_at ??= nowIso();
    store.persist();
    return ok(notificationDto(notification));
  }),
];
