import { getDestination } from '@/data/destinations';
import type {
  BookingDto,
  BookingStatus,
  CostDto,
  ImageDto,
  ItineraryDto,
  ReasonDto,
  RecommendedOfferDto,
  RecommendedOfferKind,
  ServiceUnit,
  TripBookingRecommendationsDto,
  TripDto,
} from '@/types/api';
import { toDestinationSummary } from '../catalog/destinations';
import { offerSetFor, offerTraits } from '../catalog/offers';
import { findBusiness, findService } from '../catalog/providers';
import { toMinutes, toTime } from './itinerary';

const ACTIVE_BOOKING: BookingStatus[] = ['processing', 'confirmed', 'payment_pending'];
const DAY_MS = 86_400_000;

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

const addDays = (date: string, days: number) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);

/** How many times a listed price applies: per person or vehicle, rooms × nights, or once for a guide booking. */
export function priceMultiplier(unit: ServiceUnit, quantity: number, nights: number | null) {
  if (unit === 'group') return 1;
  return quantity * (unit === 'room_night' ? Math.max(1, nights ?? 1) : 1);
}

export function priceFor(price: CostDto, unit: ServiceUnit, quantity: number, nights: number | null): CostDto {
  if (price.status === 'unavailable') return { status: 'unavailable', value: null };
  const times = priceMultiplier(unit, quantity, nights);
  const scale = (money: CostDto['value'] | undefined) => (money ? { ...money, amount_minor: money.amount_minor * times } : null);
  return { ...price, value: scale(price.value), min: scale(price.min), max: scale(price.max) };
}

export function travellerMix(trip: TripDto) {
  const t = trip.intent.travellers;
  const children = t?.children ?? 0;
  const seniors = t?.seniors ?? 0;
  const total = (t?.adults ?? 0) + children + seniors;
  return { total: Math.max(1, total), children, seniors };
}

/** Two guests to a room; up to two children share with their parents. */
export function roomsFor(trip: TripDto) {
  const { total, children } = travellerMix(trip);
  return Math.max(1, Math.ceil((total - Math.min(children, 2)) / 2));
}

interface RecommendationInput {
  trip: TripDto;
  itinerary: ItineraryDto | null;
  /** The viewer's own bookings. Other members' bookings are never exposed. */
  bookings: BookingDto[];
  /** "YYYY-MM-DD". */
  today: string;
}

/**
 * Matches bookable stays, a package and cabs to a trip's current plan, with
 * dates, quantities and times taken from the itinerary.
 */
export function buildBookingRecommendations({ trip, itinerary, bookings, today }: RecommendationInput): TripBookingRecommendationsDto {
  const slug = trip.destination?.slug ?? null;
  const set = slug ? offerSetFor(slug) : null;
  const travellers = travellerMix(trip);
  const result: TripBookingRecommendationsDto = {
    trip_id: trip.trip_id,
    destination_name: trip.destination?.name ?? null,
    itinerary_version: itinerary?.version ?? null,
    travellers: travellers.total,
    offers: [],
    notes: [],
  };

  if (!slug || !set) {
    result.notes.push(slug ? 'No bookable stays or transport are listed for this destination yet.' : 'Choose a destination to see stays, packages and cabs.');
    return result;
  }
  if (trip.status === 'completed' || trip.status === 'cancelled' || (trip.end_date && trip.end_date < today)) {
    result.notes.push('This trip has ended, so there’s nothing left to book.');
    return result;
  }

  const intent = trip.intent;
  const days = itinerary?.days ?? [];
  const dayCount = Math.max(1, days.length || trip.days || intent.days || 2);
  const start = trip.start_date;
  // Once a trip is under way, suggestions cover only the days that are left.
  const elapsed = start && start < today ? Math.min(daysBetween(start, today), dayCount - 1) : 0;
  const underway = elapsed > 0;
  const firstDay = 1 + elapsed;
  const dateOfDay = (dayNumber: number) => (start ? addDays(start, dayNumber - 1) : null);
  const nights = Math.max(1, (intent.nights ?? dayCount - 1) - elapsed);
  const lowWalking = Boolean(intent.accessibility?.low_walking || intent.accessibility?.wheelchair || intent.accessibility?.step_free_access);
  const destination = getDestination(slug);
  const destinationImage = destination ? toDestinationSummary(destination).hero_image : null;

  const activeBooking = (serviceId: string, date: string | null, matchDate: boolean) => {
    const match = bookings.find(
      (b) => b.trip_id === trip.trip_id && b.service_id === serviceId && ACTIVE_BOOKING.includes(b.status) && (!matchDate || !date || b.date === date),
    );
    return match ? { booking_id: match.booking_id, status: match.status } : null;
  };

  const make = (kind: RecommendedOfferKind, serviceId: string, suggested: RecommendedOfferDto['suggested'], reasons: ReasonDto[], image: ImageDto | null) => {
    const found = findService(serviceId);
    const business = found ? findBusiness(found.provider.provider_id) : undefined;
    if (!found || !business || !found.service.bookable) return;
    if (intent.booking_preferences?.verified_providers_only && !found.provider.verified) return;
    result.offers.push({
      offer_id: `${kind}_${serviceId}`,
      kind,
      service: found.service,
      provider: { ...found.provider, category: business.category, address: business.address },
      reasons: [...reasons.slice(0, 2), ...(found.provider.verified ? [{ code: 'verified', label: 'Verified business' }] : [])],
      suggested,
      estimated_total: priceFor(found.service.price, found.service.unit, suggested.quantity, suggested.nights),
      image,
      booking: activeBooking(serviceId, suggested.date, kind === 'cab'),
    });
  };

  // Where to stay.
  const useSuite = Boolean(set.suite) && travellers.children > 0;
  const stayService = useSuite && set.suite ? set.suite : set.room;
  const rooms = useSuite ? Math.max(1, Math.ceil(travellers.total / 4)) : roomsFor(trip);
  const stayReasons: ReasonDto[] = [];
  if ((lowWalking || travellers.seniors > 0) && offerTraits(stayService).stepFree) {
    stayReasons.push({ code: 'step_free', label: lowWalking ? 'Step-free rooms with a lift' : 'Step-free rooms, easier for older travellers' });
  }
  stayReasons.push({
    code: 'covers_nights',
    label: `${plural(rooms, 'room')} for the ${plural(nights, 'night')} ${underway ? 'left in your trip' : 'of your plan'}`,
  });
  if (intent.booking_preferences?.free_cancellation_preferred) {
    stayReasons.push({ code: 'free_cancellation', label: 'Free cancellation until the day before' });
  }
  make('stay', stayService, { date: dateOfDay(firstDay), time_slot: null, quantity: rooms, nights, day_number: firstDay }, stayReasons, null);

  // A package for the whole plan only makes sense before the trip starts.
  if (!underway) {
    const packageDays = findService(set.package)?.service.package_details?.days ?? null;
    const reasons: ReasonDto[] = [];
    if (packageDays) {
      reasons.push(
        packageDays === dayCount
          ? { code: 'matches_length', label: `Covers all ${dayCount} days of your plan` }
          : { code: 'package_length', label: `A ${packageDays}-day package; your plan has ${dayCount} days` },
      );
    }
    reasons.push({ code: 'all_in_one', label: 'Stay, car and guide in one booking' });
    make('package', set.package, { date: dateOfDay(1), time_slot: null, quantity: travellers.total, nights: null, day_number: 1 }, reasons, destinationImage);
  }

  // Cabs: sized to the group, timed to the plan.
  const cars = Math.max(1, Math.ceil(travellers.total / Math.max(1, offerTraits(set.transfer).seats)));
  const carsLabel = `${plural(cars, 'vehicle')} for ${plural(travellers.total, 'traveller')}`;
  if (!underway) {
    const stayItem = days[0]?.items.find((item) => item.kind === 'stay');
    const pickup = stayItem?.start_time ? toTime(toMinutes(stayItem.start_time) - 60) : '10:00';
    make(
      'cab',
      set.transfer,
      { date: dateOfDay(1), time_slot: pickup, quantity: cars, nights: null, day_number: 1 },
      [{ code: 'arrival', label: stayItem?.start_time ? `Timed to reach your stay by ${stayItem.start_time} on Day 1` : 'Meets you on arrival' }, { code: 'fits_group', label: carsLabel }],
      null,
    );
  } else {
    const departure = days[days.length - 1]?.items.find((item) => item.kind === 'transfer');
    make(
      'cab',
      set.transfer,
      { date: dateOfDay(dayCount), time_slot: departure?.start_time ?? '12:00', quantity: cars, nights: null, day_number: dayCount },
      [{ code: 'departure', label: `Timed for your departure on Day ${dayCount}` }, { code: 'fits_group', label: carsLabel }],
      null,
    );
  }

  const fullDay = Math.min(dayCount, underway ? firstDay : 2);
  const dayItems = days.find((d) => d.day_number === fullDay)?.items ?? [];
  const firstStop = dayItems.find((item) => item.kind !== 'stay' && item.start_time)?.start_time ?? '09:30';
  const drives = dayItems.filter((item) => item.travel_from_previous?.mode === 'taxi').length;
  const dayReasons: ReasonDto[] = [];
  if (drives > 1) dayReasons.push({ code: 'drives', label: `Covers the ${drives} drives between stops on Day ${fullDay}` });
  if (lowWalking) dayReasons.push({ code: 'door_to_door', label: 'Door-to-door between stops, with less walking' });
  else if (intent.transport?.includes('taxi')) dayReasons.push({ code: 'matches_transport', label: 'Matches your preference for taxis' });
  if (dayReasons.length === 0) dayReasons.push({ code: 'fits_group', label: carsLabel });
  make(
    'cab',
    set.fullDay,
    { date: dateOfDay(fullDay), time_slot: toTime(Math.max(8 * 60, toMinutes(firstStop) - 30)), quantity: cars, nights: null, day_number: fullDay },
    dayReasons,
    null,
  );

  if (!start) result.notes.push('Your trip dates aren’t set yet, so choose dates when you book.');
  if (underway) result.notes.push('Your trip has already started, so these suggestions cover the days that are left.');
  return result;
}

/** Marks itinerary items whose recommended service the viewer has booked for this trip. */
export function withBookingStatus(itinerary: ItineraryDto, bookings: BookingDto[]): ItineraryDto {
  const active = bookings.filter((b) => b.trip_id === itinerary.trip_id && b.service_id && ACTIVE_BOOKING.includes(b.status));
  if (active.length === 0) return itinerary;
  return {
    ...itinerary,
    days: itinerary.days.map((day) => ({
      ...day,
      items: day.items.map((item) => {
        const serviceId = item.booking?.service_id;
        if (!serviceId) return item;
        // A stay covers several nights; a transfer is booked for its own day.
        const match = active.find((b) => b.service_id === serviceId && (item.kind === 'stay' || !day.date || b.date === day.date));
        return match ? { ...item, booking: { booking_id: match.booking_id, service_id: serviceId, status: 'booked' as const } } : item;
      }),
    })),
  };
}
