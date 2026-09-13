import { describe, expect, it } from 'vitest';
import { camelizeKeys, snakeizeKeys } from './case';

describe('case conversion', () => {
  it('converts nested wire objects to domain shape and back', () => {
    const wire = { trip_id: 't1', days: [{ day_number: 1, items: [{ start_time: '09:00' }] }], cost: null };
    const domain = camelizeKeys(wire);
    expect(domain).toEqual({ tripId: 't1', days: [{ dayNumber: 1, items: [{ startTime: '09:00' }] }], cost: null });
    expect(snakeizeKeys(domain)).toEqual(wire);
  });

  it('leaves values (including snake_case strings) untouched', () => {
    expect(camelizeKeys({ status: 'payment_pending' })).toEqual({ status: 'payment_pending' });
  });
});
