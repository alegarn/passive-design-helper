import { render, fireEvent } from '@testing-library/svelte';
import { describe, it, expect, vi } from 'vitest';
import CityAutocomplete from '../../components/CityAutocomplete.svelte';

const mockCities = [
  { name: 'Bangkok', lat: 13.7563, lon: 100.5018 },
  { name: 'Bali', lat: -8.3405, lon: 115.092 },
  { name: 'Chiang Mai', lat: 18.7883, lon: 98.9853 },
];

describe('CityAutocomplete', () => {
  it('renders input with default placeholder', () => {
    const { getByPlaceholderText } = render(CityAutocomplete, { cities: mockCities });
    expect(getByPlaceholderText('Search city...')).toBeDefined();
  });

  it('renders input with custom placeholder', () => {
    const { getByPlaceholderText } = render(CityAutocomplete, {
      cities: mockCities,
      placeholder: 'Type a city name',
    });
    expect(getByPlaceholderText('Type a city name')).toBeDefined();
  });

  it('shows all cities in dropdown on focus', async () => {
    const { getByRole, getAllByRole } = render(CityAutocomplete, { cities: mockCities });
    const input = getByRole('combobox');
    await fireEvent.focus(input);
    const options = getAllByRole('option');
    expect(options.length).toBe(3);
  });

  it('filters cities based on typed input', async () => {
    const { getByRole, getAllByRole } = render(CityAutocomplete, { cities: mockCities });
    const input = getByRole('combobox');
    await fireEvent.focus(input);
    await fireEvent.input(input, { target: { value: 'ba' } });
    const options = getAllByRole('option');
    // Bangkok and Bali both contain 'ba'
    expect(options.length).toBe(2);
  });

  it('shows "No results" when filter matches nothing', async () => {
    const { getByRole, getByText } = render(CityAutocomplete, { cities: mockCities });
    const input = getByRole('combobox');
    await fireEvent.focus(input);
    await fireEvent.input(input, { target: { value: 'zzznomatch' } });
    expect(getByText('No results')).toBeDefined();
  });

  it('calls select callback when a city is clicked', async () => {
    const select = vi.fn();
    const { getByRole, getByText } = render(CityAutocomplete, { cities: mockCities, select });
    const input = getByRole('combobox');
    await fireEvent.focus(input);
    await fireEvent.mouseDown(getByText('Bangkok'));
    expect(select).toHaveBeenCalledWith(mockCities[0]);
  });

  it('closes dropdown on Escape key', async () => {
    const { getByRole, queryByRole } = render(CityAutocomplete, { cities: mockCities });
    const input = getByRole('combobox');
    await fireEvent.focus(input);
    await fireEvent.keyDown(input, { key: 'Escape' });
    expect(queryByRole('listbox')).toBeNull();
  });

  it('navigates with ArrowDown and selects first item with Enter', async () => {
    const select = vi.fn();
    const { getByRole } = render(CityAutocomplete, { cities: mockCities, select });
    const input = getByRole('combobox');
    await fireEvent.focus(input);
    await fireEvent.keyDown(input, { key: 'ArrowDown' });
    await fireEvent.keyDown(input, { key: 'Enter' });
    expect(select).toHaveBeenCalledWith(mockCities[0]);
  });

  it('has correct ARIA attributes on the combobox input', async () => {
    const { getByRole } = render(CityAutocomplete, { cities: mockCities });
    const input = getByRole('combobox');
    expect(input.getAttribute('aria-autocomplete')).toBe('list');
    expect(input.getAttribute('aria-haspopup')).toBe('listbox');
    await fireEvent.focus(input);
    expect(input.getAttribute('aria-expanded')).toBe('true');
  });

  it('listbox has accessible label', async () => {
    const { getByRole } = render(CityAutocomplete, { cities: mockCities });
    await fireEvent.focus(getByRole('combobox'));
    const listbox = getByRole('listbox');
    expect(listbox.getAttribute('aria-label')).toBe('Cities');
  });
});
