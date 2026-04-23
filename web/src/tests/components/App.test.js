import { render, fireEvent, waitFor } from '@testing-library/svelte';
import { beforeEach, describe, it, expect, vi } from 'vitest';

vi.mock('../../components/FetchOpenMeteo.svelte', async () => {
  const mod = await import('../mocks/FetchOpenMeteo.mock.svelte');
  return { default: mod.default };
});

vi.mock('../../components/ProcessControls.svelte', async () => {
  const mod = await import('../mocks/ProcessControls.mock.svelte');
  return { default: mod.default };
});

vi.mock('../../components/UploadZone.svelte', async () => {
  const mod = await import('../mocks/Empty.mock.svelte');
  return { default: mod.default };
});

vi.mock('../../components/PsychroChart.svelte', async () => {
  const mod = await import('../mocks/PsychroChart.mock.svelte');
  return { default: mod.default };
});

vi.mock('../../components/TimeSeriesChart.svelte', async () => {
  const mod = await import('../mocks/Empty.mock.svelte');
  return { default: mod.default };
});

vi.mock('../../stores/fileStore.js', async () => {
  const { writable } = await import('svelte/store');

  const fileStore = writable({
    raw: {
      file: new File(['time,temperature_2m,relative_humidity_2m'], 'remote.csv', { type: 'text/csv' }),
      headerFields: ['time', 'temperature_2m', 'relative_humidity_2m'],
      sampleRows: [],
      dayFirst: false,
      dataSpanInfo: null,
    },
  });

  const currentSummaryData = writable({ rowsWithDur: [] });
  const medianTemp = writable(28);
  const dataMedianTemp = writable(null);
  const medianOverrideStore = writable(null);

  return {
    fileStore,
    currentSummaryData,
    medianTemp,
    dataMedianTemp,
    medianOverride: {
      subscribe: medianOverrideStore.subscribe,
      set: medianOverrideStore.set,
      update: medianOverrideStore.update,
    },
  };
});

import App from '../../App.svelte';

describe('App', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('increments the analyze request token when the fetch component requests an analyze action', async () => {
    const { getByRole, getByTestId } = render(App);

    expect(getByTestId('analyze-request-id')).toHaveTextContent('0');

    await fireEvent.click(getByRole('button', { name: /Trigger Analyze/i }));

    await waitFor(() => {
      expect(getByTestId('analyze-request-id')).toHaveTextContent('1');
    });
  });

  it('scrolls to the psychrometric chart after processing succeeds', async () => {
    const { container, getByRole } = render(App);
    const chartContainer = container.querySelector('.psychro-chart-container');
    const scrollIntoView = vi.fn();

    chartContainer.scrollIntoView = scrollIntoView;

    await fireEvent.click(getByRole('button', { name: /Emit Processed/i }));

    await waitFor(() => {
      expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });
    });
  });
});