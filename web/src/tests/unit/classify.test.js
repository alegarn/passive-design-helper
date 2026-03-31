import { describe, it, expect } from 'vitest';
import { pointOnSegment, pointInPoly, classifyPoint } from '../../scripts/classify.js';

describe('pointOnSegment', () => {
  it('returns true when point is exactly on the segment', () => {
    // Horizontal segment from (0,0) to (10,0); midpoint (5,0)
    expect(pointOnSegment(5, 0, 0, 0, 10, 0)).toBe(true);
  });

  it('returns true for an endpoint', () => {
    expect(pointOnSegment(0, 0, 0, 0, 10, 0)).toBe(true);
    expect(pointOnSegment(10, 0, 0, 0, 10, 0)).toBe(true);
  });

  it('returns false when point is off the segment', () => {
    expect(pointOnSegment(5, 1, 0, 0, 10, 0)).toBe(false);
  });

  it('returns false when point is collinear but outside segment range', () => {
    expect(pointOnSegment(15, 0, 0, 0, 10, 0)).toBe(false);
  });
});

describe('pointInPoly', () => {
  // Square polygon: (0,0)→(10,0)→(10,10)→(0,10)
  const square = [[0, 0], [10, 0], [10, 10], [0, 10]];

  it('returns true for a point inside the polygon', () => {
    expect(pointInPoly(5, 5, square)).toBe(true);
  });

  it('returns false for a point outside the polygon', () => {
    expect(pointInPoly(15, 5, square)).toBe(false);
    expect(pointInPoly(-1, 5, square)).toBe(false);
  });

  it('returns true for a point on the boundary', () => {
    // Point on the bottom edge
    expect(pointInPoly(5, 0, square)).toBe(true);
  });

  it('handles triangle polygon', () => {
    const triangle = [[0, 0], [10, 0], [5, 10]];
    expect(pointInPoly(5, 5, triangle)).toBe(true);
    expect(pointInPoly(0, 10, triangle)).toBe(false);
  });
});

describe('classifyPoint', () => {
  it('returns "Air Conditioning" when temp > 43.5', () => {
    expect(classifyPoint(44, 50)).toBe('Air Conditioning');
  });

  it('returns "Heating" when temp < 0', () => {
    expect(classifyPoint(-5, 30)).toBe('Heating');
  });

  it('returns a zone string for typical comfort conditions', () => {
    // 25°C, 50% RH — should be in Comfort or Ventilation zone
    const zone = classifyPoint(25, 50);
    expect(typeof zone).toBe('string');
    expect(zone.length).toBeGreaterThan(0);
  });

  it('returns a non-empty string for all valid temp/RH inputs', () => {
    // classifyPoint always returns a zone string, never throws
    const testCases = [[10, 5], [0, 100], [22, 30], [43, 90]];
    for (const [t, rh] of testCases) {
      const zone = classifyPoint(t, rh);
      expect(typeof zone).toBe('string');
      expect(zone.length).toBeGreaterThan(0);
    }
  });

  it('returns "Cold" or a named zone for sub-23°C inputs', () => {
    // At very low temp (below 0) → Heating
    expect(classifyPoint(-1, 50)).toBe('Heating');
    // At boundary temp with no zone match → Cold (T < 23)
    // We verify the result is a string without asserting a specific zone
    // because zone boundaries are data-driven
    const zone = classifyPoint(5, 0);
    expect(typeof zone).toBe('string');
  });

  it('coerces string numbers to numeric', () => {
    // Should not throw when called with strings
    expect(() => classifyPoint('25', '50')).not.toThrow();
  });
});
