import { describe, expect, it } from 'vitest';
import { describeError } from './error-messages';
import { normalizeHttpError, normalizeThrown } from './errors';

describe('normalizeHttpError', () => {
  it('reads the standard envelope, including the current version on conflicts', () => {
    const error = normalizeHttpError(409, { error: { code: 'version_conflict', message: 'Changed', current_version: 3 } });
    expect(error.kind).toBe('conflict');
    expect(error.code).toBe('version_conflict');
    expect(error.currentVersion).toBe(3);
    expect(error.retryable).toBe(false);
  });

  it('maps FastAPI validation details to camelCase field errors', () => {
    const error = normalizeHttpError(422, { detail: [{ loc: ['body', 'display_name'], msg: 'Too short', type: 'value_error' }] });
    expect(error.kind).toBe('validation');
    expect(error.fieldErrors.displayName).toBe('Too short');
  });

  it('marks server and rate-limit errors as retryable', () => {
    expect(normalizeHttpError(503, null).retryable).toBe(true);
    expect(normalizeHttpError(429, { error: { code: 'slow_down', message: 'Wait', retry_after_seconds: 30 } }).retryAfterSeconds).toBe(30);
  });
});

describe('normalizeThrown', () => {
  it('treats a fetch TypeError as a network error', () => {
    const error = normalizeThrown(new TypeError('Failed to fetch'));
    expect(error.kind).toBe('network');
    expect(error.retryable).toBe(true);
  });

  it('distinguishes timeouts from cancellations', () => {
    expect(normalizeThrown(new DOMException('aborted', 'AbortError'), true).kind).toBe('timeout');
    expect(normalizeThrown(new DOMException('aborted', 'AbortError')).kind).toBe('aborted');
  });
});

describe('describeError', () => {
  it('uses context-specific language', () => {
    const conflict = normalizeHttpError(409, { error: { code: 'version_conflict', message: 'x' } });
    expect(describeError(conflict, 'adaptation.accept').title).toBe('This update is out of date');
    expect(describeError(conflict, 'itinerary.update').title).toBe('Your itinerary changed while you were away');
  });

  it('never tells an offline SOS sender that the alert was delivered', () => {
    const description = describeError(normalizeThrown(new TypeError('offline')), 'sos.send');
    expect(description.title).toBe('Saved on this device');
    expect(description.message).toContain('112');
  });
});
