'use client';

import Link from 'next/link';
import { Avatar } from '@/components/ui/Avatar';
import { ButtonLink } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { ErrorState, InlineNotice } from '@/components/ui/States';
import { StatusPill } from '@/components/ui/StatusPill';
import { useTranslation } from '@/i18n/react';
import { useAuth } from '@/lib/auth/provider';
import { useTrip } from '@/lib/query/hooks/trips';

const ROLES = ['owner', 'editor', 'viewer'] as const;

export function TripPeople({ tripId }: { tripId: string }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const trip = useTrip(tripId);

  if (trip.isPending) return <Skeleton className="h-64 w-full rounded-[1.25rem]" />;
  if (trip.isError) return <ErrorState error={trip.error} context="trip.load" onRetry={() => void trip.refetch()} />;

  const data = trip.data;
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
      <ul className="surface-card divide-y divide-[var(--hairline)]" aria-label={t('trips.people.travellersLabel')}>
        {data.members.map((member) => {
          const me = member.userId === user?.userId;
          return (
            <li key={member.userId} className="flex flex-wrap items-center gap-3 p-4">
              <Avatar name={member.displayName} src={member.avatarUrl} presence={member.presence} decorative />
              <div className="grid min-w-0 flex-1">
                <span className="font-semibold">
                  {member.displayName}
                  {me && <span className="font-normal text-[var(--text-muted)]"> {t('trips.people.you')}</span>}
                </span>
                <span className="text-[0.875rem] text-[var(--text-muted)]">
                  {t(`trips.people.roles.${member.role}.label`)}
                  {member.presence === 'online' ? ` · ${t('trips.people.online')}` : member.presence === 'away' ? ` · ${t('trips.people.away')}` : ''}
                </span>
              </div>
              {member.locationShareId ? (
                <Link href={`/location-sharing/view?share=${member.locationShareId}`} className="rounded-full">
                  <StatusPill tone="live">{t('trips.people.sharingLocation')}</StatusPill>
                </Link>
              ) : me ? (
                <ButtonLink href={`/location-sharing?trip=${tripId}`} variant="secondary" size="sm">
                  {t('trips.people.shareMyLocation')}
                </ButtonLink>
              ) : null}
            </li>
          );
        })}
      </ul>
      <aside className="grid content-start gap-4">
        <section className="surface-card grid gap-3 p-5">
          <h2 className="font-semibold">{t('trips.people.rolesTitle')}</h2>
          <dl className="grid gap-3">
            {ROLES.map((role) => (
              <div key={role}>
                <dt className="font-medium">{t(`trips.people.roles.${role}.label`)}</dt>
                <dd className="text-[0.875rem] text-[var(--text-muted)]">{t(`trips.people.roles.${role}.description`)}</dd>
              </div>
            ))}
          </dl>
        </section>
        {data.permissions.canInvite && (
          <InlineNotice tone="neutral" title={t('trips.people.invitingTitle')}>
            {t('trips.people.invitingBody')}
          </InlineNotice>
        )}
        <p className="text-[0.8125rem] text-[var(--text-muted)]">{t('trips.people.privacyNote')}</p>
      </aside>
    </div>
  );
}
