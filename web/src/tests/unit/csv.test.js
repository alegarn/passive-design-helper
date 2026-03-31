import { describe, it, expect } from 'vitest';
import { csvSplitLine, parseHeader, findBestColumn } from '../../scripts/csv.js';

describe('csvSplitLine', () => {
  it('splits a simple comma-separated line', () => {
    expect(csvSplitLine('a,b,c')).toEqual(['a', 'b', 'c']);
  });

  it('handles quoted fields containing commas', () => {
    expect(csvSplitLine('"a,b",c')).toEqual(['a,b', 'c']);
  });

  it('handles escaped double-quotes inside quoted fields', () => {
    expect(csvSplitLine('"say ""hello""",world')).toEqual(['say "hello"', 'world']);
  });

  it('handles trailing comma (empty last field)', () => {
    expect(csvSplitLine('a,b,')).toEqual(['a', 'b', '']);
  });

  it('handles leading comma (empty first field)', () => {
    expect(csvSplitLine(',b,c')).toEqual(['', 'b', 'c']);
  });

  it('handles consecutive commas (empty middle field)', () => {
    expect(csvSplitLine('a,,c')).toEqual(['a', '', 'c']);
  });

  it('handles a single field with no comma', () => {
    expect(csvSplitLine('hello')).toEqual(['hello']);
  });

  it('returns one empty string for empty input', () => {
    expect(csvSplitLine('')).toEqual(['']);
  });
});

describe('parseHeader', () => {
  it('parses and lowercases headers from the first line', () => {
    expect(parseHeader(['Temperature,Humidity,Date'])).toEqual(['temperature', 'humidity', 'date']);
  });

  it('throws an error when given an empty array', () => {
    expect(() => parseHeader([])).toThrow('No lines provided for header parsing');
  });

  it('trims whitespace from headers', () => {
    expect(parseHeader([' Temp , RH , Date '])).toEqual(['temp', 'rh', 'date']);
  });

  it('uses only the first line, ignoring subsequent lines', () => {
    expect(parseHeader(['a,b,c', 'x,y,z'])).toEqual(['a', 'b', 'c']);
  });
});

describe('findBestColumn', () => {
  const headers = ['timestamp', 'dry_bulb_temp', 'relative_humidity', 'wind_speed'];

  it('returns the correct index when a candidate matches', () => {
    expect(findBestColumn(headers, ['humidity'])).toBe(2);
  });

  it('returns -1 when no candidate matches', () => {
    expect(findBestColumn(headers, ['pressure', 'solar'])).toBe(-1);
  });

  it('returns the index of the first matching candidate', () => {
    // 'wind' matches index 3, 'temp' matches index 1 — 'wind' is listed first
    expect(findBestColumn(headers, ['wind', 'temp'])).toBe(3);
  });

  it('does not match a candidate that only differs in case', () => {
    // headers are lowercase; uppercase candidate should not match
    expect(findBestColumn(headers, ['Temp'])).toBe(-1);
  });
});
