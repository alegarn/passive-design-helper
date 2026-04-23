import { render, waitFor } from '@testing-library/svelte';
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../utils/dataProcessor.js', () => ({
  aggregateCsvStream: vi.fn(),
  exportAllFiles: vi.fn(),
  buildTimeSeriesCsv: vi.fn(() => 'time,temperature_2m,relative_humidity_2m'),
  buildSummaryJson: vi.fn(() => '{}'),
  buildSummaryMd: vi.fn(() => '# Summary'),
  downloadBlob: vi.fn(),
  detectDataSpan: vi.fn(() => null),
}));

vi.mock('../../scripts/psychro/math.js', () => ({
  W_from_RH_T: vi.fn(() => 0.01),
}));

vi.mock('../../scripts/classify.js', () => ({
  classifyPoint: vi.fn(() => 'comfort'),
}));

vi.mock('../../scripts/ui-bridge.js', () => ({
  getZoneColor: vi.fn(() => '#123456'),
}));

vi.mock('../../stores/fileStore.js', async () => {
  const { writable } = await import('svelte/store');

  return {
    fileStore: {
      setMapping: vi.fn(),
      setAggregationResult: vi.fn(),
      setSelectedMonth: vi.fn(),
    },
    mapping: writable({ timestamp: null, temperature: null, humidity: null }),
    availableMonths: writable([]),
    selectedMonth: writable(null),
  };
});

import ProcessControls from '../../components/ProcessControls.svelte';
import { aggregateCsvStream } from '../../utils/dataProcessor.js';
import { fileStore } from '../../stores/fileStore.js';

describe('ProcessControls', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    aggregateCsvStream.mockResolvedValue({
      rowsWithDur: [{ temp: 24, rh: 50, zone: 'comfort' }],
      rowsCount: 1,
      timelineUnit: 'hour',
      firstTs: '2025-01-01T00:00:00.000Z',
      lastTs: '2025-01-01T01:00:00.000Z',
      medianDelta: 3600000,
    });
  });

  it('processes a new analyze request once the auto-mapped remote columns are ready', async () => {
    const props = {
      file: new File(
        ['time,temperature_2m,relative_humidity_2m\n2025-01-01T00:00,24,50'],
        'remote.csv',
        { type: 'text/csv' }
      ),
      headerFields: ['time', 'temperature_2m', 'relative_humidity_2m'],
      sampleRows: [['2025-01-01T00:00', 24, 50]],
      dayFirst: false,
      dataSpanInfo: null,
      analyzeRequestId: 0,
    };

    const view = render(ProcessControls, { props });

    expect(aggregateCsvStream).not.toHaveBeenCalled();

    await view.rerender({ ...props, analyzeRequestId: 1 });

    await waitFor(() => expect(aggregateCsvStream).toHaveBeenCalledTimes(1));
    expect(fileStore.setMapping).toHaveBeenCalledWith({
      timestamp: 'time',
      temperature: 'temperature_2m',
      humidity: 'relative_humidity_2m',
    });
    expect(fileStore.setAggregationResult).toHaveBeenCalledWith(
      expect.objectContaining({
        rowsCount: 1,
        timelineUnit: 'hour',
      })
    );
  });
});