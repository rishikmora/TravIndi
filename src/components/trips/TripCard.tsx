'use client';

import Image from 'next/image';
import Link from 'next/link';
import { StatusPill } from '@/components/ui/StatusPill';
import { useTranslation } from '@/i18n/react';
import { formatDateRange } from '@/lib/format/dates';
import { isRemoteImage, isTrustedImageUrl } from '@/lib/media/trusted';
import type { TripSummary } from '@/types/domain';
import { cn } from '@/utils/cn';
import { TRIP_STATUS } from './tripStatus';

export function TripCard({ trip, className }: { trip: TripSummary; className?: string }) {
  const { t } = useTranslation();
  const status = TRIP_STATUS[trip.status];
  const dates = formatDateRange(trip.startDate, trip.endDate);
  const image = trip.coverImage;

  return (
    <article className={cn('surface-card group relative flex flex-col overflow-hidden', className)}>
      <div className="relative aspect-[16/9] overflow-hidden bg-navy">
        {image && isTrustedImageUrl(image.url) ? (
          <Image
            src={image.urlSmall ?? image.url}
            alt=""
            fill
            unoptimized={isRemoteImage(image.url)}
            sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
            className="object-cover transition-transform duration-700 ease-cinematic group-hover:scale-[1.03]"
          />
        ) : (
          <div aria-hidden="true" className="absolute inset-0 bg-[radial-gradient(90%_70%_at_20%_20%,rgb(212_166_73/0.35),transparent_60%),linear-gradient(135deg,#1c2b4a,#1d6b6b)]" />
        )}
        <div className="absolute left-3 top-3">
          <StatusPill tone={status.tone} className="bg-ivory/95 shadow-sm">
            {status.label}
          </StatusPill>
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <h3 className="text-[1.125rem] font-semibold leading-snug tracking-[-0.015em]">
          <Link href={`/trips/${trip.tripId}`} className="after:absolute after:inset-0 focus-visible:outline-none">
            {trip.title}
          </Link>
        </h3>
        <p className="text-[0.9375rem] text-[var(--text-muted)]">
          {[trip.destination?.name, dates ?? t('trips.card.datesNotSet'), trip.days ? t('planner.duration.days', { count: trip.days }) : null].filter(Boolean).join(' · ')}
        </p>
        <div className="mt-auto flex flex-wrap gap-2 pt-2">
          {trip.pendingAdaptations > 0 && (
            <StatusPill tone="warning">{t('trips.card.updatesToReview', { count: trip.pendingAdaptations })}</StatusPill>
          )}
          {trip.unreadMessages > 0 && <StatusPill tone="info">{t('trips.card.unread', { count: trip.unreadMessages })}</StatusPill>}
          {trip.membersCount > 1 && <StatusPill>{t('trips.card.travellers', { count: trip.membersCount })}</StatusPill>}
        </div>
      </div>
    </article>
  );
}
