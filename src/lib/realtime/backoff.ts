export interface BackoffOptions {
  baseMs: number;
  maxMs: number;
}

export const DEFAULT_BACKOFF: BackoffOptions = { baseMs: 1000, maxMs: 30_000 };

/**
 * Exponential backoff with "equal jitter": half the window is fixed, half is
 * random, so a fleet of clients reconnecting after an outage spreads out
 * without any single client waiting close to zero.
 */
export function backoffDelay(attempt: number, options: BackoffOptions = DEFAULT_BACKOFF, random: () => number = Math.random) {
  const exponent = Math.max(0, attempt - 1);
  const window = Math.min(options.maxMs, options.baseMs * 2 ** exponent);
  return Math.round(window / 2 + random() * (window / 2));
}
