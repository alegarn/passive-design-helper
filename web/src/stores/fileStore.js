import { writable, derived, readonly, get } from 'svelte/store';
import { start as startRequest, cancel as cancelRequest } from './requestManager.js';
import { normalizeOpenMeteoToFileData, parseCsvText, aggregateCsvStream } from '../utils/dataProcessor.js';

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
   * Creates a stable dedupe key from params using canonical JSON serialization
   * @param {Object} params - Parameters to serialize
   * @returns {string} Stable dedupe key
   */
  function createDedupeKey(params) {
    // Sort keys and create canonical JSON
    const sortedKeys = Object.keys(params).sort();
    const canonical = {};
    for (const key of sortedKeys) {
      canonical[key] = params[key];
    }
    return JSON.stringify(canonical);
  }

  /**
   * Fetches remote data using the request manager
   * @param {Object} params - Parameters for the fetch operation
   * @param {string} params.url - URL to fetch from
   * @param {string} [params.format] - Response format ('json' or 'csv')
   * @returns {Promise<Object>} Promise that resolves with { requestId, result }
   */
  async function fetchRemote(params) {
    // Validate params
    if (!params || !params.url) {
      throw new Error('fetchRemote: params.url is required');
    }

    // Create stable dedupe key
    const dedupeKey = createDedupeKey(params);
    
    // Start the request
    const { requestId, promise } = startRequest({
      dedupeKey,
      executor: async (signal, currentRequestId) => {
        // Get current snapshot for staging
        const currentSnapshot = getSnapshot();
        
        // Stage loading state increment
        const stagingSnapshot = {
          ...currentSnapshot,
          meta: {
            ...currentSnapshot.meta,
            loadingCount: currentSnapshot.meta.loadingCount + 1,
            requestIds: [...currentSnapshot.meta.requestIds, currentRequestId]
          }
        };
        
        // Commit staged loading state
        commit(stagingSnapshot);
        
        try {
          // Build URL
          const url = params.url;
          
          // Perform fetch with abort signal
          const response = await fetch(url, { signal });
          
          // Handle HTTP errors
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }
          
          // Parse response based on format
          let payload;
          const format = params.format || 'json';
          if (format === 'json') {
            payload = await response.json();
          } else {
            payload = await response.text();
          }
          
          // Normalize the fetched payload using available normalizer
          let normalizedData;
          try {
            // Try to use OpenMeteo normalizer first
            const filename = `remote_data.${format}`;
            normalizedData = normalizeOpenMeteoToFileData(payload, filename, format);
          } catch (e) {
            // Fallback: use raw payload as aggregationResult
            console.debug('Normalizer failed, using raw payload:', e);
            normalizedData = { aggregationResult: payload };
          }
          
          // Commit successful result
          const successSnapshot = {
            ...stagingSnapshot,
            raw: {
              ...currentSnapshot.raw,
              aggregationResult: normalizedData.aggregationResult || normalizedData
            },
            meta: {
              ...stagingSnapshot.meta,
              loadingCount: stagingSnapshot.meta.loadingCount - 1,
              lastError: null
            }
          };
          commit(successSnapshot);
          
          return { currentRequestId, result: normalizedData.aggregationResult || normalizedData };
        } catch (error) {
          // Get fresh snapshot for error handling
          const freshSnapshot = getSnapshot();
          
          if (error.name === 'AbortError') {
            // On abort: decrement loadingCount and remove requestId
            const abortSnapshot = {
              ...freshSnapshot,
              meta: {
                ...freshSnapshot.meta,
                loadingCount: Math.max(0, freshSnapshot.meta.loadingCount - 1),
                requestIds: freshSnapshot.meta.requestIds.filter(id => id !== currentRequestId)
              }
            };
            commit(abortSnapshot);
            console.debug('Request aborted:', currentRequestId);
          } else {
            // On other errors: set lastError and decrement loadingCount
            const errorSnapshot = {
              ...freshSnapshot,
              meta: {
                ...freshSnapshot.meta,
                loadingCount: Math.max(0, freshSnapshot.meta.loadingCount - 1),
                lastError: error.message
              }
            };
            commit(errorSnapshot);
            console.debug('Request failed:', error);
          }
          
          throw error;
        }
      }
    });
    
    // Return the request info
    return promise.then(result => ({ requestId, result }));
  }

  /**
   * Loads data from CSV file or text using the request manager
   * @param {File|string} fileOrText - File object or CSV text string
   * @returns {Promise<Object>} Promise that resolves with { requestId, result }
   */
  async function loadFromCsv(fileOrText) {
    // Create dedupe key based on input type and content
    const dedupeKey = typeof fileOrText === 'string'
      ? `csv_text_${fileOrText.slice(0, 100)}` // First 100 chars of text
      : `csv_file_${fileOrText.name}_${fileOrText.size}_${fileOrText.lastModified}`;
    
    // Start request using requestManager
    const { requestId, promise } = startRequest({
      dedupeKey,
      executor: async (signal, currentRequestId) => {
        // Get current snapshot for staging
        const currentSnapshot = getSnapshot();
        
        // Stage loading state increment
        const stagingSnapshot = {
          ...currentSnapshot,
          meta: {
            ...currentSnapshot.meta,
            loadingCount: currentSnapshot.meta.loadingCount + 1,
            requestIds: [...currentSnapshot.meta.requestIds, currentRequestId]
          }
        };
        
        // Commit staged loading state before heavy work
        commit(stagingSnapshot);
        
        try {
          let result;
          
          if (typeof fileOrText === 'string') {
            // Parse CSV text
            result = await parseCsvText(fileOrText, { signal });
          } else {
            // Aggregate CSV file/stream
            result = await aggregateCsvStream(fileOrText, { signal });
          }
          
          // Commit successful result
          const successSnapshot = {
            ...stagingSnapshot,
            raw: {
              ...currentSnapshot.raw,
              file: typeof fileOrText === 'string' ? null : fileOrText,
              headerFields: result.headerFields || [],
              sampleRows: result.sampleRows || [],
              dayFirst: result.dayFirst || null,
              dataSpanInfo: result.dataSpanInfo || null,
              aggregationResult: result
            },
            meta: {
              ...stagingSnapshot.meta,
              loadingCount: stagingSnapshot.meta.loadingCount - 1,
              requestIds: stagingSnapshot.meta.requestIds.filter(id => id !== currentRequestId),
              lastError: null
            }
          };
          commit(successSnapshot);
          
          return { currentRequestId, result };
        } catch (error) {
          // Get fresh snapshot for error handling
          const freshSnapshot = getSnapshot();
          
          if (error.name === 'AbortError') {
            // On abort: commit meta cleanup (decrement loadingCount, remove requestId) only
            const abortSnapshot = {
              ...freshSnapshot,
              meta: {
                ...freshSnapshot.meta,
                loadingCount: Math.max(0, freshSnapshot.meta.loadingCount - 1),
                requestIds: freshSnapshot.meta.requestIds.filter(id => id !== currentRequestId)
              }
            };
            commit(abortSnapshot);
            console.debug('CSV loading aborted:', currentRequestId);
          } else {
            // On other errors: commit meta.lastError and decrement loadingCount, then rethrow
            const errorSnapshot = {
              ...freshSnapshot,
              meta: {
                ...freshSnapshot.meta,
                loadingCount: Math.max(0, freshSnapshot.meta.loadingCount - 1),
                lastError: error.message
              }
            };
            commit(errorSnapshot);
            console.debug('CSV loading failed:', error);
          }
          
          throw error;
        }
      }
    });
    
    // Return request info
    return promise.then(result => ({ requestId, result }));
  }

  /**
   * Cancels a request using the request manager
   * @param {string} requestId - The ID of the request to cancel
   * @returns {boolean} True if request was found and cancelled, false otherwise
   */
  function cancel(requestId) {
    return cancelRequest(requestId);
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