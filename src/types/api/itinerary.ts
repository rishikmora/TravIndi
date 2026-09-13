import type { TransportMode } from './auth';
import type { CostDto, GeoPointDto, ID, ImageDto, ISODate, ISODateTime, LocalTime, MoneyDto, ReasonDto } from './common';
import type { AccessInfoDto } from './destinations';

export type ItineraryItemKind =
  | 'attraction'
  | 'meal'
  | 'transfer'
  | 'stay'
  | 'experience'
  | 'free_time'
  | 'booking';

export type ItineraryItemStatus = 'planned' | 'in_progress' | 'done' | 'skipped' | 'changed' | 'at_risk';

export interface PlaceRefDto {
  place_id: ID;
  name: string;
  category: string;
  coordinates: GeoPointDto | null;
  image: ImageDto | null;
  destination_slug: string | null;
  address: string | null;
}

export interface TravelLegDto {
  mode: TransportMode;
  duration_minutes: number | null;
  distance_meters: number | null;
  route_id: ID | null;
}

export interface ItemBookingDto {
  booking_id: ID | null;
  service_id: ID | null;
  status: 'not_required' | 'recommended' | 'available' | 'booked' | 'unavailable';
}

export interface ItineraryItemDto {
  item_id: ID;
  kind: ItineraryItemKind;
  title: string;
  description: string | null;
  place: PlaceRefDto | null;
  category: string;
  start_time: LocalTime | null;
  end_time: LocalTime | null;
  duration_minutes: number | null;
  travel_from_previous: TravelLegDto | null;
  /** Short reasons ("Matches your heritage interests"). Never model reasoning. */
  reasons: ReasonDto[];
  status: ItineraryItemStatus;
  cost: CostDto;
  safety_note: string | null;
  accessibility: AccessInfoDto | null;
  booking: ItemBookingDto | null;
}

export interface ItineraryDayDto {
  day_number: number;
  date: ISODate | null;
  title: string;
  summary: string | null;
  items: ItineraryItemDto[];
}

export interface BudgetSummaryDto {
  ceiling: MoneyDto | null;
  /** Sum of authoritative costs only. */
  known_total: MoneyDto;
  estimated_min: MoneyDto | null;
  estimated_max: MoneyDto | null;
  unknown_items_count: number;
  /** Ceiling minus known costs; null without a ceiling. */
  remaining: MoneyDto | null;
}

export interface ItineraryDto {
  trip_id: ID;
  version: number;
  created_at: ISODateTime;
  created_by: 'generator' | 'adaptation' | 'user' | 'replan';
  summary: string;
  days: ItineraryDayDto[];
  budget: BudgetSummaryDto;
  validation: { status: 'valid' | 'warnings'; warnings: string[] };
}

export interface ItineraryVersionDto {
  version: number;
  created_at: ISODateTime;
  trigger: 'generated' | 'adaptation' | 'user_edit' | 'replan';
  title: string;
  reason: string;
  change_count: number;
  proposal_id: ID | null;
}

export type ItineraryCost = CostDto;
