import { describe, expect, it } from 'vitest';
import { destinations } from '@/data/destinations';
import type { BookingDto } from '@/types/api';
import { metroNetworkById } from '../catalog/transport';
import {
  buildCabQuote,
  buildDepartureQuote,
  buildMetroFare,
  buildMetroQuote,
  cabPlacesFor,
  cabSearch,
  cabTimingIssue,
  departuresOn,
  estimateRide,
  findDeparture,
  isCalendarDate,
  istDate,
  istInstant,
  metroFareRupees,
  metroTicketDateIssue,
  planMetroJourney,
  resolveCabEndpoint,
  searchDepartures,
  seatsLeft,
  transportPlaces,
} from './transport';

const TODAY = '2026-10-01';
/** 10:00 in India on TODAY. */
const NOW = istInstant(TODAY, '10:00');

const booking = (availabilityId: string, passengers: number, status: BookingDto['status'] = 'confirmed') =>
  ({ status, quantity: passengers, transport: { availability_id: availabilityId, passengers } }) as BookingDto;

const delhi = () => metroNetworkById('metro_delhi')!;
const hyderabad = () => metroNetworkById('metro_hyderabad')!;

describe('dates in India', () => {
  it('converts between instants and local dates and times', () => {
    expect(istDate(Date.parse('2026-10-01T19:00:00Z'))).toBe('2026-10-02');
    expect(new Date(istInstant('2026-10-01', '06:15')).toISOString()).toBe('2026-10-01T00:45:00.000Z');
  });

  it('rejects dates that do not exist', () => {
    expect(isCalendarDate('2026-02-31')).toBe(false);
    expect(isCalendarDate('2026-02-28')).toBe(true);
  });
});

describe('transportPlaces', () => {
  const places = transportPlaces();

  it('lists cabs for every destination', () => {
    for (const destination of destinations) {
      expect(places.find((p) => p.slug === destination.slug)?.modes, destination.slug).toContain('cab');
    }
  });

  it('describes each mode a place has, in a fixed order', () => {
    const delhi = places.find((p) => p.slug === 'delhi')!;
    expect(delhi.modes).toEqual(['flight', 'bus', 'metro', 'cab']);
    expect(delhi.airport_name).toBe('Indira Gandhi International Airport');
    expect(delhi.metro_network_id).toBe('metro_delhi');
    expect(places.find((p) => p.slug === 'bengaluru')?.metro_network_id).toBe('metro_bengaluru');
    expect(places.find((p) => p.slug === 'spiti-valley')?.modes).not.toContain('flight');
  });
});

describe('scheduled departures', () => {
  it('is stable between calls and consistent within itself', () => {
    const first = departuresOn('flight', 'delhi', 'mumbai', '2026-10-05', TODAY);
    expect(first.length).toBeGreaterThan(0);
    expect(departuresOn('flight', 'delhi', 'mumbai', '2026-10-05', TODAY)).toEqual(first);
    for (const departure of first) {
      expect(departure.endsAtMs).toBeGreaterThan(departure.startsAtMs);
      expect(departure.baseBooked).toBeLessThanOrEqual(departure.capacity);
      expect(departure.fare).toBeGreaterThan(0);
      expect(istDate(departure.startsAtMs)).toBe('2026-10-05');
    }
    expect([...first].sort((a, b) => a.startsAtMs - b.startsAtMs)).toEqual(first);
  });

  it('only lists dates within the published schedule', () => {
    expect(departuresOn('flight', 'delhi', 'mumbai', '2026-09-30', TODAY)).toEqual([]);
    expect(departuresOn('flight', 'delhi', 'mumbai', '2027-01-15', TODAY)).toEqual([]);
    expect(departuresOn('flight', 'delhi', 'agra', '2026-10-05', TODAY)).toEqual([]);
  });

  it('closes seasonal mountain roads', () => {
    expect(departuresOn('bus', 'manali', 'spiti-valley', '2027-01-10', '2026-12-20')).toEqual([]);
    expect(departuresOn('bus', 'manali', 'spiti-valley', '2026-10-10', TODAY).length).toBeGreaterThanOrEqual(0);
    expect(departuresOn('bus', 'kochi', 'alappuzha', '2026-10-10', TODAY).length).toBeGreaterThan(0);
  });
});

describe('searchDepartures', () => {
  const window = { afterMs: istInstant('2026-10-05', '00:00'), beforeMs: istInstant('2026-10-06', '00:00'), nowMs: NOW, bookings: [] };

  it('returns departures within the window, earliest first, like the backend search', () => {
    const results = searchDepartures({ ...window, category: 'AIRLINE', originDestinationId: 'dst_delhi', destinationDestinationId: 'dst_mumbai' });
    expect(results.length).toBeGreaterThan(0);
    for (const result of results) {
      expect(result.origin_destination_id).toBe('dst_delhi');
      expect(result.destination_destination_id).toBe('dst_mumbai');
      expect(Date.parse(result.starts_at)).toBeGreaterThanOrEqual(window.afterMs);
      expect(Date.parse(result.starts_at)).toBeLessThan(window.beforeMs);
      expect(result.remaining).toBe(result.capacity - result.booked_count);
      expect(result.price?.status).toBe('estimate');
    }
    expect(results.map((r) => r.starts_at)).toEqual([...results.map((r) => r.starts_at)].sort());
  });

  it('never lists departures that have already left', () => {
    const results = searchDepartures({ category: 'BUS_OPERATOR', originDestinationId: 'dst_kochi', destinationDestinationId: 'dst_alappuzha', afterMs: istInstant(TODAY, '00:00'), beforeMs: istInstant('2026-10-02', '00:00'), nowMs: NOW, bookings: [] });
    expect(results.every((r) => Date.parse(r.starts_at) >= NOW)).toBe(true);
  });

  it('has no sample trains, and nothing for unknown places', () => {
    expect(searchDepartures({ ...window, category: 'RAILWAY' })).toEqual([]);
    expect(searchDepartures({ ...window, category: 'AIRLINE', originDestinationId: 'dst_atlantis' })).toEqual([]);
  });
});

describe('seats', () => {
  const departure = departuresOn('bus', 'bengaluru', 'mysuru', '2026-10-06', TODAY)[0]!;

  it('counts active TravIndi bookings against the seats left', () => {
    const before = seatsLeft(departure, []);
    const after = seatsLeft(departure, [booking(departure.availabilityId, 2), booking(departure.availabilityId, 3, 'cancelled'), booking('avl_other', 4)]);
    expect(after).toBe(Math.max(0, before - 2));
  });

  it('finds a departure from its ids, and rejects mismatched ids', () => {
    expect(findDeparture(departure.serviceId, departure.availabilityId, TODAY)?.startsAtMs).toBe(departure.startsAtMs);
    expect(findDeparture('svc_bus_bengaluru_goa_banyan', departure.availabilityId, TODAY)).toBeNull();
    expect(findDeparture(departure.serviceId, 'avl_nonsense', TODAY)).toBeNull();
  });
});

describe('metro journeys', () => {
  it('stays on one line when it can', () => {
    const journey = planMetroJourney(delhi(), 'rajiv-chowk', 'hauz-khas')!;
    expect(journey.legs).toHaveLength(1);
    expect(journey.interchanges).toHaveLength(0);
    expect(journey.legs[0]).toMatchObject({ line_name: 'Yellow Line', towards_station_name: 'Millennium City Centre Gurugram' });
    expect(journey.distanceKm).toBeCloseTo(9.4, 1);
  });

  it('changes lines where the networks meet', () => {
    const journey = planMetroJourney(hyderabad(), 'assembly', 'hitec-city')!;
    expect(journey.legs.map((leg) => leg.line_name)).toEqual(['Red Line', 'Blue Line']);
    expect(journey.interchanges).toEqual([
      expect.objectContaining({ station_name: 'Ameerpet', from_line_name: 'Red Line', to_line_name: 'Blue Line' }),
    ]);
    expect(journey.durationMinutes).toBe(journey.legs.reduce((sum, leg) => sum + leg.duration_minutes, 0) + 6);
  });

  it('names the real terminal when the listed stations stop short of it', () => {
    const journey = planMetroJourney(delhi(), 'rajiv-chowk', 'mayur-vihar-1')!;
    expect(journey.legs[0]?.towards_station_name).toBe('Noida Electronic City');
  });

  it('has no journey for unknown or identical stations', () => {
    expect(planMetroJourney(delhi(), 'rajiv-chowk', 'rajiv-chowk')).toBeNull();
    expect(planMetroJourney(delhi(), 'rajiv-chowk', 'charminar')).toBeNull();
  });

  it('prices by distance slab', () => {
    expect(metroFareRupees(delhi(), 1.5)).toBe(11);
    expect(metroFareRupees(delhi(), 9.4)).toBe(32);
    expect(metroFareRupees(delhi(), 60)).toBe(64);
  });

  it('sells tickets for today and the next week only', () => {
    expect(metroTicketDateIssue(TODAY, NOW)).toBeNull();
    expect(metroTicketDateIssue('2026-09-30', NOW)?.code).toBe('date_in_past');
    expect(metroTicketDateIssue('2026-10-20', NOW)?.code).toBe('date_too_far');
  });
});

describe('cabs', () => {
  const airport = () => resolveCabEndpoint('delhi', cabPlacesFor('delhi').find((p) => p.kind === 'airport')!.place_id, null)!;
  const qutub = () => resolveCabEndpoint('delhi', 'cab_delhi_qutub-minar', null)!;

  it('suggests arrival hubs and sights as pickup points', () => {
    const places = cabPlacesFor('delhi');
    expect(places[0]).toMatchObject({ kind: 'airport', name: 'Indira Gandhi International Airport' });
    expect(places.some((p) => p.place_id === 'cab_delhi_red-fort')).toBe(true);
  });

  it('accepts typed addresses, with wider estimates', () => {
    const address = resolveCabEndpoint('delhi', null, '  14 Lodhi Road  ')!;
    expect(address).toMatchObject({ name: '14 Lodhi Road', isAddress: true });
    expect(resolveCabEndpoint('delhi', null, 'ab')).toBeNull();
    const withAddress = estimateRide(address, qutub());
    const betweenSights = estimateRide(resolveCabEndpoint('delhi', 'cab_delhi_red-fort', null)!, qutub());
    expect(withAddress.high - withAddress.low).toBeGreaterThan(betweenSights.high - betweenSights.low);
  });

  it('only takes rides booked at least two hours ahead', () => {
    expect(cabTimingIssue(TODAY, '11:00', NOW)?.code).toBe('pickup_too_soon');
    expect(cabTimingIssue(TODAY, '12:30', NOW)).toBeNull();
    expect(cabTimingIssue('2027-03-01', '12:30', NOW)?.code).toBe('date_too_far');
  });

  it('offers vehicle types that suit the ride and the group', () => {
    const search = cabSearch({ slug: 'delhi', pickup: airport(), drop: qutub(), date: '2026-10-02', time: '09:00', passengers: 5, nowMs: NOW })!;
    const types = search.options.map((o) => o.vehicle_type);
    expect(types).toEqual(['hatchback', 'sedan', 'suv']);
    expect(search.options.find((o) => o.vehicle_type === 'sedan')?.vehicles).toBe(2);
    expect(search.options.find((o) => o.vehicle_type === 'suv')?.vehicles).toBe(1);
    for (const option of search.options) {
      expect(option.fare.status).toBe('estimate');
      expect(option.fare.min!.amount_minor).toBeLessThanOrEqual(option.fare.value!.amount_minor);
      expect(option.fare.max!.amount_minor).toBeGreaterThanOrEqual(option.fare.value!.amount_minor);
      expect(option.provider.verified).toBe(true);
    }
  });

  it('offers autos for short rides only, and SUVs only where the operator runs them', () => {
    const redFort = resolveCabEndpoint('delhi', 'cab_delhi_red-fort', null)!;
    const chandniChowk = resolveCabEndpoint('delhi', 'cab_delhi_chandni-chowk', null)!;
    const short = cabSearch({ slug: 'delhi', pickup: redFort, drop: chandniChowk, date: '2026-10-02', time: '09:00', passengers: 2, nowMs: NOW })!;
    expect(short.options[0]?.vehicle_type).toBe('auto');

    const leh = cabPlacesFor('leh-ladakh');
    const mountains = cabSearch({
      slug: 'leh-ladakh',
      pickup: resolveCabEndpoint('leh-ladakh', leh[0]!.place_id, null)!,
      drop: resolveCabEndpoint('leh-ladakh', leh[1]!.place_id, null)!,
      date: '2026-10-02',
      time: '09:00',
      passengers: 3,
      nowMs: NOW,
    })!;
    expect(mountains.options.map((o) => o.vehicle_type)).toEqual(['suv']);
  });
});

describe('quotes', () => {
  const flight = departuresOn('flight', 'delhi', 'mumbai', '2026-10-05', TODAY)[0]!;
  const bus = departuresOn('bus', 'bengaluru', 'mysuru', '2026-10-06', TODAY)[0]!;

  it('prices flights for every passenger and needs payment before ticketing', () => {
    const quote = buildDepartureQuote(flight, 3, 40, 'qte_1', NOW);
    expect(quote.price).toMatchObject({ status: 'authoritative', value: { amount_minor: flight.fare * 300, currency: 'INR' } });
    expect(quote.payment).toEqual({ required: true, supported: false });
    expect(quote.transport).toMatchObject({ mode: 'flight', passengers: 3, availability_id: flight.availabilityId, seats: [], driver: null });
    expect(quote).toMatchObject({ date: '2026-10-05', time_slot: flight.time, quantity: 3, service: { unit: 'person' } });
    expect(Date.parse(quote.expires_at)).toBe(NOW + 15 * 60_000);
  });

  it('confirms buses without payment through TravIndi', () => {
    expect(buildDepartureQuote(bus, 1, 20, 'qte_2', NOW).payment.required).toBe(false);
  });

  it('keeps metro fares as sample estimates', () => {
    const network = hyderabad();
    const fare = buildMetroFare(network, planMetroJourney(network, 'assembly', 'hitec-city')!, 'assembly', 'hitec-city', 2, NOW);
    expect(fare.total.value?.amount_minor).toBe(fare.fare_per_passenger.value!.amount_minor * 2);
    const quote = buildMetroQuote(network, fare, TODAY, 'qte_3', NOW);
    expect(quote.price.status).toBe('estimate');
    expect(quote.provider.verified).toBe(false);
    expect(quote.time_slot).toBeNull();
    expect(quote.transport?.metro).toEqual({ network_id: 'metro_hyderabad', network_name: 'Hyderabad Metro Rail', line_names: ['Red Line', 'Blue Line'], interchanges: 1 });
  });

  it('books cabs per vehicle and never invents driver details', () => {
    const pickup = resolveCabEndpoint('jaipur', cabPlacesFor('jaipur')[0]!.place_id, null)!;
    const drop = resolveCabEndpoint('jaipur', null, 'Hotel on MI Road')!;
    const search = cabSearch({ slug: 'jaipur', pickup, drop, date: '2026-10-02', time: '07:30', passengers: 6, nowMs: NOW })!;
    const sedan = search.options.find((o) => o.vehicle_type === 'sedan')!;
    const quote = buildCabQuote(search, sedan, pickup, drop, 'qte_4', NOW);
    expect(quote).toMatchObject({ quantity: 2, time_slot: '07:30', service: { unit: 'vehicle' }, price: { status: 'estimate' } });
    expect(quote.transport).toMatchObject({ mode: 'cab', vehicles: 2, passengers: 6, driver: null, departs_at: new Date(istInstant('2026-10-02', '07:30')).toISOString() });
  });
});
