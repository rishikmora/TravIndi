import { formatDistance } from '@/lib/format/dates';
import { formatMoney } from '@/lib/format/money';
import type { ImpactSummary as Impact } from '@/types/domain';

function signed(value: number, format: (n: number) => string | null) {
  if (value === 0) return 'No change';
  return `${value > 0 ? '+' : '−'}${format(Math.abs(value))}`;
}

const SAFETY: Record<Impact['safety']['status'], string> = {
  improved: 'Improved',
  unchanged: 'No known change',
  reduced: 'Reduced',
  unknown: 'Unknown',
};

/** What changes if the traveller accepts. Unknowns are stated as unknown. */
export function ImpactSummary({ impact }: { impact: Impact | null | undefined }) {
  if (!impact) {
    return <p className="text-[0.9375rem] text-[var(--text-muted)]">The impact of this change hasn’t been calculated.</p>;
  }

  const cost =
    impact.cost.status === 'no_known_change'
      ? 'No known change'
      : impact.cost.status === 'unknown'
        ? 'Unknown'
        : impact.cost.delta
          ? `${impact.cost.status === 'increase' ? '+' : '−'}${formatMoney(impact.cost.delta)}`
          : impact.cost.status === 'increase'
            ? 'May increase'
            : 'May decrease';

  const rows = [
    { term: 'Travel time', value: impact.timeDeltaMinutes === null ? 'Unknown' : signed(impact.timeDeltaMinutes, (n) => `${n} min`) },
    { term: 'Distance', value: impact.distanceDeltaMeters === null ? 'Unknown' : signed(impact.distanceDeltaMeters, formatDistance) },
    { term: 'Cost', value: cost },
    { term: 'Safety', value: impact.safety.note ?? SAFETY[impact.safety.status] },
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
