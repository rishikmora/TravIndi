import type { DataSourceKind, ID, ISODateTime, JourneyContextDto, LocalTime, MoneyDto, ReasonDto } from './common';
import type { ItineraryDto } from './itinerary';

export type AdaptationTrigger =
  | 'crowd'
  | 'weather'
  | 'closure'
  | 'transport'
  | 'safety'
  | 'schedule'
  | 'user_request'
  | 'other';

/** Never collapse these into a generic "updated" state in the UI. */
export type AdaptationStatus = 'proposed' | 'approved' | 'rejected' | 'expired' | 'applied' | 'failed' | 'stale';

export interface AdaptationEventDto {
  event_id: ID;
  trigger_type: AdaptationTrigger;
  observed_at: ISODateTime;
  summary: string;
  source_kind: DataSourceKind;
  source_label: string | null;
  location_label: string | null;
}

export interface ItineraryItemRefDto {
  item_id: ID;
  title: string;
  place_name: string | null;
  category: string;
  start_time: LocalTime | null;
  end_time: LocalTime | null;
}

export interface AdaptationChangeDto {
  change_id: ID;
  change_type: 'unchanged' | 'moved' | 'removed' | 'added';
  day_number: number;
  before: ItineraryItemRefDto | null;
  after: ItineraryItemRefDto | null;
  reasons: ReasonDto[];
}

export interface ImpactSummaryDto {
  time_delta_minutes: number | null;
  distance_delta_meters: number | null;
  cost: { status: 'no_known_change' | 'increase' | 'decrease' | 'unknown'; delta: MoneyDto | null };
  safety: { status: 'improved' | 'unchanged' | 'reduced' | 'unknown'; note: string | null };
}

export interface AdaptationAlternativeDto {
  alternative_id: ID;
  title: string;
  summary: string;
  reasons: ReasonDto[];
  impact_summary: ImpactSummaryDto | null;
}

export interface AdaptationProposalDto {
  proposal_id: ID;
  trip_id: ID;
  based_on_version: number;
  trigger_type: AdaptationTrigger;
  reason_code: string;
  summary: string;
  /** Short headline for the change, e.g. "Lower current crowd at Mehtab Bagh". */
  title?: string | null;
  confidence?: 'high' | 'medium' | 'low' | null;
  risk_level?: 'low' | 'moderate' | 'high' | 'critical' | null;
  changes: AdaptationChangeDto[];
  impact_summary?: ImpactSummaryDto | null;
  reasons?: ReasonDto[];
  alternatives?: AdaptationAlternativeDto[];
  event?: AdaptationEventDto | null;
  status: AdaptationStatus;
  created_at: ISODateTime;
  expires_at?: ISODateTime | null;
  resulting_version?: number | null;
  failure_reason?: string | null;
}

export interface AcceptAdaptationRequestDto {
  based_on_version: number;
  alternative_id?: ID | null;
}

export interface AcceptAdaptationResponseDto {
  proposal: AdaptationProposalDto;
  itinerary: ItineraryDto;
}

export interface RejectAdaptationRequestDto {
  reason?: 'keep_current' | 'not_relevant' | 'other' | null;
}

export type ReplanPreset =
  | 'cheaper'
  | 'more_relaxed'
  | 'more_heritage'
  | 'more_food'
  | 'less_walking'
  | 'avoid_crowds'
  | 'improve_safety';

export interface ReplanRequestDto {
  journey_context?: JourneyContextDto;
  based_on_version: number;
  presets: ReplanPreset[];
  instruction: string | null;
  scope: { day_number: number | null; item_id: ID | null };
}
