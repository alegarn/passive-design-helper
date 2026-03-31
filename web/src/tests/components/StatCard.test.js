import { render } from '@testing-library/svelte';
import { describe, it, expect } from 'vitest';
import StatCard from '../../components/StatCard.svelte';

describe('StatCard', () => {
  it('renders the label', () => {
    const { getByText } = render(StatCard, { label: 'Temperature', value: 25 });
    expect(getByText('Temperature')).toBeDefined();
  });

  it('renders a numeric value formatted to 1 decimal by default', () => {
    const { getByText } = render(StatCard, { label: 'Humidity', value: 55 });
    expect(getByText('55.0')).toBeDefined();
  });

  it('respects custom decimals prop', () => {
    const { getByText } = render(StatCard, { label: 'Pressure', value: 1013, decimals: 0 });
    expect(getByText('1013')).toBeDefined();
  });

  it('renders "-" when value is null', () => {
    const { getByText } = render(StatCard, { label: 'Wind', value: null });
    expect(getByText('-')).toBeDefined();
  });

  it('renders "-" when value is undefined', () => {
    const { getByText } = render(StatCard, { label: 'Solar', value: undefined });
    expect(getByText('-')).toBeDefined();
  });

  it('renders "-" when value is NaN', () => {
    const { getByText } = render(StatCard, { label: 'CO2', value: NaN });
    expect(getByText('-')).toBeDefined();
  });

  it('renders the color bar when color prop is provided', () => {
    const { container } = render(StatCard, { label: 'Zone', value: 5, color: '#a3be8c' });
    const colorBar = container.querySelector('.stat-card__color');
    expect(colorBar).toBeDefined();
    expect(colorBar.style.backgroundColor).toBe('rgb(163, 190, 140)');
  });

  it('does not render a color bar when color is omitted', () => {
    const { container } = render(StatCard, { label: 'Zone', value: 5 });
    const colorBar = container.querySelector('.stat-card__color');
    expect(colorBar).toBeNull();
  });

  it('has correct aria-label attribute', () => {
    const { container } = render(StatCard, { label: 'Temp', value: 25 });
    const card = container.querySelector('[role="listitem"]');
    expect(card).toBeDefined();
    expect(card.getAttribute('aria-label')).toBe('Temp: 25.0');
  });
});
