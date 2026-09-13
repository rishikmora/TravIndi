import type { GeoPoint } from '@/data/types';

/**
 * The India outline (svg-maps) is drawn in a Mercator projection inside a
 * 612 × 696 view box. Constants were calibrated against known coordinates
 * (westernmost Gujarat, easternmost Arunachal, Kanyakumari, Indira Point,
 * Delhi and Chandigarh) and agree to within about one map unit.
 */
export const INDIA_MAP_VIEWBOX = { width: 612, height: 696 } as const;

const MERCATOR_RADIUS = 1199.8;
const ORIGIN_LNG = 68.18;
const ORIGIN_Y = 837.46;
const DEG = Math.PI / 180;

export interface MapPoint {
  x: number;
  y: number;
}

export function projectToMap({ lat, lng }: GeoPoint): MapPoint {
  return {
    x: (lng - ORIGIN_LNG) * MERCATOR_RADIUS * DEG,
    y: ORIGIN_Y - MERCATOR_RADIUS * Math.log(Math.tan(Math.PI / 4 + (lat * DEG) / 2)),
  };
}

export function unprojectFromMap({ x, y }: MapPoint): GeoPoint {
  const lng = x / (MERCATOR_RADIUS * DEG) + ORIGIN_LNG;
  const lat = (2 * Math.atan(Math.exp((ORIGIN_Y - y) / MERCATOR_RADIUS)) - Math.PI / 2) / DEG;
  return { lat, lng };
}

/** Great-circle distance in kilometres. */
export function haversineKm(a: GeoPoint, b: GeoPoint): number {
  const R = 6371;
  const dLat = (b.lat - a.lat) * DEG;
  const dLng = (b.lng - a.lng) * DEG;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * DEG) * Math.cos(b.lat * DEG) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** Rough road distance/time estimate used by the planner (not routing). */
export function estimateTravel(a: GeoPoint, b: GeoPoint) {
  const km = haversineKm(a, b);
  const roadKm = km * 1.3;
  if (km > 700) return { km: Math.round(km), mode: 'flight' as const, hours: 2 + km / 700 };
  if (km > 350) return { km: Math.round(roadKm), mode: 'train' as const, hours: roadKm / 60 };
  return { km: Math.round(roadKm), mode: 'road' as const, hours: roadKm / 45 };
}

export function formatCoordinates({ lat, lng }: GeoPoint): string {
  const ns = lat >= 0 ? 'N' : 'S';
  const ew = lng >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(2)}° ${ns}, ${Math.abs(lng).toFixed(2)}° ${ew}`;
}
