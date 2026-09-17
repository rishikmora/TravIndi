import type { Locale } from '@/i18n/config';
import { getLocale, getTranslator } from '@/i18n/runtime';
import type { Freshness } from '@/types/domain';
import { formatDateTime } from './dates';

export type FreshnessTone = 'live' | 'application' | 'estimate' | 'snapshot' | 'unavailable' | 'stale';

export interface FreshnessDescription {
  /** Short label, e.g. "LIVE", "ESTIMATE". */
  label: string;
  tone: FreshnessTone;
  stale: boolean;
  /** "Updated 4 min ago · Visitor reports", or null when nothing is known. */
  detail: string | null;
}

export function relativeTime(iso: string | null | undefined, now = Date.now(), locale: Locale = getLocale()): string | null {
  if (!iso) return null;
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return null;
  const t = getTranslator(locale);
  const seconds = Math.round((now - then) / 1000);
  if (seconds < -60) {
    const ahead = Math.round(-seconds / 60);
    return ahead < 60 ? t('format.relative.inMinutes', { count: ahead }) : t('format.relative.inHours', { count: Math.round(ahead / 60) });
  }
  if (seconds < 45) return t('format.relative.justNow');
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return t('format.relative.minutesAgo', { count: minutes });
  const hours = Math.round(minutes / 60);
  if (hours < 24) return t('format.relative.hoursAgo', { count: hours });
  const days = Math.round(hours / 24);
  if (days < 7) return t('format.relative.daysAgo', { count: days });
  return formatDateTime(then, { day: 'numeric', month: 'short' }, locale);
}

/**
 * Describes where a changing value came from and whether it is still current.
 * Live data past its stale window is never presented as live.
 */
export function describeFreshness(
  freshness: Freshness | null | undefined,
  now = Date.now(),
  locale: Locale = getLocale(),
): FreshnessDescription {
  const t = getTranslator(locale);
  if (!freshness || freshness.sourceKind === 'unavailable') {
    return { label: t('format.freshness.unavailable'), tone: 'unavailable', stale: false, detail: null };
  }
  const updated = freshness.updatedAt ? Date.parse(freshness.updatedAt) : NaN;
  const staleAfter = freshness.staleAfterSeconds ?? null;
  const stale = Boolean(staleAfter && Number.isFinite(updated) && now - updated > staleAfter * 1000);
  const when = relativeTime(freshness.updatedAt, now, locale);
  const detail = [when ? t('format.freshness.updated', { when }) : null, freshness.sourceLabel ?? null].filter(Boolean).join(' · ') || null;
  if (stale) return { label: t('format.freshness.stale'), tone: 'stale', stale: true, detail };
  return { label: t(`format.freshness.${freshness.sourceKind}`), tone: freshness.sourceKind, stale: false, detail };
}

export type LocationFreshness = 'live' | 'recent' | 'stale' | 'last_known' | 'none';

/** LIVE < 1 min · RECENT < 5 min · STALE < 30 min · LAST KNOWN beyond that. */
export function locationFreshness(recordedAt: string | null | undefined, now = Date.now()): LocationFreshness {
  if (!recordedAt) return 'none';
  const age = now - Date.parse(recordedAt);
  if (!Number.isFinite(age)) return 'none';
  if (age < 60_000) return 'live';
  if (age < 5 * 60_000) return 'recent';
  if (age < 30 * 60_000) return 'stale';
  return 'last_known';
}

export function locationFreshnessLabel(value: LocationFreshness, locale: Locale = getLocale()): string {
  return getTranslator(locale)(`format.locationFreshness.${value}`);
}
