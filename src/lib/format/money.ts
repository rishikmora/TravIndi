import { LOCALE_INFO, type Locale } from '@/i18n/config';
import { getLocale, getTranslator } from '@/i18n/runtime';
import type { Cost, Money } from '@/types/domain';

const formatters = new Map<string, Intl.NumberFormat>();

export function formatMoney(money: Money | null | undefined, locale: Locale = getLocale()): string | null {
  if (!money) return null;
  const id = `${locale}:${money.currency}`;
  let formatter = formatters.get(id);
  if (!formatter) {
    formatter = new Intl.NumberFormat(LOCALE_INFO[locale].intl, { style: 'currency', currency: money.currency, maximumFractionDigits: 0 });
    formatters.set(id, formatter);
  }
  return formatter.format(money.amountMinor / 100);
}

export interface CostDescription {
  /** What to display, e.g. "₹1,200", "₹300–₹700", "Cost unavailable". */
  label: string;
  status: Cost['status'];
  /** Qualifier to show alongside: "Estimate", source label, or why it is unknown. */
  note: string | null;
}

/** Costs are shown exactly as certain as the backend says they are — never rounded up into a price. */
export function describeCost(cost: Cost | null | undefined, locale: Locale = getLocale()): CostDescription {
  const t = getTranslator(locale);
  const unavailable = t('format.cost.unavailable');
  if (!cost || cost.status === 'unavailable') {
    return { label: unavailable, status: 'unavailable', note: null };
  }
  if (cost.status === 'estimate') {
    const range = cost.min && cost.max ? t('format.cost.range', { min: formatMoney(cost.min, locale), max: formatMoney(cost.max, locale) }) : null;
    const single = cost.value ? t('format.cost.about', { amount: formatMoney(cost.value, locale) }) : null;
    return {
      label: range ?? single ?? unavailable,
      status: range || single ? 'estimate' : 'unavailable',
      note: cost.sourceLabel ?? t('format.cost.estimate'),
    };
  }
  return { label: formatMoney(cost.value, locale) ?? unavailable, status: cost.value ? 'authoritative' : 'unavailable', note: cost.sourceLabel ?? null };
}
