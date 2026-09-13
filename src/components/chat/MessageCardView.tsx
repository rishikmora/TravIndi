'use client';

import Link from 'next/link';
import { LocateIcon, MapPinIcon, RouteIcon, UsersIcon } from '@/components/ui/icons';
import { StatusPill } from '@/components/ui/StatusPill';
import { useNow } from '@/hooks/useNow';
import { isApiError } from '@/lib/api/errors';
import { formatLocalTime } from '@/lib/format/dates';
import { LOCATION_FRESHNESS_LABEL, locationFreshness } from '@/lib/format/freshness';
import { useShare } from '@/lib/query/hooks/location';
import type { MessageCard } from '@/types/domain';
import { cn } from '@/utils/cn';

const clock = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }) : null);
const coords = (lat: number, lng: number) => `${lat.toFixed(4)}, ${lng.toFixed(4)}`;

function Shell({ icon, label, children, href, own }: { icon: React.ReactNode; label: string; children: React.ReactNode; href?: string; own: boolean }) {
  const body = (
    <div className={cn('grid gap-1 rounded-xl p-3 ring-1 ring-inset', own ? 'bg-white/10 ring-white/15' : 'bg-[var(--surface-sunken)] ring-[var(--hairline)]')}>
      <p className={cn('label flex items-center gap-1.5', own ? 'text-ivory/70' : 'text-[var(--text-subtle)]')}>
        {icon}
        {label}
      </p>
      {children}
    </div>
  );
  return href ? (
    <Link href={href} className="block rounded-xl transition-opacity hover:opacity-90">
      {body}
    </Link>
  ) : (
    body
  );
}

/** Live location as it is *now*: fetched fresh, so an ended share never looks live. */
function LiveLocationCard({ card, own }: { card: Extract<MessageCard, { cardType: 'live_location' }>; own: boolean }) {
  const share = useShare(card.shareId);
  const now = useNow();
  const unavailable = share.isError && isApiError(share.error) && share.error.kind === 'not_found';
  const status = share.data?.status ?? (unavailable ? 'stopped' : card.status);
  const live = status === 'active';
  const freshness = live && now ? locationFreshness(share.data?.lastLocationAt, now) : null;

  return (
    <Shell icon={<LocateIcon size={14} />} label="Live location" own={own} href={live || status === 'paused' ? `/location-sharing/view?share=${card.shareId}` : undefined}>
      <div className="flex flex-wrap items-center gap-2">
        {share.isPending ? (
          <span className="text-[0.875rem] opacity-80">Checking…</span>
        ) : live ? (
          <StatusPill tone={freshness === 'live' || freshness === 'recent' ? 'live' : 'warning'}>{freshness ? LOCATION_FRESHNESS_LABEL[freshness] : 'Live'}</StatusPill>
        ) : status === 'paused' ? (
          <StatusPill tone="warning">Paused</StatusPill>
        ) : (
          <StatusPill>No longer shared</StatusPill>
        )}
        {live && card.expiresAt && <span className="text-[0.8125rem] opacity-80">until {clock(card.expiresAt)}</span>}
      </div>
    </Shell>
  );
}

export function MessageCardView({ card, own }: { card: MessageCard; own: boolean }) {
  switch (card.cardType) {
    case 'place':
      return (
        <Shell icon={<MapPinIcon size={14} />} label="Place" own={own} href={card.destinationSlug ? `/destinations/${card.destinationSlug}` : undefined}>
          <p className="font-semibold">{card.name}</p>
          <p className="text-[0.8125rem] opacity-80">{card.category}</p>
        </Shell>
      );
    case 'itinerary_item':
      return (
        <Shell icon={<RouteIcon size={14} />} label="From the itinerary" own={own} href={`/trips/${card.tripId}/itinerary`}>
          <p className="font-semibold">{card.title}</p>
          <p className="text-[0.8125rem] opacity-80">
            Day {card.dayNumber}
            {card.startTime && ` · ${formatLocalTime(card.startTime)}`}
          </p>
        </Shell>
      );
    case 'location':
      return (
        <Shell icon={<MapPinIcon size={14} />} label="Location · not live" own={own} href={`/map?lat=${card.latitude}&lng=${card.longitude}`}>
          <p className="font-semibold">{card.label ?? coords(card.latitude, card.longitude)}</p>
          <p className="text-[0.8125rem] opacity-80">
            Shared at {clock(card.recordedAt)}
            {card.accuracy ? ` · within about ${card.accuracy} m` : ''}
          </p>
        </Shell>
      );
    case 'live_location':
      return <LiveLocationCard card={card} own={own} />;
    case 'meeting_point':
      return (
        <Shell icon={<UsersIcon size={14} />} label="Meeting point" own={own} href={`/map?lat=${card.latitude}&lng=${card.longitude}&label=${encodeURIComponent(card.label)}`}>
          <p className="font-semibold">{card.label}</p>
          {card.meetAt && <p className="text-[0.8125rem] opacity-80">Meet at {clock(card.meetAt)}</p>}
        </Shell>
      );
    default:
      return null;
  }
}
