import { render, fireEvent } from '@testing-library/svelte';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ColumnMapper from '../../components/ColumnMapper.svelte';
import { fileStore, mapping } from '../../stores/fileStore.js';
import { get } from 'svelte/store';

describe('ColumnMapper', () => {
  beforeEach(() => {
    // Reset stores
    fileStore.reset();
    fileStore.setParsedRaw({
      headerFields: ['Date', 'Temp', 'Hum', 'Other']
    });
  });

  it('renders column options from fileStore', () => {
    const { getAllByRole } = render(ColumnMapper);
    const selects = getAllByRole('combobox');
    
    expect(selects.length).toBe(3); // timestamp, temperature, humidity
    
    const options = selects[0].querySelectorAll('option');
    expect(options.length).toBe(5); // Empty + 4 columns
    expect(options[1].textContent).toBe('Date');
  });

  it('enables Apply button only when all fields are mapped', async () => {
    const { getByRole, getAllByRole } = render(ColumnMapper);
    const applyButton = getByRole('button', { name: /Apply Mapping/i });
    
    expect(applyButton.disabled).toBe(true);

    const selects = getAllByRole('combobox');
    await fireEvent.change(selects[0], { target: { value: 'Date' } });
    await fireEvent.change(selects[1], { target: { value: 'Temp' } });
    await fireEvent.change(selects[2], { target: { value: 'Hum' } });

    expect(applyButton.disabled).toBe(false);
  });

  it('updates mapping store when Apply is clicked', async () => {
    const { getByRole, getAllByRole } = render(ColumnMapper);
    const selects = getAllByRole('combobox');
    
    await fireEvent.change(selects[0], { target: { value: 'Date' } });
    await fireEvent.change(selects[1], { target: { value: 'Temp' } });
    await fireEvent.change(selects[2], { target: { value: 'Hum' } });
    
    const applyButton = getByRole('button', { name: /Apply Mapping/i });
    await fireEvent.click(applyButton);

    const currentMapping = get(mapping);
    expect(currentMapping).toEqual({
      timestamp: 'Date',
      temperature: 'Temp',
      humidity: 'Hum'
    });
  });
});
