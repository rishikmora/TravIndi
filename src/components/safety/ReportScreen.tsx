'use client';

import { useEffect, useRef, useState } from 'react';
import { useNow } from '@/hooks/useNow';
import { RequireAuth } from '@/components/auth/RequireAuth';
import { PageHeader, PageShell } from '@/components/app/PageShell';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Checkbox, Field, Select, TextArea, TextInput } from '@/components/ui/Field';
import { CheckIcon, LocateIcon } from '@/components/ui/icons';
import { ErrorState, InlineNotice } from '@/components/ui/States';
import { StatusPill } from '@/components/ui/StatusPill';
import { useTranslation } from '@/i18n/react';
import { getTranslator } from '@/i18n/runtime';
import { isApiError } from '@/lib/api/errors';
import { useAuth } from '@/lib/auth/provider';
import { geolocationMessage, getCurrentPosition, type Position } from '@/lib/location/geolocation';
import { isBrowserOnline } from '@/lib/offline/connectivity';
import { enqueue, onOutboxResult } from '@/lib/offline/outbox';
import { useReportIncident } from '@/lib/query/hooks/safety';
import { useTrips } from '@/lib/query/hooks/trips';
import { announce } from '@/lib/ui/toast';
import type { IncidentCategory } from '@/types/api';
import type { Incident, IncidentReportInput } from '@/types/domain';
import { cn } from '@/utils/cn';
import { EmergencyNumbers } from './EmergencyNumbers';
import { INCIDENT_CATEGORY } from './vocabulary';

const localDateTime = (date: Date) => {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

type Outcome = { kind: 'sent'; incident: Incident } | { kind: 'saved'; id: string };

function ReportForm() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const trips = useTrips();
  const report = useReportIncident();
  const [category, setCategory] = useState<IncidentCategory | null>(null);
  const [description, setDescription] = useState('');
  const [occurredAt, setOccurredAt] = useState('');
  const [locationLabel, setLocationLabel] = useState('');
  const [position, setPosition] = useState<Position | null>(null);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [anonymous, setAnonymous] = useState(false);
  const [tripId, setTripId] = useState('');
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const clientReportId = useRef(crypto.randomUUID());
  const now = useNow();

  // "When" defaults to now once the clock is available (it isn't during server render).
  const [whenDefaulted, setWhenDefaulted] = useState(false);
  if (!whenDefaulted && now) {
    setWhenDefaulted(true);
    setOccurredAt(localDateTime(new Date(now)));
  }

  // Link the report to the active trip unless another is chosen.
  const activeTrip = !tripId ? trips.data?.find((trip) => trip.status === 'active') : undefined;
  if (activeTrip) setTripId(activeTrip.tripId);

  useEffect(
    () =>
      onOutboxResult((result) => {
        if (result.item.kind !== 'safety.report' || outcome?.kind !== 'saved' || result.item.id !== outcome.id) return;
        if (result.status === 'sent') {
          setOutcome({ kind: 'sent', incident: result.response as Incident });
          announce(getTranslator()('report.announceSent'));
        }
      }),
    [outcome],
  );

  const fieldErrors = isApiError(report.error) ? report.error.fieldErrors : {};

  const submit = async () => {
    if (!category || !user) return;
    const input: IncidentReportInput = {
      clientReportId: clientReportId.current,
      category,
      description: description.trim(),
      coordinates: position ? { lat: position.lat, lng: position.lng } : null,
      locationLabel: locationLabel.trim() || null,
      occurredAt: new Date(occurredAt).toISOString(),
      anonymous,
      tripId: tripId || null,
    };
    if (!isBrowserOnline()) {
      await enqueue('safety.report', input.clientReportId, input, user.userId);
      setOutcome({ kind: 'saved', id: input.clientReportId });
      announce(t('report.announceSaved'), 'assertive');
      return;
    }
    report.mutate(input, {
      onSuccess: (incident) => {
        setOutcome({ kind: 'sent', incident });
        announce(getTranslator()('report.announceReceived'), 'assertive');
      },
    });
  };

  const reset = () => {
    clientReportId.current = crypto.randomUUID();
    setCategory(null);
    setDescription('');
    setPosition(null);
    setLocationLabel('');
    setOccurredAt(localDateTime(new Date()));
    setOutcome(null);
    report.reset();
  };

  if (outcome) {
    return (
      <div role="status" className="surface-card grid gap-4 p-6">
        <div className="flex flex-wrap gap-2">
          {outcome.kind === 'sent' ? (
            <>
              <StatusPill tone="success">{t('report.confirmed')}</StatusPill>
              <StatusPill>{t('report.privateUntilVerified')}</StatusPill>
            </>
          ) : (
            <>
              <StatusPill tone="warning">{t('report.saved')}</StatusPill>
              <StatusPill tone="warning">{t('report.pendingSync')}</StatusPill>
            </>
          )}
        </div>
        <div className="flex items-start gap-3">
          <CheckIcon size={24} className="mt-1 shrink-0 text-teal" />
          <div className="grid gap-1">
            <p className="text-[1.25rem] font-semibold">{outcome.kind === 'sent' ? t('report.received') : t('report.savedNotSent')}</p>
            <p className="text-[var(--text-muted)]">{outcome.kind === 'sent' ? t('report.receivedDetail') : t('report.savedDetail')}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <ButtonLink href="/safety" variant="navy">
            {t('report.backToSafety')}
          </ButtonLink>
          <Button variant="secondary" onClick={reset}>
            {t('report.reportAnother')}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form
      className="grid gap-6"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <fieldset className="grid gap-3">
        <legend className="mb-1 text-[1.0625rem] font-semibold">{t('report.whatHappened')}</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {(Object.keys(INCIDENT_CATEGORY) as IncidentCategory[]).map((value) => (
            <label
              key={value}
              className={cn('flex cursor-pointer items-start gap-3 rounded-2xl p-3.5 ring-1 ring-inset transition-colors', category === value ? 'bg-[var(--tone-neutral-bg)] ring-2 ring-navy' : 'bg-[var(--surface-raised)] ring-[var(--hairline-strong)]')}
            >
              <input type="radio" name="category" value={value} checked={category === value} onChange={() => setCategory(value)} className="mt-1 size-4 accent-[var(--color-navy)]" />
              <span className="grid gap-0.5">
                <span className="font-medium">{INCIDENT_CATEGORY[value].label}</span>
                <span className="text-[0.8125rem] text-[var(--text-muted)]">{INCIDENT_CATEGORY[value].description}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <Field label={t('report.describe')} hint={t('report.describeHint')} error={fieldErrors.description}>
        {(control) => <TextArea {...control} maxLength={4000} value={description} onChange={(e) => setDescription(e.target.value)} />}
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('report.when')} error={fieldErrors.occurredAt}>
          {(control) => <TextInput {...control} type="datetime-local" max={now ? localDateTime(new Date(now)) : undefined} value={occurredAt} onChange={(e) => setOccurredAt(e.target.value)} />}
        </Field>
        <Field label={t('report.trip')} optional>
          {(control) => (
            <Select {...control} value={tripId} onChange={(e) => setTripId(e.target.value)}>
              <option value="">{t('report.noTrip')}</option>
              {(trips.data ?? []).map((trip) => (
                <option key={trip.tripId} value={trip.tripId}>
                  {trip.title}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>

      <div className="grid gap-3">
        <Field label={t('report.where')} optional hint={t('report.whereHint')}>
          {(control) => <TextInput {...control} maxLength={120} value={locationLabel} onChange={(e) => setLocationLabel(e.target.value)} />}
        </Field>
        {position ? (
          <p className="flex flex-wrap items-center gap-2 text-[0.9375rem]">
            <StatusPill tone="info">{t('report.locationAdded')}</StatusPill>
            <span className="text-[var(--text-muted)]">{position.accuracy ? t('report.accuracy', { meters: position.accuracy }) : t('report.accuracyUnknown')}</span>
            <button type="button" onClick={() => setPosition(null)} className="font-semibold text-[var(--link)] underline underline-offset-2">
              {t('common.actions.remove')}
            </button>
          </p>
        ) : (
          <Button
            variant="subtle"
            size="sm"
            className="justify-self-start"
            loading={locating}
            onClick={async () => {
              setLocating(true);
              setLocationError(null);
              try {
                setPosition(await getCurrentPosition({ highAccuracy: true }));
              } catch (error) {
                setLocationError(geolocationMessage(error));
              } finally {
                setLocating(false);
              }
            }}
          >
            <LocateIcon size={16} />
            {t('report.addLocation')}
          </Button>
        )}
        {locationError && <InlineNotice tone="warning">{t('report.locationFallback', { message: locationError })}</InlineNotice>}
      </div>

      <Checkbox label={t('report.anonymous')} description={t('report.anonymousDetail')} checked={anonymous} onChange={(e) => setAnonymous(e.target.checked)} />

      {report.error && !Object.keys(fieldErrors).length ? <ErrorState error={report.error} context="incident.report" compact politeness="assertive" /> : null}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="navy" size="lg" loading={report.isPending} disabled={!category || description.trim().length < 10 || !occurredAt}>
          {t('report.send')}
        </Button>
        <span className="text-[0.875rem] text-[var(--text-muted)]">{t('report.privateNote')}</span>
      </div>
    </form>
  );
}

export function ReportScreen() {
  const { t } = useTranslation();
  return (
    <PageShell width="narrow">
      <PageHeader eyebrow={t('report.eyebrow')} title={t('report.title')} description={t('report.description')} />
      <div className="grid gap-8">
        <EmergencyNumbers compact />
        <RequireAuth description={t('report.signIn')}>
          <ReportForm />
        </RequireAuth>
      </div>
    </PageShell>
  );
}
