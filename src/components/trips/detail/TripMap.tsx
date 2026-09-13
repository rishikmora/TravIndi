'use client';

import { useMemo, useState } from 'react';
import { MapView, type MapLine, type MapPoint } from '@/components/map/MapView';
import { ButtonLink } from '@/components/ui/Button';
import { ToggleChip } from '@/components/ui/Chip';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { Skeleton } from '@/components/ui/Skeleton';
import { ErrorState, InlineNotice } from '@/components/ui/States';
import { useNow } from '@/hooks/useNow';
import { formatLocalTime } from '@/lib/format/dates';
import { LOCATION_FRESHNESS_LABEL, locationFreshness } from '@/lib/format/freshness';
import { useVisibleShares } from '@/lib/query/hooks/location';
import { useItinerary, useTrip } from '@/lib/query/hooks/trips';

export function TripMap({ tripId, placeId }: { tripId: string; placeId: string | null }) {
  const now = useNow();
  const trip = useTrip(tripId);
  const itinerary = useItinerary(tripId);
  const [dayNumber, setDayNumber] = useState<string | null>(null);
  const [showPeople, setShowPeople] = useState(false);
  const shares = useVisibleShares(showPeople);
  const initialDay = placeId ? itinerary.data?.days.find((d) => d.items.some((i) => i.place?.placeId === placeId))?.dayNumber : undefined;
  const activeDay = itinerary.data?.days.find((d) => String(d.dayNumber) === (dayNumber ?? String(initialDay ?? itinerary.data?.days[0]?.dayNumber)));
  const [selected, setSelected] = useState<string | null>(null);

  const { points, lines } = useMemo(() => {
    const stops = (activeDay?.items ?? []).filter((item) => item.place?.coordinates);
    const list: MapPoint[] = stops.map((item, index) => ({
      id: item.itemId,
      lat: item.place!.coordinates!.lat,
      lng: item.place!.coordinates!.lng,
      label: item.title,
      kind: 'stop',
      order: index + 1,
      detail: formatLocalTime(item.startTime),
    }));
    const memberShareIds = new Set(trip.data?.members.map((m) => m.locationShareId).filter(Boolean));
    if (showPeople) {
      for (const share of shares.data ?? []) {
        if (share.lastLocation && memberShareIds.has(share.shareId)) {
          list.push({ id: share.shareId, lat: share.lastLocation.latitude, lng: share.lastLocation.longitude, label: share.ownerName, kind: 'person', detail: now ? LOCATION_FRESHNESS_LABEL[locationFreshness(share.lastLocationAt, now)] : null });
        }
      }
    }
    const connector: MapLine[] = stops.length > 1 ? [{ id: 'order', coordinates: stops.map((s) => [s.place!.coordinates!.lng, s.place!.coordinates!.lat]), label: 'Order of stops (straight lines, not routes)', tone: 'connector' }] : [];
    return { points: list, lines: connector };
  }, [activeDay, showPeople, shares.data, trip.data, now]);

  if (itinerary.isPending) return <Skeleton className="aspect-[4/3] w-full rounded-[1.25rem]" />;
  if (itinerary.isError) return <ErrorState error={itinerary.error} context="trip.load" onRetry={() => void itinerary.refetch()} />;

  const highlighted = selected ?? itinerary.data.days.flatMap((d) => d.items).find((i) => i.place?.placeId === placeId)?.itemId ?? null;

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SegmentedControl
          label="Day"
          size="sm"
          value={String(activeDay?.dayNumber ?? '')}
          onChange={(value) => setDayNumber(value)}
          options={itinerary.data.days.map((d) => ({ value: String(d.dayNumber), label: `Day ${d.dayNumber}` }))}
        />
        <div className="flex flex-wrap gap-2">
          <ToggleChip selected={showPeople} onToggle={() => setShowPeople((v) => !v)}>
            Travellers sharing location
          </ToggleChip>
          <ButtonLink href={`/routes?trip=${tripId}`} variant="secondary" size="sm">
            Compare routes
          </ButtonLink>
        </div>
      </div>
      <InlineNotice tone="neutral">Dashed lines show the order of stops, not the way to travel between them.</InlineNotice>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <MapView points={points} lines={lines} selectedId={highlighted} onSelect={setSelected} label={`Day ${activeDay?.dayNumber ?? ''} stops`} className="aspect-[4/3] w-full" />
        <ol className="surface-card grid content-start gap-1 p-3" aria-label={`Day ${activeDay?.dayNumber ?? ''} stops in order`}>
          {points.map((point) => (
            <li key={point.id}>
              <button type="button" onClick={() => setSelected(point.id)} aria-pressed={point.id === highlighted} className="flex w-full items-start gap-3 rounded-xl p-2 text-left hover:bg-[var(--surface-sunken)] aria-pressed:bg-[var(--tone-neutral-bg)]">
                <span aria-hidden="true" className="flex size-6 shrink-0 items-center justify-center rounded-full bg-terracotta text-[0.75rem] font-bold text-white">
                  {point.order ?? '•'}
                </span>
                <span className="grid">
                  <span className="font-medium">{point.label}</span>
                  {point.detail && <span className="text-[0.8125rem] text-[var(--text-muted)]">{point.detail}</span>}
                </span>
              </button>
            </li>
          ))}
          {points.length === 0 && <li className="p-2 text-[var(--text-muted)]">No mapped stops on this day.</li>}
        </ol>
      </div>
    </div>
  );
}
