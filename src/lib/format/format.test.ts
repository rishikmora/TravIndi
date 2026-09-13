import { describe, expect, it } from 'vitest';
import { formatDateRange, formatLocalTime } from './dates';
import { describeFreshness, locationFreshness } from './freshness';
import { describeCost } from './money';

const inr = (rupees: number) => ({ amountMinor: rupees * 100, currency: 'INR' });

describe('describeCost', () => {
  it('shows unknown costs as unavailable, never as zero', () => {
    expect(describeCost({ status: 'unavailable', value: null }).label).toBe('Cost unavailable');
    expect(describeCost(null).label).toBe('Cost unavailable');
  });

  it('labels estimates as a range', () => {
    const cost = describeCost({ status: 'estimate', value: null, min: inr(300), max: inr(700) });
    expect(cost.status).toBe('estimate');
    expect(cost.label).toBe('₹300–₹700');
  });

  it('formats authoritative prices in Indian notation', () => {
    expect(describeCost({ status: 'authoritative', value: inr(4800) }).label).toBe('₹4,800');
  });
});

describe('freshness', () => {
  const now = Date.parse('2026-09-12T12:00:00Z');
  const ago = (ms: number) => new Date(now - ms).toISOString();

  it('grades location age', () => {
    expect(locationFreshness(ago(30_000), now)).toBe('live');
    expect(locationFreshness(ago(3 * 60_000), now)).toBe('recent');
    expect(locationFreshness(ago(10 * 60_000), now)).toBe('stale');
    expect(locationFreshness(ago(2 * 3_600_000), now)).toBe('last_known');
    expect(locationFreshness(null, now)).toBe('none');
  });

  it('never presents expired live data as live', () => {
    const described = describeFreshness({ sourceKind: 'live', updatedAt: ago(3_600_000), staleAfterSeconds: 60, sourceLabel: 'Sensor' }, now);
    expect(described.label).toBe('STALE');
    expect(described.stale).toBe(true);
  });

  it('labels missing freshness as unavailable', () => {
    expect(describeFreshness(null, now).label).toBe('UNAVAILABLE');
  });
});

describe('dates', () => {
  it('formats local times and ranges without timezone drift', () => {
    expect(formatLocalTime('16:00')).toBe('4:00 pm');
    expect(formatLocalTime('00:30')).toBe('12:30 am');
    expect(formatDateRange('2026-09-11', '2026-09-14')).toMatch(/^11–14 Sept? 2026$/);
  });
});
