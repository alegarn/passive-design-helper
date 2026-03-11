import { render, fireEvent } from '@testing-library/svelte';
import { describe, it, expect, vi } from 'vitest';
import TacticCard from '../../components/TacticCard.svelte';

describe('TacticCard', () => {
  const mockTactic = {
    id: 'Comfort',
    description: 'Comfortable temperature/humidity',
    icon: '🛋️',
    type: 'passive',
    complexity: 'Low',
    examples: ['Example 1']
  };

  it('renders tactic information correctly', () => {
    const { getByText } = render(TacticCard, { tactic: mockTactic });

    expect(getByText('Comfort')).toBeDefined();
    expect(getByText('Comfortable temperature/humidity')).toBeDefined();
    expect(getByText('passive')).toBeDefined();
    expect(getByText('Low')).toBeDefined();
    expect(getByText('Example: Example 1')).toBeDefined();
  });

  it('calls onOpen when clicked', async () => {
    const onOpen = vi.fn();
    const { getByRole } = render(TacticCard, { tactic: mockTactic, onOpen });

    const card = getByRole('button');
    await fireEvent.click(card);

    expect(onOpen).toHaveBeenCalledWith(mockTactic);
  });

  it('calls onOpen when Enter key is pressed', async () => {
    const onOpen = vi.fn();
    const { getByRole } = render(TacticCard, { tactic: mockTactic, onOpen });

    const card = getByRole('button');
    await fireEvent.keyDown(card, { key: 'Enter' });

    expect(onOpen).toHaveBeenCalledWith(mockTactic);
  });
});
