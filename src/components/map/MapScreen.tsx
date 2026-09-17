'use client';

import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { PageHeader, PageShell } from '@/components/app/PageShell';
import { ButtonLink } from '@/components/ui/Button';
import { ToggleChip } from '@/components/ui/Chip';
import { FreshnessBadge } from '@/components/ui/FreshnessBadge';
import { ErrorState, InlineNotice } from '@/components/ui/States';
import { StatusPill } from '@/components/ui/StatusPill';
import { useNow } from '@/hooks/useNow';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth/provider';
import { useCapabilities } from '@/lib/capabilities/useCapabilities';
import { formatDistance } from '@/lib/format/dates';
import { locationFreshness, locationFreshnessLabel } from '@/lib/format/freshness';
import { useDestinations } from '@/lib/query/hooks/destinations';
import { useVisibleShares } from '@/lib/query/hooks/location';
import { queryKeys } from '@/lib/query/keys';
import type { MapLayerId } from '@/types/domain';
import { haversineKm } from '@/utils/geo';
import { type MapArea, type MapPoint, MapView, POINT_COLOR } from './MapView';

type LayerChoice = 'places' | 'safety' | 'crowd' | 'accessibility' | 'people';

const KIND_LABEL: Record<MapPoint['kind'], string> = {
  focus: 'Selected location',
  stop: 'Itinerary stop',
  place: 'Place',
  help: 'Help point',
  person: 'Sharing their location with you',
  crowd: 'Crowd report',
  access: 'Easier access',
};

export function MapScreen({ focus, destinationSlug }: { focus: { lat: number; lng: number; label: string } | null; destinationSlug: string | null }) {
  const now = useNow();
  const { status } = useAuth();
  const { capabilities } = useCapabilities();
  const destinations = useDestinations({ limit: 60 });
  const destination = destinationSlug ? destinations.data?.items.find((d) => d.slug === destinationSlug) : undefined;
  const center = useMemo(() => focus ?? (destination ? { ...destination.coordinates, label: destination.name } : null), [focus, destination]);
  // Layers are off by default: the map starts calm and the traveller chooses what to add.
  const [layers, setLayers] = useState<LayerChoice[]>([]);
  const [selected, setSelected] = useState<string | null>(null);

  const bbox: [number, number, number, number] = center ? [center.lng - 0.12, center.lat - 0.1, center.lng + 0.12, center.lat + 0.1] : [68, 6, 98, 37];
  const apiLayers = layers.filter((l): l is Exclude<LayerChoice, 'people'> => l !== 'people') as MapLayerId[];
  const layerData = useQuery({
    queryKey: queryKeys.map.layers(bbox.map((n) => n.toFixed(3)).join(','), apiLayers.join(','), null),
    queryFn: ({ signal }) => api.maps.layers({ bbox, layers: apiLayers }, { signal }),
    enabled: apiLayers.length > 0,
  });
  const shares = useVisibleShares(status === 'authenticated' && layers.includes('people'));

  const { points, areas } = useMemo(() => {
    const list: MapPoint[] = [];
    if (center) list.push({ id: 'focus', lat: center.lat, lng: center.lng, label: center.label, kind: 'focus' });
    else if (!layers.includes('places')) {
      for (const d of destinations.data?.items ?? []) list.push({ id: d.destinationId, lat: d.coordinates.lat, lng: d.coordinates.lng, label: d.name, kind: 'place', detail: d.state });
    }
    for (const place of layerData.data?.places ?? []) list.push({ id: place.placeId, lat: place.coordinates.lat, lng: place.coordinates.lng, label: place.name, kind: 'place', detail: place.category });
    for (const place of layerData.data?.accessibilityPoints ?? []) list.push({ id: `access-${place.placeId}`, lat: place.coordinates.lat, lng: place.coordinates.lng, label: place.name, kind: 'access', detail: 'Little walking needed' });
    for (const signal of layerData.data?.crowdSignals ?? []) list.push({ id: signal.signalId, lat: signal.coordinates.lat, lng: signal.coordinates.lng, label: signal.label, kind: 'crowd', detail: `Level: ${signal.level}` });
    if (layers.includes('people')) {
      for (const share of shares.data ?? []) {
        if (share.lastLocation) list.push({ id: share.shareId, lat: share.lastLocation.latitude, lng: share.lastLocation.longitude, label: share.ownerName, kind: 'person', detail: now ? locationFreshnessLabel(locationFreshness(share.lastLocationAt, now)) : null });
      }
    }
    const zones: MapArea[] = (layerData.data?.safetyZones ?? []).map((zone) => ({ id: zone.zoneId, coordinates: zone.geometry.coordinates[0] ?? [], label: zone.label }));
    return { points: list, areas: zones };
  }, [center, layers, destinations.data, layerData.data, shares.data, now]);

  const toggle = (layer: LayerChoice) => setLayers((current) => (current.includes(layer) ? current.filter((l) => l !== layer) : [...current, layer]));
  const selectedPoint = points.find((p) => p.id === selected) ?? null;

  const LAYERS: Array<{ id: LayerChoice; label: string; disabled?: boolean }> = [
    { id: 'places', label: 'Places to visit' },
    { id: 'safety', label: 'Safety zones' },
    { id: 'crowd', label: capabilities.liveCrowd ? 'Live crowds' : 'Crowd reports' },
    { id: 'accessibility', label: 'Easier access' },
    { id: 'people', label: 'People sharing with me', disabled: status !== 'authenticated' },
  ];

  return (
    <PageShell width="wide">
      <PageHeader
        eyebrow="Map"
        title={center ? center.label : 'Map of India'}
        description="Add only the layers you need. Everything on the map is also listed as text."
        actions={
          <ButtonLink href="/routes" variant="secondary">
            Compare routes
          </ButtonLink>
        }
      />
      <div className="grid gap-4">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Map layers">
          {LAYERS.map((layer) => (
            <ToggleChip key={layer.id} selected={layers.includes(layer.id)} onToggle={() => toggle(layer.id)} disabled={layer.disabled}>
              {layer.label}
            </ToggleChip>
          ))}
        </div>
        {layers.includes('crowd') && !capabilities.liveCrowd && (
          <InlineNotice tone="info">Crowd information comes from visitor reports, not live sensors. Each report shows how recent it is.</InlineNotice>
        )}
        {layerData.isError && <ErrorState error={layerData.error} context="map.routes" compact onRetry={() => void layerData.refetch()} />}

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <MapView points={points} areas={areas} selectedId={selected} onSelect={setSelected} label={`Map showing ${points.length} locations`} className="aspect-[4/3] w-full lg:aspect-auto lg:min-h-[34rem]" />

          <section aria-labelledby="map-list-title" className="surface-card grid max-h-[34rem] content-start gap-3 overflow-y-auto p-4" data-lenis-prevent>
            <h2 id="map-list-title" className="font-semibold">
              On the map
            </h2>
            {selectedPoint && (
              <div className="rounded-2xl bg-[var(--tone-accent-bg)] p-3">
                <p className="label text-[var(--text-subtle)]">{KIND_LABEL[selectedPoint.kind]}</p>
                <p className="font-semibold">{selectedPoint.label}</p>
                {selectedPoint.detail && <p className="text-[0.875rem] text-[var(--text-muted)]">{selectedPoint.detail}</p>}
              </div>
            )}
            {areas.length > 0 && (
              <ul className="grid gap-1.5">
                {areas.map((area) => (
                  <li key={area.id} className="flex items-start gap-2 text-[0.9375rem]">
                    <StatusPill tone="warning">Zone</StatusPill>
                    {area.label}
                  </li>
                ))}
              </ul>
            )}
            {(layerData.data?.crowdSignals ?? []).map((signal) => (
              <div key={signal.signalId} className="grid gap-1 text-[0.9375rem]">
                <span className="font-medium">{signal.label}</span>
                <FreshnessBadge freshness={signal.freshness} />
              </div>
            ))}
            <ul className="grid gap-1">
              {points.map((point) => (
                <li key={point.id}>
                  <button
                    type="button"
                    onClick={() => setSelected(point.id)}
                    aria-pressed={point.id === selected}
                    className="flex w-full items-start gap-2 rounded-xl p-2 text-left hover:bg-[var(--surface-sunken)] aria-pressed:bg-[var(--tone-neutral-bg)]"
                  >
                    <span aria-hidden="true" className="mt-1.5 size-2.5 shrink-0 rounded-full" style={{ backgroundColor: POINT_COLOR[point.kind] }} />
                    <span className="grid">
                      <span className="font-medium">{point.label}</span>
                      <span className="text-[0.8125rem] text-[var(--text-muted)]">
                        {[KIND_LABEL[point.kind], point.detail, center && point.kind !== 'focus' ? `${formatDistance(haversineKm(center, point) * 1000)} away (straight line)` : null].filter(Boolean).join(' · ')}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </PageShell>
  );
}
