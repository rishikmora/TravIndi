import { describe, expect, it } from 'vitest';
import { extractIntent } from './intent';

describe('extractIntent (development stand-in)', () => {
  it('extracts what the text states and asks about what it implies', () => {
    const result = extractIntent({ text: '4 days in Hyderabad with my parents — temples and food, not too much walking' }, null);
    expect(result.intent.days).toBe(4);
    expect(result.intent.destination_id).toBe('dst_hyderabad');
    expect(result.intent.interests).toEqual(expect.arrayContaining(['temples', 'food']));
    expect(result.intent.accessibility?.low_walking).toBe(true);
    expect(result.ambiguities.map((a) => a.field)).toContain('travellers');
    expect(result.missing_fields).toContain('start_date');
  });

  it('asks when days and nights disagree instead of guessing', () => {
    const result = extractIntent({ text: '3 days and 5 nights in Jaipur' }, null);
    expect(result.ambiguities.find((a) => a.field === 'nights')).toBeDefined();
  });

  it('asks which destination when several are mentioned', () => {
    const result = extractIntent({ text: 'A week covering Jaipur and Varanasi' }, null);
    expect(result.intent.destination_id).toBeUndefined();
    expect(result.ambiguities.find((a) => a.field === 'destination')?.options.length).toBeGreaterThanOrEqual(2);
  });

  it('reads rupee budgets without inventing a per-day split', () => {
    const result = extractIntent({ text: 'Relaxed weekend in Kochi under ₹25,000' }, null);
    expect(result.intent.budget?.ceiling?.amount_minor).toBe(25_000_00);
    expect(result.intent.budget?.per).toBe('trip');
    expect(result.intent.pace).toBe('relaxed');
  });
});
