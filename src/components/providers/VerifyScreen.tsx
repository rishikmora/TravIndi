'use client';

import Link from 'next/link';
import { type FormEvent, useState } from 'react';
import { PageHeader, PageShell } from '@/components/app/PageShell';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Field, TextInput } from '@/components/ui/Field';
import { Skeleton } from '@/components/ui/Skeleton';
import { ErrorState, InlineNotice } from '@/components/ui/States';
import { StatusPill } from '@/components/ui/StatusPill';
import { isApiError } from '@/lib/api/errors';
import { useTrustLookup } from '@/lib/query/hooks/providers';
import type { VerificationEvidence } from '@/types/domain';
import { EVIDENCE_LABEL, EVIDENCE_STATUS, verificationSummary } from './trust';

function EvidenceList({ evidence }: { evidence: VerificationEvidence[] }) {
  return (
    <ul className="grid gap-2">
      {evidence.map((item) => (
        <li key={item.kind} className="flex items-center justify-between gap-3">
          <span>{EVIDENCE_LABEL[item.kind]}</span>
          <StatusPill tone={EVIDENCE_STATUS[item.status].tone}>{EVIDENCE_STATUS[item.status].label}</StatusPill>
        </li>
      ))}
    </ul>
  );
}

export function VerifyScreen({ initialQuery }: { initialQuery: string }) {
  const [text, setText] = useState(initialQuery);
  const [submitted, setSubmitted] = useState<string | null>(initialQuery.length >= 3 ? initialQuery : null);
  const lookup = useTrustLookup(submitted);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const value = text.trim().slice(0, 100);
    if (value.length >= 3) setSubmitted(value);
  };

  const result = lookup.data;
  const match = result?.match;

  return (
    <PageShell width="narrow">
      <PageHeader eyebrow="Trust" title="Verify a guide, business or ticket" description="Check the evidence TravIndi holds before you pay or hand over belongings." />
      <div className="grid gap-6">
        <form onSubmit={submit} className="surface-card grid gap-3 p-5 sm:grid-cols-[1fr_auto] sm:items-end">
          <Field label="Name, listing ID or ticket code" hint="Ticket codes look like TVD-7Q4K2M.">
            {(control) => <TextInput {...control} value={text} maxLength={100} onChange={(e) => setText(e.target.value)} autoComplete="off" />}
          </Field>
          <Button type="submit" variant="navy" loading={lookup.isFetching} disabled={text.trim().length < 3}>
            Check
          </Button>
        </form>

        {submitted && lookup.isPending && <Skeleton className="h-40 w-full rounded-[1.25rem]" />}
        {lookup.isError && (isApiError(lookup.error) && lookup.error.kind === 'validation' ? <InlineNotice tone="warning">{lookup.error.message}</InlineNotice> : <ErrorState error={lookup.error} context="verification.lookup" compact onRetry={() => void lookup.refetch()} />)}

        {result && (
          <section aria-live="polite" aria-label="Result" className="surface-card grid gap-4 p-5">
            {match?.kind === 'business' || match?.kind === 'guide' ? (
              (() => {
                const provider = match.kind === 'business' ? match.business : match.guide;
                const summary = verificationSummary(provider.verification);
                const href = match.kind === 'business' ? `/businesses/${match.business.businessId}` : `/guides/${match.guide.guideId}`;
                return (
                  <>
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusPill tone={summary.tone}>{summary.label}</StatusPill>
                      <StatusPill>{match.kind === 'business' ? 'Business' : 'Guide'}</StatusPill>
                    </div>
                    <p className="text-[1.25rem] font-semibold">{provider.name}</p>
                    <p>{result.message}</p>
                    <EvidenceList evidence={provider.verification} />
                    <ButtonLink href={href} variant="secondary" className="justify-self-start">
                      View full profile
                    </ButtonLink>
                  </>
                );
              })()
            ) : match?.kind === 'ticket' ? (
              <>
                <StatusPill tone={match.valid ? 'success' : 'warning'} className="justify-self-start">
                  {match.valid ? 'Valid ticket' : 'Not currently valid'}
                </StatusPill>
                <p className="text-[1.125rem] font-semibold">{result.message}</p>
                <dl className="grid gap-1 text-[0.9375rem]">
                  <div className="flex justify-between gap-3">
                    <dt className="text-[var(--text-muted)]">Provider</dt>
                    <dd>{match.providerName}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-[var(--text-muted)]">Booking status</dt>
                    <dd className="capitalize">{match.bookingStatus.replace('_', ' ')}</dd>
                  </div>
                </dl>
              </>
            ) : (
              <>
                <StatusPill className="justify-self-start">No match</StatusPill>
                <p>{result.message}</p>
                <Link href={`/trust/fraud?provider=${encodeURIComponent(submitted ?? '')}`} className="justify-self-start font-semibold text-[var(--link)] underline underline-offset-4">
                  Report a suspected scam
                </Link>
              </>
            )}
          </section>
        )}

        <InlineNotice tone="info" title="Staying safe">
          <ul className="grid gap-1">
            <li>Don’t pay in advance to anyone who contacts you outside TravIndi.</li>
            <li>Check that the name and ID match the profile here.</li>
            <li>Guides should be able to show their licence.</li>
          </ul>
        </InlineNotice>
      </div>
    </PageShell>
  );
}
