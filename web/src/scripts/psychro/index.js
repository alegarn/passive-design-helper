/**
 * Psychrometric chart API module
 */

import { createPsychroRenderer } from './renderer.js';

export function initPsychroChart(containerSelector, options = {}) {
  const containerEl = document.querySelector(containerSelector);
  if (!containerEl) { throw new Error(`Container element not found: ${containerSelector}`); }
  const defaultOptions = { Tmin: 0, Tmax: 50, Wmax: 0.03, p: 101325, samplingN: 200, dprCap: 2.0, rafThrottleThreshold: 500, resizeDebounceMs: 150 };
  const mergedOptions = { ...defaultOptions, ...options };
  const renderer = createPsychroRenderer(containerEl, mergedOptions);
  renderer.init();
  return renderer;
}

export function createSampleDataPoints(count = 10) {
  const points = [];
  for (let i = 0; i < count; i++) points.push({ T: Math.random() * 50, W: Math.random() * 0.03, id: i });
  return points;
}

export { createPsychroRenderer };
