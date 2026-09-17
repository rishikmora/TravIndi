import { LOCALE_INFO, type Locale } from '@/i18n/config';
import { getLocale, getTranslator } from '@/i18n/runtime';

/*
 * Calendar dates ("YYYY-MM-DD") are formatted in UTC so they never shift a day
 * with the viewer's timezone, and server and client render identical text.
 * Every formatter follows the selected language; digits stay Western.
 */

const formats = new Map<string, Intl.DateTimeFormat>();

function dateFormat(locale: Locale, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const id = `${locale}:${JSON.stringify(options)}`;
  let format = formats.get(id);
  if (!format) {
    format = new Intl.DateTimeFormat(LOCALE_INFO[locale].intl, { ...options, timeZone: 'UTC' });
    formats.set(id, format);
  }
  return format;
}

const DAY_MONTH: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' };
const DAY_MONTH_YEAR: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' };
const WEEKDAY_DAY_MONTH: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short' };

const parseDate = (iso: string) => new Date(`${iso}T00:00:00Z`);

export function formatDate(iso: string | null | undefined, withYear = true, locale: Locale = getLocale()): string | null {
  if (!iso) return null;
  return dateFormat(locale, withYear ? DAY_MONTH_YEAR : DAY_MONTH).format(parseDate(iso));
}

export function formatDayHeading(iso: string | null | undefined, locale: Locale = getLocale()): string | null {
  return iso ? dateFormat(locale, WEEKDAY_DAY_MONTH).format(parseDate(iso)) : null;
}

export function formatDateRange(
  start: string | null | undefined,
  end: string | null | undefined,
  locale: Locale = getLocale(),
): string | null {
  if (!start) return null;
  if (!end || end === start) return formatDate(start, true, locale);
  const a = parseDate(start);
  const b = parseDate(end);
  const full = dateFormat(locale, DAY_MONTH_YEAR);
  if (locale !== 'en' && typeof full.formatRange === 'function') return full.formatRange(a, b);
  if (a.getUTCFullYear() === b.getUTCFullYear()) {
    if (a.getUTCMonth() === b.getUTCMonth()) return `${a.getUTCDate()}–${full.format(b)}`;
    return `${dateFormat(locale, DAY_MONTH).format(a)} – ${full.format(b)}`;
  }
  return `${full.format(a)} – ${full.format(b)}`;
}

/** "16:00" → "4:00 pm". Local wall-clock time at the destination. */
export function formatLocalTime(time: string | null | undefined, locale: Locale = getLocale()): string | null {
  if (!time) return null;
  const [h, m] = time.split(':').map(Number);
  if (h === undefined || Number.isNaN(h)) return null;
  if (locale !== 'en') {
    return dateFormat(locale, { hour: 'numeric', minute: '2-digit' }).format(new Date(Date.UTC(2000, 0, 1, h, m ?? 0)));
  }
  const suffix = h >= 12 ? 'pm' : 'am';
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m ?? 0).padStart(2, '0')} ${suffix}`;
}

/** Timestamp in the viewer's timezone, e.g. "12 Sep, 4:05 pm". Render only after mount. */
export function formatTimestamp(iso: string | null | undefined, locale: Locale = getLocale()): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString(LOCALE_INFO[locale].intl, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
}

/** Clock time in the viewer's timezone, e.g. "4:05 pm". Render only after mount. */
export function formatClock(iso: string | null | undefined, locale: Locale = getLocale()): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleTimeString(LOCALE_INFO[locale].intl, { hour: 'numeric', minute: '2-digit' });
}

/** Date and time in the viewer's timezone with explicit options. Render only after mount. */
export function formatDateTime(
  value: string | number | Date | null | undefined,
  options: Intl.DateTimeFormatOptions,
  locale: Locale = getLocale(),
): string | null {
  if (value === null || value === undefined) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString(LOCALE_INFO[locale].intl, options);
}

export function formatDuration(minutes: number | null | undefined, locale: Locale = getLocale()): string | null {
  if (minutes === null || minutes === undefined) return null;
  const t = getTranslator(locale);
  if (minutes < 60) return t('format.duration.minutes', { minutes });
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? t('format.duration.hoursMinutes', { hours, minutes: rest }) : t('format.duration.hours', { hours });
}

export function formatDistance(meters: number | null | undefined, locale: Locale = getLocale()): string | null {
  if (meters === null || meters === undefined) return null;
  const t = getTranslator(locale);
  return meters < 1000
    ? t('format.distance.meters', { value: String(Math.round(meters / 10) * 10) })
    : t('format.distance.kilometers', { value: (meters / 1000).toFixed(meters < 10_000 ? 1 : 0) });
}
