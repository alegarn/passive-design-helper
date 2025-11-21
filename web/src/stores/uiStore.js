import { writable, derived } from 'svelte/store';

/**
 * Raw data from CSV files - array of row objects
 * @type {import('svelte/store').Writable<Array<Object>>}
 */
export const rawData = writable([]);

/**
 * Column mapping configuration
 * @type {import('svelte/store').Writable<Object>}
 */

/**
 * Analysis results
 * @type {import('svelte/store').Writable<Object>}
 */
export const results = writable({
  psychrometricData: null,
  comfortZones: null,
  tactics: null
});

/**
 * Helper function to set raw data and optionally reset results
 * @param {Array<Object>} data - The parsed CSV data
 * @param {boolean} resetResults - Whether to reset results when setting data (default: true)
 */
export function setRawData(data, resetResults = true) {
  rawData.set(data);
  
  // Optionally reset results when new data is loaded
  if (resetResults) {
    results.set({
      psychrometricData: null,
      comfortZones: null,
      tactics: null
    });
  }
}

/**
 * Helper function to set mapping configuration
 * @param {Object} mappingConfig - The mapping configuration object
 */

/**
 * Derived store to check if mapping is complete
 * @type {import('svelte/store').Derived<boolean>}
 */

/**
 * Helper function to set results
 * @param {Object} resultsData - The results data object
 */
export function setResults(resultsData) {
  results.set(resultsData);
}

/**
 * Derived store to check if results are available
 * @type {import('svelte/store').Derived<boolean>}
 */
export const hasResults = derived(
  results,
  $results => $results && (
    $results.psychrometricData !== null ||
    $results.comfortZones !== null ||
    $results.tactics !== null
  )
);

// Export a combined store object for backward compatibility
export const uiStore = {
  rawData,
  results,
  setRawData,
  setResults
};