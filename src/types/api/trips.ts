import type {
  AccessibilityNeedsDto,
  AccommodationPreference,
  FoodPreferencesDto,
  Pace,
  SafetyPreference,
  TransportMode,
} from './auth';
import type { ID, ImageDto, ISODate, ISODateTime, JourneyContextDto, MoneyDto } from './common';
import type { DestinationSummaryDto } from './destinations';

export type TripType =
  | 'leisure'
  | 'family'
  | 'heritage'
  | 'pilgrimage'
  | 'adventure'
  | 'honeymoon'
  | 'solo'
  | 'friends'
  | 'business';

export interface TravellersDto {
  adults: number;
  children: number;
  seniors: number;
}

export interface BudgetDto {
  ceiling: MoneyDto | null;
  level: 'budget' | 'moderate' | 'premium' | null;
  per: 'trip' | 'day' | 'person';
}

export interface BookingPreferencesDto {
  book_through_travindi: boolean;
  verified_providers_only: boolean;
  free_cancellation_preferred: boolean;
}

/**
 * What the traveller wants. Every field is optional: the UI collects what it
 * can and asks only about what is missing or ambiguous.
 */
export interface TripIntentInputDto {
  destination?: string | null;
  destination_id?: ID | null;
  start_date?: ISODate | null;
  end_date?: ISODate | null;
  days?: number | null;
  nights?: number | null;
  travellers?: TravellersDto | null;
  trip_type?: TripType | null;
  pace?: Pace | null;
  interests?: string[];
  avoid?: string[];
  budget?: BudgetDto | null;
  safety_preference?: SafetyPreference | null;
  accessibility?: AccessibilityNeedsDto | null;
  food?: FoodPreferencesDto | null;
  transport?: TransportMode[];
  accommodation?: AccommodationPreference | null;
  booking_preferences?: BookingPreferencesDto | null;
  notes?: string | null;
}

export type TripIntentField = keyof TripIntentInputDto;

export interface ExtractIntentRequestDto {
  /** Written in any language the traveller chooses. */
  text: string;
  /** BCP 47 tag of the interface language, e.g. "te-IN". */
  locale?: string;
  journey_context?: JourneyContextDto;
  /** Merge with the traveller's saved profile preferences where the text is silent. */
  use_profile_defaults?: boolean;
  /** Intent already confirmed by the user, so extraction refines rather than replaces. */
  current_intent?: TripIntentInputDto | null;
}

export interface ExtractedFieldDto {
  field: TripIntentField;
  confidence: 'high' | 'medium' | 'low';
  /** The exact span of the user's text the value came from, if any. */
  source_text: string | null;
  from_profile: boolean;
}

export interface AmbiguityDto {
  field: TripIntentField;
  question: string;
  options: Array<{ label: string; value: unknown }>;
}

export interface IntentExtractionDto {
  intent: TripIntentInputDto;
  extracted_fields: ExtractedFieldDto[];
  /** Things the backend is unsure about. The UI must ask, never assume. */
  ambiguities: AmbiguityDto[];
  /** Fields required before an itinerary can be generated. */
  missing_fields: TripIntentField[];
}

export type TripStatus = 'draft' | 'planning' | 'ready' | 'active' | 'completed' | 'cancelled';

export interface TripPermissionsDto {
  can_edit: boolean;
  can_invite: boolean;
  can_review_adaptations: boolean;
  can_book: boolean;
}

export interface TripMemberDto {
  user_id: ID;
  display_name: string;
  avatar_url: string | null;
  role: 'owner' | 'editor' | 'viewer';
  /** Null when the member has not permitted presence. */
  presence: 'online' | 'away' | 'offline' | null;
  location_share_id: ID | null;
}

export interface TripSummaryDto {
  trip_id: ID;
  title: string;
  status: TripStatus;
  destination: DestinationSummaryDto | null;
  start_date: ISODate | null;
  end_date: ISODate | null;
  days: number | null;
  cover_image: ImageDto | null;
  members_count: number;
  pending_adaptations: number;
  unread_messages: number;
  updated_at: ISODateTime;
}

export interface TripDto extends TripSummaryDto {
  owner_id: ID;
  intent: TripIntentInputDto;
  current_itinerary_version: number | null;
  conversation_id: ID | null;
  members: TripMemberDto[];
  permissions: TripPermissionsDto;
  created_at: ISODateTime;
}

export interface CreateTripRequestDto {
  intent: TripIntentInputDto;
  title?: string | null;
  journey_context?: JourneyContextDto;
}

export interface GenerateItineraryRequestDto {
  journey_context?: JourneyContextDto;
}

export interface UpdateTripRequestDto {
  title?: string;
  intent?: TripIntentInputDto;
  /** Optimistic concurrency: the version the edit was based on. */
  based_on_updated_at?: ISODateTime;
}

export type GenerationStage =
  | 'understanding_trip'
  | 'checking_destination'
  | 'finding_places'
  | 'checking_preferences'
  | 'building_itinerary'
  | 'validating_journey';

export interface GenerationJobDto {
  job_id: ID;
  trip_id: ID;
  status: 'queued' | 'running' | 'completed' | 'failed';
  stage: GenerationStage | null;
  stages_completed: GenerationStage[];
  itinerary_version: number | null;
  error: { code: string; message: string } | null;
  updated_at: ISODateTime;
}

export interface HomeSummaryDto {
  upcoming_trip: TripSummaryDto | null;
  draft_trip: TripSummaryDto | null;
  recent_destination: DestinationSummaryDto | null;
  unread_trip_messages: number;
  pending_adaptations: Array<{ trip_id: ID; proposal_id: ID; summary: string; trip_title: string }>;
  saved_places: Array<{ place_id: ID; name: string; destination_slug: string; image: ImageDto | null }>;
}
