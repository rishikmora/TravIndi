import type { CostDto, FreshnessDto, GeoPointDto, ID, ImageDto, ISODateTime } from './common';

export type EvidenceKind =
  | 'identity'
  | 'business_registration'
  | 'credential'
  | 'review_authenticity'
  | 'availability';

export type EvidenceStatus = 'verified' | 'pending' | 'expired' | 'unverified' | 'rejected';

/** One verifiable fact about a provider. Trust is shown as evidence, never as a score. */
export interface VerificationEvidenceDto {
  kind: EvidenceKind;
  status: EvidenceStatus;
  verified_at: ISODateTime | null;
  expires_at: ISODateTime | null;
  verifier_label: string | null;
  note: string | null;
}

export interface ReputationDto {
  rating: number | null;
  review_count: number;
  /** How much the review data can be relied on. */
  review_signal: 'strong' | 'limited' | 'insufficient' | 'under_review';
}

export interface AvailabilityDto {
  status: 'available' | 'limited' | 'unavailable' | 'unknown';
  next_available_at: ISODateTime | null;
  freshness: FreshnessDto;
}

/** What one unit of a service's price covers. */
export type ServiceUnit = 'person' | 'room_night' | 'vehicle' | 'group';

/** What a multi-day package includes. */
export interface PackageDetailsDto {
  days: number;
  nights: number;
  includes: string[];
}

export interface ServiceDto {
  service_id: ID;
  provider_id: ID;
  provider_type: 'business' | 'guide';
  name: string;
  description: string;
  duration_minutes: number | null;
  price: CostDto;
  /** Per person, per room per night, per vehicle, or per booking (guides). */
  unit: ServiceUnit;
  /** Whether the backend can take bookings for this service right now. */
  bookable: boolean;
  /** Most people, rooms or vehicles that can be booked at once. */
  capacity: number | null;
  /** Short facts about the offer, e.g. "Breakfast included". */
  highlights: string[];
  package_details: PackageDetailsDto | null;
}

export type BusinessCategory =
  | 'stay'
  | 'restaurant'
  | 'tour_operator'
  | 'transport'
  | 'experience'
  | 'shop'
  | 'wellness';

export interface BusinessDto {
  business_id: ID;
  name: string;
  category: BusinessCategory;
  destination_id: ID;
  destination_name: string;
  address: string;
  coordinates: GeoPointDto;
  description: string;
  images: ImageDto[];
  services: ServiceDto[];
  verification: VerificationEvidenceDto[];
  reputation: ReputationDto;
  availability: AvailabilityDto | null;
  languages: string[];
  opening_hours: string | null;
}

export interface GuideDto {
  guide_id: ID;
  name: string;
  avatar: ImageDto | null;
  languages: string[];
  specializations: string[];
  destination_ids: ID[];
  destination_names: string[];
  bio: string;
  years_experience: number | null;
  verification: VerificationEvidenceDto[];
  reputation: ReputationDto;
  availability: AvailabilityDto | null;
  services: ServiceDto[];
}

export interface ReviewDto {
  review_id: ID;
  author_name: string;
  rating: number;
  text: string;
  created_at: ISODateTime;
  authenticity: 'verified_booking' | 'unverified';
  response: { text: string; created_at: ISODateTime } | null;
}

export interface ProviderListQueryDto {
  destination_id?: ID;
  category?: BusinessCategory;
  language?: string;
  verified_only?: boolean;
  q?: string;
  cursor?: string;
  limit?: number;
}

/** Result of checking a provider or ticket code at /verify. */
export interface VerificationLookupDto {
  query: string;
  match:
    | { kind: 'business'; business: BusinessDto }
    | { kind: 'guide'; guide: GuideDto }
    | { kind: 'ticket'; ticket_id: ID; booking_status: string; valid: boolean; provider_name: string; checked_at: ISODateTime }
    | null;
  message: string;
}

export interface FraudReportRequestDto {
  client_report_id: string;
  category: 'impersonation' | 'overcharging' | 'fake_listing' | 'payment_scam' | 'harassment' | 'other';
  description: string;
  provider_reference: string | null;
  occurred_at: ISODateTime | null;
  contact_permission: boolean;
}

export interface FraudReportDto {
  report_id: ID;
  client_report_id: string;
  status: 'received' | 'under_review' | 'actioned' | 'closed';
  received_at: ISODateTime;
  reference_code: string;
}
