import { formatMoney } from '@/lib/format/money';
import type { BudgetSummary as Budget } from '@/types/domain';

/** Honest totals: confirmed prices, estimates and unknowns are kept separate and labelled. */
export function BudgetSummary({ budget }: { budget: Budget }) {
  const estimate = budget.estimatedMin && budget.estimatedMax ? `${formatMoney(budget.estimatedMin)}–${formatMoney(budget.estimatedMax)}` : null;

  return (
    <section aria-labelledby="budget-title" className="surface-card grid gap-4 p-5">
      <h3 id="budget-title" className="text-[1.0625rem] font-semibold">
        Budget
      </h3>
      <dl className="grid gap-3 text-[0.9375rem]">
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-[var(--text-muted)]">Confirmed prices</dt>
          <dd className="font-semibold tabular-nums">{formatMoney(budget.knownTotal)}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-[var(--text-muted)]">Estimates</dt>
          <dd className="tabular-nums">{estimate ?? 'None'}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-[var(--text-muted)]">Cost unavailable</dt>
          <dd className="tabular-nums">
            {budget.unknownItemsCount} {budget.unknownItemsCount === 1 ? 'stop' : 'stops'}
          </dd>
        </div>
        {budget.ceiling && (
          <div className="grid gap-1 border-t border-[var(--hairline)] pt-3">
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-[var(--text-muted)]">Your budget</dt>
              <dd className="tabular-nums">{formatMoney(budget.ceiling)}</dd>
            </div>
            {budget.remaining && (
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-[var(--text-muted)]">Left after confirmed prices</dt>
                <dd className="font-semibold tabular-nums">{formatMoney(budget.remaining)}</dd>
              </div>
            )}
          </div>
        )}
      </dl>
      {budget.unknownItemsCount > 0 && (
        <p className="text-[0.8125rem] leading-relaxed text-[var(--text-muted)]">
          Totals include only prices we know. Estimates and stops without cost information aren’t added to what’s left.
        </p>
      )}
    </section>
  );
}
