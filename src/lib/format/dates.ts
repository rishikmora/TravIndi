/*
 * Calendar dates ("YYYY-MM-DD") are formatted in UTC so they never shift a day
 * with the viewer's timezone, and server and client render identical text.
 */

const dayMonth = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const dayMonthYear = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const weekdayDayMonth = new Intl.DateTimeFormat('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });

const parseDate = (iso: string) => new Date(`${iso}T00:00:00Z`);

export function formatDate(iso: string | null | undefined, withYear = true): string | null {
  if (!iso) return null;
  return (withYear ? dayMonthYear : dayMonth).format(parseDate(iso));
}

export function formatDayHeading(iso: string | null | undefined): string | null {
  return iso ? weekdayDayMonth.format(parseDate(iso)) : null;
}

export function formatDateRange(start: string | null | undefined, end: string | null | undefined): string | null {
  if (!start) return null;
  if (!end || end === start) return formatDate(start);
  const a = parseDate(start);
  const b = parseDate(end);
  if (a.getUTCFullYear() === b.getUTCFullYear()) {
    if (a.getUTCMonth() === b.getUTCMonth()) return `${a.getUTCDate()}–${dayMonthYear.format(b)}`;
    return `${dayMonth.format(a)} – ${dayMonthYear.format(b)}`;
  }
  return `${dayMonthYear.format(a)} – ${dayMonthYear.format(b)}`;
}

/** "16:00" → "4:00 pm". Local wall-clock time at the destination. */
export function formatLocalTime(time: string | null | undefined): string | null {
  if (!time) return null;
  const [h, m] = time.split(':').map(Number);
  if (h === undefined || Number.isNaN(h)) return null;
  const suffix = h >= 12 ? 'pm' : 'am';
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m ?? 0).padStart(2, '0')} ${suffix}`;
}

/** Timestamp in the viewer's locale, e.g. "12 Sep, 4:05 pm". Render only after mount. */
export function formatTimestamp(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
}

export function formatDuration(minutes: number | null | undefined): string | null {
  if (minutes === null || minutes === undefined) return null;
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

export function formatDistance(meters: number | null | undefined): string | null {
  if (meters === null || meters === undefined) return null;
  return meters < 1000 ? `${Math.round(meters / 10) * 10} m` : `${(meters / 1000).toFixed(meters < 10_000 ? 1 : 0)} km`;
}
