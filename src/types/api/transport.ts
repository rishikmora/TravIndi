import type { ProviderRefDto } from './booking';
import type { CostDto, FreshnessDto, ID, ISODate, ISODateTime, LocalTime } from './common';

/*
 * Transport: getting there (flights, buses), getting around (metro, cabs) and
 * getting back.
 *
 * Bookings reuse the booking flow. `POST /v1/transport/quotes` returns a
 * `BookingQuoteDto` carrying `transport` details; the traveller confirms it
 * with `POST /v1/bookings`, and the booking is then listed, cancelled and
 * ticketed like any other. Every price and seat count comes from the backend.
 *
 * Backend status:
 *  - Flight and bus search mirrors the backend's `GET /v1/services/search`
 *    (`TransportSearchResultOut`). Fields marked "frontend addition" are
 *    optional presentation extras the backend may omit. The backend wraps
 *    lists as `{ data, meta }`; this contract uses `{ items }`, so the API
 *    adapter maps one to the other.
 *  - The backend books a departure directly (`POST /bookings` with
 *    `service_id`, `availability_id`, `party_size`). The quote step below maps
 *    onto that: `passengers` → `party_size`.
 *  - Places, metro, cabs and `POST /v1/transport/quotes` are served only by the
 *    development backend today. The backend must implement them (it has no
 *    metro data, and `TAXI` businesses have no ride pricing yet).
 */

/** The kinds of transport a traveller can search and book. */
export type TransportBookingMode = 'flight' | 'bus' | 'metro' | 'cab';

/** Operator categories accepted by the backend's transport search (its `BusinessCategory` values). */
export type TransportSearchCategory = 'AIRLINE' | 'RAILWAY' | 'BUS_OPERATOR';

/** Aircraft, coach, train or cab type. Codes are translated by the UI. */
export type TransportVehicleType =
  | 'jet'
  | 'turboprop'
  | 'ac_sleeper'
  | 'ac_semi_sleeper'
  | 'ac_seater'
  | 'non_ac_seater'
  | 'metro_train'
  | 'auto'
  | 'hatchback'
  | 'sedan'
  | 'suv';

export type CabVehicleType = Extract<TransportVehicleType, 'auto' | 'hatchback' | 'sedan' | 'suv'>;

// Places ------------------------------------------------------------------------

/**
 * A city or destination with transport listed to, from or within it.
 * `GET /v1/transport/places` → `{ items }`. Backend work: not implemented yet.
 */
export interface TransportPlaceDto {
  destination_id: ID;
  slug: string;
  name: string;
  state: string | null;
  /** Which kinds of transport are listed for this place. */
  modes: TransportBookingMode[];
  /** Airport serving the place, when flights are listed. */
  airport_name: string | null;
  /** Main bus station or boarding point, when buses are listed. */
  bus_station_name: string | null;
  metro_network_id: ID | null;
}

// Flights and buses: mirrors the backend's transport search -----------------------

/** Query for `GET /v1/services/search`. */
export interface TransportSearchQueryDto {
  category: TransportSearchCategory;
  origin_destination_id?: ID;
  destination_destination_id?: ID;
  /** Earliest departure, inclusive. The backend defaults to now. */
  after?: ISODateTime;
  /** Latest departure, exclusive. Frontend addition: the backend doesn't filter on it yet. */
  before?: ISODateTime;
  cursor?: string;
  limit?: number;
}

/**
 * One scheduled, bookable departure: a route (`service_id`) operated by a
 * business, on one of its departures (`availability_id`).
 */
export interface TransportSearchResultDto {
  service_id: ID;
  business_id: ID;
  business_name: string;
  category: TransportSearchCategory;
  origin_destination_id: ID | null;
  origin_name: string | null;
  destination_destination_id: ID | null;
  destination_name: string | null;
  availability_id: ID;
  starts_at: ISODateTime;
  ends_at: ISODateTime;
  capacity: number;
  booked_count: number;
  /** Seats left as reported by the operator when searched. Never presented as live. */
  remaining: number;
  /** Fare per passenger in major units (rupees), as the backend stores it. */
  base_price: number | null;
  currency: string;
  /** Frontend addition: journey time in minutes. */
  duration_minutes?: number | null;
  /** Frontend addition: 0 for non-stop. */
  stops?: number | null;
  /** Frontend addition. */
  vehicle_type?: TransportVehicleType | null;
  /** Frontend addition: airport or boarding point. */
  origin_point?: string | null;
  /** Frontend addition: airport or drop point. */
  destination_point?: string | null;
  /** Frontend addition: fare per passenger with its provenance. When absent, `base_price` is shown as an estimate. */
  price?: CostDto | null;
  /** Frontend addition: whether TravIndi holds verification evidence for the operator. */
  operator_verified?: boolean | null;
}

// Metro ---------------------------------------------------------------------------

export interface MetroLineDto {
  line_id: ID;
  name: string;
  /** Hex colour from the network's own map. Never the only way a line is identified. */
  colour: string;
}

export interface MetroStationDto {
  station_id: ID;
  name: string;
  line_ids: ID[];
}

/** `GET /v1/transport/metro/networks` → `{ items }`. Backend work: not implemented yet. */
export interface MetroNetworkSummaryDto {
  network_id: ID;
  /** The network's own name, e.g. "Namma Metro". */
  name: string;
  city_name: string;
  destination_id: ID;
  line_count: number;
  station_count: number;
}

/** `GET /v1/transport/metro/networks/:networkId`. */
export interface MetroNetworkDto extends MetroNetworkSummaryDto {
  lines: MetroLineDto[];
  stations: MetroStationDto[];
  /** `partial` when only a selection of the network's stations is listed. */
  coverage: 'full' | 'partial';
  freshness: FreshnessDto;
}

/** Query for `GET /v1/transport/metro/fare`. Public: no sign-in needed. */
export interface MetroFareQueryDto {
  network_id: ID;
  from_station_id: ID;
  to_station_id: ID;
  passengers?: number;
}

export interface MetroLegDto {
  line_id: ID;
  line_name: string;
  colour: string;
  from_station_id: ID;
  from_station_name: string;
  to_station_id: ID;
  to_station_name: string;
  /** Direction of travel, named after the terminal station trains show. */
  towards_station_name: string;
  duration_minutes: number;
}

export interface MetroInterchangeDto {
  station_id: ID;
  station_name: string;
  from_line_id: ID;
  from_line_name: string;
  to_line_id: ID;
  to_line_name: string;
}

export interface MetroFareDto {
  network_id: ID;
  network_name: string;
  from_station_id: ID;
  from_station_name: string;
  to_station_id: ID;
  to_station_name: string;
  passengers: number;
  fare_per_passenger: CostDto;
  total: CostDto;
  /** Approximate time on trains and changing lines. */
  duration_minutes: number | null;
  distance_km: number | null;
  legs: MetroLegDto[];
  interchanges: MetroInterchangeDto[];
  /** Whether tickets for this journey can be booked through TravIndi. */
  bookable: boolean;
  freshness: FreshnessDto;
}

// Cabs ----------------------------------------------------------------------------

export type CabPlaceKind = 'city_centre' | 'airport' | 'railway_station' | 'bus_station' | 'jetty' | 'attraction';

export interface CabPlaceDto {
  place_id: ID;
  name: string;
  kind: CabPlaceKind;
}

/** `GET /v1/transport/cabs/places?destination_id=`. Backend work: not implemented yet. */
export interface CabPlacesDto {
  destination_id: ID;
  destination_name: string;
  /** Suggested pickup and drop points. Travellers can also type an address. */
  places: CabPlaceDto[];
  /** Rides are pre-booked: the soonest pickup, in minutes from now. */
  min_notice_minutes: number;
  /** How far ahead a ride can be booked. */
  max_days_ahead: number;
}

/** A pickup or drop: a listed place, or an address typed by the traveller. */
export interface CabLocationInputDto {
  place_id: ID | null;
  address: string | null;
}

/**
 * Query for `GET /v1/transport/cabs/options`. Public. Give a place id or an
 * address for each end. `time` is local time at the destination.
 */
export interface CabOptionsQueryDto {
  destination_id: ID;
  pickup_place_id?: ID;
  pickup_address?: string;
  drop_place_id?: ID;
  drop_address?: string;
  date: ISODate;
  time: LocalTime;
  passengers: number;
}

/** A pre-booked ride from a verified local cab operator. */
export interface CabOptionDto {
  option_id: ID;
  service_id: ID;
  vehicle_type: CabVehicleType;
  /** Passengers per vehicle. */
  seats: number;
  air_conditioned: boolean;
  /** Vehicles needed for the party. */
  vehicles: number;
  provider: ProviderRefDto;
  /** Whole-ride fare for every vehicle. An estimate until the operator confirms it. */
  fare: CostDto;
  distance_km: number | null;
  duration_minutes: number | null;
  bookable: boolean;
}

export interface CabSearchDto {
  destination_id: ID;
  destination_name: string;
  pickup_name: string;
  drop_name: string;
  date: ISODate;
  time: LocalTime;
  passengers: number;
  options: CabOptionDto[];
  freshness: FreshnessDto;
}

// Quotes and booking details --------------------------------------------------------

/**
 * `POST /v1/transport/quotes` (sign-in required) → `BookingQuoteDto` with
 * `transport` set. Confirm it with `POST /v1/bookings`. Backend work: not
 * implemented yet; for flights and buses it maps onto the backend's
 * `service_id` + `availability_id` + `party_size` booking.
 */
export type TransportQuoteRequestDto =
  | {
      mode: 'flight' | 'bus';
      service_id: ID;
      availability_id: ID;
      passengers: number;
      trip_id: ID | null;
    }
  | {
      mode: 'metro';
      network_id: ID;
      from_station_id: ID;
      to_station_id: ID;
      date: ISODate;
      passengers: number;
      trip_id: ID | null;
    }
  | {
      mode: 'cab';
      option_id: ID;
      destination_id: ID;
      pickup: CabLocationInputDto;
      drop: CabLocationInputDto;
      date: ISODate;
      time: LocalTime;
      passengers: number;
      trip_id: ID | null;
    };

export interface TransportEndpointDto {
  /** City, station or pickup point. */
  name: string;
  /** Airport, boarding point or area, when known. */
  detail: string | null;
  destination_id: ID | null;
  /** Station or cab place id, when the endpoint is a listed place. */
  place_id: ID | null;
}

/** What a transport quote or booking is for. */
export interface TransportDetailsDto {
  mode: TransportBookingMode;
  from: TransportEndpointDto;
  to: TransportEndpointDto;
  /** Scheduled departure or pickup. Null for metro tickets, which are valid on their travel date. */
  departs_at: ISODateTime | null;
  /** Scheduled arrival. Null when not scheduled. */
  arrives_at: ISODateTime | null;
  duration_minutes: number | null;
  passengers: number;
  operator_name: string;
  /** Flights and buses: the scheduled departure booked. */
  availability_id: ID | null;
  vehicle_type: TransportVehicleType | null;
  /** Cabs: vehicles booked. */
  vehicles: number | null;
  /** Seat numbers, once the operator allocates them. */
  seats: string[];
  metro: { network_id: ID; network_name: string; line_names: string[]; interchanges: number } | null;
  /** Cabs: shared by the operator closer to pickup. Never invented. */
  driver: { name: string; phone_masked: string | null; vehicle_number: string | null } | null;
  distance_km: number | null;
}
