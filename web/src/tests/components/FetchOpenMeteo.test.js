import { render, fireEvent, waitFor } from '@testing-library/svelte';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock fileStore
vi.mock('../../stores/fileStore.js', async () => {
  const { readable } = await import('svelte/store');
  return {
    fileStore: {
      fetchRemote: vi.fn().mockResolvedValue({ result: {}, rawPayload: { hourly: { time: [] } } }),
      setMetaLastError: vi.fn(),
    },
    isLoading: readable(false),
    lastError: readable(null),
  };
});

// Mock data/cities.js
vi.mock('../../data/cities.js', () => ({
  cities: [
    { name: 'Berlin', lat: 52.52, lon: 13.41 },
    { name: 'Paris', lat: 48.85, lon: 2.35 },
  ],
}));

// Mock child components used inside FetchOpenMeteo
vi.mock('../../components/LeafletMap.svelte', async () => {
  const mod = await import('../mocks/Empty.mock.svelte');
  return { default: mod.default };
});

vi.mock('../../components/CityAutocomplete.svelte', async () => {
  const mod = await import('../mocks/CityAutocomplete.mock.svelte');
  return { default: mod.default };
});
vi.mock('../../utils/jsonToCsv.js', () => ({
  jsonToCsv: vi.fn(() => 'time,temperature_2m,relative_humidity_2m'),
}));

import FetchOpenMeteo from '../../components/FetchOpenMeteo.svelte';
import { fileStore } from '../../stores/fileStore.js';

describe('FetchOpenMeteo', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    URL.createObjectURL = vi.fn(() => 'blob:mock-download');
    URL.revokeObjectURL = vi.fn();
    HTMLAnchorElement.prototype.click = vi.fn();
  });

  it('defaults to the 2025 full-year range and exposes the casual analyze action', async () => {
    const { getByLabelText, getByRole, queryByLabelText, queryByRole } = render(FetchOpenMeteo);

    expect(getByLabelText(/Location/i)).toBeInTheDocument();
    expect(getByLabelText(/Year/i)).toHaveValue(2025);
    expect(getByLabelText(/Output Format/i)).toHaveValue('csv');
    expect(getByRole('button', { name: /Analyze/i })).toBeInTheDocument();
    expect(getByRole('button', { name: /Show advanced tools/i })).toBeInTheDocument();
    expect(queryByLabelText(/API URL/i)).not.toBeInTheDocument();
    expect(queryByRole('button', { name: /Fetch & Download/i })).not.toBeInTheDocument();
    expect(queryByRole('button', { name: /Choose parameters/i })).not.toBeInTheDocument();
  });

  it('does not fetch when the year changes until the user triggers an explicit action', async () => {
    const { getByLabelText } = render(FetchOpenMeteo);

    await fireEvent.input(getByLabelText(/Year/i), { target: { value: '2024' } });

    expect(fileStore.fetchRemote).not.toHaveBeenCalled();
  });

  it('reveals the legacy controls only after the advanced button is clicked', async () => {
    const { getByRole, queryByRole, getByLabelText } = render(FetchOpenMeteo);

    expect(queryByRole('button', { name: /Choose parameters/i })).not.toBeInTheDocument();
    expect(queryByRole('button', { name: /Fetch & Download/i })).not.toBeInTheDocument();

    await fireEvent.click(getByRole('button', { name: /Show advanced tools/i }));

    expect(getByRole('button', { name: /Back to casual view/i })).toBeInTheDocument();
    expect(getByRole('button', { name: /Choose parameters/i })).toBeInTheDocument();
    expect(getByRole('button', { name: /Open Map Preview/i })).toBeInTheDocument();
    expect(getByRole('button', { name: /Use your current location/i })).toBeInTheDocument();
    expect(getByRole('button', { name: /Fetch & Download/i })).toBeInTheDocument();
    expect(getByLabelText(/Output Format/i)).toHaveValue('csv');
  });

  it('calls fetchRemote for the explicit analyze action and then notifies the parent callback', async () => {
    const onAnalyze = vi.fn();

    fileStore.fetchRemote.mockImplementation(async (params) => {
      expect(onAnalyze).not.toHaveBeenCalled();
      return { result: {}, rawPayload: { hourly: { time: ['2025-01-01T00:00'] } }, params };
    });

    const { getByRole } = render(FetchOpenMeteo, { props: { onAnalyze } });

    await fireEvent.click(getByRole('button', { name: /Analyze/i }));

    await waitFor(() => {
      expect(fileStore.fetchRemote).toHaveBeenCalledWith({
        url: expect.stringContaining('start_date=2025-01-01'),
        format: 'json',
      });
    });
    await waitFor(() => expect(onAnalyze).toHaveBeenCalledTimes(1));
  });

  it('keeps the advanced manual fetch path accessible', async () => {
    const manualUrl = 'https://archive-api.open-meteo.com/v1/archive?latitude=11.11&longitude=22.22&start_date=2024-06-01&end_date=2024-06-30&hourly=temperature_2m,relative_humidity_2m';
    const { getByLabelText, getByRole } = render(FetchOpenMeteo);

    await fireEvent.click(getByRole('button', { name: /Show advanced tools/i }));
    await fireEvent.click(getByRole('button', { name: /Choose parameters/i }));
    await fireEvent.input(getByLabelText(/API URL/i), { target: { value: manualUrl } });
    await fireEvent.click(getByRole('button', { name: /Fetch & Download/i }));

    await waitFor(() => {
      expect(fileStore.fetchRemote).toHaveBeenCalledWith({
        url: manualUrl,
        format: 'json',
      });
    });
  });
});
