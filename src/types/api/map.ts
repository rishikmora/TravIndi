import type { TransportMode } from './auth';
import type { FreshnessDto, GeoPointDto, ID, LineStringDto, PolygonDto, ReasonDto } from './common';

export type RouteLabel = 'fastest' | 'lower_risk' | 'accessible' | 'less_walking' | 'balanced';

export interface RoutePlanRequestDto {
  origin: GeoPointDto;
  destination: GeoPointDto;
  modes: TransportMode[];
  preferences: RouteLabel[];
  trip_id?: ID | null;
}

export interface RouteOptionDto {
  route_id: ID;
  /** Only labels the backend can substantiate are returned. */
  label_code: RouteLabel;
  label: string;
  duration_minutes: number;
  distance_meters: number;
  walking_meters: number | null;
  mode: TransportMode;
  geometry: LineStringDto;
  /** Factors that make this option different ("less walking"). */
  factors: ReasonDto[];
  risk_signal: { level: 'lower' | 'typical' | 'higher' | 'unknown'; freshness: FreshnessDto } | null;
  step_free: boolean | null;
  warnings: string[];
}

export interface RoutePlanResponseDto {
  options: RouteOptionDto[];
  /** Turn-by-turn navigation is not offered unless the backend supports it. */
  turn_by_turn_available: boolean;
  /** `approximate` geometry must be labelled as such; it is not a road-accurate path. */
  geometry_precision: 'road_network' | 'approximate';
  freshness: FreshnessDto;
}

export type MapLayerId = 'route' | 'safety' | 'crowd' | 'accessibility' | 'places' | 'people' | 'location';

export interface SafetyZoneDto {
  zone_id: ID;
  severity: 'info' | 'caution' | 'warning' | 'critical';
  label: string;
  geometry: PolygonDto;
  freshness: FreshnessDto;
}

export interface CrowdSignalDto {
  signal_id: ID;
  coordinates: GeoPointDto;
  level: 'low' | 'moderate' | 'high';
  label: string;
  freshness: FreshnessDto;
}

export interface MapPlaceDto {
  place_id: ID;
  name: string;
  category: string;
  coordinates: GeoPointDto;
  destination_slug: string | null;
  step_free: boolean | null;
}

export interface MapLayersQueryDto {
  bbox: [west: number, south: number, east: number, north: number];
  layers: MapLayerId[];
  trip_id?: ID | null;
}

export interface MapLayersResponseDto {
  safety_zones: SafetyZoneDto[] | null;
  crowd_signals: CrowdSignalDto[] | null;
  places: MapPlaceDto[] | null;
  accessibility_points: MapPlaceDto[] | null;
}
