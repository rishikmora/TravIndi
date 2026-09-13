/** Accepts only same-origin relative paths for post-sign-in redirects (no open redirects). */
export function safeNextPath(value: string | string[] | undefined, fallback = '/trips'): string {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw || !raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) return fallback;
  if (/^\/(login|register)(\/|\?|$)/.test(raw)) return fallback;
  return raw;
}
