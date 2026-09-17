'use client';

import { useTranslation } from '@/i18n/react';
import { formatInteger } from '@/i18n/translate';
import { usePlatformMetrics } from '@/lib/query/hooks/trips';

const PRINCIPLES = ['sources', 'approval', 'costs', 'sos'] as const;

/** Only real, backend-provided numbers are shown; missing metrics are simply left out. */
export function HomeTrustBand() {
  const metrics = usePlatformMetrics();
  const { t, locale } = useTranslation();
  const facts = [
    metrics.data?.destinationsCount != null ? { value: metrics.data.destinationsCount, label: t('home.trust.facts.destinations') } : null,
    metrics.data?.verifiedProvidersCount != null ? { value: metrics.data.verifiedProvidersCount, label: t('home.trust.facts.providers') } : null,
    metrics.data?.tripsPlannedCount != null ? { value: metrics.data.tripsPlannedCount, label: t('home.trust.facts.trips') } : null,
  ].filter((fact): fact is { value: number; label: string } => fact !== null);

  return (
    <div className="grid gap-10 md:grid-cols-[1fr_1.2fr] md:items-start">
      <div className="grid gap-6">
        <h2 id="trust-title" className="display-md max-w-[18ch] text-balance">
          {t('home.trust.title')}
        </h2>
        {facts.length > 0 && (
          <dl className="flex flex-wrap gap-8">
            {facts.map((fact) => (
              <div key={fact.label} className="grid">
                <dt className="order-2 text-[0.9375rem] text-[var(--text-muted)]">{fact.label}</dt>
                <dd className="order-1 text-[clamp(2.25rem,4vw,3.25rem)] font-semibold leading-none tracking-[-0.04em] tabular-nums">{formatInteger(locale, fact.value)}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>
      <ul className="grid gap-3">
        {PRINCIPLES.map((principle) => (
          <li key={principle} className="flex gap-3 rounded-2xl bg-white/[0.04] p-4 ring-1 ring-inset ring-white/10">
            <span aria-hidden="true" className="mt-2 size-2 shrink-0 rounded-full bg-[var(--color-gold)]" />
            <span className="text-[1rem] leading-relaxed">{t(`home.trust.principles.${principle}`)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
