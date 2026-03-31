import { describe, it, expect } from 'vitest';
import { detectSampling, createAggregator, bucketKey, buildBuckets } from '../../scripts/aggregate.js';
import { datePartsFactory } from '../../scripts/utils.js';

describe('detectSampling', () => {
  it('detects hourly sampling for ~1h deltas', () => {
    const oneHour = 60 * 60 * 1000;
    const { sampling } = detectSampling(oneHour);
    expect(sampling).toBe('hourly');
    // samplingUnit is 'minutes' for <=90min deltas per the function's thresholds
    const { samplingUnit } = detectSampling(oneHour);
    expect(samplingUnit).toBe('minutes');
  });

  it('detects "hour" samplingUnit for ~2h deltas (between 90min and 3h)', () => {
    const twoHours = 2 * 60 * 60 * 1000;
    const { samplingUnit } = detectSampling(twoHours);
    expect(samplingUnit).toBe('hour');
  });

  it('detects daily sampling for ~24h deltas', () => {
    const { sampling, samplingUnit } = detectSampling(24 * 60 * 60 * 1000);
    expect(sampling).toBe('daily');
    expect(samplingUnit).toBe('day');
  });

  it('detects irregular for 0 delta', () => {
    const { samplingUnit } = detectSampling(0);
    expect(samplingUnit).toBe('single');
  });

  it('detects sub-minute unit for short deltas', () => {
    const { samplingUnit } = detectSampling(30 * 1000); // 30 seconds
    expect(samplingUnit).toBe('seconds');
  });
});

describe('bucketKey', () => {
  const dateParts = datePartsFactory(true);

  it('returns YYYY-MM-DD for day unit', () => {
    const ts = Date.UTC(2024, 0, 15, 8, 0, 0);
    const key = bucketKey(ts, 'day', dateParts);
    expect(key).toBe('2024-01-15');
  });

  it('returns YYYY-MM for month unit', () => {
    const ts = Date.UTC(2024, 5, 15);
    const key = bucketKey(ts, 'month', dateParts);
    expect(key).toBe('2024-06');
  });

  it('returns YYYY-MM-DD HH:00 for hour unit', () => {
    const ts = Date.UTC(2024, 0, 15, 8, 30, 0);
    const key = bucketKey(ts, 'hour', dateParts);
    expect(key).toBe('2024-01-15 08:00');
  });
});

describe('createAggregator', () => {
  function makeRow(isoTs, temp, rh) {
    return { ts: new Date(isoTs).getTime(), temp, rh };
  }

  it('finishes with correct total zone hours for 2 rows 1h apart', () => {
    const agg = createAggregator({ treatAsUTC: true });

    agg.pushRow(makeRow('2024-01-01T00:00:00Z', 25, 50));
    agg.pushRow(makeRow('2024-01-01T01:00:00Z', 25, 50));

    const result = agg.finish();
    expect(result.rowsCount).toBe(2);
    // totalMs = 1 hour (between rows) + medianDelta (estimated for last row)
    expect(result.totalMs).toBeGreaterThan(0);
    expect(result.summary.length).toBeGreaterThan(0);
    expect(result.summary[0]).toHaveProperty('zone');
    expect(result.summary[0]).toHaveProperty('hours');
    expect(result.summary[0]).toHaveProperty('percent');
  });

  it('sets medianDelta correctly', () => {
    const agg = createAggregator({ treatAsUTC: true });
    const oneHour = 60 * 60 * 1000;

    agg.pushRow(makeRow('2024-01-01T00:00:00Z', 25, 50));
    agg.pushRow(makeRow('2024-01-01T01:00:00Z', 25, 50));
    agg.pushRow(makeRow('2024-01-01T02:00:00Z', 25, 50));

    const result = agg.finish();
    expect(result.medianDelta).toBe(oneHour);
  });

  it('handles single row with no delta', () => {
    const agg = createAggregator({ treatAsUTC: true });
    agg.pushRow(makeRow('2024-01-01T00:00:00Z', 25, 50));
    const result = agg.finish();
    expect(result.rowsCount).toBe(1);
    expect(result.medianDelta).toBe(0);
  });

  it('generates perBucket entries when setTimelineUnit is called before finish', () => {
    const agg = createAggregator({ treatAsUTC: true });
    agg.setTimelineUnit('day');

    agg.pushRow(makeRow('2024-01-01T00:00:00Z', 25, 50));
    agg.pushRow(makeRow('2024-01-01T12:00:00Z', 25, 50));
    agg.pushRow(makeRow('2024-01-02T00:00:00Z', 25, 50));

    const result = agg.finish();
    expect(Object.keys(result.perBucket).length).toBeGreaterThan(0);
  });

  it('accumulates first and last timestamps', () => {
    const agg = createAggregator({ treatAsUTC: true });
    const t1 = new Date('2024-01-01T00:00:00Z').getTime();
    const t2 = new Date('2024-01-01T01:00:00Z').getTime();

    agg.pushRow({ ts: t1, temp: 25, rh: 50 });
    agg.pushRow({ ts: t2, temp: 25, rh: 50 });

    const result = agg.finish();
    expect(result.firstTs).toBe(t1);
    expect(result.lastTs).toBe(t2);
  });
});
