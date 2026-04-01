import { describe, it, expect, vi, beforeEach } from 'vitest';
import { initPsychroChart, createSampleDataPoints } from '../../scripts/psychro/index.js';

// Mock the renderer to avoid canvas/DOM complexity
vi.mock('../../scripts/psychro/renderer.js', () => ({
  createPsychroRenderer: vi.fn(() => ({
    init: vi.fn(),
    render: vi.fn(),
    destroy: vi.fn(),
  })),
}));

describe('Psychro Chart API', () => {
  describe('createSampleDataPoints', () => {
    it('returns an array of the requested length', () => {
      const pts = createSampleDataPoints(5);
      expect(pts).toHaveLength(5);
    });

    it('defaults to 10 points', () => {
      const pts = createSampleDataPoints();
      expect(pts).toHaveLength(10);
    });

    it('each point has T, W in valid ranges', () => {
      const pts = createSampleDataPoints(20);
      for (const pt of pts) {
        expect(pt.T).toBeGreaterThanOrEqual(0);
        expect(pt.T).toBeLessThan(50);
        expect(pt.W).toBeGreaterThanOrEqual(0);
        expect(pt.W).toBeLessThan(0.03);
      }
    });

    it('each point has a unique numeric id', () => {
      const pts = createSampleDataPoints(5);
      const ids = pts.map(p => p.id);
      expect(ids).toEqual([0, 1, 2, 3, 4]);
    });
  });

  describe('initPsychroChart', () => {
    beforeEach(() => {
      // Add a container element to the jsdom document
      document.body.innerHTML = '<div id="psychro-container"></div>';
    });

    it('throws when container selector does not match', () => {
      expect(() => initPsychroChart('#nonexistent')).toThrow('Container element not found');
    });

    it('returns the renderer when container exists', () => {
      const renderer = initPsychroChart('#psychro-container');
      expect(renderer).toBeDefined();
      expect(typeof renderer.init).toBe('function');
    });

    it('passes custom options to the renderer', async () => {
      const { createPsychroRenderer } = await import('../../scripts/psychro/renderer.js');
      initPsychroChart('#psychro-container', { Tmin: 5, Tmax: 45 });
      const callArgs = createPsychroRenderer.mock.calls.at(-1);
      expect(callArgs[1].Tmin).toBe(5);
      expect(callArgs[1].Tmax).toBe(45);
    });

    it('applies default options when none provided', async () => {
      const { createPsychroRenderer } = await import('../../scripts/psychro/renderer.js');
      initPsychroChart('#psychro-container');
      const callArgs = createPsychroRenderer.mock.calls.at(-1);
      expect(callArgs[1].Tmin).toBe(0);
      expect(callArgs[1].Tmax).toBe(50);
      expect(callArgs[1].p).toBe(101325);
    });
  });
});
