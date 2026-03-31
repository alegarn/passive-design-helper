import { render, fireEvent } from '@testing-library/svelte';
import { describe, it, expect, vi, afterEach } from 'vitest';
import TacticModal from '../../components/TacticModal.svelte';

const mockTactic = {
  id: 'Natural Ventilation',
  description: 'Use natural airflow to cool spaces',
  icon: '🌬️',
  type: 'passive',
  complexity: 'Medium',
  examples: ['Open cross ventilation', 'Stack effect towers'],
  howToApply: {
    beginner: ['Step 1: Open windows', 'Step 2: Orient building'],
    advanced: ['Step A: CFD analysis', 'Step B: Pressure mapping'],
  },
  resources: [{ url: 'https://example.com/ventilation', label: 'Read more' }],
};

describe('TacticModal', () => {
  afterEach(() => {
    document.body.style.overflow = '';
  });

  it('renders tactic title, description, type and complexity', () => {
    const { getByText, container } = render(TacticModal, { tactic: mockTactic, onClose: vi.fn() });
    expect(getByText('Natural Ventilation')).toBeDefined();
    expect(getByText('Use natural airflow to cool spaces')).toBeDefined();
    // Use querySelector to target the specific pill elements to avoid multiple-match errors
    const typePill = container.querySelector('.pill:not(.complexity)');
    expect(typePill?.textContent).toBe('passive');
    const complexityPill = container.querySelector('.pill.complexity');
    expect(complexityPill?.textContent).toBe('Medium');
  });

  it('renders the tactic icon', () => {
    const { getByText } = render(TacticModal, { tactic: mockTactic, onClose: vi.fn() });
    expect(getByText('🌬️')).toBeDefined();
  });

  it('renders examples list', () => {
    const { getByText } = render(TacticModal, { tactic: mockTactic, onClose: vi.fn() });
    expect(getByText('Open cross ventilation')).toBeDefined();
    expect(getByText('Stack effect towers')).toBeDefined();
  });

  it('renders howToApply beginner and advanced steps', () => {
    const { getByText } = render(TacticModal, { tactic: mockTactic, onClose: vi.fn() });
    expect(getByText('Step 1: Open windows')).toBeDefined();
    expect(getByText('Step 2: Orient building')).toBeDefined();
    expect(getByText('Step A: CFD analysis')).toBeDefined();
    expect(getByText('Step B: Pressure mapping')).toBeDefined();
  });

  it('renders resource link with correct href', () => {
    const { getByText } = render(TacticModal, { tactic: mockTactic, onClose: vi.fn() });
    const link = getByText('Read more');
    expect(link.tagName).toBe('A');
    expect(link.getAttribute('href')).toBe('https://example.com/ventilation');
    expect(link.getAttribute('rel')).toBe('noopener');
  });

  it('calls onClose when close button is clicked', async () => {
    const onClose = vi.fn();
    const { getByLabelText } = render(TacticModal, { tactic: mockTactic, onClose });
    await fireEvent.click(getByLabelText('Close details'));
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onClose when Escape key is pressed', async () => {
    const onClose = vi.fn();
    render(TacticModal, { tactic: mockTactic, onClose });
    await fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onClose when backdrop is clicked directly', async () => {
    const onClose = vi.fn();
    const { container } = render(TacticModal, { tactic: mockTactic, onClose });
    const backdrop = container.querySelector('.backdrop');
    await fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalled();
  });

  it('has dialog role with aria-modal on modal element', () => {
    const { getByRole } = render(TacticModal, { tactic: mockTactic, onClose: vi.fn() });
    const dialog = getByRole('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.getAttribute('aria-labelledby')).toBe('tactic-title');
  });

  it('sets body overflow to hidden on mount', () => {
    render(TacticModal, { tactic: mockTactic, onClose: vi.fn() });
    expect(document.body.style.overflow).toBe('hidden');
  });

  it('renders nothing when tactic is null', () => {
    const { container } = render(TacticModal, { tactic: null, onClose: vi.fn() });
    expect(container.querySelector('.modal')).toBeNull();
    expect(container.querySelector('.backdrop')).toBeNull();
  });

  it('uses fallback icon when tactic.icon is absent', () => {
    const tacticWithoutIcon = { ...mockTactic, icon: undefined };
    const { getByText } = render(TacticModal, { tactic: tacticWithoutIcon, onClose: vi.fn() });
    expect(getByText('🟦')).toBeDefined();
  });
});
