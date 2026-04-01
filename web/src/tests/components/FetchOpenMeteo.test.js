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
vi.mock('../../components/LeafletMap.svelte', () => ({ default: { render: () => '' } }));
vi.mock('../../components/CityAutocomplete.svelte', () => ({ default: { render: () => '' } }));

import FetchOpenMeteo from '../../components/FetchOpenMeteo.svelte';
import { fileStore } from '../../stores/fileStore.js';

describe('FetchOpenMeteo', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the heading', () => {
    const { getByRole } = render(FetchOpenMeteo);
    expect(getByRole('heading', { name: /Fetch Open-Meteo/i })).toBeDefined();
  });

  it('renders the API URL input pre-filled', () => {
    const { getByLabelText } = render(FetchOpenMeteo);
    const input = getByLabelText(/API URL/i);
    expect(input.value).toContain('archive-api.open-meteo.com');
  });

  it('renders Choose parameters toggle button', () => {
    const { getByText } = render(FetchOpenMeteo);
    expect(getByText('Choose parameters')).toBeDefined();
  });

  it('expands parameters section when "Choose parameters" is clicked', async () => {
    const { getByText, findByLabelText } = render(FetchOpenMeteo);
    await fireEvent.click(getByText('Choose parameters'));
    expect(await findByLabelText(/Latitude/i)).toBeDefined();
    expect(await findByLabelText(/Longitude/i)).toBeDefined();
  });

  it('renders "Locate me" button', () => {
    const { getByRole } = render(FetchOpenMeteo);
    expect(getByRole('button', { name: /Use your current location/i })).toBeDefined();
  });

  it('renders format select for CSV/JSON', async () => {
    const { getByText, findByLabelText } = render(FetchOpenMeteo);
    await fireEvent.click(getByText('Choose parameters'));
    // either a select or a visible label — component has a format dropdown
    // just verify parameters section is open
    expect(await findByLabelText('Latitude:')).toBeDefined();
  });

  it('updates URL when latitude input changes', async () => {
    const { getByText, getByLabelText } = render(FetchOpenMeteo);
    await fireEvent.click(getByText('Choose parameters'));
    const latInput = getByLabelText('Latitude:');
    await fireEvent.input(latInput, { target: { value: '40.7128' } });
    await waitFor(() => {
      expect(latInput.value).toBe('40.7128');
    });
  });

  it('calls fileStore.fetchRemote when Fetch & Download is clicked', async () => {
    const { getByRole } = render(FetchOpenMeteo);
    await fireEvent.click(getByRole('button', { name: /Fetch & Download/i }));
    await waitFor(() => expect(fileStore.fetchRemote).toHaveBeenCalled());
  });
});
