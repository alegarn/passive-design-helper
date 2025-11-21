import { writable, derived, readonly, get } from 'svelte/store';

/**
 * @typedef {Object} Snapshot
 * @property {Object} raw - Raw file data
 * @property {File|null} raw.file - The uploaded file object
 * @property {string[]} raw.headerFields - Array of column header names
 * @property {any[]} raw.sampleRows - Sample rows from the file
 * @property {boolean|null} raw.dayFirst - Whether dates are in day-first format
 * @property {any|null} raw.dataSpanInfo - Information about data span/range
 * @property {any|null} raw.aggregationResult - Result of data aggregation
 * @property {Object} meta - Metadata about the state
 * @property {string[]} meta.requestIds - Array of active request IDs
 * @property {number} meta.loadingCount - Number of active loading operations
 * @property {any|null} meta.lastError - Last error that occurred
 * @property {any} [derived] - Optional place for cached derived values
 */

/**
 * Creates a fresh initial state for the file store
 * @returns {Snapshot} A new snapshot object with initial state
 */
function makeInitialState() {
  return {
    raw: {
      file: null,
      headerFields: [],
      sampleRows: [],
      dayFirst: null,
      dataSpanInfo: null,
      aggregationResult: null
    },
    meta: {
      requestIds: [],
      loadingCount: 0,
      lastError: null
    },
    derived: undefined // Optional place for cached derived values
  };
}

/**
 * Factory function to create a file store
 * @returns {Object} A file store object with methods and Svelte store interface
 */
export function createFileStore() {
  // Internal writable store to hold the canonical snapshot
  const internalStore = writable(makeInitialState());

  /**
   * Internal helper to atomically update the snapshot
   * @param {Snapshot} newSnapshot - The new snapshot to set
   */
  function commit(newSnapshot) {
    internalStore.set(newSnapshot);
  }

  /**
   * Gets the current snapshot synchronously
   * @returns {Snapshot} The current snapshot
   */
  function getSnapshot() {
    return get(internalStore);
  }

  /**
   * Resets the store to a fresh initial state
   */
  function reset() {
    commit(makeInitialState());
  }

  /**
   * Fetches remote data - placeholder implementation
   * @param {...any} args - Arguments for the fetch operation
   * @returns {Promise<never>} Promise that rejects with "Not implemented in PR2"
   */
  async function fetchRemote(...args) {
    return Promise.reject(new Error('fetchRemote: Not implemented in PR2'));
  }

  /**
   * Loads data from CSV - placeholder implementation
   * @param {...any} args - Arguments for the CSV loading operation
   * @returns {Promise<never>} Promise that rejects with "Not implemented in PR2"
   */
  async function loadFromCsv(...args) {
    return Promise.reject(new Error('loadFromCsv: Not implemented in PR2'));
  }

  /**
   * Cancels a request - placeholder implementation
   * @param {string} requestId - The ID of the request to cancel
   * @returns {boolean} Always returns false in this placeholder implementation
   */
  function cancel(requestId) {
    return false;
  }

  // Return the store object with Svelte store interface and methods
  return {
    // Svelte store interface
    subscribe: internalStore.subscribe,
    
    // Methods
    getSnapshot,
    reset,
    fetchRemote,
    loadFromCsv,
    cancel
  };
}

// Create the default shared instance
export const fileStore = createFileStore();

// Legacy shims with deprecation warnings
let fileDataWarned = false;
let loadingWarned = false;
let errorWarned = false;

// Legacy fileData shim - readonly derived store pointing to snapshot.raw
export const fileData = readonly(
  derived(
    fileStore,
    ($fileStore) => {
      if (!fileDataWarned) {
        console.warn('fileData is deprecated. Use fileStore.getSnapshot().raw instead.');
        fileDataWarned = true;
      }
      return $fileStore.raw;
    }
  )
);

// Legacy loading shim - readonly derived store pointing to snapshot.meta.loadingCount > 0
export const loading = readonly(
  derived(
    fileStore,
    ($fileStore) => {
      if (!loadingWarned) {
        console.warn('loading is deprecated. Use fileStore.getSnapshot().meta.loadingCount > 0 instead.');
        loadingWarned = true;
      }
      return $fileStore.meta.loadingCount > 0;
    }
  )
);

// Legacy error shim - readonly derived store pointing to snapshot.meta.lastError
export const error = readonly(
  derived(
    fileStore,
    ($fileStore) => {
      if (!errorWarned) {
        console.warn('error is deprecated. Use fileStore.getSnapshot().meta.lastError instead.');
        errorWarned = true;
      }
      return $fileStore.meta.lastError;
    }
  )
);

// Test hook for unit tests - only available in development
/**
 * Test hook to directly commit a snapshot for testing purposes
 * @param {Snapshot} snapshot - The snapshot to commit
 * @private This should only be used in tests
 */
export function commitForTest(snapshot) {
  if (process.env.NODE_ENV === 'development') {
    const internalStore = writable(makeInitialState());
    internalStore.set(snapshot);
    return internalStore;
  }
  throw new Error('commitForTest is only available in development mode');
}