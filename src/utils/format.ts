import type { Month } from '@/data/types';
import { LOCALE_INFO, type Locale } from '@/i18n/config';
import { getLocale, getTranslator } from '@/i18n/runtime';

const shortMonths = new Map<Locale, string[]>();

/** Abbreviated month names in the selected language: "Jan", "जन॰", "జన". */
export function monthShortNames(locale: Locale = getLocale()): string[] {
  let names = shortMonths.get(locale);
  if (!names) {
    const format = new Intl.DateTimeFormat(LOCALE_INFO[locale].intl, { month: 'short', timeZone: 'UTC' });
    names = Array.from({ length: 12 }, (_, i) => format.format(new Date(Date.UTC(2000, i, 1))));
    shortMonths.set(locale, names);
  }
  return names;
}

/** 1-based (or 0-based) months as a list: "Oct, Nov, Dec"; none → "Year-round". */
export function formatMonthList(months: readonly number[], locale: Locale = getLocale()): string {
  const t = getTranslator(locale);
  if (months.length === 0) return t('destinations.months.yearRound');
  const zeroBased = months.includes(0);
  const names = monthShortNames(locale);
  return months
    .map((m) => names[zeroBased ? m : m - 1])
    .filter(Boolean)
    .join(t('common.list.separator'));
}

/**
 * Collapses a set of months into readable ranges, wrapping over the new year:
 * [10, 11, 12, 1, 2, 3] → "Oct–Mar"; all twelve → "Year-round".
 */
export function formatMonthRange(months: readonly Month[] | readonly number[], locale: Locale = getLocale()): string {
  const set = new Set(months);
  if (set.size === 0) return '';
  const t = getTranslator(locale);
  if (set.size === 12) return t('destinations.months.yearRound');
  const names = monthShortNames(locale);

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
    .map(([start, end]) => (start === end ? names[start - 1] : `${names[start - 1]}–${names[end - 1]}`))
    .join(t('common.list.separator'));
}
