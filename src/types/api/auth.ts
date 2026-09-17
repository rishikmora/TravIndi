import type { ID, ISODateTime, LanguageCode } from './common';

export type UserRole = 'traveller' | 'business' | 'guide' | 'authority' | 'admin';

export interface UserDto {
  user_id: ID;
  email: string;
  display_name: string;
  avatar_url: string | null;
  /** UX hints only — the backend enforces authorisation on every request. */
  roles: UserRole[];
  locale: string;
  created_at: ISODateTime;
}

export interface SessionDto {
  user: UserDto;
  /** Present only in bearer mode; cookie mode relies on an httpOnly cookie. */
  access_token?: string | null;
  expires_at: ISODateTime;
}

export interface LoginRequestDto {
  email: string;
  password: string;
}

export interface RegisterRequestDto {
  email: string;
  password: string;
  display_name: string;
  accept_terms: boolean;
  consents: Array<{ consent_id: string; granted: boolean }>;
}

export type Pace = 'relaxed' | 'balanced' | 'active';
export type SafetyPreference = 'standard' | 'high' | 'maximum';
export type TransportMode = 'walk' | 'car' | 'taxi' | 'auto_rickshaw' | 'metro' | 'bus' | 'train' | 'flight' | 'boat';
export type AccommodationPreference = 'budget' | 'mid_range' | 'premium' | 'heritage' | 'homestay';
export type DietaryPreference = 'vegetarian' | 'vegan' | 'jain' | 'non_vegetarian' | 'eggetarian' | 'halal' | 'no_preference';

export interface FoodPreferencesDto {
  diet: DietaryPreference | null;
  spice_tolerance: 'mild' | 'medium' | 'hot' | null;
  allergies: string[];
  interests: string[];
}

export interface AccessibilityNeedsDto {
  low_walking: boolean;
  wheelchair: boolean;
  step_free_access: boolean;
  hearing_support: boolean;
  visual_support: boolean;
  notes: string | null;
}

export interface TravelPreferencesDto {
  pace: Pace | null;
  interests: string[];
  food: FoodPreferencesDto | null;
  transport: TransportMode[];
  accommodation: AccommodationPreference | null;
}

export interface SafetyPreferencesDto {
  preference: SafetyPreference;
  check_in_reminders: boolean;
  default_share_duration_minutes: number | null;
}

export interface NotificationPreferencesDto {
  safety: boolean;
  trips: boolean;
  messages: boolean;
  bookings: boolean;
  community: boolean;
  channels: Array<'in_app' | 'email' | 'push' | 'sms'>;
}

export interface ProfileDto {
  user_id: ID;
  display_name: string;
  email: string;
  phone_masked: string | null;
  home_city: string | null;
  languages: string[];
  /** Interface language for content the backend sends later (notifications, trip updates, safety alerts). */
  preferred_language: LanguageCode | null;
  travel_preferences: TravelPreferencesDto;
  accessibility: AccessibilityNeedsDto;
  safety_preferences: SafetyPreferencesDto;
  notification_preferences: NotificationPreferencesDto;
  updated_at: ISODateTime;
}

export type ProfileUpdateDto = Partial<
  Pick<
    ProfileDto,
    | 'display_name'
    | 'home_city'
    | 'languages'
    | 'preferred_language'
    | 'travel_preferences'
    | 'accessibility'
    | 'safety_preferences'
    | 'notification_preferences'
  >
>;

export interface ConsentDto {
  consent_id: string;
  title: string;
  description: string;
  required: boolean;
  granted: boolean;
  updated_at: ISODateTime | null;
}

export interface DataRequestDto {
  request_id: ID;
  kind: 'export' | 'deletion';
  status: 'received' | 'processing' | 'ready' | 'completed' | 'rejected';
  created_at: ISODateTime;
  download_url: string | null;
}
