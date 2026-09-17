import type { BookingQuoteDto } from '@/types/api';
import { CAB_MAX_DAYS_AHEAD, CAB_MIN_NOTICE_MINUTES, hubByDestinationId, METRO_NETWORKS, metroNetworkById } from '../catalog/transport';
import { created, fail, newId, ok, paginate } from '../http';
import {
  buildCabQuote,
  buildDepartureQuote,
  buildMetroFare,
  buildMetroQuote,
  cabOperatorFor,
  cabPlacesFor,
  cabSearch,
  cabTimingIssue,
  type CabIssue,
  findDeparture,
  istDate,
  metroDetail,
  metroSummary,
  metroTicketDateIssue,
  planMetroJourney,
  resolveCabEndpoint,
  searchDepartures,
  seatsLeft,
  transportPlaces,
} from '../logic/transport';
import { route, type RouteDefinition } from '../router';
import { readNumber, readString, requireTripMember, validationFailed } from './shared';

/*
 * Transport endpoints of the development backend. `GET /v1/services/search`
 * mirrors the real backend; the rest are contracts the backend still has to
 * implement (see `src/types/api/transport.ts`).
 */

const MINUTE = 60_000;
const CATEGORIES = ['AIRLINE', 'RAILWAY', 'BUS_OPERATOR'] as const;
type Category = (typeof CATEGORIES)[number];

const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

function instant(value: string | undefined, field: string) {
  if (!value) return null;
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) validationFailed([{ field, issue: 'Use an ISO 8601 date and time.' }]);
  return ms;
}

function wholeNumber(value: unknown, field: string, min: number, max: number, fallback: number) {
  if (value === undefined || value === null || value === '') return fallback;
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(n) || n < min || n > max) validationFailed([{ field, issue: `Use a whole number from ${min} to ${max}.` }]);
  return n;
}

const failIssue = (issue: CabIssue, status = 422): never => fail(status, issue.code, issue.message, { details: [{ field: issue.field, issue: issue.message }] });

function resolveMetro(input: Record<string, unknown>, passengers: number, nowMs: number) {
  const network = metroNetworkById(text(input.network_id));
  if (!network) fail(404, 'network_not_found', 'That metro network isn’t listed.');
  const fromId = text(input.from_station_id);
  const toId = text(input.to_station_id);
  if (!network.stations[fromId]) validationFailed([{ field: 'from_station_id', issue: 'Choose a station on this network.' }]);
  if (!network.stations[toId]) validationFailed([{ field: 'to_station_id', issue: 'Choose a station on this network.' }]);
  if (fromId === toId) fail(422, 'same_station', 'Choose two different stations.', { details: [{ field: 'to_station_id', issue: 'Choose two different stations.' }] });
  const journey = planMetroJourney(network, fromId, toId);
  if (!journey) fail(422, 'no_route', 'No metro route was found between these stations.');
  return { network, fare: buildMetroFare(network, journey, fromId, toId, passengers, nowMs) };
}

interface CabRequest {
  destinationId: string;
  pickupPlaceId: string | null;
  pickupAddress: string | null;
  dropPlaceId: string | null;
  dropAddress: string | null;
  date: string;
  time: string;
  passengers: number;
}

function resolveCab(request: CabRequest, nowMs: number) {
  const hub = hubByDestinationId(request.destinationId);
  if (!hub || !cabOperatorFor(hub.slug)) fail(404, 'no_cab_operator', 'No cab operators are listed for this destination yet.');
  const pickup = resolveCabEndpoint(hub.slug, request.pickupPlaceId, request.pickupAddress);
  if (!pickup) failIssue({ field: 'pickup', code: 'invalid_pickup', message: 'Choose a pickup point, or type an address of 3 to 120 characters.' });
  const drop = resolveCabEndpoint(hub.slug, request.dropPlaceId, request.dropAddress);
  if (!drop) failIssue({ field: 'drop', code: 'invalid_drop', message: 'Choose a drop point, or type an address of 3 to 120 characters.' });
  const samePlace = pickup.placeId ? pickup.placeId === drop.placeId : pickup.name.toLowerCase() === drop.name.toLowerCase();
  if (samePlace) failIssue({ field: 'drop', code: 'same_place', message: 'Choose a drop point different from the pickup.' });
  const timing = cabTimingIssue(request.date, request.time, nowMs);
  if (timing) failIssue(timing);
  const search = cabSearch({ slug: hub.slug, pickup, drop, date: request.date, time: request.time, passengers: request.passengers, nowMs });
  if (!search) fail(404, 'no_cab_operator', 'No cab operators are listed for this destination yet.');
  return { pickup, drop, search };
}

const location = (value: unknown) => {
  const record = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  return { placeId: text(record.place_id) || null, address: text(record.address) || null };
};

export const transportRoutes: RouteDefinition[] = [
  route('GET', '/v1/services/search', ({ store, query }) => {
    const category = query.category as Category | undefined;
    if (!category || !CATEGORIES.includes(category)) fail(422, 'invalid_category', 'Transport search only supports AIRLINE, RAILWAY or BUS_OPERATOR.');
    const nowMs = Date.now();
    const items = searchDepartures({
      category,
      originDestinationId: query.origin_destination_id || null,
      destinationDestinationId: query.destination_destination_id || null,
      afterMs: instant(query.after, 'after') ?? nowMs,
      beforeMs: instant(query.before, 'before'),
      nowMs,
      bookings: store.state.bookings,
    });
    return ok(paginate(items, query.cursor, wholeNumber(query.limit, 'limit', 1, 100, 50)));
  }),

  route('GET', '/v1/transport/places', () => ok({ items: transportPlaces() })),

  route('GET', '/v1/transport/metro/networks', () => ok({ items: METRO_NETWORKS.map(metroSummary) })),

  route('GET', '/v1/transport/metro/networks/:networkId', ({ params }) => {
    const network = metroNetworkById(params.networkId!);
    if (!network) fail(404, 'network_not_found', 'That metro network isn’t listed.');
    return ok(metroDetail(network, Date.now()));
  }),

  route('GET', '/v1/transport/metro/fare', ({ query }) => {
    const passengers = wholeNumber(query.passengers, 'passengers', 1, 6, 1);
    return ok(resolveMetro(query, passengers, Date.now()).fare);
  }),

  route('GET', '/v1/transport/cabs/places', ({ query }) => {
    const hub = hubByDestinationId(text(query.destination_id));
    if (!hub || !cabOperatorFor(hub.slug)) fail(404, 'no_cab_operator', 'No cab operators are listed for this destination yet.');
    return ok({
      destination_id: query.destination_id,
      destination_name: hub.name,
      places: cabPlacesFor(hub.slug).map(({ place_id, name, kind }) => ({ place_id, name, kind })),
      min_notice_minutes: CAB_MIN_NOTICE_MINUTES,
      max_days_ahead: CAB_MAX_DAYS_AHEAD,
    });
  }),

  route('GET', '/v1/transport/cabs/options', ({ query }) => {
    const { search } = resolveCab(
      {
        destinationId: text(query.destination_id),
        pickupPlaceId: query.pickup_place_id || null,
        pickupAddress: query.pickup_address || null,
        dropPlaceId: query.drop_place_id || null,
        dropAddress: query.drop_address || null,
        date: text(query.date),
        time: text(query.time),
        passengers: wholeNumber(query.passengers, 'passengers', 1, 12, 1),
      },
      Date.now(),
    );
    return ok(search);
  }),

  route('POST', '/v1/transport/quotes', (ctx) => {
    const user = ctx.requireUser();
    const { store, body } = ctx;
    const tripId = text(body.trip_id) || null;
    if (tripId) requireTripMember(ctx, tripId);
    const nowMs = Date.now();
    const quoteId = newId('qte');
    let quote: BookingQuoteDto;

    if (body.mode === 'flight' || body.mode === 'bus') {
      const mode = body.mode;
      const serviceId = readString(body, 'service_id', { required: true, max: 160, label: 'Service' })!;
      const availabilityId = readString(body, 'availability_id', { required: true, max: 200, label: 'Departure' })!;
      const passengers = readNumber(body, 'passengers', 1, mode === 'flight' ? 9 : 6, 'Passengers');
      if (!Number.isInteger(passengers)) validationFailed([{ field: 'passengers', issue: 'Use a whole number.' }]);
      const departure = findDeparture(serviceId, availabilityId, istDate(nowMs));
      if (!departure || departure.mode !== mode) fail(404, 'departure_not_found', 'That departure is no longer listed. Search again for current departures.');
      if (departure.startsAtMs <= nowMs + (mode === 'flight' ? 60 : 30) * MINUTE) fail(409, 'departure_closed', 'Booking has closed for this departure.');
      const remaining = seatsLeft(departure, store.state.bookings);
      if (passengers > remaining) {
        const message = remaining === 0 ? 'This departure is sold out.' : `Only ${remaining} seats are left on this departure.`;
        fail(409, 'not_enough_seats', message, { details: [{ field: 'passengers', issue: message }] });
      }
      quote = buildDepartureQuote(departure, passengers, remaining, quoteId, nowMs);
    } else if (body.mode === 'metro') {
      const passengers = readNumber(body, 'passengers', 1, 6, 'Passengers');
      if (!Number.isInteger(passengers)) validationFailed([{ field: 'passengers', issue: 'Use a whole number.' }]);
      const date = readString(body, 'date', { required: true, max: 10, label: 'Date' })!;
      const dateIssue = metroTicketDateIssue(date, nowMs);
      if (dateIssue) failIssue(dateIssue);
      const { network, fare } = resolveMetro(body, passengers, nowMs);
      quote = buildMetroQuote(network, fare, date, quoteId, nowMs);
    } else if (body.mode === 'cab') {
      const optionId = readString(body, 'option_id', { required: true, max: 120, label: 'Ride option' })!;
      const passengers = readNumber(body, 'passengers', 1, 12, 'Passengers');
      if (!Number.isInteger(passengers)) validationFailed([{ field: 'passengers', issue: 'Use a whole number.' }]);
      const pickupInput = location(body.pickup);
      const dropInput = location(body.drop);
      const { pickup, drop, search } = resolveCab(
        {
          destinationId: text(body.destination_id),
          pickupPlaceId: pickupInput.placeId,
          pickupAddress: pickupInput.address,
          dropPlaceId: dropInput.placeId,
          dropAddress: dropInput.address,
          date: text(body.date),
          time: text(body.time),
          passengers,
        },
        nowMs,
      );
      const option = search.options.find((candidate) => candidate.option_id === optionId);
      if (!option || !option.bookable) fail(409, 'option_unavailable', 'That ride option isn’t available for these details. Check the options again.');
      quote = buildCabQuote(search, option, pickup, drop, quoteId, nowMs);
    } else {
      validationFailed([{ field: 'mode', issue: 'Choose flight, bus, metro or cab.' }]);
    }

    store.state.quotes.push({ owner_id: user.user_id, value: quote });
    store.persist();
    return created(quote);
  }),
];
