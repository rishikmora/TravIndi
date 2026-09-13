import { allAttractions } from '@/data/destinations';
import type {
  CrowdSignalDto,
  GeoPointDto,
  MapLayerId,
  MapLayersResponseDto,
  MapPlaceDto,
  RouteOptionDto,
  RoutePlanRequestDto,
  RoutePlanResponseDto,
  SafetyZoneDto,
} from '@/types/api';
import { haversineKm } from '@/utils/geo';
import { HYDERABAD_PLACES } from '../catalog/places';
import { newId } from '../http';

const SAMPLE = 'Sample data';

const HYDERABAD_BOUNDS = { south: 17.2, north: 17.6, west: 78.2, east: 78.7 };

export function inHyderabad(point: GeoPointDto) {
  return (
    point.lat >= HYDERABAD_BOUNDS.south &&
    point.lat <= HYDERABAD_BOUNDS.north &&
    point.lng >= HYDERABAD_BOUNDS.west &&
    point.lng <= HYDERABAD_BOUNDS.east
  );
}

/** A smooth, clearly approximate path between two points (not a road route). */
function curve(a: GeoPointDto, b: GeoPointDto, bend: number, steps = 24): [number, number][] {
  const midLat = (a.lat + b.lat) / 2;
  const midLng = (a.lng + b.lng) / 2;
  const dx = b.lng - a.lng;
  const dy = b.lat - a.lat;
  const control = { lat: midLat + dx * bend, lng: midLng - dy * bend };
  const points: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const lat = (1 - t) ** 2 * a.lat + 2 * (1 - t) * t * control.lat + t ** 2 * b.lat;
    const lng = (1 - t) ** 2 * a.lng + 2 * (1 - t) * t * control.lng + t ** 2 * b.lng;
    points.push([Number(lng.toFixed(6)), Number(lat.toFixed(6))]);
  }
  return points;
}

export function planRoutes(request: RoutePlanRequestDto): RoutePlanResponseDto {
  const km = haversineKm(request.origin, request.destination);
  const roadKm = Math.max(0.2, km * 1.35);
  const now = new Date().toISOString();
  const options: RouteOptionDto[] = [];

  options.push({
    route_id: newId('rte'),
    label_code: 'fastest',
    label: 'Fastest',
    duration_minutes: Math.max(4, Math.round((roadKm / 24) * 60 + 4)),
    distance_meters: Math.round(roadKm * 1000),
    walking_meters: 150,
    mode: 'taxi',
    geometry: { type: 'LineString', coordinates: curve(request.origin, request.destination, 0.08) },
    factors: [{ code: 'shortest_time', label: 'Shortest estimated travel time' }],
    risk_signal: null,
    step_free: null,
    warnings: [],
  });

  const safetyData = inHyderabad(request.origin) && inHyderabad(request.destination);
  if (safetyData) {
    options.push({
      route_id: newId('rte'),
      label_code: 'lower_risk',
      label: 'Lower-risk',
      duration_minutes: Math.max(6, Math.round((roadKm * 1.18) / 24 * 60 + 6)),
      distance_meters: Math.round(roadKm * 1180),
      walking_meters: 120,
      mode: 'taxi',
      geometry: { type: 'LineString', coordinates: curve(request.origin, request.destination, -0.18) },
      factors: [{ code: 'avoids_reported_area', label: 'Avoids an area with recent incident reports' }],
      risk_signal: { level: 'lower', freshness: { source_kind: 'application', updated_at: now, source_label: `Incident reports (${SAMPLE})` } },
      step_free: null,
      warnings: [],
    });
  }

  if (request.preferences.includes('accessible') || request.preferences.includes('less_walking')) {
    options.push({
      route_id: newId('rte'),
      label_code: 'less_walking',
      label: 'Less walking',
      duration_minutes: Math.max(7, Math.round((roadKm * 1.25) / 24 * 60 + 9)),
      distance_meters: Math.round(roadKm * 1250),
      walking_meters: 40,
      mode: 'taxi',
      geometry: { type: 'LineString', coordinates: curve(request.origin, request.destination, 0.25) },
      factors: [{ code: 'closer_drop_off', label: 'Drop-off closer to the entrance' }],
      risk_signal: null,
      step_free: null,
      warnings: ['Step-free access at the destination hasn’t been confirmed.'],
    });
  }

  return {
    options,
    turn_by_turn_available: false,
    geometry_precision: 'approximate',
    freshness: { source_kind: 'estimate', updated_at: now, source_label: 'Estimated from distance' },
  };
}

function withinBbox(point: GeoPointDto, bbox: [number, number, number, number]) {
  const [west, south, east, north] = bbox;
  return point.lng >= west && point.lng <= east && point.lat >= south && point.lat <= north;
}

const square = (center: GeoPointDto, delta: number): SafetyZoneDto['geometry'] => ({
  type: 'Polygon',
  coordinates: [
    [
      [center.lng - delta, center.lat - delta * 0.8],
      [center.lng + delta, center.lat - delta * 0.8],
      [center.lng + delta * 1.1, center.lat + delta * 0.9],
      [center.lng - delta * 0.9, center.lat + delta],
      [center.lng - delta, center.lat - delta * 0.8],
    ],
  ],
});

export function mapLayers(
  bbox: [number, number, number, number],
  layers: MapLayerId[],
  crowdReports: CrowdSignalDto[],
): MapLayersResponseDto {
  const now = new Date().toISOString();
  const wants = (layer: MapLayerId) => layers.includes(layer);

  const zones: SafetyZoneDto[] = [
    {
      zone_id: 'zone_laad_bazaar',
      severity: 'caution',
      label: 'Crowded market lanes — pickpocketing reported',
      geometry: square({ lat: 17.3609, lng: 78.4732 }, 0.0028),
      freshness: { source_kind: 'application', updated_at: now, source_label: `Incident reports (${SAMPLE})` },
    },
  ];

  const places: MapPlaceDto[] = [
    ...HYDERABAD_PLACES.filter((p) => p.kind === 'attraction' || p.kind === 'experience').map((p) => ({
      place_id: p.place_id,
      name: p.name,
      category: p.category,
      coordinates: p.coordinates,
      destination_slug: 'hyderabad',
      step_free: p.step_free,
    })),
    ...allAttractions.map(({ attraction, destination }) => ({
      place_id: `plc_${attraction.slug}`,
      name: attraction.name,
      category: attraction.type,
      coordinates: attraction.coordinates,
      destination_slug: destination.slug,
      step_free: null,
    })),
  ].filter((p) => withinBbox(p.coordinates, bbox));

  return {
    safety_zones: wants('safety') ? zones.filter((z) => withinBbox({ lat: z.geometry.coordinates[0]![0]![1], lng: z.geometry.coordinates[0]![0]![0] }, bbox)) : null,
    crowd_signals: wants('crowd') ? crowdReports.filter((c) => withinBbox(c.coordinates, bbox)) : null,
    places: wants('places') ? places.slice(0, 400) : null,
    accessibility_points: wants('accessibility')
      ? HYDERABAD_PLACES.filter((p) => p.walking === 'low' && p.kind !== 'meal' && p.kind !== 'stay' && withinBbox(p.coordinates, bbox)).map((p) => ({
          place_id: p.place_id,
          name: p.name,
          category: p.category,
          coordinates: p.coordinates,
          destination_slug: 'hyderabad',
          step_free: p.step_free,
        }))
      : null,
  };
}
