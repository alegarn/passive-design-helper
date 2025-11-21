import { writable, derived } from 'svelte/store';
import { results as fileStoreResults, setResults as fileSetResults } from './fileStore.js';

/**
 * Raw data from CSV files - array of row objects
 * @type {import('svelte/store').Writable<Array<Object>>}
 */
// `rawData` migrated to `fileStore` as the canonical store for file data
// Keep an alias for compatibility only if explicitly required elsewhere.
// export const rawData = writable([]);

/**
 * Column mapping configuration
 * @type {import('svelte/store').Writable<Object>}
 */

/**
 * Analysis results
 * @type {import('svelte/store').Writable<Object>}
 */
export const results = fileStoreResults;

/**
 * Helper function to set raw data and optionally reset results
 * @param {Array<Object>} data - The parsed CSV data
 * @param {boolean} resetResults - Whether to reset results when setting data (default: true)
 */
// `setRawData` moved to `fileStore`. Components should call `fileStore.setRawData` instead.
// export function setRawData(data, resetResults = true) {
//   rawData.set(data);
//   if (resetResults) {
//     results.set({ psychrometricData: null, comfortZones: null, tactics: null });
//   }
// }

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
// `setResults` migrated to `fileStore.setResults`
// For backwards compatibility, export a function that forwards to fileStore.setResults when available
export function setResults(resultsData) {
  if (typeof fileSetResults === 'function') {
    fileSetResults(resultsData);
  }
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
  results,
  setResults
};