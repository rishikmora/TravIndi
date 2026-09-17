'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { RequireAuth } from '@/components/auth/RequireAuth';
import { PageHeader, PageShell, Section } from '@/components/app/PageShell';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Checkbox, Field, Select } from '@/components/ui/Field';
import { Dialog } from '@/components/ui/Dialog';
import { LocateIcon } from '@/components/ui/icons';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { LoadingBlock, Skeleton } from '@/components/ui/Skeleton';
import { ErrorState, InlineNotice } from '@/components/ui/States';
import { StatusPill } from '@/components/ui/StatusPill';
import { useNow } from '@/hooks/useNow';
import { isApiError } from '@/lib/api/errors';
import { useAuth } from '@/lib/auth/provider';
import { locationFreshness, locationFreshnessLabel, relativeTime } from '@/lib/format/freshness';
import { broadcastingIds, markBroadcasting, unmarkBroadcasting, useBroadcastingIds, useBroadcastStatus } from '@/lib/location/broadcast';
import { getCurrentPosition, GeolocationError } from '@/lib/location/geolocation';
import { api } from '@/lib/api';
import { useConversations } from '@/lib/query/hooks/chat';
import { useCreateShare, useExtendShare, useMyShares, usePauseShare, useResumeShare, useShareHistory, useStopAllShares, useStopShare, useVisibleShares } from '@/lib/query/hooks/location';
import { useConsents } from '@/lib/query/hooks/profile';
import { useTrips } from '@/lib/query/hooks/trips';
import { locationSharingMachine, type LocationSharingEvent, type LocationSharingState } from '@/lib/state/machine';
import { announce, toast } from '@/lib/ui/toast';
import type { LocationShare, LocationShareInput } from '@/types/domain';

const clock = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }) : null);
const DURATIONS = [
  { value: '30', label: '30 min' },
  { value: '60', label: '1 hour' },
  { value: '120', label: '2 hours' },
  { value: '240', label: '4 hours' },
  { value: '480', label: '8 hours' },
] as const;

function MyShareCard({ share, sendingHere }: { share: LocationShare; sendingHere: boolean }) {
  const now = useNow();
  const pause = usePauseShare();
  const resume = useResumeShare();
  const extend = useExtendShare();
  const stop = useStopShare();
  const broadcastError = useBroadcastStatus((s) => s.error);
  const [confirmStop, setConfirmStop] = useState(false);
  const minutesLeft = share.expiresAt && now ? Math.max(0, Math.round((Date.parse(share.expiresAt) - now) / 60_000)) : null;
  const freshness = now ? locationFreshness(share.lastLocationAt, now) : 'none';
  const busy = pause.isPending || resume.isPending || extend.isPending || stop.isPending;
  const error = pause.error ?? resume.error ?? extend.error ?? stop.error;

  return (
    <li className="surface-card grid gap-4 p-5">
      <dl className="grid gap-3 sm:grid-cols-3">
        <div className="grid gap-0.5">
          <dt className="label text-[var(--text-subtle)]">Who</dt>
          <dd className="font-semibold">{share.audienceLabel}</dd>
          {share.recipients.length > 1 && <dd className="text-[0.8125rem] text-[var(--text-muted)]">{share.recipients.map((r) => r.displayName).join(', ')}</dd>}
        </div>
        <div className="grid gap-0.5">
          <dt className="label text-[var(--text-subtle)]">Until when</dt>
          <dd className="font-semibold">{clock(share.expiresAt) ?? 'Until you stop'}</dd>
          {minutesLeft !== null && <dd className="text-[0.8125rem] text-[var(--text-muted)]">{minutesLeft > 0 ? `${minutesLeft} min left` : 'Ending now'}</dd>}
        </div>
        <div className="grid gap-1">
          <dt className="label text-[var(--text-subtle)]">Status</dt>
          <dd className="flex flex-wrap gap-1.5">
            {share.status === 'paused' ? (
              <StatusPill tone="warning">Paused</StatusPill>
            ) : sendingHere ? (
              <StatusPill tone={freshness === 'live' || freshness === 'recent' ? 'live' : 'warning'}>{freshness === 'none' ? 'Starting' : locationFreshnessLabel(freshness)}</StatusPill>
            ) : (
              <StatusPill tone="neutral">Not sending from this device</StatusPill>
            )}
            <StatusPill>{share.precisionMode === 'approximate' ? 'Approximate' : 'Precise'}</StatusPill>
          </dd>
          {share.lastLocationAt && now > 0 && <dd className="text-[0.8125rem] text-[var(--text-muted)]">Last sent {relativeTime(share.lastLocationAt, now)}</dd>}
        </div>
      </dl>

      {sendingHere && broadcastError && share.status === 'active' && <InlineNotice tone="warning">{broadcastError}</InlineNotice>}
      {!sendingHere && share.status === 'active' && (
        <InlineNotice tone="neutral">
          This share is active, but this device isn’t sending its location.{' '}
          <button type="button" className="font-semibold text-[var(--link)] underline underline-offset-2" onClick={() => markBroadcasting(share.shareId)}>
            Send from this device
          </button>
        </InlineNotice>
      )}
      {error ? <ErrorState error={error} context="location.share" compact /> : null}

      <div className="flex flex-wrap gap-2">
        {share.status === 'active' ? (
          <Button variant="secondary" size="sm" disabled={busy} onClick={() => pause.mutate(share.shareId, { onSuccess: () => announce('Location sharing paused.') })}>
            Pause
          </Button>
        ) : (
          <Button variant="secondary" size="sm" disabled={busy} onClick={() => resume.mutate(share.shareId, { onSuccess: () => { markBroadcasting(share.shareId); announce('Location sharing resumed.'); } })}>
            Resume
          </Button>
        )}
        <Button variant="subtle" size="sm" disabled={busy} onClick={() => extend.mutate({ shareId: share.shareId, minutes: 30 })}>
          +30 min
        </Button>
        <Button variant="subtle" size="sm" disabled={busy} onClick={() => extend.mutate({ shareId: share.shareId, minutes: 60 })}>
          +1 hour
        </Button>
        <Button variant="danger" size="sm" disabled={busy} onClick={() => setConfirmStop(true)}>
          Stop sharing
        </Button>
      </div>

      <Dialog
        open={confirmStop}
        onClose={() => setConfirmStop(false)}
        title="Stop sharing your location?"
        description={`${share.audienceLabel} will stop seeing your location straight away.`}
        dismissible={!stop.isPending}
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmStop(false)} disabled={stop.isPending}>
              Keep sharing
            </Button>
            <Button
              variant="danger"
              loading={stop.isPending}
              onClick={() =>
                stop.mutate(share.shareId, {
                  onSuccess: () => {
                    unmarkBroadcasting(share.shareId);
                    setConfirmStop(false);
                    toast.success('Stopped sharing', `${share.audienceLabel} can no longer see your location.`);
                  },
                })
              }
            >
              Stop sharing
            </Button>
          </>
        }
      />
    </li>
  );
}

function StartShareForm({ initialTripId }: { initialTripId: string | null }) {
  const { user } = useAuth();
  const trips = useTrips();
  const conversations = useConversations();
  const create = useCreateShare();
  const [machine, setMachine] = useState<LocationSharingState>('off');
  const [audience, setAudience] = useState<LocationShareInput['audience']>('trip_members');
  const [tripId, setTripId] = useState(initialTripId ?? '');
  const [people, setPeople] = useState<string[]>([]);
  const [duration, setDuration] = useState('60');
  const [precision, setPrecision] = useState<'precise' | 'approximate'>('precise');
  const [permissionMessage, setPermissionMessage] = useState<string | null>(null);
  const send = (event: LocationSharingEvent) => setMachine((state) => locationSharingMachine.next(state, event));

  const shareableTrips = (trips.data ?? []).filter((t) => t.status !== 'completed' && t.status !== 'cancelled' && t.membersCount > 1);
  // Default to the first trip that can be shared with.
  if (!tripId && shareableTrips[0]) setTripId(shareableTrips[0].tripId);

  const candidates = useMemo(() => {
    const map = new Map<string, string>();
    for (const conversation of conversations.data ?? []) {
      if (conversation.kind === 'community') continue;
      for (const member of conversation.members) if (member.userId !== user?.userId) map.set(member.userId, member.displayName);
    }
    return [...map.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [conversations.data, user?.userId]);

  const now = useNow();
  const until = now ? new Date(now + Number(duration) * 60_000).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }) : '…';
  const who =
    audience === 'trip_members'
      ? `Everyone on “${shareableTrips.find((t) => t.tripId === tripId)?.title ?? 'your trip'}”`
      : audience === 'trusted_contacts'
        ? 'Your trusted contacts who use TravIndi'
        : people.length
          ? candidates.filter((c) => people.includes(c.id)).map((c) => c.name).join(', ')
          : 'The people you choose';
  const ready = audience === 'trip_members' ? Boolean(tripId) : audience === 'custom' ? people.length > 0 : true;

  const start = async () => {
    send('START');
    setPermissionMessage(null);
    create.reset();
    let first;
    try {
      first = await getCurrentPosition({ highAccuracy: true, timeoutMs: 15_000 });
      send('PERMISSION_GRANTED');
    } catch (error) {
      const reason = error instanceof GeolocationError ? error.reason : 'unavailable';
      setPermissionMessage(error instanceof Error ? error.message : 'Location unavailable.');
      send(reason === 'denied' ? 'PERMISSION_DENIED' : 'GEOLOCATION_UNAVAILABLE');
      return;
    }
    create.mutate(
      { tripId: audience === 'trip_members' ? tripId : null, audience, recipientIds: audience === 'custom' ? people : [], durationMinutes: Number(duration), precisionMode: precision },
      {
        onSuccess: async (share) => {
          if (!('shareId' in share)) return;
          markBroadcasting(share.shareId);
          send('SHARE_CREATED');
          announce(`Sharing your location with ${share.audienceLabel} until ${clock(share.expiresAt)}.`);
          await api.location
            .postUpdates(share.shareId, [{ latitude: first.lat, longitude: first.lng, accuracy: first.accuracy, recordedAt: first.recordedAt, sequence: Date.now() }])
            .catch(() => undefined);
          send('RESET');
        },
        onError: () => send('SHARE_FAILED'),
      },
    );
  };

  const consentNeeded = isApiError(create.error) && create.error.code === 'consent_required';

  return (
    <section aria-labelledby="start-title" className="surface-card grid gap-5 p-5 md:p-6">
      <h2 id="start-title" className="text-[1.25rem] font-semibold">
        Share your location
      </h2>

      <div className="grid gap-2">
        <p className="font-medium">With</p>
        <SegmentedControl
          label="Share with"
          value={audience}
          onChange={setAudience}
          options={[
            { value: 'trip_members', label: 'A trip', disabled: shareableTrips.length === 0 },
            { value: 'trusted_contacts', label: 'Trusted contacts' },
            { value: 'custom', label: 'Chosen people', disabled: candidates.length === 0 },
          ]}
        />
      </div>

      {audience === 'trip_members' && (
        <Field label="Trip">
          {(control) => (
            <Select {...control} value={tripId} onChange={(e) => setTripId(e.target.value)}>
              {shareableTrips.map((trip) => (
                <option key={trip.tripId} value={trip.tripId}>
                  {trip.title} ({trip.membersCount} travellers)
                </option>
              ))}
            </Select>
          )}
        </Field>
      )}

      {audience === 'custom' && (
        <fieldset className="grid gap-2">
          <legend className="mb-1 font-medium">People</legend>
          {candidates.map((person) => (
            <Checkbox
              key={person.id}
              label={person.name}
              checked={people.includes(person.id)}
              onChange={(e) => setPeople((current) => (e.target.checked ? [...current, person.id] : current.filter((id) => id !== person.id)))}
            />
          ))}
        </fieldset>
      )}

      <div className="grid gap-2">
        <p className="font-medium">For how long</p>
        <SegmentedControl label="Duration" value={duration} onChange={setDuration} options={DURATIONS.map((d) => ({ value: d.value, label: d.label }))} size="sm" />
      </div>

      <div className="grid gap-2">
        <p className="font-medium">How precisely</p>
        <SegmentedControl
          label="Precision"
          value={precision}
          onChange={setPrecision}
          options={[
            { value: 'precise', label: 'Precise' },
            { value: 'approximate', label: 'Approximate (about 1 km)' },
          ]}
          size="sm"
        />
      </div>

      <p className="rounded-2xl bg-[var(--tone-neutral-bg)] p-4 text-[0.9375rem]">
        <strong>{who}</strong> will see your {precision === 'approximate' ? 'approximate' : 'precise'} location until about <strong>{until}</strong>. You can stop at any time. Your location is sent while TravIndi is open on this device.
      </p>

      {machine === 'permission_denied' && (
        <InlineNotice tone="warning" title="Location permission is off">
          {permissionMessage} Turn on location for this site in your browser settings, then try again.
        </InlineNotice>
      )}
      {machine === 'unavailable' && <InlineNotice tone="warning" title="Location unavailable">{permissionMessage}</InlineNotice>}
      {consentNeeded ? (
        <InlineNotice tone="warning" title="Location sharing is turned off in your privacy choices" action={<ButtonLink href="/consents" variant="secondary" size="sm">Review privacy choices</ButtonLink>}>
          You need to allow location sharing before starting a share.
        </InlineNotice>
      ) : create.error ? (
        isApiError(create.error) && create.error.kind === 'validation' ? (
          <InlineNotice tone="warning">{create.error.message}</InlineNotice>
        ) : (
          <ErrorState error={create.error} context="location.share" compact />
        )
      ) : null}

      <Button
        variant="navy"
        size="lg"
        className="justify-self-start"
        onClick={() => void start()}
        disabled={!ready}
        loading={machine === 'requesting_permission' || machine === 'starting' || create.isPending}
      >
        <LocateIcon size={18} />
        {machine === 'requesting_permission' ? 'Finding your location…' : 'Start sharing'}
      </Button>
    </section>
  );
}

function SharingManager({ initialTripId }: { initialTripId: string | null }) {
  const now = useNow();
  const mine = useMyShares();
  const visible = useVisibleShares();
  const history = useShareHistory();
  const consents = useConsents();
  const stopAll = useStopAllShares();
  const broadcasting = useBroadcastingIds();
  const [confirmAll, setConfirmAll] = useState(false);
  const consentOff = consents.data && !consents.data.find((c) => c.consentId === 'location_sharing')?.granted;

  return (
    <div className="grid gap-10">
      {consentOff && (
        <InlineNotice tone="warning" title="Location sharing is turned off" action={<ButtonLink href="/consents" variant="secondary" size="sm">Privacy choices</ButtonLink>}>
          Allow location sharing in your privacy choices to start sharing. Nothing is shared until you start a share.
        </InlineNotice>
      )}

      <Section
        title="You’re sharing with"
        level={2}
        id="mine"
        action={
          (mine.data?.length ?? 0) > 0 ? (
            <Button variant="danger" size="sm" onClick={() => setConfirmAll(true)}>
              Stop all sharing
            </Button>
          ) : undefined
        }
      >
        {mine.isPending ? (
          <LoadingBlock label="Loading your shares">
            <Skeleton className="h-32 w-full rounded-[1.25rem]" />
          </LoadingBlock>
        ) : mine.isError ? (
          <ErrorState error={mine.error} onRetry={() => void mine.refetch()} />
        ) : mine.data.length === 0 ? (
          <p className="text-[var(--text-muted)]">No one can see your location right now.</p>
        ) : (
          <ul className="grid gap-3">
            {mine.data.map((share) => (
              <MyShareCard key={share.shareId} share={share} sendingHere={broadcasting.includes(share.shareId)} />
            ))}
          </ul>
        )}
      </Section>

      {!consentOff && <StartShareForm initialTripId={initialTripId} />}

      <Section title="Shared with you" description="People who chose to share their location with you." level={2} id="visible">
        {visible.isPending ? (
          <Skeleton className="h-20 w-full rounded-2xl" />
        ) : visible.isError ? (
          <ErrorState error={visible.error} compact onRetry={() => void visible.refetch()} />
        ) : visible.data.length === 0 ? (
          <p className="text-[var(--text-muted)]">No one is sharing their location with you.</p>
        ) : (
          <ul className="surface-card divide-y divide-[var(--hairline)]">
            {visible.data.map((share) => {
              const freshness = now ? locationFreshness(share.lastLocationAt, now) : 'none';
              return (
                <li key={share.shareId}>
                  <Link href={`/location-sharing/view?share=${share.shareId}`} className="flex flex-wrap items-center justify-between gap-3 p-4 hover:bg-[var(--surface-sunken)]">
                    <span className="grid">
                      <span className="font-semibold">{share.ownerName}</span>
                      <span className="text-[0.8125rem] text-[var(--text-muted)]">
                        {share.audienceLabel}
                        {share.expiresAt ? ` · until ${clock(share.expiresAt)}` : ''}
                      </span>
                    </span>
                    {share.status === 'paused' ? (
                      <StatusPill tone="warning">Paused</StatusPill>
                    ) : (
                      <StatusPill tone={freshness === 'live' || freshness === 'recent' ? 'live' : 'warning'}>{locationFreshnessLabel(freshness)}</StatusPill>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      <Section title="Sharing history" level={2} id="history">
        {history.data && history.data.length > 0 ? (
          <ul className="grid gap-2 text-[0.9375rem]">
            {history.data.map((item) => (
              <li key={item.shareId} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl p-3 ring-1 ring-inset ring-[var(--hairline)]">
                <span>
                  <span className="font-medium">{item.audienceLabel}</span>
                  <span className="text-[var(--text-muted)]"> · {new Date(item.startedAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</span>
                </span>
                <StatusPill>{item.status === 'stopped' ? 'Stopped' : item.status === 'expired' ? 'Expired' : 'Revoked'}</StatusPill>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[var(--text-muted)]">{history.isPending ? 'Loading…' : 'No past shares.'}</p>
        )}
      </Section>

      <Dialog
        open={confirmAll}
        onClose={() => setConfirmAll(false)}
        title="Stop all location sharing?"
        description="Everyone you’re sharing with will immediately stop seeing your location."
        dismissible={!stopAll.isPending}
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmAll(false)} disabled={stopAll.isPending}>
              Keep sharing
            </Button>
            <Button
              variant="danger"
              loading={stopAll.isPending}
              onClick={() =>
                stopAll.mutate(undefined, {
                  onSuccess: () => {
                    broadcastingIds().forEach(unmarkBroadcasting);
                    setConfirmAll(false);
                    toast.success('All location sharing stopped');
                  },
                })
              }
            >
              Stop all sharing
            </Button>
          </>
        }
      >
        {stopAll.error ? <ErrorState error={stopAll.error} context="location.share" compact /> : null}
      </Dialog>
    </div>
  );
}

export function LocationSharingScreen({ initialTripId }: { initialTripId: string | null }) {
  return (
    <PageShell width="default">
      <PageHeader eyebrow="Safety" title="Location sharing" description="Share your live location with people you choose, for as long as you choose." />
      <RequireAuth description="Location sharing is private to your account and the people you choose.">
        <SharingManager initialTripId={initialTripId} />
      </RequireAuth>
    </PageShell>
  );
}
