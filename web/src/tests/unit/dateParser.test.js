import { describe, it, expect } from 'vitest';
import {
  tryParseDate,
  detectDayFirstFromSamples,
  normalizeToUTC,
  parseTimestampOrThrow
} from '../../scripts/dateParser.js';

describe('tryParseDate', () => {
  it('parses an ISO 8601 date string', () => {
    const result = tryParseDate('2024-01-15T10:00:00Z', false);
    expect(result).toBe(new Date('2024-01-15T10:00:00Z').getTime());
  });

  it('parses a month-first slash-separated date', () => {
    const result = tryParseDate('01/15/2024', false);
    expect(new Date(result).getUTCFullYear()).toBe(2024);
    expect(new Date(result).getUTCMonth()).toBe(0); // January
  });

  it('parses a day-first date when preferDayFirst=true', () => {
    // "15/01/2024" must be treated as day=15, month=01
    const result = tryParseDate('15/01/2024', true);
    const d = new Date(result);
    // Year must be 2024, month must be January
    expect(d.getUTCFullYear()).toBe(2024);
    expect(d.getUTCMonth()).toBe(0);
  });

  it('returns NaN for empty string', () => {
    expect(isNaN(tryParseDate('', false))).toBe(true);
  });

  it('returns NaN for null', () => {
    expect(isNaN(tryParseDate(null, false))).toBe(true);
  });

  it('returns NaN for garbage string', () => {
    expect(isNaN(tryParseDate('not-a-date', false))).toBe(true);
  });

  it('parses date with time part (using ISO format for timezone stability)', () => {
    // Use ISO format to avoid timezone-dependent UTC offset issues
    const result = tryParseDate('2024-01-15T08:30:00Z', false);
    const d = new Date(result);
    expect(d.getUTCHours()).toBe(8);
    expect(d.getUTCMinutes()).toBe(30);
  });
});

describe('detectDayFirstFromSamples', () => {
  it('detects day-first when first component is >12', () => {
    const samples = ['15/01/2024', '16/01/2024', '17/01/2024'];
    expect(detectDayFirstFromSamples(samples, '')).toBe(true);
  });

  it('returns false for ISO-format samples', () => {
    const samples = ['2024-01-15', '2024-01-16', '2024-01-17'];
    expect(detectDayFirstFromSamples(samples, '')).toBe(false);
  });

  it('returns false for unambiguous month-first samples', () => {
    // all 01/XX/YYYY - can't tell just from values <=12
    const samples = ['01/05/2024', '02/05/2024', '03/05/2024'];
    expect(detectDayFirstFromSamples(samples, '')).toBe(false);
  });

  it('handles empty array without throwing', () => {
    expect(() => detectDayFirstFromSamples([], '')).not.toThrow();
  });

  it('returns false for empty array', () => {
    expect(detectDayFirstFromSamples([], '')).toBe(false);
  });
});

describe('normalizeToUTC', () => {
  it('returns tsMs unchanged when treatAsUTC=false', () => {
    const ts = Date.now();
    expect(normalizeToUTC(ts, false)).toBe(ts);
  });

  it('converts local time to UTC when treatAsUTC=true', () => {
    // Create a timestamp at midnight local
    const local = new Date(2024, 0, 15, 0, 0, 0, 0); // local midnight
    const result = normalizeToUTC(local.getTime(), true);
    // Result should be UTC midnight on same calendar date
    const d = new Date(result);
    expect(d.getUTCFullYear()).toBe(2024);
    expect(d.getUTCMonth()).toBe(0);
    expect(d.getUTCDate()).toBe(15);
  });
});

describe('parseTimestampOrThrow', () => {
  it('parses a valid ISO string', () => {
    const ts = parseTimestampOrThrow('2024-06-01T00:00:00Z', false);
    expect(ts).toBe(new Date('2024-06-01T00:00:00Z').getTime());
  });

  it('throws on unparseable string', () => {
    expect(() => parseTimestampOrThrow('not-a-date', false)).toThrow('DateParseError');
  });

  it('parses numeric string as milliseconds', () => {
    const ms = 1700000000000;
    const result = parseTimestampOrThrow(String(ms), false);
    expect(result).toBe(ms);
  });

  it('forces day-first when preferDayFirst=true', () => {
    const ts = parseTimestampOrThrow('15/01/2024', true);
    const d = new Date(ts);
    expect(d.getUTCMonth()).toBe(0); // January
  });
});
