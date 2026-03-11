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
});
