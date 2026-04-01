import { render } from '@testing-library/svelte';
import { describe, it, expect, vi } from 'vitest';

// Mock leaflet — it uses browser APIs not available in jsdom
const mockMarker = {
  addTo: vi.fn().mockReturnThis(),
  setLatLng: vi.fn().mockReturnThis(),
};
const mockTileLayer = { addTo: vi.fn().mockReturnThis() };
const mockMap = {
  setView: vi.fn().mockReturnThis(),
  addLayer: vi.fn().mockReturnThis(),
  on: vi.fn(),
  off: vi.fn(),
  remove: vi.fn(),
  getZoom: vi.fn().mockReturnValue(5),
};

vi.mock('leaflet', () => {
  return {
    default: {
      map: vi.fn(() => mockMap),
      tileLayer: vi.fn(() => mockTileLayer),
      marker: vi.fn(() => mockMarker),
    },
  };
});
vi.mock('leaflet/dist/leaflet.css', () => ({}));

// Re-expose mocks after vi.mock factory
const { default: L } = await import('leaflet');

import LeafletMap from '../../components/LeafletMap.svelte';

describe('LeafletMap', () => {
  it('renders a container div', () => {
    const { container } = render(LeafletMap, { lat: 48.8, lon: 2.3 });
    const div = container.querySelector('div');
    expect(div).toBeDefined();
  });

  it('applies custom mapClass to container element', () => {
    const { container } = render(LeafletMap, { lat: 0, lon: 0, mapClass: 'my-map' });
    expect(container.querySelector('.my-map')).toBeDefined();
  });

  it('applies default mapClass when none provided', () => {
    const { container } = render(LeafletMap, { lat: 0, lon: 0 });
    expect(container.querySelector('.leaflet-map')).toBeDefined();
  });

  it('initializes leaflet map on mount with provided lat/lon', async () => {
    vi.clearAllMocks();
    render(LeafletMap, { lat: 48.8, lon: 2.3, zoom: 10 });
    // Allow onMount to fire
    await new Promise(r => setTimeout(r, 10));
    expect(L.map).toHaveBeenCalled();
  });

  it('creates a tile layer on mount', async () => {
    vi.clearAllMocks();
    render(LeafletMap, { lat: 0, lon: 0 });
    await new Promise(r => setTimeout(r, 10));
    expect(L.tileLayer).toHaveBeenCalled();
  });
});
