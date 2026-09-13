'use client';

import Link from 'next/link';
import { useState } from 'react';
import { RequireAuth } from '@/components/auth/RequireAuth';
import { PageHeader, PageShell, Section } from '@/components/app/PageShell';
import { Button } from '@/components/ui/Button';
import { BellIcon, MessageIcon, ShieldIcon, SuitcaseIcon, TicketIcon, UsersIcon } from '@/components/ui/icons';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { LoadingBlock, Skeleton } from '@/components/ui/Skeleton';
import { EmptyState, ErrorState } from '@/components/ui/States';
import { StatusPill } from '@/components/ui/StatusPill';
import { useNow } from '@/hooks/useNow';
import { relativeTime } from '@/lib/format/freshness';
import { useMarkAllNotificationsRead, useMarkNotificationRead, useNotifications } from '@/lib/query/hooks/notifications';
import type { Notification, NotificationTarget } from '@/types/domain';
import { cn } from '@/utils/cn';

const CATEGORY_ICON = { safety: ShieldIcon, trip: SuitcaseIcon, message: MessageIcon, booking: TicketIcon, community: UsersIcon } as const;

export function notificationHref(target: NotificationTarget | null): string | null {
  if (!target) return null;
  switch (target.kind) {
    case 'trip':
      return `/trips/${target.tripId}`;
    case 'adaptation':
      return `/trips/${target.tripId}/itinerary`;
    case 'conversation':
      return `/messages/${target.conversationId}`;
    case 'booking':
      return `/bookings?booking=${target.bookingId}`;
    case 'sos':
      return '/sos';
    case 'location_share':
      return `/location-sharing/view?share=${target.shareId}`;
    case 'destination':
      return `/destinations/${target.slug}`;
    default:
      return null;
  }
}

function NotificationItem({ notification, now }: { notification: Notification; now: number }) {
  const markRead = useMarkNotificationRead();
  const Icon = CATEGORY_ICON[notification.category];
  const href = notificationHref(notification.target);
  const unread = !notification.readAt;
  const urgent = notification.priority === 'critical' || notification.priority === 'high';

  const body = (
    <div className="flex items-start gap-3">
      <span className={cn('mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-full', urgent ? 'bg-[var(--tone-danger-bg)] text-[var(--tone-danger-fg)]' : 'bg-[var(--tone-neutral-bg)] text-[var(--text-muted)]')}>
        <Icon size={20} />
      </span>
      <div className="grid min-w-0 flex-1 gap-0.5">
        <div className="flex flex-wrap items-center gap-2">
          {unread && <span aria-hidden="true" className="size-2 rounded-full bg-terracotta" />}
          <span className={cn(unread ? 'font-semibold' : 'font-medium')}>{notification.title}</span>
          {notification.priority === 'critical' && <StatusPill tone="danger">Critical</StatusPill>}
          {notification.priority === 'high' && <StatusPill tone="warning">Important</StatusPill>}
        </div>
        <p className="text-[0.9375rem] text-[var(--text-muted)]">{notification.body}</p>
        {now > 0 && <p className="text-[0.75rem] text-[var(--text-subtle)]">{relativeTime(notification.createdAt, now)}</p>}
      </div>
      <span className="sr-only">{unread ? 'Unread' : 'Read'}</span>
    </div>
  );

  const onOpen = () => {
    if (unread) markRead.mutate(notification.notificationId);
  };

  return (
    <li className={cn(unread && 'bg-[var(--tone-accent-bg)]/40')}>
      {href ? (
        <Link href={href} onClick={onOpen} className="block p-4 transition-colors hover:bg-[var(--surface-sunken)]">
          {body}
        </Link>
      ) : (
        <div className="grid gap-2 p-4">
          {body}
          {unread && (
            <Button variant="ghost" size="sm" className="justify-self-end" onClick={onOpen}>
              Mark as read
            </Button>
          )}
        </div>
      )}
    </li>
  );
}

function NotificationList() {
  const now = useNow();
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const notifications = useNotifications(filter === 'unread');
  const markAll = useMarkAllNotificationsRead();

  if (notifications.isPending) {
    return (
      <LoadingBlock label="Loading notifications" className="grid gap-2">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-20 w-full rounded-2xl" />
        ))}
      </LoadingBlock>
    );
  }
  if (notifications.isError) return <ErrorState error={notifications.error} onRetry={() => void notifications.refetch()} retrying={notifications.isFetching} />;

  const items = notifications.data.items;
  const attention = items.filter((n) => !n.readAt && (n.priority === 'critical' || n.priority === 'high'));
  const rest = items.filter((n) => !attention.includes(n));
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const today = rest.filter((n) => Date.parse(n.createdAt) >= startOfToday.getTime());
  const earlier = rest.filter((n) => Date.parse(n.createdAt) < startOfToday.getTime());
  const unreadCount = items.filter((n) => !n.readAt).length;

  const group = (title: string, list: Notification[]) =>
    list.length > 0 && (
      <Section title={title} level={2}>
        <ul className="surface-card divide-y divide-[var(--hairline)] overflow-hidden">
          {list.map((notification) => (
            <NotificationItem key={notification.notificationId} notification={notification} now={now} />
          ))}
        </ul>
      </Section>
    );

  return (
    <div className="grid gap-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SegmentedControl
          label="Show"
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: 'All' },
            { value: 'unread', label: 'Unread' },
          ]}
        />
        {unreadCount > 0 && (
          <Button variant="secondary" size="sm" onClick={() => markAll.mutate()} loading={markAll.isPending}>
            Mark all as read
          </Button>
        )}
      </div>
      {items.length === 0 ? (
        <EmptyState icon={<BellIcon />} title={filter === 'unread' ? 'You’re all caught up' : 'No notifications yet'} description="Trip updates, messages, bookings and safety alerts will appear here." className="surface-card" />
      ) : (
        <>
          {group('Needs your attention', attention)}
          {group('Today', today)}
          {group('Earlier', earlier)}
        </>
      )}
    </div>
  );
}

export function NotificationsScreen() {
  return (
    <PageShell width="narrow">
      <PageHeader eyebrow="Notifications" title="Updates" description="Critical safety alerts are shown first." />
      <RequireAuth>
        <NotificationList />
      </RequireAuth>
    </PageShell>
  );
}
