import { describe, it, expect, vi } from 'vitest';
import {
  prepareChartData,
  getZoneColor,
  getZoneById,
  formatTemperature,
  formatHumidity,
  formatHours,
  formatPercent,
  createTooltipHTML,
  debounce
} from '../../scripts/ui-bridge.js';

describe('getZoneColor', () => {
  it('returns the color for a known zone', () => {
    const color = getZoneColor('Comfort');
    expect(typeof color).toBe('string');
    expect(color).toMatch(/^#[0-9a-fA-F]{6}$/);
  });

  it('returns #999999 for an unknown zone', () => {
    expect(getZoneColor('NonexistentZone')).toBe('#999999');
  });
});

describe('getZoneById', () => {
  it('returns the zone object for a known zone id', () => {
    const zone = getZoneById('Comfort');
    expect(zone).toBeDefined();
    expect(zone.id).toBe('Comfort');
  });

  it('returns undefined for an unknown zone id', () => {
    expect(getZoneById('Unknown')).toBeUndefined();
  });
});

describe('prepareChartData', () => {
  it('maps rows to chart format', () => {
    const rows = [
      { temp: 25, rh: 50, zone: 'Comfort', ts: 1700000000000 }
    ];
    const result = prepareChartData(rows);
    expect(result).toHaveLength(1);
    expect(result[0].x).toBe(25);
    expect(result[0].y).toBe(50);
    expect(result[0].zone).toBe('Comfort');
    expect(typeof result[0].color).toBe('string');
  });

  it('handles empty array', () => {
    expect(prepareChartData([])).toEqual([]);
  });
});

describe('formatTemperature', () => {
  it('formats to 1 decimal place with °C suffix', () => {
    expect(formatTemperature(25.5)).toBe('25.5°C');
    expect(formatTemperature(20)).toBe('20.0°C');
  });
});

describe('formatHumidity', () => {
  it('formats to 0 decimal places with % suffix', () => {
    expect(formatHumidity(50.7)).toBe('51%');
    expect(formatHumidity(30)).toBe('30%');
  });
});

describe('formatHours', () => {
  it('formats to 1 decimal place with " hours" suffix', () => {
    expect(formatHours(120.5)).toBe('120.5 hours');
    expect(formatHours(8)).toBe('8.0 hours');
  });
});

describe('formatPercent', () => {
  it('formats to 1 decimal place with % suffix', () => {
    expect(formatPercent(15.2)).toBe('15.2%');
    expect(formatPercent(100)).toBe('100.0%');
  });
});

describe('createTooltipHTML', () => {
  it('returns an HTML string containing zone name, temperature, and humidity', () => {
    const point = { x: 25, y: 50, zone: 'Comfort', timestamp: 1700000000000 };
    const html = createTooltipHTML(point);
    expect(typeof html).toBe('string');
    expect(html).toContain('Comfort');
    expect(html).toContain('25.0°C');
    expect(html).toContain('50%');
  });

  it('handles an unknown zone gracefully', () => {
    const point = { x: 30, y: 40, zone: 'MysteryZone', timestamp: 1700000000000 };
    const html = createTooltipHTML(point);
    expect(html).toContain('Unknown');
  });
});

describe('debounce', () => {
  it('calls the function only after the wait period', async () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const debounced = debounce(fn, 100);

    debounced();
    debounced();
    debounced();
    expect(fn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});
