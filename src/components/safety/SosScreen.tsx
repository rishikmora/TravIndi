'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import { RequireAuth } from '@/components/auth/RequireAuth';
import { PageShell } from '@/components/app/PageShell';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Field, TextArea } from '@/components/ui/Field';
import { CheckIcon, WifiOffIcon } from '@/components/ui/icons';
import { ErrorState, InlineNotice } from '@/components/ui/States';
import { StatusPill, type Tone } from '@/components/ui/StatusPill';
import { useTranslation } from '@/i18n/react';
import { getTranslator } from '@/i18n/runtime';
import type { Translator } from '@/i18n/translate';
import { api } from '@/lib/api';
import { isApiError } from '@/lib/api/errors';
import { useAuth } from '@/lib/auth/provider';
import { formatClock } from '@/lib/format/dates';
import { getCurrentPosition } from '@/lib/location/geolocation';
import { isBrowserOnline } from '@/lib/offline/connectivity';
import { enqueue, flushOutbox, onOutboxResult, pendingItems, removeFromOutbox } from '@/lib/offline/outbox';
import { useActiveSos, useCancelSos, useSosAlert, useTrustedContacts } from '@/lib/query/hooks/safety';
import { useTrips } from '@/lib/query/hooks/trips';
import { queryKeys } from '@/lib/query/keys';
import { sosMachine, type SosEvent, type SosState } from '@/lib/state/machine';
import { announce } from '@/lib/ui/toast';
import type { SosAlert, SosInput } from '@/types/domain';
import { cn } from '@/utils/cn';
import { EmergencyNumbers } from './EmergencyNumbers';

const CHANNEL_TONE: Record<SosAlert['notifications'][number]['status'], Tone> = {
  queued: 'info',
  delivered: 'success',
  failed: 'danger',
  not_supported: 'neutral',
};

function channelNote(t: Translator, channel: SosAlert['notifications'][number]) {
  if (channel.channel === 'authority') return t('sos.channelNote.authority');
  if (channel.channel === 'trusted_contact') {
    if (channel.status === 'not_supported') return t('sos.channelNote.contactNotSupported');
    if (channel.status === 'delivered') return t('sos.channelNote.contactDelivered');
    if (channel.status === 'failed') return t('sos.channelNote.contactFailed');
    return t('sos.channelNote.contactSending');
  }
  return channel.status === 'delivered' ? t('sos.channelNote.opsDelivered') : null;
}

const STEPS = ['received', 'acknowledged', 'responding', 'resolved'] as const satisfies ReadonlyArray<SosAlert['status']>;

function AlertProgress({ alert }: { alert: SosAlert }) {
  const { t } = useTranslation();
  const reached = STEPS.findIndex((status) => status === alert.status);
  const times: Partial<Record<SosAlert['status'], string | null>> = {
    received: alert.receivedAt,
    acknowledged: alert.acknowledgedAt,
    resolved: alert.resolvedAt,
  };
  return (
    <ol aria-label={t('sos.progress.label')} className="grid gap-3">
      {STEPS.map((status, index) => {
        const done = alert.status !== 'cancelled' && index <= reached;
        const current = index === reached;
        return (
          <li key={status} aria-current={current ? 'step' : undefined} className="flex items-start gap-3">
            <span aria-hidden="true" className={cn('mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full ring-1 ring-inset', done ? 'bg-[var(--color-gold)] text-navy ring-transparent' : 'ring-[var(--hairline-strong)]')}>
              {done && <CheckIcon size={15} strokeWidth={2.4} />}
            </span>
            <div className="grid">
              <span className={cn('font-medium', !done && 'text-[var(--text-muted)]')}>
                {t(`sos.progress.${status}`)}
                <span className="sr-only"> {done ? t('sos.progress.done') : t('sos.progress.notYet')}</span>
              </span>
              {done && (times[status] || (status === 'acknowledged' && alert.acknowledgedByLabel)) && (
                <span className="text-[0.8125rem] text-[var(--text-muted)]">
                  {[formatClock(times[status] ?? null), status === 'acknowledged' ? alert.acknowledgedByLabel : null].filter(Boolean).join(' · ')}
                </span>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function SosPanel() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const active = useActiveSos();
  const contacts = useTrustedContacts();
  const trips = useTrips();
  const cancel = useCancelSos();

  const [local, setLocal] = useState<SosState>('ready');
  const [alertId, setAlertId] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [locationMissing, setLocationMissing] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const payloadRef = useRef<SosInput | null>(null);
  const send = useCallback((event: SosEvent) => setLocal((state) => sosMachine.next(state, event)), []);

  const detail = useSosAlert(alertId);
  const alert = detail.data ?? active.data ?? null;

  // Pick up an alert that is already open, e.g. one sent from another tab.
  if (active.data && !alertId) setAlertId(active.data.alertId);

  // An alert saved while offline (even in an earlier visit) is picked up again.
  useEffect(() => {
    if (!user) return;
    void pendingItems('sos.create').then((items) => {
      const saved = items.find((item) => item.userId === user.userId);
      if (saved && saved.kind === 'sos.create') {
        payloadRef.current = saved.payload;
        setLocal('queued_offline');
      }
    });
  }, [user]);

  const confirmReceived = useCallback(
    (received: SosAlert) => {
      queryClient.setQueryData(queryKeys.sos.active, received);
      queryClient.setQueryData(queryKeys.sos.detail(received.alertId), received);
      setAlertId(received.alertId);
      send('SERVER_RECEIVED');
      // Read the language at the moment of the announcement, not when the callback was created.
      announce(getTranslator()('sos.announce.received'), 'assertive');
    },
    [queryClient, send],
  );

  useEffect(
    () =>
      onOutboxResult((result) => {
        if (result.item.kind !== 'sos.create' || result.item.id !== payloadRef.current?.clientAlertId) return;
        if (result.status === 'sent') confirmReceived(result.response as SosAlert);
        else {
          setError(result.error);
          send('SEND_FAILED');
        }
      }),
    [confirmReceived, send],
  );

  const deliver = async (payload: SosInput) => {
    if (!isBrowserOnline()) {
      send('WENT_OFFLINE');
      announce(t('sos.announce.savedOffline'), 'assertive');
      return;
    }
    try {
      const received = await api.sos.create(payload);
      await removeFromOutbox(payload.clientAlertId);
      confirmReceived(received);
    } catch (caught) {
      setError(caught);
      if (isApiError(caught) && (caught.kind === 'network' || caught.kind === 'timeout')) send('WENT_OFFLINE');
      else send('SEND_FAILED');
      if (isApiError(caught) && caught.kind === 'validation') await removeFromOutbox(payload.clientAlertId);
    }
  };

  const confirmSend = async () => {
    if (!user) return;
    send('CONFIRM');
    setError(null);
    announce(t('sos.announce.sending'), 'assertive');
    // Never wait on a permission prompt: a location is added only if it arrives quickly.
    const position = await Promise.race([
      getCurrentPosition({ highAccuracy: true, timeoutMs: 5000 }).catch(() => null),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000)),
    ]);
    setLocationMissing(!position);
    const activeTrip = trips.data?.find((trip) => trip.status === 'active');
    const payload: SosInput = {
      clientAlertId: crypto.randomUUID(),
      tripId: activeTrip?.tripId ?? null,
      coordinates: position ? { lat: position.lat, lng: position.lng } : null,
      accuracyMeters: position?.accuracy ?? null,
      recordedAt: position?.recordedAt ?? null,
      createdOnDeviceAt: new Date().toISOString(),
      message: message.trim() || null,
      notifyTrustedContacts: true,
    };
    payloadRef.current = payload;
    // Saved on the device before any network attempt, so it can't be lost.
    await enqueue('sos.create', payload.clientAlertId, payload, user.userId);
    await deliver(payload);
  };

  const retry = () => {
    if (!payloadRef.current) return;
    send(local === 'queued_offline' ? 'CONNECTION_RESTORED' : 'RETRY');
    void deliver(payloadRef.current);
  };

  const state: SosState = alert ? alert.status : local;
  const sosContacts = (contacts.data ?? []).filter((c) => c.notifyOn.includes('sos'));

  if (state === 'ready' || state === 'confirming') {
    return (
      <div className="grid justify-items-center gap-6 py-4 text-center">
        <div className="grid gap-2">
          <p className="label text-[var(--text-subtle)]">{t('sos.eyebrow')}</p>
          <h1 className="text-[clamp(2rem,6vw,2.75rem)] font-semibold tracking-[-0.03em]">{t('sos.heading')}</h1>
        </div>
        <button
          type="button"
          onClick={() => send('PRESS')}
          aria-describedby="sos-explainer"
          lang="en"
          className="flex size-52 items-center justify-center rounded-full bg-danger text-[3rem] font-bold tracking-[0.04em] text-white shadow-[0_30px_60px_-24px_rgb(179_38_30/0.9)] ring-[12px] ring-danger/25 transition-transform hover:scale-[1.02] active:scale-[0.98] md:size-60"
        >
          {t('sos.button')}
        </button>
        <p id="sos-explainer" className="max-w-md text-[var(--text-muted)]">
          {t('sos.explainer')}
        </p>
        {active.isError && <ErrorState error={active.error} context="safety.load" compact onRetry={() => void active.refetch()} />}

        <Dialog
          open={state === 'confirming'}
          onClose={() => send('CANCEL_CONFIRM')}
          tone="danger"
          title={t('sos.confirm.title')}
          description={t('sos.confirm.description')}
          footer={
            <>
              <Button variant="secondary" onClick={() => send('CANCEL_CONFIRM')}>
                {t('common.actions.cancel')}
              </Button>
              <Button variant="danger" onClick={() => void confirmSend()}>
                {t('sos.confirm.send')}
              </Button>
            </>
          }
        >
          <div className="grid gap-4 pb-2 text-left">
            <ul className="grid gap-2 text-[0.9375rem]">
              <li>• {t('sos.confirm.opsDesk')}</li>
              <li>• {sosContacts.length > 0 ? t('sos.confirm.contacts', { count: sosContacts.length }) : t('sos.confirm.noContacts')}</li>
              <li>• {t('sos.confirm.location')}</li>
              <li className="font-semibold">• {t('sos.confirm.noEmergencyServices')}</li>
            </ul>
            <Field label={t('sos.confirm.message')} optional hint={t('sos.confirm.messageHint')}>
              {(control) => <TextArea {...control} maxLength={500} value={message} onChange={(e) => setMessage(e.target.value)} />}
            </Field>
          </div>
        </Dialog>
      </div>
    );
  }

  if (state === 'sending') {
    return (
      <div role="status" aria-busy="true" className="surface-card grid justify-items-center gap-3 p-8 text-center">
        <span aria-hidden="true" className="size-10 animate-spin rounded-full border-4 border-[var(--color-gold)] border-t-transparent" />
        <StatusPill tone="info">{t('sos.sending.pill')}</StatusPill>
        <p className="text-[1.125rem] font-semibold">{t('sos.sending.title')}</p>
        <p className="text-[var(--text-muted)]">{t('sos.sending.detail')}</p>
      </div>
    );
  }

  if (state === 'queued_offline' || state === 'send_failed') {
    const offline = state === 'queued_offline';
    return (
      <div role="alert" className="surface-card grid gap-4 p-6">
        <div className="flex flex-wrap gap-2">
          <StatusPill tone="warning">{t('sos.pending.saved')}</StatusPill>
          <StatusPill tone={offline ? 'warning' : 'danger'}>{offline ? t('sos.pending.waiting') : t('sos.pending.notSent')}</StatusPill>
        </div>
        <div className="flex items-start gap-3">
          {offline && <WifiOffIcon size={24} className="mt-1 shrink-0 text-[var(--tone-warning-fg)]" />}
          <div className="grid gap-1">
            <p className="text-[1.25rem] font-semibold">{t('sos.pending.title')}</p>
            <p className="text-[var(--text-muted)]">
              {offline ? t('sos.pending.offline') : t('sos.pending.failed')}{' '}
              <strong className="text-[var(--text)]">{t('sos.pending.callNow')}</strong>
            </p>
          </div>
        </div>
        {!offline && Boolean(error) && <ErrorState error={error} context="sos.send" compact />}
        <div className="flex flex-wrap gap-2">
          <Button variant="accent" onClick={retry}>
            {t('sos.pending.retry')}
          </Button>
          <Button variant="glass" onClick={() => void flushOutbox()}>
            {t('sos.pending.check')}
          </Button>
        </div>
      </div>
    );
  }

  if (!alert) return null;

  if (state === 'resolved' || state === 'cancelled') {
    return (
      <div className="surface-card grid gap-4 p-6">
        <StatusPill tone={state === 'resolved' ? 'success' : 'neutral'}>{state === 'resolved' ? t('sos.closed.resolved') : t('sos.closed.cancelled')}</StatusPill>
        <p className="text-[1.25rem] font-semibold">{state === 'resolved' ? t('sos.closed.resolvedTitle') : t('sos.closed.cancelledTitle')}</p>
        <p className="text-[var(--text-muted)]">{t('sos.closed.detail')}</p>
        <Button
          variant="secondary"
          className="justify-self-start"
          onClick={() => {
            setAlertId(null);
            payloadRef.current = null;
            setLocal('ready');
            queryClient.setQueryData(queryKeys.sos.active, null);
          }}
        >
          {t('common.actions.done')}
        </Button>
      </div>
    );
  }

  return (
    <div className="grid gap-6">
      <div role="status" className="surface-card grid gap-5 p-6 ring-2 ring-[var(--color-gold)]">
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill tone="success" dot>
            {t('sos.active.confirmed')}
          </StatusPill>
          <StatusPill tone={state === 'received' ? 'warning' : 'info'}>
            {state === 'received' ? t('sos.active.waitingAck') : state === 'acknowledged' ? t('sos.active.acknowledged') : t('sos.active.responding')}
          </StatusPill>
        </div>
        <div className="grid gap-1">
          <h1 className="text-[1.75rem] font-semibold tracking-[-0.02em]">{t('sos.active.title')}</h1>
          <p className="text-[var(--text-muted)]">{t('sos.active.receivedAt', { time: formatClock(alert.receivedAt) })}</p>
        </div>
        <AlertProgress alert={alert} />
        {locationMissing && (
          <InlineNotice tone="warning" title={t('sos.active.noLocationTitle')}>
            {t('sos.active.noLocation')}
          </InlineNotice>
        )}
      </div>

      <section aria-labelledby="delivery-title" className="grid gap-3">
        <h2 id="delivery-title" className="text-[1.125rem] font-semibold">
          {t('sos.active.whoAlerted')}
        </h2>
        <ul className="surface-card divide-y divide-[var(--hairline)]">
          {alert.notifications.map((channel) => {
            const note = channelNote(t, channel);
            return (
              <li key={`${channel.channel}-${channel.recipientLabel}`} className="grid gap-1 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">{channel.recipientLabel}</span>
                  <StatusPill tone={CHANNEL_TONE[channel.status]}>{t(`sos.channelStatus.${channel.status}`)}</StatusPill>
                </div>
                {note && <p className="text-[0.875rem] text-[var(--text-muted)]">{note}</p>}
              </li>
            );
          })}
        </ul>
      </section>

      {alert.guidance.length > 0 && (
        <section aria-labelledby="guidance-title" className="grid gap-2">
          <h2 id="guidance-title" className="text-[1.125rem] font-semibold">
            {t('sos.active.whileYouWait')}
          </h2>
          <ul className="grid gap-1.5 text-[var(--text-muted)]">
            {alert.guidance.map((line) => (
              <li key={line}>• {line}</li>
            ))}
          </ul>
        </section>
      )}

      <Button variant="glass" className="justify-self-start" onClick={() => setCancelOpen(true)}>
        {t('sos.active.imSafe')}
      </Button>
      <Dialog
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        title={t('sos.active.cancelTitle')}
        description={t('sos.active.cancelDescription')}
        dismissible={!cancel.isPending}
        footer={
          <>
            <Button variant="secondary" onClick={() => setCancelOpen(false)} disabled={cancel.isPending}>
              {t('sos.active.keepOpen')}
            </Button>
            <Button
              variant="navy"
              loading={cancel.isPending}
              onClick={() =>
                cancel.mutate(alert.alertId, {
                  onSuccess: (updated) => {
                    queryClient.setQueryData(queryKeys.sos.detail(updated.alertId), updated);
                    setCancelOpen(false);
                    announce(getTranslator()('sos.announce.cancelled'));
                  },
                })
              }
            >
              {t('sos.active.yesSafe')}
            </Button>
          </>
        }
      >
        {cancel.error ? <ErrorState error={cancel.error} compact /> : null}
      </Dialog>
    </div>
  );
}

export function SosScreen() {
  const { t } = useTranslation();
  return (
    <PageShell width="narrow" tone="dark">
      <div className="grid gap-8">
        <EmergencyNumbers />
        <RequireAuth title={t('sos.signIn.title')} description={t('sos.signIn.description')}>
          <SosPanel />
        </RequireAuth>
      </div>
    </PageShell>
  );
}
