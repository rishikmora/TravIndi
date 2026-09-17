import { getDestination } from '@/data/destinations';
import type { GeoPoint } from '@/data/types';
import type {
  AvailabilityDto,
  BookingDto,
  BookingQuoteDto,
  BookingStatus,
  BusinessDto,
  CabOptionDto,
  CabPlaceDto,
  CabPlaceKind,
  CabSearchDto,
  CostDto,
  FreshnessDto,
  MetroFareDto,
  MetroInterchangeDto,
  MetroLegDto,
  MetroNetworkDto,
  MetroNetworkSummaryDto,
  ProviderRefDto,
  ServiceDto,
  TransportBookingMode,
  TransportDetailsDto,
  TransportEndpointDto,
  TransportPlaceDto,
  TransportSearchCategory,
  TransportSearchResultDto,
  TransportVehicleType,
} from '@/types/api';
import { haversineKm } from '@/utils/geo';
import { offerSetFor, offerTraits } from '../catalog/offers';
import { BUSINESSES } from '../catalog/providers';
import {
  AIRLINES,
  AIRPORTS,
  BUS_OPERATORS,
  BUS_ROUTES,
  BUS_STATIONS,
  type BusRouteOptions,
  CAB_HUBS,
  CAB_MAX_DAYS_AHEAD,
  CAB_MIN_NOTICE_MINUTES,
  CAB_VEHICLES,
  destinationIdFor,
  FLIGHT_ROUTES,
  hubByDestinationId,
  hubBySlug,
  HUBS,
  METRO_MAX_DAYS_AHEAD,
  METRO_NETWORKS,
  metroNetworkForSlug,
  type MetroNetworkDef,
  type OperatorDef,
  SCHEDULE_HORIZON_DAYS,
  type TransportHub,
} from '../catalog/transport';

/*
 * Pure logic behind the development backend's transport endpoints. Sample
 * data: schedules, fares and seat counts are generated deterministically so
 * they don't shift between reloads, and are never presented as live.
 */

const MINUTE = 60_000;
const DAY_MS = 86_400_000;
const IST_OFFSET_MS = 330 * MINUTE;

const SAMPLE_SCHEDULE = 'Operator schedule (sample data)';
const SAMPLE_METRO = 'Sample fares and journey times';
const SAMPLE_CAB_FARE = 'Sample fare estimate — the operator confirms the final fare';

export const ACTIVE_BOOKING: BookingStatus[] = ['processing', 'confirmed', 'payment_pending'];

// Time and money --------------------------------------------------------------------

/** Calendar date in India ("YYYY-MM-DD") for an instant. */
export const istDate = (ms: number) => new Date(ms + IST_OFFSET_MS).toISOString().slice(0, 10);
/** Wall-clock time in India ("HH:MM") for an instant. */
export const istTime = (ms: number) => new Date(ms + IST_OFFSET_MS).toISOString().slice(11, 16);
/** An Indian local date and time as an instant. */
export const istInstant = (date: string, time: string) => Date.parse(`${date}T${time}:00+05:30`);

export function addDays(date: string, days: number) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);

/** A real "YYYY-MM-DD" date (not, say, 31 February). */
export function isCalendarDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const ms = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(ms) && new Date(ms).toISOString().slice(0, 10) === value;
}

const inr = (rupees: number) => ({ amount_minor: Math.round(rupees) * 100, currency: 'INR' });
const roundTo = (value: number, step: number) => Math.round(value / step) * step;

/** Stable pseudo-random value in [0, 1) for a key. */
export function hash01(key: string) {
  let hash = 2166136261;
  for (let i = 0; i < key.length; i++) hash = Math.imul(hash ^ key.charCodeAt(i), 16777619);
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x85ebca6b);
  hash ^= hash >>> 13;
  hash = Math.imul(hash, 0xc2b2ae35);
  hash ^= hash >>> 16;
  return (hash >>> 0) / 4294967296;
}

const pick = <T>(items: readonly T[], key: string) => items[Math.floor(hash01(key) * items.length)]!;

const verifiedBusiness = (business: BusinessDto) =>
  business.verification.some((e) => ['identity', 'business_registration', 'credential'].includes(e.kind) && e.status === 'verified');

const freshness = (kind: FreshnessDto['source_kind'], label: string, nowMs: number): FreshnessDto => ({
  source_kind: kind,
  updated_at: new Date(nowMs).toISOString(),
  stale_after_seconds: kind === 'estimate' ? null : 900,
  source_label: label,
});

const availability = (status: AvailabilityDto['status'], label: string, nowMs: number): AvailabilityDto => ({
  status,
  next_available_at: null,
  freshness: freshness('application', label, nowMs),
});

// Places ------------------------------------------------------------------------------

const MODE_ORDER: TransportBookingMode[] = ['flight', 'bus', 'metro', 'cab'];

/** The destination's own verified cab operator, if it has one. */
export function cabOperatorFor(slug: string): BusinessDto | undefined {
  return BUSINESSES.find((b) => b.category === 'transport' && b.destination_id === destinationIdFor(slug));
}

export function transportPlaces(): TransportPlaceDto[] {
  const modes = new Map<string, Set<TransportBookingMode>>();
  const add = (slug: string, mode: TransportBookingMode) => {
    if (!hubBySlug(slug)) return;
    const set = modes.get(slug) ?? new Set();
    set.add(mode);
    modes.set(slug, set);
  };
  FLIGHT_ROUTES.forEach(([a, b]) => {
    add(a, 'flight');
    add(b, 'flight');
  });
  BUS_ROUTES.forEach(([a, b]) => {
    add(a, 'bus');
    add(b, 'bus');
  });
  METRO_NETWORKS.forEach((network) => add(network.slug, 'metro'));
  HUBS.forEach((hub) => {
    if (CAB_HUBS[hub.slug] && cabOperatorFor(hub.slug)) add(hub.slug, 'cab');
  });

  return HUBS.filter((hub) => modes.has(hub.slug))
    .map((hub) => {
      const set = modes.get(hub.slug)!;
      return {
        destination_id: destinationIdFor(hub.slug),
        slug: hub.slug,
        name: hub.name,
        state: hub.state,
        modes: MODE_ORDER.filter((mode) => set.has(mode)),
        airport_name: set.has('flight') ? (AIRPORTS[hub.slug] ?? null) : null,
        bus_station_name: set.has('bus') ? (BUS_STATIONS[hub.slug] ?? null) : null,
        metro_network_id: metroNetworkForSlug(hub.slug)?.id ?? null,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

// Scheduled departures (flights and buses) ---------------------------------------------------

type ScheduledMode = 'flight' | 'bus';

export interface Departure {
  mode: ScheduledMode;
  category: Extract<TransportSearchCategory, 'AIRLINE' | 'BUS_OPERATOR'>;
  serviceId: string;
  availabilityId: string;
  operator: OperatorDef;
  origin: TransportHub;
  destination: TransportHub;
  /** Local date and time of departure in India. */
  date: string;
  time: string;
  startsAtMs: number;
  endsAtMs: number;
  durationMinutes: number;
  distanceKm: number;
  vehicleType: TransportVehicleType;
  capacity: number;
  /** Seats already sold by the operator elsewhere (sample). */
  baseBooked: number;
  /** Rupees per passenger. */
  fare: number;
  originPoint: string | null;
  destinationPoint: string | null;
}

interface RouteInfo {
  daily: number;
  options: BusRouteOptions;
}

const routeKey = (from: string, to: string) => `${from}>${to}`;

function routeTable(routes: ReadonlyArray<readonly [string, string, number, BusRouteOptions?]>) {
  const table = new Map<string, RouteInfo>();
  for (const [a, b, daily, options = {}] of routes) {
    table.set(routeKey(a, b), { daily, options });
    table.set(routeKey(b, a), { daily, options });
  }
  return table;
}

const FLIGHTS = routeTable(FLIGHT_ROUTES);
const BUSES = routeTable(BUS_ROUTES);

const FLIGHT_SLOTS = ['05:50', '07:15', '08:40', '10:05', '11:30', '13:10', '14:45', '16:20', '17:55', '19:30', '21:05', '22:35'];
const DAY_BUS_SLOTS = ['05:45', '06:30', '07:15', '08:30', '09:45', '11:00', '12:30', '14:00', '15:30', '17:00'];
const NIGHT_BUS_SLOTS = ['18:30', '19:15', '20:00', '20:45', '21:30', '22:15', '23:00'];

const BUS_CAPACITY: Partial<Record<TransportVehicleType, number>> = { ac_sleeper: 30, ac_semi_sleeper: 36, ac_seater: 41, non_ac_seater: 45 };
const BUS_RATE: Partial<Record<TransportVehicleType, number>> = { ac_sleeper: 2.2, ac_semi_sleeper: 1.8, ac_seater: 1.5, non_ac_seater: 1.05 };

const addMinutes = (time: string, minutes: number) => {
  const [h, m] = time.split(':').map(Number) as [number, number];
  const total = (h * 60 + m + minutes + 24 * 60) % (24 * 60);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
};

function slotTimes(slots: string[], daily: number, key: string) {
  const count = Math.min(daily, slots.length);
  const offset = Math.floor(hash01(`${key}:offset`) * slots.length);
  const step = Math.max(1, Math.floor(slots.length / count));
  return Array.from({ length: count }, (_, i) => slots[(offset + i * step) % slots.length]!)
    .map((time, i) => addMinutes(time, Math.floor(hash01(`${key}:jitter:${i}`) * 4) * 5))
    .sort();
}

const operatorKey = (operator: OperatorDef) => operator.id.replace(/^biz_(air|bus)_/, '');

/**
 * Departures between two places on a local date. Empty outside the schedule
 * horizon (today to 90 days ahead), when the road is closed for the season,
 * or when no route is listed.
 */
export function departuresOn(mode: ScheduledMode, originSlug: string, destinationSlug: string, date: string, today: string): Departure[] {
  const origin = hubBySlug(originSlug);
  const destination = hubBySlug(destinationSlug);
  const route = (mode === 'flight' ? FLIGHTS : BUSES).get(routeKey(originSlug, destinationSlug));
  if (!origin || !destination || !route) return [];
  const ahead = daysBetween(today, date);
  if (!isCalendarDate(date) || ahead < 0 || ahead > SCHEDULE_HORIZON_DAYS) return [];
  const month = Number(date.slice(5, 7));
  if (route.options.months && !route.options.months.includes(month)) return [];

  const straight = haversineKm(origin.coordinates, destination.coordinates);
  const key = routeKey(originSlug, destinationSlug);
  const departures: Departure[] = [];

  if (mode === 'flight') {
    const durationMinutes = Math.max(45, roundTo((straight / 760) * 60 + 35, 5));
    const vehicleType: TransportVehicleType = straight < 350 ? 'turboprop' : 'jet';
    const capacity = vehicleType === 'jet' ? 180 : 72;
    slotTimes(FLIGHT_SLOTS, route.daily, `flt:${key}`).forEach((time, i) => {
      if (hash01(`flt:${key}:${i}:${date}:runs`) < 0.07) return;
      const operator = pick(AIRLINES, `flt:${key}:operator:${i}`);
      const serviceId = `svc_flt_${originSlug}_${destinationSlug}_${operatorKey(operator)}`;
      const availabilityId = `avl_${serviceId}_${date.replace(/-/g, '')}_${time.replace(':', '')}`;
      const load = Math.min(1, 0.3 + hash01(`${availabilityId}:load`) * 0.72 + Math.max(0, 7 - ahead) * 0.02);
      const demand = 1 + (load > 0.85 ? 0.2 : 0) + (ahead < 7 ? 0.15 : 0);
      const fare = Math.round(Math.max(2300, 1400 + straight * 4.6) * (0.85 + hash01(`${availabilityId}:fare`) * 0.45) * demand);
      const startsAtMs = istInstant(date, time);
      departures.push({
        mode,
        category: 'AIRLINE',
        serviceId,
        availabilityId,
        operator,
        origin,
        destination,
        date,
        time,
        startsAtMs,
        endsAtMs: startsAtMs + durationMinutes * MINUTE,
        durationMinutes,
        distanceKm: Math.round(straight),
        vehicleType,
        capacity,
        baseBooked: Math.floor(capacity * load),
        fare,
        originPoint: AIRPORTS[originSlug] ?? null,
        destinationPoint: AIRPORTS[destinationSlug] ?? null,
      });
    });
  } else {
    const { hill, minutes, daytime } = route.options;
    const road = straight * (hill ? 1.45 : 1.3);
    const durationMinutes = minutes ?? Math.max(60, roundTo((road / 52) * 60 + (road > 250 ? 30 : 0), 15));
    const overnight = !daytime && durationMinutes > 7 * 60;
    const types: TransportVehicleType[] = overnight
      ? ['ac_sleeper', 'ac_semi_sleeper', 'non_ac_seater']
      : hill
        ? ['non_ac_seater', 'ac_seater']
        : ['ac_seater', 'non_ac_seater', 'ac_semi_sleeper'];
    slotTimes(overnight ? NIGHT_BUS_SLOTS : DAY_BUS_SLOTS, route.daily, `bus:${key}`).forEach((time, i) => {
      if (hash01(`bus:${key}:${i}:${date}:runs`) < 0.05) return;
      const operator = pick(BUS_OPERATORS, `bus:${key}:operator:${i}`);
      const vehicleType = pick(types, `bus:${key}:vehicle:${i}`);
      const capacity = BUS_CAPACITY[vehicleType] ?? 40;
      const serviceId = `svc_bus_${originSlug}_${destinationSlug}_${operatorKey(operator)}`;
      const availabilityId = `avl_${serviceId}_${date.replace(/-/g, '')}_${time.replace(':', '')}`;
      const load = Math.min(1, 0.25 + hash01(`${availabilityId}:load`) * 0.78 + Math.max(0, 3 - ahead) * 0.04);
      const fare = roundTo(Math.max(150, road * (BUS_RATE[vehicleType] ?? 1.2)) * (0.9 + hash01(`${availabilityId}:fare`) * 0.25), 10);
      const startsAtMs = istInstant(date, time);
      departures.push({
        mode,
        category: 'BUS_OPERATOR',
        serviceId,
        availabilityId,
        operator,
        origin,
        destination,
        date,
        time,
        startsAtMs,
        endsAtMs: startsAtMs + durationMinutes * MINUTE,
        durationMinutes,
        distanceKm: Math.round(road),
        vehicleType,
        capacity,
        baseBooked: Math.floor(capacity * load),
        fare,
        originPoint: BUS_STATIONS[originSlug] ?? null,
        destinationPoint: BUS_STATIONS[destinationSlug] ?? null,
      });
    });
  }
  return departures.sort((a, b) => a.startsAtMs - b.startsAtMs);
}

export type SeatBooking = Pick<BookingDto, 'status' | 'quantity' | 'transport'>;

/** Seats taken on a departure by bookings made through TravIndi. */
export function seatsBookedThroughTravIndi(bookings: SeatBooking[], availabilityId: string) {
  return bookings
    .filter((b) => ACTIVE_BOOKING.includes(b.status) && b.transport?.availability_id === availabilityId)
    .reduce((sum, b) => sum + (b.transport?.passengers ?? b.quantity), 0);
}

export function seatsLeft(departure: Departure, bookings: SeatBooking[]) {
  return Math.max(0, departure.capacity - departure.baseBooked - seatsBookedThroughTravIndi(bookings, departure.availabilityId));
}

const SERVICE_ID = /^svc_(flt|bus)_([a-z0-9-]+)_([a-z0-9-]+)_([a-z0-9]+)$/;
const AVAILABILITY_ID = /^avl_(svc_[a-z0-9_-]+)_(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})$/;

/** The departure an availability id refers to, if it is still on the schedule. */
export function findDeparture(serviceId: string, availabilityId: string, today: string): Departure | null {
  const service = SERVICE_ID.exec(serviceId);
  const slot = AVAILABILITY_ID.exec(availabilityId);
  if (!service || !slot || slot[1] !== serviceId) return null;
  const mode: ScheduledMode = service[1] === 'flt' ? 'flight' : 'bus';
  const date = `${slot[2]}-${slot[3]}-${slot[4]}`;
  return departuresOn(mode, service[2]!, service[3]!, date, today).find((d) => d.availabilityId === availabilityId) ?? null;
}

export interface TransportSearchInput {
  category: TransportSearchCategory;
  originDestinationId?: string | null;
  destinationDestinationId?: string | null;
  afterMs: number;
  beforeMs?: number | null;
  nowMs: number;
  bookings: SeatBooking[];
}

const MAX_SEARCH_DAYS = 7;

/** Mirrors the backend's transport search: departures from `after`, earliest first. */
export function searchDepartures({ category, originDestinationId, destinationDestinationId, afterMs, beforeMs, nowMs, bookings }: TransportSearchInput): TransportSearchResultDto[] {
  if (category === 'RAILWAY') return [];
  const mode: ScheduledMode = category === 'AIRLINE' ? 'flight' : 'bus';
  const origin = originDestinationId ? hubByDestinationId(originDestinationId) : null;
  const destination = destinationDestinationId ? hubByDestinationId(destinationDestinationId) : null;
  if ((originDestinationId && !origin) || (destinationDestinationId && !destination)) return [];

  const from = Math.max(afterMs, nowMs);
  const until = beforeMs ?? from + 2 * DAY_MS;
  if (until <= from) return [];
  const today = istDate(nowMs);
  const firstDate = istDate(from);
  const days = Math.min(MAX_SEARCH_DAYS, daysBetween(firstDate, istDate(until - 1)) + 1);

  const table = mode === 'flight' ? FLIGHTS : BUSES;
  const pairs = [...table.keys()]
    .map((key) => key.split('>') as [string, string])
    .filter(([a, b]) => (!origin || a === origin.slug) && (!destination || b === destination.slug));

  const results: TransportSearchResultDto[] = [];
  for (let day = 0; day < days; day++) {
    const date = addDays(firstDate, day);
    for (const [a, b] of pairs) {
      for (const departure of departuresOn(mode, a, b, date, today)) {
        if (departure.startsAtMs < from || departure.startsAtMs >= until) continue;
        results.push(toSearchResult(departure, bookings, nowMs));
      }
    }
  }
  return results.sort((x, y) => x.starts_at.localeCompare(y.starts_at) || x.service_id.localeCompare(y.service_id));
}

function toSearchResult(departure: Departure, bookings: SeatBooking[], nowMs: number): TransportSearchResultDto {
  const remaining = seatsLeft(departure, bookings);
  const operator = departure.operator;
  return {
    service_id: departure.serviceId,
    business_id: operator.id,
    business_name: operator.name,
    category: departure.category,
    origin_destination_id: destinationIdFor(departure.origin.slug),
    origin_name: departure.origin.name,
    destination_destination_id: destinationIdFor(departure.destination.slug),
    destination_name: departure.destination.name,
    availability_id: departure.availabilityId,
    starts_at: new Date(departure.startsAtMs).toISOString(),
    ends_at: new Date(departure.endsAtMs).toISOString(),
    capacity: departure.capacity,
    booked_count: departure.capacity - remaining,
    remaining,
    base_price: departure.fare,
    currency: 'INR',
    duration_minutes: departure.durationMinutes,
    stops: 0,
    vehicle_type: departure.vehicleType,
    origin_point: departure.originPoint,
    destination_point: departure.destinationPoint,
    price: { status: 'estimate', value: inr(departure.fare), source_label: 'Operator’s published fare (sample data)', updated_at: new Date(nowMs).toISOString() },
    operator_verified: true,
  };
}

// Metro -------------------------------------------------------------------------------------------

/** Minutes per kilometre on a metro train, including station stops. */
const METRO_MINUTES_PER_KM = 2;
/** Walking between platforms and waiting when changing lines. */
const METRO_INTERCHANGE_MINUTES = 6;

/** Where trains are headed, when the network's real terminal lies beyond the stations listed here. */
const METRO_TERMINALS: Record<string, readonly [start: string, end: string]> = {
  'metro_delhi:blue': ['Dwarka Sector 21', 'Noida Electronic City'],
  'metro_delhi:violet': ['Kashmere Gate', 'Raja Nahar Singh (Ballabhgarh)'],
  'metro_delhi:pink': ['Majlis Park', 'Shiv Vihar'],
};

export function metroSummary(network: MetroNetworkDef): MetroNetworkSummaryDto {
  return {
    network_id: network.id,
    name: network.name,
    city_name: network.city,
    destination_id: destinationIdFor(network.slug),
    line_count: network.lines.length,
    station_count: Object.keys(network.stations).length,
  };
}

export function metroDetail(network: MetroNetworkDef, nowMs: number): MetroNetworkDto {
  return {
    ...metroSummary(network),
    lines: network.lines.map((line) => ({ line_id: line.id, name: line.name, colour: line.colour })),
    stations: Object.entries(network.stations)
      .map(([station_id, name]) => ({
        station_id,
        name,
        line_ids: network.lines.filter((line) => line.stops.some(([id]) => id === station_id)).map((line) => line.id),
      }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    coverage: network.coverage,
    freshness: freshness('estimate', SAMPLE_METRO, nowMs),
  };
}

export interface MetroJourney {
  legs: MetroLegDto[];
  interchanges: MetroInterchangeDto[];
  distanceKm: number;
  durationMinutes: number;
}

/** Quickest journey between two stations, counting time to change lines. */
export function planMetroJourney(network: MetroNetworkDef, fromId: string, toId: string): MetroJourney | null {
  if (!network.stations[fromId] || !network.stations[toId] || fromId === toId) return null;

  type Edge = { to: string; minutes: number; km: number };
  const graph = new Map<string, Edge[]>();
  const link = (a: string, b: string, minutes: number, km: number) => {
    graph.set(a, [...(graph.get(a) ?? []), { to: b, minutes, km }]);
    graph.set(b, [...(graph.get(b) ?? []), { to: a, minutes, km }]);
  };
  const node = (station: string, line: string) => `${station}@${line}`;
  for (const line of network.lines) {
    line.stops.forEach(([station, km], i) => {
      const next = line.stops[i + 1];
      if (next) link(node(station, line.id), node(next[0], line.id), Math.abs(next[1] - km) * METRO_MINUTES_PER_KM, Math.abs(next[1] - km));
    });
  }
  for (const station of Object.keys(network.stations)) {
    const lines = network.lines.filter((line) => line.stops.some(([id]) => id === station));
    for (let i = 0; i < lines.length; i++) {
      for (let j = i + 1; j < lines.length; j++) link(node(station, lines[i]!.id), node(station, lines[j]!.id), METRO_INTERCHANGE_MINUTES, 0);
    }
  }

  const cost = new Map<string, number>();
  const previous = new Map<string, string>();
  const open = new Set<string>();
  for (const line of network.lines) {
    if (line.stops.some(([id]) => id === fromId)) {
      cost.set(node(fromId, line.id), 0);
      open.add(node(fromId, line.id));
    }
  }
  let target: string | null = null;
  while (open.size > 0) {
    let current = '';
    let best = Infinity;
    for (const candidate of open) {
      const value = cost.get(candidate)!;
      if (value < best || (value === best && candidate < current)) {
        best = value;
        current = candidate;
      }
    }
    open.delete(current);
    if (current.startsWith(`${toId}@`)) {
      target = current;
      break;
    }
    for (const edge of graph.get(current) ?? []) {
      const next = best + edge.minutes;
      if (next < (cost.get(edge.to) ?? Infinity)) {
        cost.set(edge.to, next);
        previous.set(edge.to, current);
        open.add(edge.to);
      }
    }
  }
  if (!target) return null;

  const path: string[] = [target];
  while (previous.has(path[0]!)) path.unshift(previous.get(path[0]!)!);
  const steps = path.map((entry) => {
    const [station, line] = entry.split('@') as [string, string];
    return { station, line };
  });

  const lineById = new Map(network.lines.map((line) => [line.id, line]));
  const legs: MetroLegDto[] = [];
  const interchanges: MetroInterchangeDto[] = [];
  let distanceKm = 0;
  let start = 0;
  for (let i = 1; i <= steps.length; i++) {
    const step = steps[i];
    if (step && step.line === steps[start]!.line) continue;
    const from = steps[start]!;
    const to = steps[i - 1]!;
    if (from.station !== to.station) {
      const line = lineById.get(from.line)!;
      const index = (id: string) => line.stops.findIndex(([station]) => station === id);
      const kmAt = (id: string) => line.stops[index(id)]![1];
      const km = Math.abs(kmAt(to.station) - kmAt(from.station));
      const forward = index(to.station) > index(from.station);
      const terminals = METRO_TERMINALS[`${network.id}:${line.id}`];
      const towards = terminals
        ? terminals[forward ? 1 : 0]
        : network.stations[(forward ? line.stops[line.stops.length - 1]! : line.stops[0]!)[0]]!;
      distanceKm += km;
      legs.push({
        line_id: line.id,
        line_name: line.name,
        colour: line.colour,
        from_station_id: from.station,
        from_station_name: network.stations[from.station]!,
        to_station_id: to.station,
        to_station_name: network.stations[to.station]!,
        towards_station_name: towards,
        duration_minutes: Math.max(2, Math.round(km * METRO_MINUTES_PER_KM)),
      });
    }
    if (step) start = i;
  }
  for (let i = 1; i < legs.length; i++) {
    const before = legs[i - 1]!;
    const after = legs[i]!;
    interchanges.push({
      station_id: after.from_station_id,
      station_name: after.from_station_name,
      from_line_id: before.line_id,
      from_line_name: before.line_name,
      to_line_id: after.line_id,
      to_line_name: after.line_name,
    });
  }
  const durationMinutes = legs.reduce((sum, leg) => sum + leg.duration_minutes, 0) + interchanges.length * METRO_INTERCHANGE_MINUTES;
  return { legs, interchanges, distanceKm: Math.round(distanceKm * 10) / 10, durationMinutes };
}

/** Distance-slab fare in rupees. */
export function metroFareRupees(network: MetroNetworkDef, distanceKm: number) {
  const slab = network.fares.find(([upTo]) => distanceKm <= upTo) ?? network.fares[network.fares.length - 1]!;
  return slab[1];
}

export function buildMetroFare(network: MetroNetworkDef, journey: MetroJourney, fromId: string, toId: string, passengers: number, nowMs: number): MetroFareDto {
  const fare = metroFareRupees(network, journey.distanceKm);
  const estimate = (rupees: number): CostDto => ({ status: 'estimate', value: inr(rupees), source_label: SAMPLE_METRO, updated_at: new Date(nowMs).toISOString() });
  return {
    network_id: network.id,
    network_name: network.name,
    from_station_id: fromId,
    from_station_name: network.stations[fromId]!,
    to_station_id: toId,
    to_station_name: network.stations[toId]!,
    passengers,
    fare_per_passenger: estimate(fare),
    total: estimate(fare * passengers),
    duration_minutes: journey.durationMinutes,
    distance_km: journey.distanceKm,
    legs: journey.legs,
    interchanges: journey.interchanges,
    bookable: true,
    freshness: freshness('estimate', SAMPLE_METRO, nowMs),
  };
}

// Cabs ----------------------------------------------------------------------------------------------

export interface CabPlaceRecord extends CabPlaceDto {
  coordinates: GeoPoint | null;
  /** Approximate road distance from the destination's centre. */
  km: number;
}

/** Suggested pickup and drop points: arrival hubs, then the destination's sights. */
export function cabPlacesFor(slug: string): CabPlaceRecord[] {
  const destination = getDestination(slug);
  const hubs = CAB_HUBS[slug];
  if (!destination || !hubs) return [];
  const centre = destination.coordinates;
  return [
    ...hubs.map(([kind, name, km], i) => ({ place_id: `cab_${slug}_hub_${i + 1}`, name, kind: kind as CabPlaceKind, coordinates: null, km })),
    ...destination.attractions.map((attraction) => ({
      place_id: `cab_${slug}_${attraction.slug}`,
      name: attraction.name,
      kind: 'attraction' as const,
      coordinates: attraction.coordinates,
      km: Math.round(haversineKm(centre, attraction.coordinates) * 1.3 * 10) / 10,
    })),
  ];
}

/** A pickup or drop resolved to something a distance can be estimated from. */
export interface CabEndpoint {
  placeId: string | null;
  name: string;
  coordinates: GeoPoint | null;
  km: number;
  /** A typed address: its distance from the centre is assumed, so estimates are wider. */
  isAddress: boolean;
}

/** Typed addresses are assumed to be this far from the centre. */
export const ADDRESS_ASSUMED_KM = 6;

export function resolveCabEndpoint(slug: string, placeId: string | null, address: string | null): CabEndpoint | null {
  if (placeId) {
    const place = cabPlacesFor(slug).find((p) => p.place_id === placeId);
    return place ? { placeId: place.place_id, name: place.name, coordinates: place.coordinates, km: place.km, isAddress: false } : null;
  }
  const text = (address ?? '').replace(/\s+/g, ' ').trim();
  if (text.length < 3 || text.length > 120) return null;
  return { placeId: null, name: text, coordinates: null, km: ADDRESS_ASSUMED_KM, isAddress: true };
}

export function estimateRide(a: CabEndpoint, b: CabEndpoint): { km: number; low: number; high: number } {
  if (a.coordinates && b.coordinates) {
    return { km: Math.max(1.5, haversineKm(a.coordinates, b.coordinates) * 1.35), low: 0.9, high: 1.15 };
  }
  const km = Math.max(2, Math.sqrt(a.km ** 2 + b.km ** 2));
  return a.isAddress || b.isAddress ? { km, low: 0.6, high: 1.5 } : { km, low: 0.8, high: 1.25 };
}

export type CabIssue = { field: 'pickup' | 'drop' | 'date' | 'time' | 'passengers' | 'destination_id'; code: string; message: string };

/** Pre-booked rides only: at least two hours ahead and at most 90 days. */
export function cabTimingIssue(date: string, time: string, nowMs: number): CabIssue | null {
  if (!isCalendarDate(date)) return { field: 'date', code: 'invalid_date', message: 'Choose a valid date.' };
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return { field: 'time', code: 'invalid_time', message: 'Choose a valid time.' };
  const pickupMs = istInstant(date, time);
  if (pickupMs < nowMs + CAB_MIN_NOTICE_MINUTES * MINUTE) {
    return { field: 'time', code: 'pickup_too_soon', message: 'Rides are pre-booked: choose a pickup at least 2 hours from now.' };
  }
  if (daysBetween(istDate(nowMs), date) > CAB_MAX_DAYS_AHEAD) {
    return { field: 'date', code: 'date_too_far', message: 'Rides can be booked up to 90 days ahead.' };
  }
  return null;
}

export const isSuvFleet = (slug: string) => {
  const set = offerSetFor(slug);
  return set ? offerTraits(set.transfer).seats >= 6 : false;
};

export interface CabOptionsInput {
  slug: string;
  pickup: CabEndpoint;
  drop: CabEndpoint;
  date: string;
  time: string;
  passengers: number;
  nowMs: number;
}

const MAX_VEHICLES = 4;

export function cabSearch({ slug, pickup, drop, date, time, passengers, nowMs }: CabOptionsInput): CabSearchDto | null {
  const hub = hubBySlug(slug);
  const operator = cabOperatorFor(slug);
  if (!hub || !operator) return null;
  const ride = estimateRide(pickup, drop);
  const suvFleet = isSuvFleet(slug);
  const provider: ProviderRefDto = { provider_id: operator.business_id, provider_type: 'business', name: operator.name, verified: verifiedBusiness(operator) };
  const updatedAt = new Date(nowMs).toISOString();

  const options: CabOptionDto[] = CAB_VEHICLES.filter((vehicle) => (suvFleet ? vehicle.type === 'suv' : true))
    .filter((vehicle) => ride.km <= vehicle.maxKm)
    .map((vehicle) => {
      const vehicles = Math.ceil(passengers / vehicle.seats);
      const perVehicle = Math.max(vehicle.minimum, vehicle.base + vehicle.perKm * ride.km) * (suvFleet ? 1.4 : 1);
      const total = perVehicle * vehicles;
      const speed = (ride.km <= 25 ? 20 : ride.km <= 120 ? 36 : 45) * (suvFleet ? 0.7 : 1);
      return {
        option_id: `cabopt_${slug}_${vehicle.type}`,
        service_id: `svc_cab_${slug}_${vehicle.type}`,
        vehicle_type: vehicle.type,
        seats: vehicle.seats,
        air_conditioned: vehicle.airConditioned,
        vehicles,
        provider,
        fare: {
          status: 'estimate' as const,
          value: inr(roundTo(total, 10)),
          min: inr(roundTo(total * ride.low, 10)),
          max: inr(roundTo(total * ride.high, 10)),
          source_label: SAMPLE_CAB_FARE,
          updated_at: updatedAt,
        },
        distance_km: Math.round(ride.km),
        duration_minutes: roundTo((ride.km / speed) * 60 + 5, 5),
        bookable: vehicles <= MAX_VEHICLES,
      };
    })
    .filter((option) => option.vehicles <= MAX_VEHICLES);

  return {
    destination_id: destinationIdFor(slug),
    destination_name: hub.name,
    pickup_name: pickup.name,
    drop_name: drop.name,
    date,
    time,
    passengers,
    options,
    freshness: freshness('estimate', SAMPLE_CAB_FARE, nowMs),
  };
}

// Quotes -----------------------------------------------------------------------------------------------

const QUOTE_TTL_MINUTES = 15;

const PAYMENT: Record<TransportBookingMode, BookingQuoteDto['payment']> = {
  // Airlines issue tickets only once paid, and TravIndi doesn't take payments.
  flight: { required: true, supported: false },
  bus: { required: false, supported: false },
  metro: { required: false, supported: false },
  cab: { required: false, supported: false },
};

const CANCELLATION: Record<TransportBookingMode, string> = {
  flight: 'Cancellation charges are set by the airline and rise closer to departure.',
  bus: 'Free cancellation until 12 hours before departure. After that, the operator’s own policy applies.',
  metro: 'Unused tickets can be cancelled until the end of the travel date.',
  cab: 'Free cancellation until 2 hours before pickup. Driver details are shared closer to pickup.',
};

const endpoint = (name: string, detail: string | null, destinationId: string | null, placeId: string | null): TransportEndpointDto => ({
  name,
  detail,
  destination_id: destinationId,
  place_id: placeId,
});

function quoteShell(mode: TransportBookingMode, quoteId: string, nowMs: number) {
  return {
    quote_id: quoteId,
    cancellation_policy: CANCELLATION[mode],
    expires_at: new Date(nowMs + QUOTE_TTL_MINUTES * MINUTE).toISOString(),
    payment: PAYMENT[mode],
  };
}

export function buildDepartureQuote(departure: Departure, passengers: number, remaining: number, quoteId: string, nowMs: number): BookingQuoteDto {
  const updatedAt = new Date(nowMs).toISOString();
  const perPassenger: CostDto = { status: 'authoritative', value: inr(departure.fare), source_label: 'Operator’s fare at quote time (sample data)', updated_at: updatedAt };
  const noun = departure.mode === 'flight' ? 'flight' : 'bus';
  const service: ServiceDto = {
    service_id: departure.serviceId,
    provider_id: departure.operator.id,
    provider_type: 'business',
    name: `${departure.origin.name} to ${departure.destination.name} ${noun}`,
    description: `${departure.operator.name}, departing ${departure.time} local time.`,
    duration_minutes: departure.durationMinutes,
    price: perPassenger,
    unit: 'person',
    bookable: true,
    capacity: departure.capacity,
    highlights: [],
    package_details: null,
  };
  const transport: TransportDetailsDto = {
    mode: departure.mode,
    from: endpoint(departure.origin.name, departure.originPoint, destinationIdFor(departure.origin.slug), null),
    to: endpoint(departure.destination.name, departure.destinationPoint, destinationIdFor(departure.destination.slug), null),
    departs_at: new Date(departure.startsAtMs).toISOString(),
    arrives_at: new Date(departure.endsAtMs).toISOString(),
    duration_minutes: departure.durationMinutes,
    passengers,
    operator_name: departure.operator.name,
    availability_id: departure.availabilityId,
    vehicle_type: departure.vehicleType,
    vehicles: null,
    seats: [],
    metro: null,
    driver: null,
    distance_km: departure.distanceKm,
  };
  return {
    ...quoteShell(departure.mode, quoteId, nowMs),
    service,
    provider: { provider_id: departure.operator.id, provider_type: 'business', name: departure.operator.name, verified: true },
    date: departure.date,
    time_slot: departure.time,
    quantity: passengers,
    nights: null,
    price: { ...perPassenger, value: inr(departure.fare * passengers) },
    availability: availability(remaining <= 5 ? 'limited' : 'available', SAMPLE_SCHEDULE, nowMs),
    transport,
  };
}

export function metroTicketDateIssue(date: string, nowMs: number): CabIssue | null {
  if (!isCalendarDate(date)) return { field: 'date', code: 'invalid_date', message: 'Choose a valid date.' };
  const ahead = daysBetween(istDate(nowMs), date);
  if (ahead < 0) return { field: 'date', code: 'date_in_past', message: 'Choose today or a later date.' };
  if (ahead > METRO_MAX_DAYS_AHEAD) return { field: 'date', code: 'date_too_far', message: 'Metro tickets can be bought up to 7 days ahead.' };
  return null;
}

export function buildMetroQuote(network: MetroNetworkDef, fare: MetroFareDto, date: string, quoteId: string, nowMs: number): BookingQuoteDto {
  const service: ServiceDto = {
    service_id: `svc_${network.id}`,
    provider_id: `op_${network.id}`,
    provider_type: 'business',
    name: `${network.name} ticket: ${fare.from_station_name} to ${fare.to_station_name}`,
    description: 'Single-journey ticket, valid on the travel date.',
    duration_minutes: fare.duration_minutes,
    price: fare.fare_per_passenger,
    unit: 'person',
    bookable: true,
    capacity: 6,
    highlights: [],
    package_details: null,
  };
  const lines = [...new Set(fare.legs.map((leg) => leg.line_name))];
  const destinationId = destinationIdFor(network.slug);
  return {
    ...quoteShell('metro', quoteId, nowMs),
    service,
    // A public transit network: TravIndi holds no business verification for it.
    provider: { provider_id: `op_${network.id}`, provider_type: 'business', name: network.name, verified: false },
    date,
    time_slot: null,
    quantity: fare.passengers,
    nights: null,
    price: fare.total,
    availability: { status: 'available', next_available_at: null, freshness: freshness('estimate', SAMPLE_METRO, nowMs) },
    transport: {
      mode: 'metro',
      from: endpoint(fare.from_station_name, fare.legs[0]?.line_name ?? null, destinationId, fare.from_station_id),
      to: endpoint(fare.to_station_name, fare.legs[fare.legs.length - 1]?.line_name ?? null, destinationId, fare.to_station_id),
      departs_at: null,
      arrives_at: null,
      duration_minutes: fare.duration_minutes,
      passengers: fare.passengers,
      operator_name: network.name,
      availability_id: null,
      vehicle_type: 'metro_train',
      vehicles: null,
      seats: [],
      metro: { network_id: network.id, network_name: network.name, line_names: lines, interchanges: fare.interchanges.length },
      driver: null,
      distance_km: fare.distance_km,
    },
  };
}

const VEHICLE_NAME: Record<CabOptionDto['vehicle_type'], string> = { auto: 'Auto-rickshaw', hatchback: 'Hatchback', sedan: 'Sedan', suv: 'SUV' };

export function buildCabQuote(search: CabSearchDto, option: CabOptionDto, pickup: CabEndpoint, drop: CabEndpoint, quoteId: string, nowMs: number): BookingQuoteDto {
  const pickupMs = istInstant(search.date, search.time);
  const durationMinutes = option.duration_minutes;
  const service: ServiceDto = {
    service_id: option.service_id,
    provider_id: option.provider.provider_id,
    provider_type: 'business',
    name: `${VEHICLE_NAME[option.vehicle_type]} ride: ${pickup.name} to ${drop.name}`,
    description: 'A pre-booked ride with a driver from a verified local operator.',
    duration_minutes: durationMinutes,
    price: { ...option.fare, value: option.fare.value && { ...option.fare.value, amount_minor: Math.round(option.fare.value.amount_minor / option.vehicles) }, min: null, max: null },
    unit: 'vehicle',
    bookable: true,
    capacity: MAX_VEHICLES,
    highlights: [],
    package_details: null,
  };
  return {
    ...quoteShell('cab', quoteId, nowMs),
    service,
    provider: option.provider,
    date: search.date,
    time_slot: search.time,
    quantity: option.vehicles,
    nights: null,
    price: option.fare,
    availability: availability('available', 'Operator calendar (sample data)', nowMs),
    transport: {
      mode: 'cab',
      from: endpoint(pickup.name, search.destination_name, search.destination_id, pickup.placeId),
      to: endpoint(drop.name, search.destination_name, search.destination_id, drop.placeId),
      departs_at: new Date(pickupMs).toISOString(),
      arrives_at: null,
      duration_minutes: durationMinutes,
      passengers: search.passengers,
      operator_name: option.provider.name,
      availability_id: null,
      vehicle_type: option.vehicle_type,
      vehicles: option.vehicles,
      seats: [],
      metro: null,
      driver: null,
      distance_km: option.distance_km,
    },
  };
}
