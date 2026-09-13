import type { ISODateTime } from './common';

/**
 * What the connected backend can actually do. The UI hides or explains
 * features whose capability is false instead of pretending they work.
 */
export interface CapabilitiesDto {
  live_crowd: boolean;
  weather: boolean;
  transport: boolean;
  push: boolean;
  payment: boolean;
  auto_adaptation: boolean;
  turn_by_turn: boolean;
  sms: boolean;
  offline_message_queue: boolean;
  authority_integration: boolean;
  community: boolean;
  gamification: boolean;
  bookings: boolean;
  location_sharing: boolean;
}

/** Real platform metrics. Null means "not provided" — the UI omits it. */
export interface PlatformMetricsDto {
  destinations_count: number | null;
  verified_providers_count: number | null;
  trips_planned_count: number | null;
  planner_available: boolean | null;
  as_of: ISODateTime | null;
}
