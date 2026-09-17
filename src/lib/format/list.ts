import { LOCALE_INFO, type Locale } from '@/i18n/config';
import { getLocale, getTranslator } from '@/i18n/runtime';

const formatters = new Map<Locale, Intl.ListFormat | null>();

/** "a, b and c" in the reader's language. Falls back to a plain separator where Intl.ListFormat is missing. */
export function formatList(items: string[], locale: Locale = getLocale()): string {
  if (!formatters.has(locale)) {
    formatters.set(locale, typeof Intl.ListFormat === 'function' ? new Intl.ListFormat(LOCALE_INFO[locale].intl, { type: 'conjunction' }) : null);
  }
  const formatter = formatters.get(locale);
  return formatter ? formatter.format(items) : items.join(getTranslator(locale)('common.list.separator'));
}
