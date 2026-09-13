'use client';

import { useState } from 'react';
import { RequireAuth } from '@/components/auth/RequireAuth';
import { PageHeader, PageShell, Section } from '@/components/app/PageShell';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Switch } from '@/components/ui/Field';
import { LoadingBlock, Skeleton } from '@/components/ui/Skeleton';
import { ErrorState } from '@/components/ui/States';
import { StatusPill, type Tone } from '@/components/ui/StatusPill';
import { useNow } from '@/hooks/useNow';
import { relativeTime } from '@/lib/format/freshness';
import { useConsents, useCreateDataRequest, useDataRequests, useUpdateConsent } from '@/lib/query/hooks/profile';
import { announce, toast } from '@/lib/ui/toast';
import type { Consent, DataRequest } from '@/types/domain';

const REQUEST_STATUS: Record<DataRequest['status'], { label: string; tone: Tone }> = {
  received: { label: 'Received', tone: 'info' },
  processing: { label: 'Processing', tone: 'info' },
  ready: { label: 'Ready', tone: 'success' },
  completed: { label: 'Completed', tone: 'success' },
  rejected: { label: 'Rejected', tone: 'danger' },
};

function ConsentList() {
  const now = useNow();
  const consents = useConsents();
  const update = useUpdateConsent();
  const [confirmLocation, setConfirmLocation] = useState<Consent | null>(null);

  if (consents.isPending) {
    return (
      <LoadingBlock label="Loading privacy choices" className="grid gap-3">
        <Skeleton className="h-20 w-full rounded-2xl" />
        <Skeleton className="h-20 w-full rounded-2xl" />
      </LoadingBlock>
    );
  }
  if (consents.isError) return <ErrorState error={consents.error} onRetry={() => void consents.refetch()} />;

  const change = (consent: Consent, granted: boolean) =>
    update.mutate(
      { consentId: consent.consentId, granted },
      { onSuccess: () => announce(`${consent.title} ${granted ? 'allowed' : 'turned off'}.`) },
    );

  return (
    <>
      <ul className="surface-card divide-y divide-[var(--hairline)]">
        {consents.data.map((consent) => (
          <li key={consent.consentId} className="grid gap-1 p-4">
            <Switch
              label={consent.title}
              description={consent.required ? `${consent.description} Required to use TravIndi.` : consent.description}
              checked={consent.granted}
              disabled={consent.required || update.isPending}
              onChange={(e) => {
                if (consent.consentId === 'location_sharing' && !e.target.checked) setConfirmLocation(consent);
                else change(consent, e.target.checked);
              }}
            />
            {consent.updatedAt && now > 0 && <p className="text-[0.75rem] text-[var(--text-subtle)]">Last changed {relativeTime(consent.updatedAt, now)}</p>}
          </li>
        ))}
      </ul>
      {update.error ? <ErrorState error={update.error} compact className="mt-3" /> : null}

      <Dialog
        open={Boolean(confirmLocation)}
        onClose={() => setConfirmLocation(null)}
        title="Turn off location sharing?"
        description="Any location you’re sharing right now will stop immediately, and you won’t be able to start new shares until you allow it again."
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmLocation(null)}>
              Keep it on
            </Button>
            <Button
              variant="danger"
              loading={update.isPending}
              onClick={() => {
                if (confirmLocation) change(confirmLocation, false);
                setConfirmLocation(null);
              }}
            >
              Turn off
            </Button>
          </>
        }
      />
    </>
  );
}

function DataRequests() {
  const now = useNow();
  const requests = useDataRequests();
  const create = useCreateDataRequest();
  const [confirmDeletion, setConfirmDeletion] = useState(false);

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" loading={create.isPending && create.variables === 'export'} onClick={() => create.mutate('export', { onSuccess: () => toast.success('Request received', 'We’ll let you know when your data is ready.') })}>
          Request a copy of my data
        </Button>
        <Button variant="subtle" onClick={() => setConfirmDeletion(true)}>
          Request account deletion
        </Button>
      </div>
      {create.error ? <ErrorState error={create.error} compact /> : null}
      {requests.data && requests.data.length > 0 && (
        <ul className="grid gap-2">
          {requests.data.map((request) => (
            <li key={request.requestId} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl p-3 ring-1 ring-inset ring-[var(--hairline)]">
              <span>
                <span className="font-medium">{request.kind === 'export' ? 'Copy of my data' : 'Account deletion'}</span>
                {now > 0 && <span className="text-[0.875rem] text-[var(--text-muted)]"> · requested {relativeTime(request.createdAt, now)}</span>}
              </span>
              <StatusPill tone={REQUEST_STATUS[request.status].tone}>{REQUEST_STATUS[request.status].label}</StatusPill>
            </li>
          ))}
        </ul>
      )}
      <Dialog
        open={confirmDeletion}
        onClose={() => setConfirmDeletion(false)}
        title="Request account deletion?"
        description="We’ll review your request and confirm by email before anything is deleted. Active trips, bookings and open safety reports may need to be closed first."
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmDeletion(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              loading={create.isPending}
              onClick={() =>
                create.mutate('deletion', {
                  onSuccess: () => {
                    setConfirmDeletion(false);
                    toast.success('Deletion request received');
                  },
                })
              }
            >
              Send request
            </Button>
          </>
        }
      />
    </div>
  );
}

export function ConsentsScreen() {
  return (
    <PageShell width="narrow">
      <PageHeader eyebrow="Privacy" title="Privacy & consents" description="Decide what TravIndi may do with your information. Changes apply straight away." />
      <RequireAuth>
        <div className="grid gap-10">
          <Section title="Your choices" level={2}>
            <ConsentList />
          </Section>
          <Section title="Your data" description="Ask for a copy of your data, or for your account to be deleted." level={2}>
            <DataRequests />
          </Section>
        </div>
      </RequireAuth>
    </PageShell>
  );
}
