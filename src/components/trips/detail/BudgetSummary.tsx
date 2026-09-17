'use client';

import { useTranslation } from '@/i18n/react';
import { formatMoney } from '@/lib/format/money';
import type { BudgetSummary as Budget } from '@/types/domain';

/** Honest totals: confirmed prices, estimates and unknowns are kept separate and labelled. */
export function BudgetSummary({ budget }: { budget: Budget }) {
  const { t } = useTranslation();
  const estimate =
    budget.estimatedMin && budget.estimatedMax
      ? t('itinerary.budget.range', { min: formatMoney(budget.estimatedMin) ?? '', max: formatMoney(budget.estimatedMax) ?? '' })
      : null;

  return (
    <section aria-labelledby="budget-title" className="surface-card grid gap-4 p-5">
      <h3 id="budget-title" className="text-[1.0625rem] font-semibold">
        {t('itinerary.budget.title')}
      </h3>
      <dl className="grid gap-3 text-[0.9375rem]">
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-[var(--text-muted)]">{t('itinerary.budget.confirmed')}</dt>
          <dd className="font-semibold tabular-nums">{formatMoney(budget.knownTotal)}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-[var(--text-muted)]">{t('itinerary.budget.estimates')}</dt>
          <dd className="tabular-nums">{estimate ?? t('itinerary.budget.none')}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-[var(--text-muted)]">{t('itinerary.budget.unavailable')}</dt>
          <dd className="tabular-nums">{t('itinerary.view.stops', { count: budget.unknownItemsCount })}</dd>
        </div>
        {budget.ceiling && (
          <div className="grid gap-1 border-t border-[var(--hairline)] pt-3">
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-[var(--text-muted)]">{t('itinerary.budget.yourBudget')}</dt>
              <dd className="tabular-nums">{formatMoney(budget.ceiling)}</dd>
            </div>
            {budget.remaining && (
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-[var(--text-muted)]">{t('itinerary.budget.left')}</dt>
                <dd className="font-semibold tabular-nums">{formatMoney(budget.remaining)}</dd>
              </div>
            )}
          </div>
        )}
      </dl>
      {budget.unknownItemsCount > 0 && (
        <p className="text-[0.8125rem] leading-relaxed text-[var(--text-muted)]">
          {t('itinerary.budget.note')}
        </p>
      )}
    </section>
  );
}
