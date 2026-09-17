/**
 * Canonical wire types shared by every domain. Field names are snake_case to
 * match the FastAPI backend exactly; the UI works with camelCase domain types
 * derived from these (see `src/types/domain`).
 */

/** RFC 3339 timestamp in UTC, e.g. "2026-09-12T10:30:00Z". */
export type ISODateTime = string;
/** Calendar date, "YYYY-MM-DD". */
export type ISODate = string;
/** Local wall-clock time, "HH:MM" (24h). */
export type LocalTime = string;
export type ID = string;

export interface GeoPointDto {
  lat: number;
  lng: number;
}

export interface LineStringDto {
  type: 'LineString';
  /** [lng, lat] pairs (GeoJSON order). */
  coordinates: [number, number][];
}

export interface PolygonDto {
  type: 'Polygon';
  coordinates: [number, number][][];
}

/** Money in minor units (paise for INR) to avoid floating-point errors. */
export interface MoneyDto {
  amount_minor: number;
  currency: string;
}

/**
 * Where a cost came from. `unavailable` must be shown as "Cost unavailable";
 * the UI never invents a number.
 */
export type CostStatus = 'authoritative' | 'estimate' | 'unavailable';

/** Interface languages (codes match `src/i18n/config.ts`). */
export type LanguageCode = 'en' | 'hi' | 'te' | 'ta' | 'kn' | 'ml' | 'bn' | 'mr';

/**
 * Traveller context sent with AI requests (intent extraction, itinerary
 * generation, re-planning). `language` is the language the traveller reads the
 * app in: the backend writes explanations, recommendations, adaptation reasons
 * and guidance in it. Place names, business names, people's names, addresses,
 * IDs, codes and structured values are never translated.
 */
export interface JourneyContextDto {
  language: LanguageCode;
}

export interface CostDto {
  status: CostStatus;
  value: MoneyDto | null;
  min?: MoneyDto | null;
  max?: MoneyDto | null;
  source_label?: string | null;
  updated_at?: ISODateTime | null;
}

/**
 * How a piece of changing information was obtained. Drives freshness labels:
 * LIVE · APPLICATION DATA · ESTIMATE · OFFLINE SNAPSHOT · UNAVAILABLE.
 */
export type DataSourceKind = 'live' | 'application' | 'estimate' | 'snapshot' | 'unavailable';

export interface FreshnessDto {
  source_kind: DataSourceKind;
  updated_at: ISODateTime | null;
  /** After this many seconds the value should be presented as stale. */
  stale_after_seconds?: number | null;
  source_label?: string | null;
}

/** A short, human-readable justification produced by the backend. */
export interface ReasonDto {
  code: string;
  label: string;
}

/** Who took a photograph and under which licence. Shown wherever the photo appears. */
export interface ImageAttributionDto {
  author: string;
  licence: string;
  licence_url: string | null;
  /** The photo's page at its source, e.g. its Wikimedia Commons file page. */
  source_url: string;
  source_name: string;
}

export interface ImageDto {
  url: string;
  /** A smaller rendition for cards and thumbnails, when the host provides one. */
  url_small?: string | null;
  alt: string;
  width?: number | null;
  height?: number | null;
  blur_data_url?: string | null;
  credit?: string | null;
  attribution?: ImageAttributionDto | null;
}

export interface PageDto<T> {
  items: T[];
  /** Opaque cursor for the next page, or null when there are no more. */
  next_cursor: string | null;
  total?: number | null;
}

export type Level3 = 'low' | 'moderate' | 'high';

/** Standard error envelope returned by the backend for non-2xx responses. */
export interface ApiErrorBodyDto {
  error: {
    code: string;
    message: string;
    details?: Array<{ field?: string | null; issue: string }>;
    request_id?: string | null;
    retry_after_seconds?: number | null;
    /** Present on 409 version conflicts. */
    current_version?: number | null;
  };
}

/** FastAPI's default validation error body (422). Also normalised. */
export interface FastApiValidationBodyDto {
  detail: Array<{ loc: Array<string | number>; msg: string; type: string }> | string;
}
