import type { Freshness } from '@/types/domain';

export type FreshnessTone = 'live' | 'application' | 'estimate' | 'snapshot' | 'unavailable' | 'stale';

export interface FreshnessDescription {
  /** Short uppercase label, e.g. "LIVE", "ESTIMATE". */
  label: string;
  tone: FreshnessTone;
  stale: boolean;
  /** "Updated 4 min ago · Visitor reports", or null when nothing is known. */
  detail: string | null;
}

const LABELS: Record<Freshness['sourceKind'], string> = {
  live: 'LIVE',
  application: 'APPLICATION DATA',
  estimate: 'ESTIMATE',
  snapshot: 'OFFLINE SNAPSHOT',
  unavailable: 'UNAVAILABLE',
};

export function relativeTime(iso: string | null | undefined, now = Date.now()): string | null {
  if (!iso) return null;
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return null;
  const seconds = Math.round((now - then) / 1000);
  if (seconds < -60) {
    const ahead = Math.round(-seconds / 60);
    return ahead < 60 ? `in ${ahead} min` : `in ${Math.round(ahead / 60)} h`;
  }
  if (seconds < 45) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days} d ago`;
  return new Date(then).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

/**
 * Describes where a changing value came from and whether it is still current.
 * Live data past its stale window is never presented as live.
 */
export function describeFreshness(freshness: Freshness | null | undefined, now = Date.now()): FreshnessDescription {
  if (!freshness || freshness.sourceKind === 'unavailable') {
    return { label: LABELS.unavailable, tone: 'unavailable', stale: false, detail: null };
  }
  const updated = freshness.updatedAt ? Date.parse(freshness.updatedAt) : NaN;
  const staleAfter = freshness.staleAfterSeconds ?? null;
  const stale = Boolean(staleAfter && Number.isFinite(updated) && now - updated > staleAfter * 1000);
  const when = relativeTime(freshness.updatedAt, now);
  const detail = [when ? `Updated ${when}` : null, freshness.sourceLabel ?? null].filter(Boolean).join(' · ') || null;
  if (stale) return { label: 'STALE', tone: 'stale', stale: true, detail };
  return { label: LABELS[freshness.sourceKind], tone: freshness.sourceKind, stale: false, detail };
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

export const LOCATION_FRESHNESS_LABEL: Record<LocationFreshness, string> = {
  live: 'LIVE',
  recent: 'RECENT',
  stale: 'STALE',
  last_known: 'LAST KNOWN',
  none: 'NO LOCATION YET',
};
