import type { Month } from '@/data/types';

export const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

export const MONTH_SHORT = MONTH_NAMES.map((m) => m.slice(0, 3));

/**
 * Collapses a set of months into readable ranges, wrapping over the new year:
 * [10, 11, 12, 1, 2, 3] → "Oct–Mar"; all twelve → "Year-round".
 */
export function formatMonthRange(months: readonly Month[] | readonly number[]): string {
  const set = new Set(months);
  if (set.size === 0) return '';
  if (set.size === 12) return 'Year-round';

  // Start a run at a month whose predecessor is not included.
  const runs: Array<[number, number]> = [];
  for (let m = 1; m <= 12; m++) {
    const previous = m === 1 ? 12 : m - 1;
    if (!set.has(m) || set.has(previous)) continue;
    let end = m;
    while (set.has(end === 12 ? 1 : end + 1) && (end === 12 ? 1 : end + 1) !== m) end = end === 12 ? 1 : end + 1;
    runs.push([m, end]);
  }
  return runs
    .map(([start, end]) => (start === end ? MONTH_SHORT[start - 1] : `${MONTH_SHORT[start - 1]}–${MONTH_SHORT[end - 1]}`))
    .join(', ');
}

export function formatDuration(minDays: number, maxDays: number): string {
  if (minDays === maxDays) return `${minDays} ${minDays === 1 ? 'day' : 'days'}`;
  return `${minDays}–${maxDays} days`;
}

export function formatDistance(km: number): string {
  return km >= 100 ? `${Math.round(km / 10) * 10} km` : `${Math.round(km)} km`;
}
