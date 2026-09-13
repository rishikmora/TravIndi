import type { CostDto, ID, ImageDto, ISODate, ISODateTime, ReasonDto } from './common';
import type { AvailabilityDto, BusinessCategory, ServiceDto, ServiceUnit } from './providers';

export interface ProviderRefDto {
  provider_id: ID;
  provider_type: 'business' | 'guide';
  name: string;
  verified: boolean;
}

export interface BookingQuoteRequestDto {
  service_id: ID;
  /** Start date: the day of the activity, check-in, pickup or package start. */
  date: ISODate;
  time_slot: string | null;
  /** People, rooms or vehicles, following the service's `unit`. */
  quantity: number;
  /** Required for `room_night` services. */
  nights?: number | null;
  trip_id: ID | null;
}

export interface BookingQuoteDto {
  quote_id: ID;
  service: ServiceDto;
  provider: ProviderRefDto;
  date: ISODate;
  time_slot: string | null;
  quantity: number;
  nights: number | null;
  /** Only an `authoritative` price may be presented as the amount to pay. */
  price: CostDto;
  availability: AvailabilityDto;
  cancellation_policy: string | null;
  expires_at: ISODateTime;
  payment: { required: boolean; supported: boolean };
}

export interface CreateBookingRequestDto {
  quote_id: ID;
  client_booking_id: string;
  trip_id: ID | null;
  contact_name: string;
  contact_phone: string | null;
  notes: string | null;
}

export type BookingStatus = 'processing' | 'confirmed' | 'failed' | 'payment_pending' | 'cancelled';

export interface TicketDto {
  ticket_id: ID;
  booking_id: ID;
  code: string;
  issued_at: ISODateTime;
  valid_from: ISODateTime | null;
  valid_until: ISODateTime | null;
  /** Opaque payload to render as a QR code; the frontend does not interpret it. */
  qr_payload: string;
}

export interface BookingDto {
  booking_id: ID;
  client_booking_id: string;
  trip_id: ID | null;
  service_id: ID | null;
  service_name: string;
  unit: ServiceUnit;
  provider: ProviderRefDto;
  date: ISODate;
  time_slot: string | null;
  quantity: number;
  nights: number | null;
  price: CostDto;
  status: BookingStatus;
  confirmation_code: string | null;
  ticket: TicketDto | null;
  failure_reason: string | null;
  created_at: ISODateTime;
  updated_at: ISODateTime;
}

export type RecommendedOfferKind = 'stay' | 'package' | 'cab';

/** A bookable service matched to a trip's current itinerary. */
export interface RecommendedOfferDto {
  offer_id: ID;
  kind: RecommendedOfferKind;
  service: ServiceDto;
  provider: ProviderRefDto & { category: BusinessCategory; address: string | null };
  /** Short reasons from the backend ("Step-free rooms with a lift"). */
  reasons: ReasonDto[];
  /** Booking details matched to the itinerary. The traveller can change them before booking. */
  suggested: {
    date: ISODate | null;
    time_slot: string | null;
    quantity: number;
    nights: number | null;
    day_number: number | null;
  };
  /** Price for the suggested details; `unavailable` when it can't be worked out. */
  estimated_total: CostDto;
  image: ImageDto | null;
  /** The viewer's active booking of this service for this trip, if any. */
  booking: { booking_id: ID; status: BookingStatus } | null;
}

export interface TripBookingRecommendationsDto {
  trip_id: ID;
  destination_name: string | null;
  itinerary_version: number | null;
  travellers: number;
  offers: RecommendedOfferDto[];
  /** Plain-language caveats, e.g. that dates aren't set yet. */
  notes: string[];
}
