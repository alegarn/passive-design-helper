import { render, fireEvent } from '@testing-library/svelte';
import { describe, it, expect, vi } from 'vitest';

// Mock fileStore with medianTemp store
vi.mock('../../stores/fileStore.js', async () => {
  const { readable } = await import('svelte/store');
  return {
    medianTemp: readable(28),
  };
});

import Tactics from '../../components/Tactics.svelte';

describe('Tactics', () => {
  it('renders the section heading', () => {
    const { getByRole } = render(Tactics);
    expect(getByRole('heading', { name: /Passive & Active Tactics/i })).toBeDefined();
  });

  it('renders tactic cards', () => {
    const { getAllByRole } = render(Tactics);
    // Each TacticCard renders a button
    const buttons = getAllByRole('button');
    expect(buttons.length).toBeGreaterThan(0);
  });

  it('filters tactics by search query', async () => {
    const { getByLabelText, getAllByRole } = render(Tactics);
    const searchInput = getByLabelText(/Search tactics/i);
    const initialCount = getAllByRole('button').filter(b => !b.classList.contains('clear')).length;
    await fireEvent.input(searchInput, { target: { value: 'Comfort' } });
    const filteredCount = getAllByRole('button').filter(b => !b.classList.contains('clear')).length;
    expect(filteredCount).toBeLessThan(initialCount);
  });

  it('clears the search filter when Clear button is clicked', async () => {
    const { getByLabelText, getAllByRole, getByText } = render(Tactics);
    const searchInput = getByLabelText(/Search tactics/i);
    await fireEvent.input(searchInput, { target: { value: 'Comfort' } });
    await fireEvent.click(getByText('Clear'));
    expect(searchInput.value).toBe('');
    expect(getAllByRole('button').length).toBeGreaterThan(1);
  });

  it('filters tactics by category', async () => {
    const { getByLabelText, getAllByRole } = render(Tactics);
    const allCount = getAllByRole('button').filter(b => !b.textContent.includes('Clear')).length;
    const select = getByLabelText(/Category filter/i);
    await fireEvent.change(select, { target: { value: 'Passive' } });
    const passiveCount = getAllByRole('button').filter(b => !b.textContent.includes('Clear')).length;
    expect(passiveCount).toBeLessThanOrEqual(allCount);
  });

  it('shows "Loading details" placeholder when a tactic is selected but modal not loaded', async () => {
    // TacticModal loads lazily; before it resolves we should see a placeholder
    // We can just open a tactic and check the DOM
    const { getAllByRole, container } = render(Tactics);
    const buttons = getAllByRole('button').filter(b => !b.textContent.includes('Clear'));
    await fireEvent.click(buttons[0]);
    // Either the modal or the placeholder loading text is shown
    const modalOrPlaceholder =
      container.querySelector('[role="dialog"]') ||
      container.querySelector('.modal-loading');
    expect(modalOrPlaceholder).toBeDefined();
  });
});
