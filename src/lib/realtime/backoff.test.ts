import { describe, expect, it } from 'vitest';
import { backoffDelay } from './backoff';

describe('backoffDelay', () => {
  const options = { baseMs: 1000, maxMs: 30_000 };

  it('grows exponentially with equal jitter', () => {
    expect(backoffDelay(1, options, () => 0)).toBe(500);
    expect(backoffDelay(1, options, () => 1)).toBe(1000);
    expect(backoffDelay(3, options, () => 0)).toBe(2000);
  });

  it('never exceeds the maximum window', () => {
    for (let attempt = 1; attempt < 20; attempt++) {
      const delay = backoffDelay(attempt, options, Math.random);
      expect(delay).toBeGreaterThanOrEqual(Math.min(options.maxMs, options.baseMs * 2 ** (attempt - 1)) / 2);
      expect(delay).toBeLessThanOrEqual(options.maxMs);
    }
  });
});
