import type {
  CostDto,
  FreshnessDto,
  GeoPointDto,
  ID,
  ImageDto,
  ISODateTime,
  Level3,
} from './common';

export type DestinationCategory =
  | 'heritage'
  | 'mountains'
  | 'beaches'
  | 'backwaters'
  | 'wildlife'
  | 'spiritual'
  | 'city'
  | 'desert'
  | 'nature'
  | 'islands';

/** A current condition. Null at the parent level when the capability is unavailable. */
export interface ConditionSignalDto {
  level: Level3 | null;
  summary: string;
  freshness: FreshnessDto;
}

export interface DestinationSummaryDto {
  destination_id: ID;
  slug: string;
  name: string;
  state: string;
  region: string;
  category: DestinationCategory;
  tagline: string;
  /** One-line reason this destination is being suggested (context dependent). */
  short_reason: string | null;
  hero_image: ImageDto | null;
  coordinates: GeoPointDto;
  tags: string[];
  /** Optional current signal, e.g. "Pleasant this week"; null when unknown. */
  current_signal: ConditionSignalDto | null;
}

export interface AccessInfoDto {
  step_free: boolean | null;
  walking_level: Level3 | null;
  seating_available: boolean | null;
  notes: string | null;
}

export interface AttractionDto {
  attraction_id: ID;
  destination_id: ID;
  slug: string;
  name: string;
  category: string;
  summary: string;
  history: string | null;
  era: string | null;
  coordinates: GeoPointDto;
  image: ImageDto | null;
  typical_duration_minutes: number | null;
  opening_hours: string | null;
  entry_cost: CostDto;
  accessibility: AccessInfoDto | null;
  photography_tips: string[];
  unesco: boolean;
}

export interface FoodItemDto {
  food_id: ID;
  name: string;
  description: string;
  vegetarian: boolean | null;
  where_to_try: string[];
}

export interface ExperienceDto {
  experience_id: ID;
  name: string;
  category: string;
  summary: string;
  duration_label: string | null;
  best_months: number[];
}

export interface AdvisoryDto {
  advisory_id: ID;
  severity: 'info' | 'caution' | 'warning' | 'critical';
  title: string;
  body: string;
  source_label: string;
  issued_at: ISODateTime;
  expires_at: ISODateTime | null;
}

export interface EmergencyNumberDto {
  label: string;
  number: string;
}

export interface DestinationSafetyDto {
  summary: string;
  advisories: AdvisoryDto[];
  emergency_numbers: EmergencyNumberDto[];
  freshness: FreshnessDto;
}

export interface DestinationAccessibilityDto {
  summary: string;
  step_free_highlights: string[];
  considerations: string[];
}

export interface DestinationConditionsDto {
  weather: ConditionSignalDto | null;
  crowd: ConditionSignalDto | null;
  transport: ConditionSignalDto | null;
}

export interface DestinationDto extends DestinationSummaryDto {
  /** Photographs of the destination beyond the hero image. */
  gallery: ImageDto[];
  description: string[];
  why_visit: string[];
  best_time: { months: number[]; note: string };
  ideal_duration: { min_days: number; max_days: number };
  getting_there: { air: string | null; rail: string | null; road: string | null };
  permits: string | null;
  attractions: AttractionDto[];
  food: FoodItemDto[];
  experiences: ExperienceDto[];
  safety: DestinationSafetyDto;
  accessibility: DestinationAccessibilityDto;
  conditions: DestinationConditionsDto;
}

export type SearchResultType = 'destination' | 'attraction' | 'business' | 'guide' | 'experience';

export interface SearchResultDto {
  result_type: SearchResultType;
  id: ID;
  title: string;
  subtitle: string;
  /** Route segments for the result, e.g. ["destinations", "jaipur"]. */
  path: string[];
  image: ImageDto | null;
}

export interface SearchResponseDto {
  query: string;
  results: SearchResultDto[];
  suggestions: string[];
}

export interface DestinationListQueryDto {
  q?: string;
  category?: DestinationCategory;
  region?: string;
  hidden_gems?: boolean;
  cursor?: string;
  limit?: number;
}
