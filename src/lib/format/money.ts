import type { Cost, Money } from '@/types/domain';

const formatters = new Map<string, Intl.NumberFormat>();

export function formatMoney(money: Money | null | undefined): string | null {
  if (!money) return null;
  let formatter = formatters.get(money.currency);
  if (!formatter) {
    formatter = new Intl.NumberFormat('en-IN', { style: 'currency', currency: money.currency, maximumFractionDigits: 0 });
    formatters.set(money.currency, formatter);
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
export function describeCost(cost: Cost | null | undefined): CostDescription {
  if (!cost || cost.status === 'unavailable') {
    return { label: 'Cost unavailable', status: 'unavailable', note: null };
  }
  if (cost.status === 'estimate') {
    const range = cost.min && cost.max ? `${formatMoney(cost.min)}–${formatMoney(cost.max)}` : null;
    const single = cost.value ? `About ${formatMoney(cost.value)}` : null;
    return { label: range ?? single ?? 'Cost unavailable', status: range || single ? 'estimate' : 'unavailable', note: cost.sourceLabel ?? 'Estimate' };
  }
  return { label: formatMoney(cost.value) ?? 'Cost unavailable', status: cost.value ? 'authoritative' : 'unavailable', note: cost.sourceLabel ?? null };
}
