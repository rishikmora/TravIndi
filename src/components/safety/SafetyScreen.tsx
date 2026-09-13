'use client';

import Link from 'next/link';
import { useState } from 'react';
import { PageHeader, PageShell, Section } from '@/components/app/PageShell';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { FreshnessBadge } from '@/components/ui/FreshnessBadge';
import { BadgeCheckIcon, ChevronRightIcon, FlagIcon, LocateIcon, PhoneIcon, RouteIcon, ShieldCheckIcon } from '@/components/ui/icons';
import { LoadingBlock, Skeleton, SkeletonText } from '@/components/ui/Skeleton';
import { ErrorState, InlineNotice } from '@/components/ui/States';
import { StatusPill } from '@/components/ui/StatusPill';
import { useNow } from '@/hooks/useNow';
import { useAuth } from '@/lib/auth/provider';
import { formatDistance } from '@/lib/format/dates';
import { relativeTime } from '@/lib/format/freshness';
import { getCurrentPosition, GeolocationError } from '@/lib/location/geolocation';
import { useMyShares, useStopAllShares } from '@/lib/query/hooks/location';
import { useCheckIns, useCompleteCheckIn, useIncidents, useSafetyContext, useScheduleCheckIn, useTrustedContacts } from '@/lib/query/hooks/safety';
import { useTrips } from '@/lib/query/hooks/trips';
import { announce, toast } from '@/lib/ui/toast';
import type { GeoPoint } from '@/types/domain';
import { EmergencyNumbers } from './EmergencyNumbers';
import { ADVISORY_SEVERITY, HELP_KIND, INCIDENT_CATEGORY, INCIDENT_SEVERITY, INCIDENT_STATUS, SAFETY_LEVEL } from './vocabulary';

const clock = (iso: string) => new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });

export function SafetyContextPanel({ tripId, tripName }: { tripId: string | null; tripName: string | null }) {
  const now = useNow();
  const [point, setPoint] = useState<GeoPoint | null>(null);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const context = useSafetyContext({ point, tripId: point ? null : tripId });

  const locate = async () => {
    setLocating(true);
    setLocationError(null);
    try {
      const position = await getCurrentPosition();
      setPoint({ lat: position.lat, lng: position.lng });
      announce('Showing safety information for your current location.');
    } catch (error) {
      setLocationError(error instanceof GeolocationError ? error.message : 'Your location isn’t available.');
    } finally {
      setLocating(false);
    }
  };

  return (
    <section aria-labelledby="context-title" className="surface-card grid gap-5 p-5 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1">
          <p className="label text-[var(--text-subtle)]">{point ? 'Your current location' : tripName ? `Your trip · ${tripName}` : 'Around you'}</p>
          <h2 id="context-title" className="text-[1.5rem] font-semibold tracking-[-0.02em]">
            {context.data?.locationLabel ?? 'Safety around you'}
          </h2>
        </div>
        {context.data && <StatusPill tone={SAFETY_LEVEL[context.data.level].tone}>{SAFETY_LEVEL[context.data.level].label}</StatusPill>}
      </div>

      {context.isPending ? (
        <LoadingBlock label="Loading safety information">
          <SkeletonText lines={3} />
        </LoadingBlock>
      ) : context.isError ? (
        <ErrorState error={context.error} context="safety.load" compact onRetry={() => void context.refetch()} />
      ) : (
        <>
          <div className="grid gap-2">
            <p className="text-[1.0625rem] leading-relaxed">{context.data.summary}</p>
            <FreshnessBadge freshness={context.data.freshness} />
          </div>

          {context.data.advisories.length > 0 && (
            <div className="grid gap-2">
              <h3 className="label text-[var(--text-subtle)]">Advisories</h3>
              <ul className="grid gap-2">
                {context.data.advisories.map((advisory) => (
                  <li key={advisory.advisoryId} className="grid gap-1 rounded-2xl bg-[var(--tone-warning-bg)] p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusPill tone={ADVISORY_SEVERITY[advisory.severity].tone}>{ADVISORY_SEVERITY[advisory.severity].label}</StatusPill>
                      <span className="font-semibold">{advisory.title}</span>
                    </div>
                    <p className="text-[0.9375rem]">{advisory.body}</p>
                    <p className="text-[0.8125rem] text-[var(--text-muted)]">
                      {advisory.sourceLabel}
                      {now > 0 && ` · issued ${relativeTime(advisory.issuedAt, now)}`}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="grid gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="label text-[var(--text-subtle)]">Help nearby</h3>
              <Button variant="subtle" size="sm" onClick={() => void locate()} loading={locating}>
                <LocateIcon size={16} />
                {point ? 'Update my location' : 'Use my location'}
              </Button>
            </div>
            {locationError && <InlineNotice tone="warning">{locationError} Showing information for your trip instead.</InlineNotice>}
            {context.data.nearbyHelp.length === 0 ? (
              <p className="text-[0.9375rem] text-[var(--text-muted)]">
                We don’t have help points for this area. Emergency numbers work anywhere in India.
              </p>
            ) : (
              <ul className="divide-y divide-[var(--hairline)] rounded-2xl ring-1 ring-inset ring-[var(--hairline)]">
                {context.data.nearbyHelp.map((help) => (
                  <li key={help.helpPointId} className="flex items-center justify-between gap-3 p-3.5">
                    <div className="grid min-w-0">
                      <span className="text-[0.8125rem] font-medium text-[var(--text-subtle)]">{HELP_KIND[help.kind]}</span>
                      <span className="truncate font-medium">{help.name}</span>
                      <span className="text-[0.8125rem] text-[var(--text-muted)]">
                        {help.distanceMeters !== null ? `${formatDistance(help.distanceMeters)} away (straight line)` : 'Share your location to see distance'}
                      </span>
                    </div>
                    {help.phone && (
                      <a href={`tel:${help.phone}`} className="tap-target inline-flex items-center gap-1.5 rounded-full px-3 font-semibold text-[var(--link)] ring-1 ring-inset ring-[var(--hairline-strong)]">
                        <PhoneIcon size={16} /> Call
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </section>
  );
}

export function IncidentsPanel({ tripId }: { tripId: string | null }) {
  const now = useNow();
  const incidents = useIncidents({ tripId });
  return (
    <Section title="Recent reports" description="Verified reports near your trip. New reports stay private until they’re checked." level={2} id="incidents">
      {incidents.isPending ? (
        <LoadingBlock label="Loading reports">
          <Skeleton className="h-20 w-full rounded-2xl" />
        </LoadingBlock>
      ) : incidents.isError ? (
        <ErrorState error={incidents.error} context="safety.load" compact onRetry={() => void incidents.refetch()} />
      ) : incidents.data.length === 0 ? (
        <p className="text-[var(--text-muted)]">No recent verified reports for this area.</p>
      ) : (
        <ul className="surface-card divide-y divide-[var(--hairline)]">
          {incidents.data.map((incident) => (
            <li key={incident.incidentId} className="grid gap-1 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">{INCIDENT_CATEGORY[incident.category].label}</span>
                <StatusPill tone={INCIDENT_SEVERITY[incident.severity].tone}>{INCIDENT_SEVERITY[incident.severity].label}</StatusPill>
                <StatusPill tone={INCIDENT_STATUS[incident.status].tone}>{INCIDENT_STATUS[incident.status].label}</StatusPill>
              </div>
              <p className="text-[0.9375rem]">{incident.summary}</p>
              <p className="text-[0.8125rem] text-[var(--text-muted)]">
                {[incident.locationLabel, now > 0 ? relativeTime(incident.reportedAt, now) : null].filter(Boolean).join(' · ')}
              </p>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

function SharingSummary() {
  const shares = useMyShares();
  const stopAll = useStopAllShares();
  const [confirming, setConfirming] = useState(false);
  const count = shares.data?.length ?? 0;

  return (
    <section aria-labelledby="sharing-title" className="surface-card grid gap-3 p-5">
      <div className="flex items-center justify-between gap-2">
        <h2 id="sharing-title" className="font-semibold">
          Location sharing
        </h2>
        {count > 0 && <StatusPill tone="live">{count} active</StatusPill>}
      </div>
      {shares.isPending ? (
        <SkeletonText lines={2} />
      ) : shares.isError ? (
        <ErrorState error={shares.error} compact onRetry={() => void shares.refetch()} />
      ) : count === 0 ? (
        <p className="text-[0.9375rem] text-[var(--text-muted)]">You’re not sharing your location with anyone.</p>
      ) : (
        <ul className="grid gap-1.5 text-[0.9375rem]">
          {shares.data.map((share) => (
            <li key={share.shareId}>
              <span className="font-medium">{share.audienceLabel}</span>
              <span className="text-[var(--text-muted)]">
                {share.status === 'paused' ? ' · paused' : share.expiresAt ? ` · until ${clock(share.expiresAt)}` : ''}
              </span>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap gap-2">
        <ButtonLink href="/location-sharing" variant="secondary" size="sm">
          {count > 0 ? 'Manage sharing' : 'Share my location'}
        </ButtonLink>
        {count > 0 && (
          <Button variant="danger" size="sm" onClick={() => setConfirming(true)}>
            Stop all sharing
          </Button>
        )}
      </div>
      <Dialog
        open={confirming}
        onClose={() => setConfirming(false)}
        title="Stop sharing your location?"
        description="Everyone you’re sharing with will immediately stop seeing your location."
        dismissible={!stopAll.isPending}
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirming(false)} disabled={stopAll.isPending}>
              Keep sharing
            </Button>
            <Button
              variant="danger"
              loading={stopAll.isPending}
              onClick={() =>
                stopAll.mutate(undefined, {
                  onSuccess: () => {
                    setConfirming(false);
                    toast.success('Location sharing stopped', 'No one can see your location now.');
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
    </section>
  );
}

function ContactsSummary() {
  const contacts = useTrustedContacts();
  return (
    <section aria-labelledby="contacts-title" className="surface-card grid gap-3 p-5">
      <h2 id="contacts-title" className="font-semibold">
        Trusted contacts
      </h2>
      {contacts.isPending ? (
        <SkeletonText lines={2} />
      ) : contacts.isError ? (
        <ErrorState error={contacts.error} compact onRetry={() => void contacts.refetch()} />
      ) : contacts.data.length === 0 ? (
        <p className="text-[0.9375rem] text-[var(--text-muted)]">Add someone who should hear from you in an emergency.</p>
      ) : (
        <ul className="grid gap-1.5 text-[0.9375rem]">
          {contacts.data.map((contact) => (
            <li key={contact.contactId} className="flex items-center justify-between gap-2">
              <span>
                <span className="font-medium">{contact.name}</span>
                <span className="text-[var(--text-muted)]"> · {contact.relationship}</span>
              </span>
              <StatusPill tone={contact.verified ? 'success' : 'neutral'}>{contact.verified ? 'Confirmed' : 'Not confirmed'}</StatusPill>
            </li>
          ))}
        </ul>
      )}
      <ButtonLink href="/trusted-contacts" variant="secondary" size="sm" className="justify-self-start">
        {contacts.data?.length ? 'Manage contacts' : 'Add a contact'}
      </ButtonLink>
    </section>
  );
}

function CheckInsPanel({ tripId }: { tripId: string | null }) {
  const now = useNow();
  const checkIns = useCheckIns(null);
  const complete = useCompleteCheckIn();
  const schedule = useScheduleCheckIn();
  const upcoming = (checkIns.data ?? []).filter((c) => c.status === 'scheduled' || c.status === 'missed');

  const scheduleIn = (hours: number) => {
    schedule.mutate(
      { tripId, dueAt: new Date(Date.now() + hours * 3_600_000).toISOString(), note: null },
      { onSuccess: (checkIn) => toast.success('Check-in scheduled', `We’ll ask if you’re OK at ${clock(checkIn.dueAt)}.`) },
    );
  };

  return (
    <section aria-labelledby="checkins-title" className="surface-card grid gap-3 p-5">
      <h2 id="checkins-title" className="font-semibold">
        Check-ins
      </h2>
      <p className="text-[0.875rem] text-[var(--text-muted)]">A reminder to confirm you’re OK. TravIndi records whether you checked in on time.</p>
      {checkIns.isError && <ErrorState error={checkIns.error} compact onRetry={() => void checkIns.refetch()} />}
      {upcoming.length > 0 && (
        <ul className="grid gap-2">
          {upcoming.map((checkIn) => (
            <li key={checkIn.checkInId} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl p-3 ring-1 ring-inset ring-[var(--hairline)]">
              <div className="grid">
                <span className="font-medium">{checkIn.note ?? 'Check-in'}</span>
                <span className="text-[0.8125rem] text-[var(--text-muted)]">
                  {checkIn.status === 'missed' ? 'Missed · was due ' : 'Due '}
                  {clock(checkIn.dueAt)}
                  {now > 0 && checkIn.status === 'scheduled' ? ` (${relativeTime(checkIn.dueAt, now)})` : ''}
                </span>
              </div>
              <Button variant={checkIn.status === 'missed' ? 'accent' : 'secondary'} size="sm" loading={complete.isPending && complete.variables === checkIn.checkInId} onClick={() => complete.mutate(checkIn.checkInId, { onSuccess: () => announce('Checked in. Thanks for letting us know you’re OK.') })}>
                I’m OK
              </Button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap gap-2">
        <Button variant="subtle" size="sm" onClick={() => scheduleIn(1)} disabled={schedule.isPending}>
          Check in 1 hour
        </Button>
        <Button variant="subtle" size="sm" onClick={() => scheduleIn(3)} disabled={schedule.isPending}>
          In 3 hours
        </Button>
      </div>
      {schedule.error ? <ErrorState error={schedule.error} compact /> : null}
    </section>
  );
}

const TOOLS = [
  { href: '/report', label: 'Report an incident', detail: 'Theft, harassment, scams, unsafe places', icon: FlagIcon },
  { href: '/verify', label: 'Verify a guide or business', detail: 'Check their evidence before you pay', icon: BadgeCheckIcon },
  { href: '/routes', label: 'Compare routes', detail: 'See trade-offs, not just the fastest way', icon: RouteIcon },
  { href: '/trust/fraud', label: 'Report fraud', detail: 'Fake listings, impersonation, payment scams', icon: ShieldCheckIcon },
];

export function SafetyScreen() {
  const { status } = useAuth();
  const signedIn = status === 'authenticated';
  const trips = useTrips(signedIn);
  const activeTrip = trips.data?.find((t) => t.status === 'active') ?? null;

  return (
    <PageShell width="wide">
      <PageHeader
        eyebrow="Safety"
        title="Safety centre"
        description="What’s happening around you, help nearby, and the people who can reach you."
        actions={
          <ButtonLink href="/sos" variant="danger" size="lg">
            SOS
          </ButtonLink>
        }
      />
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="grid min-w-0 content-start gap-8">
          <SafetyContextPanel tripId={activeTrip?.tripId ?? null} tripName={activeTrip?.destination?.name ?? null} />
          <IncidentsPanel tripId={activeTrip?.tripId ?? null} />
        </div>
        <div className="grid content-start gap-4">
          <EmergencyNumbers compact />
          {signedIn ? (
            <>
              <SharingSummary />
              <ContactsSummary />
              <CheckInsPanel tripId={activeTrip?.tripId ?? null} />
            </>
          ) : (
            <InlineNotice tone="info" title="Sign in for personal safety tools" action={<ButtonLink href="/login?next=%2Fsafety" variant="navy" size="sm">Sign in</ButtonLink>}>
              Location sharing, trusted contacts and check-ins are tied to your account.
            </InlineNotice>
          )}
          <nav aria-label="Safety tools" className="surface-card divide-y divide-[var(--hairline)] overflow-hidden">
            {TOOLS.map((tool) => (
              <Link key={tool.href} href={tool.href} className="flex items-center gap-3 p-4 transition-colors hover:bg-[var(--surface-sunken)]">
                <tool.icon size={20} className="shrink-0 text-[var(--tone-accent-fg)]" />
                <span className="grid flex-1">
                  <span className="font-medium">{tool.label}</span>
                  <span className="text-[0.8125rem] text-[var(--text-muted)]">{tool.detail}</span>
                </span>
                <ChevronRightIcon size={18} className="text-[var(--text-subtle)]" />
              </Link>
            ))}
          </nav>
        </div>
      </div>
    </PageShell>
  );
}
