import { describe, it, expect } from 'vitest';
import { parseNumberSafe, datePartsFactory, humanizePeriod } from '../../scripts/utils.js';

describe('parseNumberSafe', () => {
  it('returns the numeric value of a valid number string', () => {
    expect(parseNumberSafe('42')).toBe(42);
    expect(parseNumberSafe('3.14')).toBe(3.14);
  });

  it('returns NaN for non-numeric strings', () => {
    expect(isNaN(parseNumberSafe('abc'))).toBe(true);
  });

  it('returns 0 for empty string (Number(\'\') === 0 which is finite)', () => {
    expect(parseNumberSafe('')).toBe(0);
  });

  it('handles numeric input directly', () => {
    expect(parseNumberSafe(100)).toBe(100);
  });

  it('returns NaN for Infinity', () => {
    expect(isNaN(parseNumberSafe(Infinity))).toBe(true);
  });

  it('returns 0 for null (Number(null) === 0 which is finite)', () => {
    expect(parseNumberSafe(null)).toBe(0);
  });
});

describe('datePartsFactory', () => {
  it('returns correct UTC parts when treatAsUTC=true', () => {
    const getParts = datePartsFactory(true);
    // 2024-06-15T12:30:45Z
    const ts = Date.UTC(2024, 5, 15, 12, 30, 45);
    const parts = getParts(ts);
    expect(parts.year).toBe(2024);
    expect(parts.month).toBe(6); // June
    expect(parts.day).toBe(15);
    expect(parts.hours).toBe(12);
    expect(parts.minutes).toBe(30);
    expect(parts.seconds).toBe(45);
  });

  it('returns local parts when treatAsUTC=false', () => {
    const getParts = datePartsFactory(false);
    const d = new Date(2024, 5, 15, 8, 0, 0); // local time
    const parts = getParts(d.getTime());
    expect(parts.year).toBe(2024);
    expect(parts.month).toBe(6);
    expect(parts.day).toBe(15);
    expect(parts.hours).toBe(8);
  });

  it('produces different factory instances independently', () => {
    const utc = datePartsFactory(true);
    const local = datePartsFactory(false);
    // Just verify both return objects with year
    const ts = Date.UTC(2024, 0, 1, 0, 0, 0);
    expect(utc(ts)).toHaveProperty('year');
    expect(local(ts)).toHaveProperty('year');
  });
});

describe('humanizePeriod', () => {
  it('returns "per-month" for "month"', () => {
    expect(humanizePeriod('month')).toBe('per-month');
  });

  it('returns "per-day" for "day"', () => {
    expect(humanizePeriod('day')).toBe('per-day');
  });

  it('returns "per-hour" for "hour"', () => {
    expect(humanizePeriod('hour')).toBe('per-hour');
  });

  it('returns the input unchanged for unknown units', () => {
    expect(humanizePeriod('week')).toBe('week');
    expect(humanizePeriod('')).toBe('');
  });
});
