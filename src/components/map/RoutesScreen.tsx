'use client';

import { useMutation } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { PageHeader, PageShell } from '@/components/app/PageShell';
import { Button } from '@/components/ui/Button';
import { ToggleChip } from '@/components/ui/Chip';
import { Field, Select } from '@/components/ui/Field';
import { FreshnessBadge } from '@/components/ui/FreshnessBadge';
import { ErrorState, InlineNotice } from '@/components/ui/States';
import { StatusPill } from '@/components/ui/StatusPill';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth/provider';
import { formatDistance, formatDuration, formatLocalTime } from '@/lib/format/dates';
import { getCurrentPosition, GeolocationError } from '@/lib/location/geolocation';
import { useItinerary, useTrips } from '@/lib/query/hooks/trips';
import type { RouteOption, RoutePlan } from '@/types/domain';
import { cn } from '@/utils/cn';
import { type MapLine, type MapPoint, MapView } from './MapView';

const RISK_LABEL = { lower: 'Fewer recent incident reports', typical: 'Typical', higher: 'More recent incident reports', unknown: 'No safety data' } as const;

export function RoutesScreen({ initialTripId }: { initialTripId: string | null }) {
  const { status } = useAuth();
  const trips = useTrips(status === 'authenticated');
  const [tripId, setTripId] = useState(initialTripId ?? '');
  const itinerary = useItinerary(tripId, Boolean(tripId));
  const [origin, setOrigin] = useState('');
  const [destination, setDestination] = useState('');
  const [preferences, setPreferences] = useState<Array<'less_walking' | 'accessible'>>([]);
  const [myLocation, setMyLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    if (!tripId && trips.data) {
      const active = trips.data.find((t) => t.status === 'active' || t.status === 'ready');
      if (active) setTripId(active.tripId);
    }
  }, [trips.data, tripId]);

  const stops = useMemo(
    () =>
      (itinerary.data?.days ?? []).flatMap((day) =>
        day.items
          .filter((item) => item.place?.coordinates)
          .map((item) => ({ id: item.itemId, label: `Day ${day.dayNumber} · ${formatLocalTime(item.startTime) ?? ''} · ${item.title}`, name: item.title, point: item.place!.coordinates! })),
      ),
    [itinerary.data],
  );

  const pointFor = (value: string) => (value === 'me' ? myLocation : (stops.find((s) => s.id === value)?.point ?? null));
  const nameFor = (value: string) => (value === 'me' ? 'My location' : (stops.find((s) => s.id === value)?.name ?? ''));

  const plan = useMutation({
    mutationFn: () =>
      api.maps.planRoutes({ origin: pointFor(origin)!, destination: pointFor(destination)!, modes: ['taxi', 'walk'], preferences, tripId: tripId || null }),
    onSuccess: (result: RoutePlan) => setSelected(result.options[0]?.routeId ?? null),
  });

  const useMyLocation = async () => {
    setLocationError(null);
    try {
      const position = await getCurrentPosition();
      setMyLocation({ lat: position.lat, lng: position.lng });
      setOrigin('me');
    } catch (error) {
      setLocationError(error instanceof GeolocationError ? error.message : 'Location unavailable.');
    }
  };

  const result = plan.data;
  const from = pointFor(origin);
  const to = pointFor(destination);
  const mapPoints: MapPoint[] = [
    ...(from ? [{ id: 'from', lat: from.lat, lng: from.lng, label: nameFor(origin), kind: 'focus' as const }] : []),
    ...(to ? [{ id: 'to', lat: to.lat, lng: to.lng, label: nameFor(destination), kind: 'stop' as const }] : []),
  ];
  const mapLines: MapLine[] = (result?.options ?? []).map((option) => ({ id: option.routeId, coordinates: option.geometry.coordinates, label: option.label, tone: option.routeId === selected ? 'route' : 'alternative' }));

  return (
    <PageShell width="wide">
      <PageHeader eyebrow="Map" title="Compare routes" description="See the trade-offs between options — not just the fastest way." />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <div className="grid content-start gap-5">
          <form
            className="surface-card grid gap-4 p-5"
            onSubmit={(event) => {
              event.preventDefault();
              if (from && to) plan.mutate();
            }}
          >
            {(trips.data?.length ?? 0) > 0 && (
              <Field label="Trip">
                {(control) => (
                  <Select {...control} value={tripId} onChange={(e) => { setTripId(e.target.value); setOrigin(''); setDestination(''); }}>
                    <option value="">Choose a trip</option>
                    {trips.data!.map((trip) => (
                      <option key={trip.tripId} value={trip.tripId}>
                        {trip.title}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
            )}
            <Field label="From">
              {(control) => (
                <Select {...control} value={origin} onChange={(e) => setOrigin(e.target.value)}>
                  <option value="">Choose a starting point</option>
                  {myLocation && <option value="me">My location</option>}
                  {stops.map((stop) => (
                    <option key={stop.id} value={stop.id}>
                      {stop.label}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Button variant="subtle" size="sm" className="justify-self-start" onClick={() => void useMyLocation()}>
              Start from my location
            </Button>
            {locationError && <InlineNotice tone="warning">{locationError}</InlineNotice>}
            <Field label="To">
              {(control) => (
                <Select {...control} value={destination} onChange={(e) => setDestination(e.target.value)}>
                  <option value="">Choose a destination</option>
                  {stops.map((stop) => (
                    <option key={stop.id} value={stop.id}>
                      {stop.label}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Route preferences">
              <ToggleChip selected={preferences.includes('less_walking')} onToggle={() => setPreferences((p) => (p.includes('less_walking') ? p.filter((x) => x !== 'less_walking') : [...p, 'less_walking']))}>
                Less walking
              </ToggleChip>
              <ToggleChip selected={preferences.includes('accessible')} onToggle={() => setPreferences((p) => (p.includes('accessible') ? p.filter((x) => x !== 'accessible') : [...p, 'accessible']))}>
                Step-free where possible
              </ToggleChip>
            </div>
            <Button type="submit" variant="navy" loading={plan.isPending} disabled={!from || !to || origin === destination}>
              Compare routes
            </Button>
            {stops.length === 0 && tripId && !itinerary.isPending && <p className="text-[0.875rem] text-[var(--text-muted)]">This trip has no mapped stops yet.</p>}
          </form>

          {plan.error ? <ErrorState error={plan.error} context="map.routes" compact onRetry={() => plan.mutate()} /> : null}

          {result && (
            <section aria-labelledby="options-title" className="grid gap-3">
              <h2 id="options-title" className="text-[1.25rem] font-semibold">
                {result.options.length} option{result.options.length === 1 ? '' : 's'}
              </h2>
              {result.geometryPrecision === 'approximate' && <InlineNotice tone="info">Lines are drawn approximately, not along real roads. Times are estimates, not live traffic.</InlineNotice>}
              {!result.turnByTurnAvailable && <InlineNotice tone="neutral">Turn-by-turn directions aren’t available in TravIndi. Use your usual navigation app once you’ve chosen a route.</InlineNotice>}
              <ul className="grid gap-2" role="radiogroup" aria-label="Route options">
                {result.options.map((option: RouteOption) => {
                  const checked = option.routeId === selected;
                  return (
                    <li key={option.routeId}>
                      <label className={cn('surface-card grid cursor-pointer gap-2 p-4', checked && 'ring-2 ring-terracotta')}>
                        <span className="flex items-center justify-between gap-3">
                          <span className="flex items-center gap-2">
                            <input type="radio" name="route" checked={checked} onChange={() => setSelected(option.routeId)} className="size-4 accent-[var(--color-terracotta)]" />
                            <span className="font-semibold">{option.label}</span>
                          </span>
                          <span className="font-semibold tabular-nums">{formatDuration(option.durationMinutes)}</span>
                        </span>
                        <span className="text-[0.875rem] text-[var(--text-muted)]">
                          {[formatDistance(option.distanceMeters), option.walkingMeters !== null ? `${formatDistance(option.walkingMeters)} walking` : null, option.stepFree === null ? 'Step-free not confirmed' : option.stepFree ? 'Step-free' : 'Has steps'].filter(Boolean).join(' · ')}
                        </span>
                        {option.factors.length > 0 && <span className="text-[0.9375rem]">{option.factors.map((f) => f.label).join(' · ')}</span>}
                        {option.riskSignal && (
                          <span className="flex flex-wrap items-center gap-2">
                            <StatusPill tone={option.riskSignal.level === 'lower' ? 'success' : option.riskSignal.level === 'higher' ? 'warning' : 'neutral'}>{RISK_LABEL[option.riskSignal.level]}</StatusPill>
                            <FreshnessBadge freshness={option.riskSignal.freshness} />
                          </span>
                        )}
                        {option.warnings.map((warning) => (
                          <span key={warning} className="text-[0.875rem] text-[var(--tone-warning-fg)]">
                            {warning}
                          </span>
                        ))}
                      </label>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
        </div>

        <MapView points={mapPoints} lines={mapLines} label="Route options between the chosen points" className="aspect-[4/3] w-full lg:sticky lg:top-[calc(var(--nav-height)+1.5rem)]" />
      </div>
    </PageShell>
  );
}
