'use client';

import { useRef, useState } from 'react';
import { RequireAuth } from '@/components/auth/RequireAuth';
import { PageHeader, PageShell } from '@/components/app/PageShell';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Checkbox, Field, TextArea, TextInput } from '@/components/ui/Field';
import { ErrorState } from '@/components/ui/States';
import { StatusPill } from '@/components/ui/StatusPill';
import { isApiError } from '@/lib/api/errors';
import { useReportFraud } from '@/lib/query/hooks/providers';
import { announce } from '@/lib/ui/toast';
import type { FraudReport, FraudReportInput } from '@/types/domain';
import { cn } from '@/utils/cn';

const CATEGORIES: Array<{ value: FraudReportInput['category']; label: string; description: string }> = [
  { value: 'impersonation', label: 'Impersonation', description: 'Someone pretending to be a listed guide or business.' },
  { value: 'overcharging', label: 'Overcharging', description: 'Charged far more than agreed or listed.' },
  { value: 'fake_listing', label: 'Fake listing', description: 'A service that doesn’t exist or isn’t as described.' },
  { value: 'payment_scam', label: 'Payment scam', description: 'Asked to pay in advance, off-platform or by an unusual method.' },
  { value: 'harassment', label: 'Harassment', description: 'Pressure, threats or unwanted behaviour.' },
  { value: 'other', label: 'Something else', description: '' },
];

function FraudForm({ providerReference }: { providerReference: string }) {
  const report = useReportFraud();
  const clientReportId = useRef(crypto.randomUUID());
  const [category, setCategory] = useState<FraudReportInput['category'] | null>(null);
  const [description, setDescription] = useState('');
  const [reference, setReference] = useState(providerReference);
  const [contact, setContact] = useState(true);
  const [done, setDone] = useState<FraudReport | null>(null);
  const fieldErrors = isApiError(report.error) ? report.error.fieldErrors : {};

  if (done) {
    return (
      <div role="status" className="surface-card grid gap-3 p-6">
        <StatusPill tone="success" className="justify-self-start">
          Received
        </StatusPill>
        <p className="text-[1.25rem] font-semibold">Thank you — your report was received</p>
        <p className="text-[var(--text-muted)]">
          Your reference is <span className="font-mono font-semibold text-[var(--text)]">{done.referenceCode}</span>. If you’ve lost money, also report it to your bank and the national cybercrime helpline 1930.
        </p>
        <ButtonLink href="/safety" variant="secondary" className="justify-self-start">
          Back to safety centre
        </ButtonLink>
      </div>
    );
  }

  return (
    <form
      className="grid gap-6"
      onSubmit={(event) => {
        event.preventDefault();
        if (!category) return;
        report.mutate(
          { clientReportId: clientReportId.current, category, description: description.trim(), providerReference: reference.trim() || null, occurredAt: null, contactPermission: contact },
          {
            onSuccess: (result) => {
              setDone(result);
              announce('Your report was received.', 'assertive');
            },
          },
        );
      }}
    >
      <fieldset className="grid gap-2">
        <legend className="mb-1 text-[1.0625rem] font-semibold">What happened?</legend>
        {CATEGORIES.map((option) => (
          <label key={option.value} className={cn('flex cursor-pointer items-start gap-3 rounded-2xl p-3.5 ring-1 ring-inset', category === option.value ? 'bg-[var(--tone-neutral-bg)] ring-2 ring-navy' : 'ring-[var(--hairline-strong)]')}>
            <input type="radio" name="fraud-category" value={option.value} checked={category === option.value} onChange={() => setCategory(option.value)} className="mt-1 size-4 accent-[var(--color-navy)]" />
            <span className="grid">
              <span className="font-medium">{option.label}</span>
              {option.description && <span className="text-[0.8125rem] text-[var(--text-muted)]">{option.description}</span>}
            </span>
          </label>
        ))}
      </fieldset>
      <Field label="Who was involved?" optional hint="A name, listing ID, phone number or website." error={fieldErrors.providerReference}>
        {(control) => <TextInput {...control} maxLength={200} value={reference} onChange={(e) => setReference(e.target.value)} />}
      </Field>
      <Field label="Describe what happened" hint="At least 20 characters." error={fieldErrors.description}>
        {(control) => <TextArea {...control} maxLength={4000} value={description} onChange={(e) => setDescription(e.target.value)} />}
      </Field>
      <Checkbox label="TravIndi may contact me about this report" checked={contact} onChange={(e) => setContact(e.target.checked)} />
      {report.error && !Object.keys(fieldErrors).length ? <ErrorState error={report.error} compact politeness="assertive" /> : null}
      <Button type="submit" variant="navy" size="lg" className="justify-self-start" loading={report.isPending} disabled={!category || description.trim().length < 20}>
        Send report
      </Button>
    </form>
  );
}

export function FraudReportScreen({ providerReference }: { providerReference: string }) {
  return (
    <PageShell width="narrow">
      <PageHeader eyebrow="Trust" title="Report fraud" description="Reports help us remove fake listings and warn other travellers." />
      <RequireAuth description="Reports are linked to your account so we can follow up if needed.">
        <FraudForm providerReference={providerReference} />
      </RequireAuth>
    </PageShell>
  );
}
