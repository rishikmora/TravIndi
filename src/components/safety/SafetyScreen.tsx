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
import { useTranslation } from '@/i18n/react';
import { getTranslator } from '@/i18n/runtime';
import { useAuth } from '@/lib/auth/provider';
import { formatClock, formatDistance } from '@/lib/format/dates';
import { relativeTime } from '@/lib/format/freshness';
import { geolocationMessage, getCurrentPosition } from '@/lib/location/geolocation';
import { useMyShares, useStopAllShares } from '@/lib/query/hooks/location';
import { useCheckIns, useCompleteCheckIn, useIncidents, useSafetyContext, useScheduleCheckIn, useTrustedContacts } from '@/lib/query/hooks/safety';
import { useTrips } from '@/lib/query/hooks/trips';
import { announce, toast } from '@/lib/ui/toast';
import type { GeoPoint } from '@/types/domain';
import { EmergencyNumbers } from './EmergencyNumbers';
import { ADVISORY_SEVERITY, HELP_KIND, INCIDENT_CATEGORY, INCIDENT_SEVERITY, INCIDENT_STATUS, SAFETY_LEVEL } from './vocabulary';

export function SafetyContextPanel({ tripId, tripName }: { tripId: string | null; tripName: string | null }) {
  const now = useNow();
  const { t } = useTranslation();
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
      announce(getTranslator()('safety.context.showingCurrent'));
    } catch (error) {
      setLocationError(geolocationMessage(error));
    } finally {
      setLocating(false);
    }
  };

  return (
    <section aria-labelledby="context-title" className="surface-card grid gap-5 p-5 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1">
          <p className="label text-[var(--text-subtle)]">
            {point ? t('safety.context.currentLocation') : tripName ? t('safety.context.yourTrip', { name: tripName }) : t('safety.context.aroundYou')}
          </p>
          <h2 id="context-title" className="text-[1.5rem] font-semibold tracking-[-0.02em]">
            {context.data?.locationLabel ?? t('safety.context.title')}
          </h2>
        </div>
        {context.data && <StatusPill tone={SAFETY_LEVEL[context.data.level].tone}>{SAFETY_LEVEL[context.data.level].label}</StatusPill>}
      </div>

      {context.isPending ? (
        <LoadingBlock label={t('safety.context.loading')}>
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
              <h3 className="label text-[var(--text-subtle)]">{t('safety.context.advisories')}</h3>
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
                      {now > 0 && ` · ${t('safety.context.issued', { when: relativeTime(advisory.issuedAt, now) })}`}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="grid gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="label text-[var(--text-subtle)]">{t('safety.context.helpNearby')}</h3>
              <Button variant="subtle" size="sm" onClick={() => void locate()} loading={locating}>
                <LocateIcon size={16} />
                {point ? t('safety.context.updateLocation') : t('safety.context.useLocation')}
              </Button>
            </div>
            {locationError && <InlineNotice tone="warning">{t('safety.context.locationFallback', { message: locationError })}</InlineNotice>}
            {context.data.nearbyHelp.length === 0 ? (
              <p className="text-[0.9375rem] text-[var(--text-muted)]">{t('safety.context.noHelpPoints')}</p>
            ) : (
              <ul className="divide-y divide-[var(--hairline)] rounded-2xl ring-1 ring-inset ring-[var(--hairline)]">
                {context.data.nearbyHelp.map((help) => (
                  <li key={help.helpPointId} className="flex items-center justify-between gap-3 p-3.5">
                    <div className="grid min-w-0">
                      <span className="text-[0.8125rem] font-medium text-[var(--text-subtle)]">{HELP_KIND[help.kind]}</span>
                      <span className="truncate font-medium">{help.name}</span>
                      <span className="text-[0.8125rem] text-[var(--text-muted)]">
                        {help.distanceMeters !== null
                          ? t('safety.context.distanceAway', { distance: formatDistance(help.distanceMeters) })
                          : t('safety.context.shareForDistance')}
                      </span>
                    </div>
                    {help.phone && (
                      <a href={`tel:${help.phone}`} className="tap-target inline-flex items-center gap-1.5 rounded-full px-3 font-semibold text-[var(--link)] ring-1 ring-inset ring-[var(--hairline-strong)]">
                        <PhoneIcon size={16} /> {t('safety.context.call')}
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
  const { t } = useTranslation();
  const incidents = useIncidents({ tripId });
  return (
    <Section title={t('safety.incidents.title')} description={t('safety.incidents.description')} level={2} id="incidents">
      {incidents.isPending ? (
        <LoadingBlock label={t('safety.incidents.loading')}>
          <Skeleton className="h-20 w-full rounded-2xl" />
        </LoadingBlock>
      ) : incidents.isError ? (
        <ErrorState error={incidents.error} context="safety.load" compact onRetry={() => void incidents.refetch()} />
      ) : incidents.data.length === 0 ? (
        <p className="text-[var(--text-muted)]">{t('safety.incidents.empty')}</p>
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
  const { t } = useTranslation();
  const shares = useMyShares();
  const stopAll = useStopAllShares();
  const [confirming, setConfirming] = useState(false);
  const count = shares.data?.length ?? 0;

  return (
    <section aria-labelledby="sharing-title" className="surface-card grid gap-3 p-5">
      <div className="flex items-center justify-between gap-2">
        <h2 id="sharing-title" className="font-semibold">
          {t('safety.sharing.title')}
        </h2>
        {count > 0 && <StatusPill tone="live">{t('safety.sharing.active', { count })}</StatusPill>}
      </div>
      {shares.isPending ? (
        <SkeletonText lines={2} />
      ) : shares.isError ? (
        <ErrorState error={shares.error} compact onRetry={() => void shares.refetch()} />
      ) : count === 0 ? (
        <p className="text-[0.9375rem] text-[var(--text-muted)]">{t('safety.sharing.notSharing')}</p>
      ) : (
        <ul className="grid gap-1.5 text-[0.9375rem]">
          {shares.data.map((share) => (
            <li key={share.shareId}>
              <span className="font-medium">{share.audienceLabel}</span>
              <span className="text-[var(--text-muted)]">
                {share.status === 'paused'
                  ? ` · ${t('safety.sharing.paused')}`
                  : share.expiresAt
                    ? ` · ${t('safety.sharing.until', { time: formatClock(share.expiresAt) })}`
                    : ''}
              </span>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap gap-2">
        <ButtonLink href="/location-sharing" variant="secondary" size="sm">
          {count > 0 ? t('safety.sharing.manage') : t('safety.sharing.share')}
        </ButtonLink>
        {count > 0 && (
          <Button variant="danger" size="sm" onClick={() => setConfirming(true)}>
            {t('safety.sharing.stopAll')}
          </Button>
        )}
      </div>
      <Dialog
        open={confirming}
        onClose={() => setConfirming(false)}
        title={t('safety.sharing.confirmTitle')}
        description={t('safety.sharing.confirmDescription')}
        dismissible={!stopAll.isPending}
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirming(false)} disabled={stopAll.isPending}>
              {t('safety.sharing.keep')}
            </Button>
            <Button
              variant="danger"
              loading={stopAll.isPending}
              onClick={() =>
                stopAll.mutate(undefined, {
                  onSuccess: () => {
                    setConfirming(false);
                    const current = getTranslator();
                    toast.success(current('safety.sharing.stopped'), current('safety.sharing.stoppedDetail'));
                  },
                })
              }
            >
              {t('safety.sharing.stopAll')}
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
  const { t } = useTranslation();
  const contacts = useTrustedContacts();
  return (
    <section aria-labelledby="contacts-title" className="surface-card grid gap-3 p-5">
      <h2 id="contacts-title" className="font-semibold">
        {t('safety.contactsSummary.title')}
      </h2>
      {contacts.isPending ? (
        <SkeletonText lines={2} />
      ) : contacts.isError ? (
        <ErrorState error={contacts.error} compact onRetry={() => void contacts.refetch()} />
      ) : contacts.data.length === 0 ? (
        <p className="text-[0.9375rem] text-[var(--text-muted)]">{t('safety.contactsSummary.empty')}</p>
      ) : (
        <ul className="grid gap-1.5 text-[0.9375rem]">
          {contacts.data.map((contact) => (
            <li key={contact.contactId} className="flex items-center justify-between gap-2">
              <span>
                <span className="font-medium">{contact.name}</span>
                <span className="text-[var(--text-muted)]"> · {contact.relationship}</span>
              </span>
              <StatusPill tone={contact.verified ? 'success' : 'neutral'}>
                {contact.verified ? t('safety.contactsSummary.confirmed') : t('safety.contactsSummary.notConfirmed')}
              </StatusPill>
            </li>
          ))}
        </ul>
      )}
      <ButtonLink href="/trusted-contacts" variant="secondary" size="sm" className="justify-self-start">
        {contacts.data?.length ? t('safety.contactsSummary.manage') : t('safety.contactsSummary.add')}
      </ButtonLink>
    </section>
  );
}

function CheckInsPanel({ tripId }: { tripId: string | null }) {
  const now = useNow();
  const { t } = useTranslation();
  const checkIns = useCheckIns(null);
  const complete = useCompleteCheckIn();
  const schedule = useScheduleCheckIn();
  const upcoming = (checkIns.data ?? []).filter((c) => c.status === 'scheduled' || c.status === 'missed');

  const scheduleIn = (hours: number) => {
    schedule.mutate(
      { tripId, dueAt: new Date(Date.now() + hours * 3_600_000).toISOString(), note: null },
      {
        onSuccess: (checkIn) => {
          const current = getTranslator();
          toast.success(current('safety.checkIns.scheduled'), current('safety.checkIns.scheduledDetail', { time: formatClock(checkIn.dueAt) }));
        },
      },
    );
  };

  return (
    <section aria-labelledby="checkins-title" className="surface-card grid gap-3 p-5">
      <h2 id="checkins-title" className="font-semibold">
        {t('safety.checkIns.title')}
      </h2>
      <p className="text-[0.875rem] text-[var(--text-muted)]">{t('safety.checkIns.description')}</p>
      {checkIns.isError && <ErrorState error={checkIns.error} compact onRetry={() => void checkIns.refetch()} />}
      {upcoming.length > 0 && (
        <ul className="grid gap-2">
          {upcoming.map((checkIn) => (
            <li key={checkIn.checkInId} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl p-3 ring-1 ring-inset ring-[var(--hairline)]">
              <div className="grid">
                <span className="font-medium">{checkIn.note ?? t('safety.checkIns.fallbackName')}</span>
                <span className="text-[0.8125rem] text-[var(--text-muted)]">
                  {checkIn.status === 'missed'
                    ? t('safety.checkIns.missedDue', { time: formatClock(checkIn.dueAt) })
                    : t('safety.checkIns.due', { time: formatClock(checkIn.dueAt) })}
                  {now > 0 && checkIn.status === 'scheduled' ? ` ${t('safety.checkIns.relative', { when: relativeTime(checkIn.dueAt, now) })}` : ''}
                </span>
              </div>
              <Button
                variant={checkIn.status === 'missed' ? 'accent' : 'secondary'}
                size="sm"
                loading={complete.isPending && complete.variables === checkIn.checkInId}
                onClick={() => complete.mutate(checkIn.checkInId, { onSuccess: () => announce(getTranslator()('safety.checkIns.checkedIn')) })}
              >
                {t('safety.checkIns.imOk')}
              </Button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap gap-2">
        <Button variant="subtle" size="sm" onClick={() => scheduleIn(1)} disabled={schedule.isPending}>
          {t('safety.checkIns.inOneHour')}
        </Button>
        <Button variant="subtle" size="sm" onClick={() => scheduleIn(3)} disabled={schedule.isPending}>
          {t('safety.checkIns.inThreeHours')}
        </Button>
      </div>
      {schedule.error ? <ErrorState error={schedule.error} compact /> : null}
    </section>
  );
}

const TOOLS = [
  { href: '/report', key: 'report', icon: FlagIcon },
  { href: '/verify', key: 'verify', icon: BadgeCheckIcon },
  { href: '/routes', key: 'routes', icon: RouteIcon },
  { href: '/trust/fraud', key: 'fraud', icon: ShieldCheckIcon },
] as const;

export function SafetyScreen() {
  const { status } = useAuth();
  const { t } = useTranslation();
  const signedIn = status === 'authenticated';
  const trips = useTrips(signedIn);
  const activeTrip = trips.data?.find((trip) => trip.status === 'active') ?? null;

  return (
    <PageShell width="wide">
      <PageHeader
        eyebrow={t('safety.centre.eyebrow')}
        title={t('safety.centre.title')}
        description={t('safety.centre.description')}
        actions={
          <ButtonLink href="/sos" variant="danger" size="lg">
            {t('sos.button')}
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
            <InlineNotice
              tone="info"
              title={t('safety.signInPrompt.title')}
              action={
                <ButtonLink href="/login?next=%2Fsafety" variant="navy" size="sm">
                  {t('common.actions.signIn')}
                </ButtonLink>
              }
            >
              {t('safety.signInPrompt.body')}
            </InlineNotice>
          )}
          <nav aria-label={t('safety.tools.label')} className="surface-card divide-y divide-[var(--hairline)] overflow-hidden">
            {TOOLS.map((tool) => (
              <Link key={tool.href} href={tool.href} className="flex items-center gap-3 p-4 transition-colors hover:bg-[var(--surface-sunken)]">
                <tool.icon size={20} className="shrink-0 text-[var(--tone-accent-fg)]" />
                <span className="grid flex-1">
                  <span className="font-medium">{t(`safety.tools.${tool.key}`)}</span>
                  <span className="text-[0.8125rem] text-[var(--text-muted)]">{t(`safety.tools.${tool.key}Detail`)}</span>
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
