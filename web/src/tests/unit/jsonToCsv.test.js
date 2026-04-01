import { describe, it, expect } from 'vitest';
import { jsonToCsv } from '../../utils/jsonToCsv.js';

describe('jsonToCsv', () => {
  describe('Open-Meteo payload (hourly object)', () => {
    const payload = {
      hourly: {
        time: ['2024-01-01T00:00', '2024-01-01T01:00'],
        temperature_2m: [20, 21],
        relative_humidity_2m: [50, 55]
      }
    };

    it('produces a CSV string', () => {
      const csv = jsonToCsv(payload);
      expect(typeof csv).toBe('string');
    });

    it('has the correct header row', () => {
      const lines = jsonToCsv(payload).split('\n');
      expect(lines[0]).toBe('time,temperature_2m,relative_humidity_2m');
    });

    it('has the correct number of data rows', () => {
      const lines = jsonToCsv(payload).split('\n');
      expect(lines).toHaveLength(3); // header + 2 data rows
    });

    it('renders null values as empty string', () => {
      const p = { hourly: { time: ['2024-01-01T00:00'], temperature_2m: [null] } };
      const lines = jsonToCsv(p).split('\n');
      expect(lines[1]).toBe('2024-01-01T00:00,');
    });
  });

  describe('Array of objects payload', () => {
    const payload = [
      { a: 1, b: 2 },
      { a: 3, b: 4 }
    ];

    it('extracts keys as headers', () => {
      const lines = jsonToCsv(payload).split('\n');
      expect(lines[0]).toContain('a');
      expect(lines[0]).toContain('b');
    });

    it('has all data rows', () => {
      const lines = jsonToCsv(payload).split('\n');
      expect(lines).toHaveLength(3);
    });

    it('handles null values in objects', () => {
      const p = [{ a: null, b: 'hello' }];
      const lines = jsonToCsv(p).split('\n');
      expect(lines[1]).toContain('hello');
    });
  });

  describe('Generic object with array columns', () => {
    const payload = {
      temperature: [20, 21, 22],
      humidity: [50, 55, 60]
    };

    it('uses column keys as headers', () => {
      const lines = jsonToCsv(payload).split('\n');
      expect(lines[0]).toContain('temperature');
      expect(lines[0]).toContain('humidity');
    });

    it('has correct number of rows', () => {
      const lines = jsonToCsv(payload).split('\n');
      expect(lines).toHaveLength(4); // header + 3 rows
    });
  });

  describe('Edge cases', () => {
    it('returns empty string for null input', () => {
      expect(jsonToCsv(null)).toBe('');
    });

    it('returns empty string for undefined input', () => {
      expect(jsonToCsv(undefined)).toBe('');
    });

    it('falls back to JSON for unsupported structure', () => {
      const result = jsonToCsv({ foo: 'bar' }); // no array values
      expect(result).toContain('foo');
    });
  });
});
