/**
 * Psychrometric chart API module
 * Lightweight wrapper for the psychrometric chart renderer
 */

import { createPsychroRenderer } from './renderer.js';

/**
 * Initialize a psychrometric chart in the specified container
 * @param {string} containerSelector - CSS selector for the container element
 * @param {Object} options - Configuration options for the chart
 * @returns {Object} Renderer instance with methods
 */
export function initPsychroChart(containerSelector, options = {}) {
  // Find container element
  const containerEl = document.querySelector(containerSelector);
  if (!containerEl) {
    throw new Error(`Container element not found: ${containerSelector}`);
  }

  // Create renderer with default options
  const defaultOptions = {
    Tmin: 0,
    Tmax: 50,
    Wmax: 0.03,
    p: 101325,
    samplingN: 200,
    dprCap: 2.0,
    rafThrottleThreshold: 500,
    resizeDebounceMs: 150
  };

  const mergedOptions = { ...defaultOptions, ...options };

  // Create and initialize renderer
  const renderer = createPsychroRenderer(containerEl, mergedOptions);
  renderer.init();

  return renderer;
}

/**
 * Create sample data points for testing
 * @param {number} count - Number of sample points to generate
 * @returns {Array} Array of sample points with T and W properties
 */
export function createSampleDataPoints(count = 10) {
  const points = [];
  for (let i = 0; i < count; i++) {
    points.push({
      T: Math.random() * 50, // 0-50°C
      W: Math.random() * 0.03, // 0-0.03 kg/kg
      id: i
    });
  }
  return points;
}

// Export the renderer function for advanced usage
export { createPsychroRenderer };