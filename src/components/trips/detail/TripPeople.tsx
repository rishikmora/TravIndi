'use client';

import Link from 'next/link';
import { Avatar } from '@/components/ui/Avatar';
import { ButtonLink } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { ErrorState, InlineNotice } from '@/components/ui/States';
import { StatusPill } from '@/components/ui/StatusPill';
import { useAuth } from '@/lib/auth/provider';
import { useTrip } from '@/lib/query/hooks/trips';

const ROLE = {
  owner: { label: 'Owner', description: 'Can change the plan, review travel updates, book and manage the trip.' },
  editor: { label: 'Editor', description: 'Can change the plan, review travel updates and book.' },
  viewer: { label: 'Viewer', description: 'Can see the plan and take part in the trip chat.' },
} as const;

export function TripPeople({ tripId }: { tripId: string }) {
  const { user } = useAuth();
  const trip = useTrip(tripId);

  if (trip.isPending) return <Skeleton className="h-64 w-full rounded-[1.25rem]" />;
  if (trip.isError) return <ErrorState error={trip.error} context="trip.load" onRetry={() => void trip.refetch()} />;

  const t = trip.data;
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
      <ul className="surface-card divide-y divide-[var(--hairline)]" aria-label="Travellers">
        {t.members.map((member) => {
          const me = member.userId === user?.userId;
          return (
            <li key={member.userId} className="flex flex-wrap items-center gap-3 p-4">
              <Avatar name={member.displayName} src={member.avatarUrl} presence={member.presence} decorative />
              <div className="grid min-w-0 flex-1">
                <span className="font-semibold">
                  {member.displayName}
                  {me && <span className="font-normal text-[var(--text-muted)]"> (you)</span>}
                </span>
                <span className="text-[0.875rem] text-[var(--text-muted)]">
                  {ROLE[member.role].label}
                  {member.presence === 'online' ? ' · Online' : member.presence === 'away' ? ' · Away' : ''}
                </span>
              </div>
              {member.locationShareId ? (
                <Link href={`/location-sharing/view?share=${member.locationShareId}`} className="rounded-full">
                  <StatusPill tone="live">Sharing location</StatusPill>
                </Link>
              ) : me ? (
                <ButtonLink href={`/location-sharing?trip=${tripId}`} variant="secondary" size="sm">
                  Share my location
                </ButtonLink>
              ) : null}
            </li>
          );
        })}
      </ul>
      <aside className="grid content-start gap-4">
        <section className="surface-card grid gap-3 p-5">
          <h2 className="font-semibold">What each role can do</h2>
          <dl className="grid gap-3">
            {Object.values(ROLE).map((role) => (
              <div key={role.label}>
                <dt className="font-medium">{role.label}</dt>
                <dd className="text-[0.875rem] text-[var(--text-muted)]">{role.description}</dd>
              </div>
            ))}
          </dl>
        </section>
        {t.permissions.canInvite && <InlineNotice tone="neutral" title="Inviting people">Adding travellers from the app isn’t available yet.</InlineNotice>}
        <p className="text-[0.8125rem] text-[var(--text-muted)]">Online status appears only for people who allow it. Locations are visible only while someone chooses to share.</p>
      </aside>
    </div>
  );
}
