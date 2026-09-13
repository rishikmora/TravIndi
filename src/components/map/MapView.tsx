'use client';

import 'maplibre-gl/dist/maplibre-gl.css';
import { useEffect, useMemo, useRef, useState } from 'react';
import { INDIA_MAP_LITE, INDIA_VIEWBOX } from '@/data/generated/india-map';
import { env } from '@/lib/config/env';
import { projectToMap } from '@/utils/geo';
import { cn } from '@/utils/cn';

export type MapPointKind = 'focus' | 'stop' | 'place' | 'help' | 'person' | 'crowd' | 'access';

export interface MapPoint {
  id: string;
  lat: number;
  lng: number;
  label: string;
  kind: MapPointKind;
  detail?: string | null;
  /** Shown inside stop markers, e.g. the order in the day. */
  order?: number;
}

export interface MapLine {
  id: string;
  /** [lng, lat] pairs. */
  coordinates: Array<[number, number]>;
  label: string;
  tone: 'route' | 'alternative' | 'connector';
}

export interface MapArea {
  id: string;
  /** [lng, lat] ring. */
  coordinates: Array<[number, number]>;
  label: string;
}

export const POINT_COLOR: Record<MapPointKind, string> = {
  focus: '#b3261e',
  stop: '#a84a2a',
  place: '#14213d',
  help: '#1d6b6b',
  person: '#b08a3e',
  crowd: '#8a5300',
  access: '#2b5f9e',
};

const LINE_COLOR: Record<MapLine['tone'], string> = { route: '#a84a2a', alternative: '#6f665b', connector: '#1d6b6b' };

interface MapViewProps {
  points: MapPoint[];
  lines?: MapLine[];
  areas?: MapArea[];
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  /** Accessible description of what the map shows; the list next to it is the full text alternative. */
  label: string;
  className?: string;
}

/* ─── Schematic fallback ────────────────────────────────────────────────── */

const WIDTH = 800;
const HEIGHT = 600;
const PAD = 48;

function useProjection(points: MapPoint[], lines: MapLine[], areas: MapArea[]) {
  return useMemo(() => {
    const coords: Array<[number, number]> = [
      ...points.map((p) => [p.lng, p.lat] as [number, number]),
      ...lines.flatMap((l) => l.coordinates),
      ...areas.flatMap((a) => a.coordinates),
    ];
    if (coords.length === 0) return { country: true as const };
    const lngs = coords.map((c) => c[0]);
    const lats = coords.map((c) => c[1]);
    const span = Math.max(Math.max(...lngs) - Math.min(...lngs), Math.max(...lats) - Math.min(...lats));
    if (span > 6) return { country: true as const };

    const minSpan = 0.02;
    const cLng = (Math.max(...lngs) + Math.min(...lngs)) / 2;
    const cLat = (Math.max(...lats) + Math.min(...lats)) / 2;
    const halfLng = Math.max(minSpan, (Math.max(...lngs) - Math.min(...lngs)) / 2);
    const halfLat = Math.max(minSpan, (Math.max(...lats) - Math.min(...lats)) / 2);
    const kx = Math.cos((cLat * Math.PI) / 180);
    const scale = Math.min((WIDTH - PAD * 2) / (halfLng * 2 * kx), (HEIGHT - PAD * 2) / (halfLat * 2));
    return {
      country: false as const,
      project: (lng: number, lat: number) => ({ x: WIDTH / 2 + (lng - cLng) * kx * scale, y: HEIGHT / 2 - (lat - cLat) * scale }),
      metresPerUnit: 111_320 / scale,
    };
  }, [points, lines, areas]);
}

function SchematicMap({ points, lines = [], areas = [], selectedId, onSelect, label, className }: MapViewProps) {
  const projection = useProjection(points, lines, areas);
  const viewBox = projection.country ? INDIA_VIEWBOX : `0 0 ${WIDTH} ${HEIGHT}`;
  const project = projection.country ? (lng: number, lat: number) => projectToMap({ lat, lng }) : projection.project;
  const radius = projection.country ? 5 : 9;

  // A scale bar of a round distance, so the schematic still conveys how far apart things are.
  const scale = !projection.country
    ? (() => {
        const target = projection.metresPerUnit * 140;
        const nice = [100, 200, 500, 1000, 2000, 5000, 10000, 20000].find((n) => n >= target * 0.6) ?? 20000;
        return { metres: nice, width: nice / projection.metresPerUnit };
      })()
    : null;

  return (
    <div className={cn('relative overflow-hidden rounded-[1.25rem] bg-[#efe7d8] ring-1 ring-inset ring-[var(--hairline)]', className)}>
      <svg viewBox={viewBox} role="img" aria-label={`${label}. Schematic map; positions are approximate.`} className="h-full w-full">
        {projection.country ? (
          <g fill="#e4d6bd" stroke="#b9a582" strokeWidth={0.6}>
            {INDIA_MAP_LITE.map((region) => (
              <path key={region.id} d={region.d} />
            ))}
          </g>
        ) : (
          <g stroke="#d9cdb6" strokeWidth={1}>
            {Array.from({ length: 9 }, (_, i) => (
              <line key={`v${i}`} x1={(i * WIDTH) / 8} y1={0} x2={(i * WIDTH) / 8} y2={HEIGHT} />
            ))}
            {Array.from({ length: 7 }, (_, i) => (
              <line key={`h${i}`} x1={0} y1={(i * HEIGHT) / 6} x2={WIDTH} y2={(i * HEIGHT) / 6} />
            ))}
          </g>
        )}
        {areas.map((area) => (
          <polygon
            key={area.id}
            points={area.coordinates.map(([lng, lat]) => { const p = project(lng, lat); return `${p.x},${p.y}`; }).join(' ')}
            fill="rgb(217 143 58 / 0.28)"
            stroke="#8a5300"
            strokeDasharray="6 4"
            strokeWidth={2}
          />
        ))}
        {lines.map((line) => (
          <polyline
            key={line.id}
            points={line.coordinates.map(([lng, lat]) => { const p = project(lng, lat); return `${p.x},${p.y}`; }).join(' ')}
            fill="none"
            stroke={LINE_COLOR[line.tone]}
            strokeWidth={line.tone === 'route' ? 5 : 3}
            strokeDasharray={line.tone === 'connector' ? '8 8' : undefined}
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={line.tone === 'alternative' ? 0.6 : 1}
          />
        ))}
        {points.map((point) => {
          const p = project(point.lng, point.lat);
          const selected = point.id === selectedId;
          return (
            <g key={point.id} transform={`translate(${p.x} ${p.y})`} onClick={() => onSelect?.(point.id)} className={onSelect ? 'cursor-pointer' : undefined}>
              {selected && <circle r={radius + 7} fill="none" stroke={POINT_COLOR[point.kind]} strokeWidth={3} />}
              <circle r={radius} fill={POINT_COLOR[point.kind]} stroke="#fffdf8" strokeWidth={2} />
              {point.order !== undefined && !projection.country && (
                <text textAnchor="middle" dy="0.35em" fontSize={10} fontWeight={700} fill="#fffdf8">
                  {point.order}
                </text>
              )}
              {(selected || (!projection.country && points.length <= 12)) && (
                <text x={radius + 6} dy="0.35em" fontSize={projection.country ? 12 : 14} fontWeight={600} fill="#14213d" stroke="#efe7d8" strokeWidth={4} paintOrder="stroke">
                  {point.label}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      {scale && (
        <div aria-hidden="true" className="absolute bottom-3 left-3 grid gap-1 text-[0.6875rem] font-medium text-navy">
          <span className="block h-1.5 border-x-2 border-b-2 border-navy" style={{ width: `${(scale.width / WIDTH) * 100}%`, minWidth: 40 }} />
          {scale.metres >= 1000 ? `${scale.metres / 1000} km` : `${scale.metres} m`}
        </div>
      )}
      <p className="absolute right-3 top-3 rounded-full bg-ivory/90 px-2.5 py-1 text-[0.6875rem] font-semibold uppercase tracking-[0.06em] text-navy">Schematic · not for navigation</p>
    </div>
  );
}

/* ─── MapLibre (when a style is configured) ─────────────────────────────── */

type MapLibreModule = typeof import('maplibre-gl');
type MapInstance = InstanceType<MapLibreModule['Map']>;

function toGeoJson(points: MapPoint[], lines: MapLine[], areas: MapArea[], selectedId: string | null | undefined) {
  return {
    points: {
      type: 'FeatureCollection' as const,
      features: points.map((p) => ({ type: 'Feature' as const, properties: { id: p.id, color: POINT_COLOR[p.kind], selected: p.id === selectedId ? 1 : 0 }, geometry: { type: 'Point' as const, coordinates: [p.lng, p.lat] } })),
    },
    lines: {
      type: 'FeatureCollection' as const,
      features: lines.map((l) => ({ type: 'Feature' as const, properties: { id: l.id, color: LINE_COLOR[l.tone], width: l.tone === 'route' ? 5 : 3 }, geometry: { type: 'LineString' as const, coordinates: l.coordinates } })),
    },
    areas: {
      type: 'FeatureCollection' as const,
      features: areas.map((a) => ({ type: 'Feature' as const, properties: { id: a.id }, geometry: { type: 'Polygon' as const, coordinates: [a.coordinates] } })),
    },
  };
}

function LiveMap({ points, lines = [], areas = [], selectedId, onSelect, label, className, onFail }: MapViewProps & { onFail: () => void }) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapInstance | null>(null);
  const [ready, setReady] = useState(false);
  const onSelectRef = useRef(onSelect);
  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    let cancelled = false;
    let map: MapInstance | null = null;
    import('maplibre-gl')
      .then((module) => {
        const maplibre = ((module as unknown as { default?: MapLibreModule }).default ?? module) as MapLibreModule;
        if (cancelled || !container.current) return;
        map = new maplibre.Map({ container: container.current, style: env.mapStyleUrl, center: [78.96, 22.5], zoom: 3.6, attributionControl: { compact: true } });
        map.addControl(new maplibre.NavigationControl({ showCompass: false }), 'top-right');
        map.on('error', () => undefined);
        map.on('load', () => {
          if (!map) return;
          map.addSource('areas', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
          map.addSource('lines', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
          map.addSource('points', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
          map.addLayer({ id: 'areas-fill', type: 'fill', source: 'areas', paint: { 'fill-color': '#d98f3a', 'fill-opacity': 0.25 } });
          map.addLayer({ id: 'lines', type: 'line', source: 'lines', paint: { 'line-color': ['get', 'color'], 'line-width': ['get', 'width'] }, layout: { 'line-cap': 'round' } });
          map.addLayer({
            id: 'points',
            type: 'circle',
            source: 'points',
            paint: { 'circle-color': ['get', 'color'], 'circle-radius': ['case', ['==', ['get', 'selected'], 1], 11, 7], 'circle-stroke-color': '#fffdf8', 'circle-stroke-width': 2 },
          });
          map.on('click', 'points', (event) => {
            const id = event.features?.[0]?.properties?.id;
            if (typeof id === 'string') onSelectRef.current?.(id);
          });
          mapRef.current = map;
          setReady(true);
        });
      })
      .catch(onFail);
    return () => {
      cancelled = true;
      map?.remove();
      mapRef.current = null;
    };
  }, [onFail]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const data = toGeoJson(points, lines, areas, selectedId);
    (map.getSource('points') as unknown as { setData: (d: unknown) => void } | undefined)?.setData(data.points);
    (map.getSource('lines') as unknown as { setData: (d: unknown) => void } | undefined)?.setData(data.lines);
    (map.getSource('areas') as unknown as { setData: (d: unknown) => void } | undefined)?.setData(data.areas);
    const coords = [...points.map((p) => [p.lng, p.lat]), ...lines.flatMap((l) => l.coordinates)];
    if (coords.length > 0) {
      const lngs = coords.map((c) => c[0]!);
      const lats = coords.map((c) => c[1]!);
      map.fitBounds([[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]], { padding: 56, maxZoom: 15, duration: 0 });
    }
  }, [ready, points, lines, areas, selectedId]);

  return <div ref={container} role="region" aria-label={label} className={cn('overflow-hidden rounded-[1.25rem] ring-1 ring-inset ring-[var(--hairline)]', className)} />;
}

/** A map with an honest fallback: real tiles when configured, a labelled schematic otherwise. */
export function MapView(props: MapViewProps) {
  const [failed, setFailed] = useState(false);
  const fail = useMemo(() => () => setFailed(true), []);
  if (!env.mapStyleUrl || failed) return <SchematicMap {...props} />;
  return <LiveMap {...props} onFail={fail} />;
}
