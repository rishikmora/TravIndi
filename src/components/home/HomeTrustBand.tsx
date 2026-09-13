'use client';

import { usePlatformMetrics } from '@/lib/query/hooks/trips';

const PRINCIPLES = [
  'Changing information shows where it came from and how recent it is.',
  'Nothing in your plan changes until you approve it — and every version is kept.',
  'A cost we don’t know is shown as unknown, never guessed.',
  'SOS shows exactly who received your alert. It never claims help is on the way unless that’s confirmed.',
];

/** Only real, backend-provided numbers are shown; missing metrics are simply left out. */
export function HomeTrustBand() {
  const metrics = usePlatformMetrics();
  const facts = [
    metrics.data?.destinationsCount != null ? { value: metrics.data.destinationsCount, label: 'destinations with practical guidance' } : null,
    metrics.data?.verifiedProvidersCount != null ? { value: metrics.data.verifiedProvidersCount, label: 'verified local providers' } : null,
    metrics.data?.tripsPlannedCount != null ? { value: metrics.data.tripsPlannedCount, label: 'journeys planned' } : null,
  ].filter((fact): fact is { value: number; label: string } => fact !== null);

  return (
    <div className="grid gap-10 md:grid-cols-[1fr_1.2fr] md:items-start">
      <div className="grid gap-6">
        <h2 id="trust-title" className="display-md max-w-[18ch] text-balance">
          Honest by design
        </h2>
        {facts.length > 0 && (
          <dl className="flex flex-wrap gap-8">
            {facts.map((fact) => (
              <div key={fact.label} className="grid">
                <dt className="order-2 text-[0.9375rem] text-[var(--text-muted)]">{fact.label}</dt>
                <dd className="order-1 text-[clamp(2.25rem,4vw,3.25rem)] font-semibold leading-none tracking-[-0.04em] tabular-nums">{fact.value.toLocaleString('en-IN')}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>
      <ul className="grid gap-3">
        {PRINCIPLES.map((principle) => (
          <li key={principle} className="flex gap-3 rounded-2xl bg-white/[0.04] p-4 ring-1 ring-inset ring-white/10">
            <span aria-hidden="true" className="mt-2 size-2 shrink-0 rounded-full bg-[var(--color-gold)]" />
            <span className="text-[1rem] leading-relaxed">{principle}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
