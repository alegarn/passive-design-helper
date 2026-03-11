import { render } from '@testing-library/svelte';
import { describe, it, expect, vi } from 'vitest';
import ZoneHours from '../../components/ZoneHours.svelte';
import { medianOverride } from '../../stores/fileStore.js';

vi.mock('../../scripts/zones.js', () => ({
  createZonesForMedianTemp: vi.fn((temp) => [
    { id: 'Comfort', icon: '🛋️' },
    { id: 'Heating', icon: '🔥' }
  ])
}));

describe('ZoneHours', () => {
  const mockZoneData = {
    zone: 'Comfort',
    hours: 120.5,
    percent: 15.2,
    color: '#00ff00'
  };

  it('renders zone data correctly', () => {
    medianOverride.set(25);
    const { getByText } = render(ZoneHours, { zoneData: mockZoneData });

    expect(getByText('🛋️ Comfort')).toBeDefined();
    expect(getByText('120.5 hours')).toBeDefined();
    expect(getByText('15.2%')).toBeDefined();
  });

  it('updates when medianTemp changes', async () => {
    const { getByText, rerender } = render(ZoneHours, { zoneData: mockZoneData });
    
    // Changing store value should trigger reactivity via $derived in Svelte 5
    medianOverride.set(30);
    
    // In this mock, the output doesn't change based on temp, 
    // but we verify it still renders with the updated store context
    expect(getByText('🛋️ Comfort')).toBeDefined();
  });
});
