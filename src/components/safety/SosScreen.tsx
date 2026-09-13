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
import { api } from '@/lib/api';
import { isApiError } from '@/lib/api/errors';
import { useAuth } from '@/lib/auth/provider';
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

const clock = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }) : null);

const CHANNEL_STATUS: Record<SosAlert['notifications'][number]['status'], { label: string; tone: Tone }> = {
  queued: { label: 'Sending', tone: 'info' },
  delivered: { label: 'Delivered', tone: 'success' },
  failed: { label: 'Failed', tone: 'danger' },
  not_supported: { label: 'Not connected', tone: 'neutral' },
};

function channelNote(channel: SosAlert['notifications'][number]) {
  if (channel.channel === 'authority') return 'TravIndi can’t alert emergency services. Call 112 yourself.';
  if (channel.channel === 'trusted_contact') {
    if (channel.status === 'not_supported') return 'Can’t be reached through TravIndi (SMS isn’t connected). Contact them directly if you can.';
    if (channel.status === 'delivered') return 'Received as an in-app alert.';
    if (channel.status === 'failed') return 'The alert didn’t reach them. Try contacting them directly.';
    return 'Sending an in-app alert…';
  }
  return channel.status === 'delivered' ? 'Your alert is on the operations desk’s screen.' : null;
}

const STEPS: Array<{ status: SosAlert['status']; label: string }> = [
  { status: 'received', label: 'Received by TravIndi' },
  { status: 'acknowledged', label: 'Acknowledged by the operations desk' },
  { status: 'responding', label: 'Response being coordinated' },
  { status: 'resolved', label: 'Resolved' },
];

function AlertProgress({ alert }: { alert: SosAlert }) {
  const reached = STEPS.findIndex((s) => s.status === alert.status);
  const times: Partial<Record<SosAlert['status'], string | null>> = {
    received: alert.receivedAt,
    acknowledged: alert.acknowledgedAt,
    resolved: alert.resolvedAt,
  };
  return (
    <ol aria-label="Alert progress" className="grid gap-3">
      {STEPS.map((step, index) => {
        const done = alert.status !== 'cancelled' && index <= reached;
        const current = index === reached;
        return (
          <li key={step.status} aria-current={current ? 'step' : undefined} className="flex items-start gap-3">
            <span aria-hidden="true" className={cn('mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full ring-1 ring-inset', done ? 'bg-[var(--color-gold)] text-navy ring-transparent' : 'ring-[var(--hairline-strong)]')}>
              {done && <CheckIcon size={15} strokeWidth={2.4} />}
            </span>
            <div className="grid">
              <span className={cn('font-medium', !done && 'text-[var(--text-muted)]')}>
                {step.label}
                <span className="sr-only">{done ? ' — done' : ' — not yet'}</span>
              </span>
              {done && (times[step.status] || (step.status === 'acknowledged' && alert.acknowledgedByLabel)) && (
                <span className="text-[0.8125rem] text-[var(--text-muted)]">
                  {[clock(times[step.status] ?? null), step.status === 'acknowledged' ? alert.acknowledgedByLabel : null].filter(Boolean).join(' · ')}
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
      announce('TravIndi has received your SOS alert.', 'assertive');
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
      announce('Saved on this device. Your alert will send when you reconnect. If you are in danger, call 112.', 'assertive');
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
    announce('Sending your SOS alert.', 'assertive');
    // Never wait on a permission prompt: a location is added only if it arrives quickly.
    const position = await Promise.race([
      getCurrentPosition({ highAccuracy: true, timeoutMs: 5000 }).catch(() => null),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000)),
    ]);
    setLocationMissing(!position);
    const activeTrip = trips.data?.find((t) => t.status === 'active');
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
          <p className="label text-[var(--text-subtle)]">Emergency alert</p>
          <h1 className="text-[clamp(2rem,6vw,2.75rem)] font-semibold tracking-[-0.03em]">Need help now?</h1>
        </div>
        <button
          type="button"
          onClick={() => send('PRESS')}
          aria-describedby="sos-explainer"
          className="flex size-52 items-center justify-center rounded-full bg-danger text-[3rem] font-bold tracking-[0.04em] text-white shadow-[0_30px_60px_-24px_rgb(179_38_30/0.9)] ring-[12px] ring-danger/25 transition-transform hover:scale-[1.02] active:scale-[0.98] md:size-60"
        >
          SOS
        </button>
        <p id="sos-explainer" className="max-w-md text-[var(--text-muted)]">
          Sends an alert to the TravIndi operations desk and your trusted contacts, with your location if your device can share it. You’ll confirm first.
        </p>
        {active.isError && <ErrorState error={active.error} context="safety.load" compact onRetry={() => void active.refetch()} />}

        <Dialog
          open={state === 'confirming'}
          onClose={() => send('CANCEL_CONFIRM')}
          tone="danger"
          title="Send an SOS alert?"
          description="Only send this if you need help."
          footer={
            <>
              <Button variant="secondary" onClick={() => send('CANCEL_CONFIRM')}>
                Cancel
              </Button>
              <Button variant="danger" onClick={() => void confirmSend()}>
                Send SOS alert
              </Button>
            </>
          }
        >
          <div className="grid gap-4 pb-2 text-left">
            <ul className="grid gap-2 text-[0.9375rem]">
              <li>• The TravIndi operations desk will see your alert.</li>
              <li>
                •{' '}
                {sosContacts.length > 0
                  ? `${sosContacts.length} trusted contact${sosContacts.length === 1 ? '' : 's'} will be alerted where TravIndi can reach them. You’ll see each result.`
                  : 'You haven’t chosen any trusted contacts for SOS alerts.'}
              </li>
              <li>• Your current location is included if your device shares it within a few seconds.</li>
              <li className="font-semibold">• Emergency services are not contacted. Call 112 for police, fire or ambulance.</li>
            </ul>
            <Field label="Message" optional hint="e.g. what’s happening, or where exactly you are">
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
        <StatusPill tone="info">Sending</StatusPill>
        <p className="text-[1.125rem] font-semibold">Sending your alert…</p>
        <p className="text-[var(--text-muted)]">It’s already saved on this device, so it won’t be lost if the connection drops.</p>
      </div>
    );
  }

  if (state === 'queued_offline' || state === 'send_failed') {
    const offline = state === 'queued_offline';
    return (
      <div role="alert" className="surface-card grid gap-4 p-6">
        <div className="flex flex-wrap gap-2">
          <StatusPill tone="warning">Saved on this device</StatusPill>
          <StatusPill tone={offline ? 'warning' : 'danger'}>{offline ? 'Waiting for connection' : 'Not sent yet'}</StatusPill>
        </div>
        <div className="flex items-start gap-3">
          {offline && <WifiOffIcon size={24} className="mt-1 shrink-0 text-[var(--tone-warning-fg)]" />}
          <div className="grid gap-1">
            <p className="text-[1.25rem] font-semibold">Your alert hasn’t reached TravIndi yet</p>
            <p className="text-[var(--text-muted)]">
              {offline
                ? 'It will send automatically as soon as you’re back online.'
                : 'We couldn’t send it. It stays saved on this device while you try again.'}{' '}
              <strong className="text-[var(--text)]">If you’re in danger, call 112 now.</strong>
            </p>
          </div>
        </div>
        {!offline && Boolean(error) && <ErrorState error={error} context="sos.send" compact />}
        <div className="flex flex-wrap gap-2">
          <Button variant="accent" onClick={retry}>
            Try sending now
          </Button>
          <Button variant="glass" onClick={() => void flushOutbox()}>
            Check connection
          </Button>
        </div>
      </div>
    );
  }

  if (!alert) return null;

  if (state === 'resolved' || state === 'cancelled') {
    return (
      <div className="surface-card grid gap-4 p-6">
        <StatusPill tone={state === 'resolved' ? 'success' : 'neutral'}>{state === 'resolved' ? 'Resolved' : 'Cancelled'}</StatusPill>
        <p className="text-[1.25rem] font-semibold">{state === 'resolved' ? 'Your alert was marked resolved' : 'You cancelled your alert'}</p>
        <p className="text-[var(--text-muted)]">If you still need help, send a new alert or call 112.</p>
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
          Done
        </Button>
      </div>
    );
  }

  return (
    <div className="grid gap-6">
      <div role="status" className="surface-card grid gap-5 p-6 ring-2 ring-[var(--color-gold)]">
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill tone="success" dot>
            Server confirmed
          </StatusPill>
          <StatusPill tone={state === 'received' ? 'warning' : 'info'}>{state === 'received' ? 'Waiting for acknowledgement' : state === 'acknowledged' ? 'Acknowledged' : 'Responding'}</StatusPill>
        </div>
        <div className="grid gap-1">
          <h1 className="text-[1.75rem] font-semibold tracking-[-0.02em]">Your SOS alert was received</h1>
          <p className="text-[var(--text-muted)]">Received at {clock(alert.receivedAt)}. Keep your phone with you.</p>
        </div>
        <AlertProgress alert={alert} />
        {locationMissing && (
          <InlineNotice tone="warning" title="Sent without your location">
            Your device didn’t share a location in time. If you can, send your location in a message or tell someone where you are.
          </InlineNotice>
        )}
      </div>

      <section aria-labelledby="delivery-title" className="grid gap-3">
        <h2 id="delivery-title" className="text-[1.125rem] font-semibold">
          Who has been alerted
        </h2>
        <ul className="surface-card divide-y divide-[var(--hairline)]">
          {alert.notifications.map((channel) => {
            const status = CHANNEL_STATUS[channel.status];
            return (
              <li key={`${channel.channel}-${channel.recipientLabel}`} className="grid gap-1 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">{channel.recipientLabel}</span>
                  <StatusPill tone={status.tone}>{status.label}</StatusPill>
                </div>
                {channelNote(channel) && <p className="text-[0.875rem] text-[var(--text-muted)]">{channelNote(channel)}</p>}
              </li>
            );
          })}
        </ul>
      </section>

      {alert.guidance.length > 0 && (
        <section aria-labelledby="guidance-title" className="grid gap-2">
          <h2 id="guidance-title" className="text-[1.125rem] font-semibold">
            While you wait
          </h2>
          <ul className="grid gap-1.5 text-[var(--text-muted)]">
            {alert.guidance.map((line) => (
              <li key={line}>• {line}</li>
            ))}
          </ul>
        </section>
      )}

      <Button variant="glass" className="justify-self-start" onClick={() => setCancelOpen(true)}>
        I’m safe — cancel alert
      </Button>
      <Dialog
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        title="Cancel your SOS alert?"
        description="The operations desk will see that you’re safe. Trusted contacts who were alerted won’t be messaged automatically."
        dismissible={!cancel.isPending}
        footer={
          <>
            <Button variant="secondary" onClick={() => setCancelOpen(false)} disabled={cancel.isPending}>
              Keep alert open
            </Button>
            <Button
              variant="navy"
              loading={cancel.isPending}
              onClick={() =>
                cancel.mutate(alert.alertId, {
                  onSuccess: (updated) => {
                    queryClient.setQueryData(queryKeys.sos.detail(updated.alertId), updated);
                    setCancelOpen(false);
                    announce('Your SOS alert was cancelled.');
                  },
                })
              }
            >
              Yes, I’m safe
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
  return (
    <PageShell width="narrow" tone="dark">
      <div className="grid gap-8">
        <EmergencyNumbers />
        <RequireAuth title="Sign in to send an SOS alert" description="Calling 112 works without an account. An SOS alert needs your account so we know who needs help.">
          <SosPanel />
        </RequireAuth>
      </div>
    </PageShell>
  );
}
