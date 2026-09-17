'use client';

import { useTranslation } from '@/i18n/react';
import { formatDistance } from '@/lib/format/dates';
import { formatMoney } from '@/lib/format/money';
import type { ImpactSummary as Impact } from '@/types/domain';

function signed(value: number, format: (n: number) => string | null, none: string) {
  if (value === 0) return none;
  return `${value > 0 ? '+' : '−'}${format(Math.abs(value))}`;
}

/** What changes if the traveller accepts. Unknowns are stated as unknown. */
export function ImpactSummary({ impact }: { impact: Impact | null | undefined }) {
  const { t } = useTranslation();
  if (!impact) {
    return <p className="text-[0.9375rem] text-[var(--text-muted)]">{t('adaptation.impact.notCalculated')}</p>;
  }

  const cost =
    impact.cost.status === 'no_known_change'
      ? t('adaptation.impact.noKnownChange')
      : impact.cost.status === 'unknown'
        ? t('adaptation.impact.unknown')
        : impact.cost.delta
          ? `${impact.cost.status === 'increase' ? '+' : '−'}${formatMoney(impact.cost.delta)}`
          : impact.cost.status === 'increase'
            ? t('adaptation.impact.mayIncrease')
            : t('adaptation.impact.mayDecrease');

  const rows = [
    {
      term: t('adaptation.impact.travelTime'),
      value:
        impact.timeDeltaMinutes === null
          ? t('adaptation.impact.unknown')
          : signed(impact.timeDeltaMinutes, (minutes) => t('format.duration.minutes', { minutes }), t('adaptation.impact.noChange')),
    },
    {
      term: t('adaptation.impact.distance'),
      value: impact.distanceDeltaMeters === null ? t('adaptation.impact.unknown') : signed(impact.distanceDeltaMeters, formatDistance, t('adaptation.impact.noChange')),
    },
    { term: t('adaptation.impact.cost'), value: cost },
    { term: t('adaptation.impact.safety'), value: impact.safety.note ?? t(`adaptation.impact.safetyStatus.${impact.safety.status}`) },
  ];

  return (
    <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl bg-[var(--hairline)] sm:grid-cols-4">
      {rows.map((row) => (
        <div key={row.term} className="grid gap-0.5 bg-[var(--surface-raised)] p-3">
          <dt className="label text-[var(--text-subtle)]">{row.term}</dt>
          <dd className="text-[0.9375rem] font-medium">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}
