import { describe, expect, it } from 'vitest';
import type { BookingDto, TripDto } from '@/types/api';
import { seedTrips } from '../seed/trips';
import { buildItinerary } from './itinerary';
import { buildBookingRecommendations, priceFor, roomsFor, withBookingStatus } from './offers';

const TODAY = '2026-10-01';

/** The seeded Hyderabad family trip (2 adults, 2 seniors, low walking), moved to fixed dates. */
function hyderabadTrip(overrides: Partial<TripDto> = {}): TripDto {
  const trip = structuredClone(seedTrips().trips[0]!);
  return { ...trip, status: 'ready', start_date: '2026-10-10', end_date: '2026-10-13', ...overrides };
}

describe('priceFor', () => {
  const nightly = { status: 'authoritative' as const, value: { amount_minor: 520_000, currency: 'INR' } };

  it('multiplies stays by rooms and nights', () => {
    expect(priceFor(nightly, 'room_night', 2, 3).value?.amount_minor).toBe(3_120_000);
  });

  it('charges guide bookings once, whatever the group size', () => {
    expect(priceFor(nightly, 'group', 5, null).value?.amount_minor).toBe(520_000);
  });

  it('keeps unknown prices unknown', () => {
    expect(priceFor({ status: 'unavailable', value: null }, 'person', 2, null)).toEqual({ status: 'unavailable', value: null });
  });
});

describe('roomsFor', () => {
  it('puts two guests in a room and lets young children share', () => {
    expect(roomsFor(hyderabadTrip())).toBe(2);
    const family = hyderabadTrip();
    family.intent = { ...family.intent, travellers: { adults: 2, children: 2, seniors: 0 } };
    expect(roomsFor(family)).toBe(1);
  });
});

describe('buildBookingRecommendations', () => {
  it('matches a stay, a package and cabs to the plan', () => {
    const trip = hyderabadTrip();
    const result = buildBookingRecommendations({ trip, itinerary: buildItinerary(trip), bookings: [], today: TODAY });

    expect(result.offers.map((offer) => offer.kind)).toEqual(['stay', 'package', 'cab', 'cab']);

    const [stay, pkg, arrival] = result.offers;
    expect(stay?.service.service_id).toBe('svc_lakeview_room');
    expect(stay?.suggested).toMatchObject({ date: '2026-10-10', quantity: 2, nights: 3 });
    expect(stay?.reasons.map((reason) => reason.code)).toContain('step_free');
    expect(stay?.estimated_total.value?.amount_minor).toBe(5200 * 100 * 2 * 3);

    expect(pkg?.reasons[0]?.code).toBe('matches_length');
    expect(pkg?.suggested.quantity).toBe(4);

    expect(arrival?.suggested).toMatchObject({ date: '2026-10-10', time_slot: '10:00', quantity: 1 });
  });

  it('covers only the days left once the trip has started', () => {
    const trip = hyderabadTrip({ status: 'active', start_date: '2026-09-30', end_date: '2026-10-03' });
    const result = buildBookingRecommendations({ trip, itinerary: buildItinerary(trip), bookings: [], today: TODAY });

    expect(result.offers.some((offer) => offer.kind === 'package')).toBe(false);
    expect(result.offers[0]?.suggested).toMatchObject({ date: TODAY, nights: 2 });
    expect(result.offers.find((offer) => offer.reasons.some((reason) => reason.code === 'departure'))?.suggested.date).toBe('2026-10-03');
    expect(result.notes.join(' ')).toMatch(/already started/);
  });

  it('suggests nothing for a finished trip', () => {
    const result = buildBookingRecommendations({ trip: hyderabadTrip({ status: 'completed' }), itinerary: null, bookings: [], today: TODAY });
    expect(result.offers).toHaveLength(0);
    expect(result.notes).toHaveLength(1);
  });

  it('shows the viewer’s existing booking on the offer', () => {
    const trip = hyderabadTrip();
    const booking = { booking_id: 'bkg_1', trip_id: trip.trip_id, service_id: 'svc_lakeview_room', status: 'confirmed', date: '2026-10-10' } as BookingDto;
    const result = buildBookingRecommendations({ trip, itinerary: buildItinerary(trip), bookings: [booking], today: TODAY });
    expect(result.offers[0]?.booking).toEqual({ booking_id: 'bkg_1', status: 'confirmed' });
  });
});

describe('withBookingStatus', () => {
  it('marks booked items and leaves other recommendations open', () => {
    const trip = hyderabadTrip();
    const itinerary = buildItinerary(trip);
    const booking = { booking_id: 'bkg_1', trip_id: trip.trip_id, service_id: 'svc_lakeview_room', status: 'confirmed', date: '2026-10-10' } as BookingDto;

    const marked = withBookingStatus(itinerary, [booking]);
    const stay = marked.days[0]?.items.find((item) => item.kind === 'stay');
    const departure = marked.days[marked.days.length - 1]?.items.find((item) => item.kind === 'transfer');

    expect(stay?.booking).toEqual({ booking_id: 'bkg_1', service_id: 'svc_lakeview_room', status: 'booked' });
    expect(departure?.booking).toEqual({ booking_id: null, service_id: 'svc_deccan_airport', status: 'recommended' });
  });
});
