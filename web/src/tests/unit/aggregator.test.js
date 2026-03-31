import { describe, it, expect } from 'vitest';
import { aggregateByHour } from '../../utils/timeSeriesAggregator.js';

describe('Time Series Aggregator', () => {
  const sampleData = [
    { timestamp: '2024-01-01T10:00:00Z', temp: 20, rh: 50, dur_hours: 1, zone: 'Zone A' },
    { timestamp: '2024-01-01T10:30:00Z', temp: 22, rh: 60, dur_hours: 1, zone: 'Zone A' },
    { timestamp: '2024-01-01T11:00:00Z', temp: 24, rh: 70, dur_hours: 1, zone: 'Zone B' }
  ];

  it('aggregates data by hour correctly', () => {
    const result = aggregateByHour(sampleData);
    
    // Should have 2 clusters (10:00 and 11:00)
    expect(result.length).toBe(2);
    
    const hour10 = result.find(d => d.timestamp.includes('10:00'));
    expect(hour10.temp).toBe(21); // (20+22)/2
    expect(hour10.rh).toBe(55);   // (50+60)/2
    expect(hour10.dur_hours).toBe(2);
    expect(hour10.zone).toBe('Zone A');
  });

  it('handles invalid records gracefully', () => {
    const mixedData = [
      { timestamp: '2024-01-01T10:00:00Z', temp: 20, rh: 50 },
      { timestamp: 'invalid', temp: 22, rh: 60 },
      null,
      { timestamp: '2024-01-01T10:30:00Z', temp: 'invalid', rh: 50 }
    ];
    
    const result = aggregateByHour(mixedData);
    expect(result.length).toBe(1);
    expect(result[0].temp).toBe(20);
  });

  it('handles gaps in data correctly', () => {
    // 10:00 and 12:00, gap at 11:00
    const gappedData = [
      { timestamp: '2024-01-01T10:00:00Z', temp: 20, rh: 50, dur_hours: 1 },
      { timestamp: '2024-01-01T12:00:00Z', temp: 22, rh: 60, dur_hours: 1 }
    ];
    
    const result = aggregateByHour(gappedData);
    expect(result.length).toBe(2);
    expect(result[0].timestamp).toContain('10:00');
    expect(result[1].timestamp).toContain('12:00');
    // Ensure no 11:00 entry in result
    expect(result.find(d => d.timestamp.includes('11:00'))).toBeUndefined();
  });

  it('handles duplicate timestamps by averaging', () => {
    // Two records at exactly the same time
    const duplicateData = [
      { timestamp: '2024-01-01T10:00:00Z', temp: 20, rh: 50, dur_hours: 1 },
      { timestamp: '2024-01-01T10:00:00Z', temp: 24, rh: 60, dur_hours: 1 }
    ];
    
    const result = aggregateByHour(duplicateData);
    expect(result.length).toBe(1);
    expect(result[0].temp).toBe(22); // (20+24)/2
    expect(result[0].dur_hours).toBe(2);
  });

  it('handles different timezone inputs correctly', () => {
    // One UTC, one with offset. They are the same hour in UTC.
    const tzData = [
      { timestamp: '2024-01-01T10:00:00Z', temp: 20, rh: 50, dur_hours: 1 },
      { timestamp: '2024-01-01T11:00:00+01:00', temp: 24, rh: 60, dur_hours: 1 }
    ];
    const result = aggregateByHour(tzData);
    expect(result.length).toBe(1); // Same UTC hour
    expect(result[0].temp).toBe(22);
  });
});
