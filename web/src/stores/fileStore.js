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
      rawData: [],
      sampleRows: [],
      dayFirst: null,
      dataSpanInfo: null,
      mapping: {
        timestamp: null,
        temperature: null,
        humidity: null
      },
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
      setAggregationResult,
      setMapping
      setRawData
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
          
          // Parse response as JSON (Open-Meteo returns JSON).
          // We always parse JSON so the normalizer gets structured data,
          // but we allow the caller to request the normalized file format
          // (csv or json) via params.format.
          let payload;
          try {
            payload = await response.json();
          } catch (parseErr) {
            // If parsing fails, fall back to text to preserve raw payload for debugging
            console.debug('fileStore.fetchRemote: response.json() failed, falling back to text:', parseErr);
            payload = await response.text();
          }
          const requestedOutputFormat = params.format || 'json';
           
           // Normalize the fetched payload using available normalizer
           let normalizedData;
           try {
             // Try to use OpenMeteo normalizer first
             // Use requestedOutputFormat (was incorrectly using undefined `format`)
             const filename = `remote_data.${requestedOutputFormat}`;
             normalizedData = normalizeOpenMeteoToFileData(payload, filename, requestedOutputFormat);

            // Debug: show normalized keys so UI can inspect header detection
            try {
              console.debug('fileStore.fetchRemote: normalizedData keys:', Object.keys(normalizedData || {}));
              console.debug('fileStore.fetchRemote: normalizedData.headerFields:', normalizedData.headerFields);
              console.debug('fileStore.fetchRemote: normalizedData.sampleRows (first 3):', (normalizedData.sampleRows || []).slice(0,3));
              console.debug('fileStore.fetchRemote: normalizedData.file:', normalizedData.file && { name: normalizedData.file.name, type: normalizedData.file.type });
            } catch (dbgErr) {
              console.debug('fileStore.fetchRemote: debug logging failed:', dbgErr);
            }
          } catch (e) {
            // Fallback: use raw payload as aggregationResult
            console.debug('Normalizer failed, using raw payload:', e);
            normalizedData = { aggregationResult: payload };
          }
          
          // Commit file-level metadata (file, headers, samples) but do NOT set aggregationResult.
          // This makes the fetched file available to ProcessControls for user verification and
          // explicit processing, without triggering charts automatically.
          const successSnapshot = {
            ...stagingSnapshot,
            raw: {
              ...currentSnapshot.raw,
              file: normalizedData.file || currentSnapshot.raw.file,
              headerFields: normalizedData.headerFields || currentSnapshot.raw.headerFields,
              sampleRows: normalizedData.sampleRows || currentSnapshot.raw.sampleRows,
              dayFirst: normalizedData.dayFirst ?? currentSnapshot.raw.dayFirst,
              dataSpanInfo: normalizedData.dataSpanInfo || currentSnapshot.raw.dataSpanInfo,
              aggregationResult: currentSnapshot.raw.aggregationResult // keep existing aggregationResult (do not overwrite)
            },
            meta: {
              ...stagingSnapshot.meta,
              loadingCount: Math.max(0, stagingSnapshot.meta.loadingCount - 1),
              lastError: null
            }
          };
          commit(successSnapshot);

          // Debug: confirm what was committed so ProcessControls can rely on it
          try {
            console.debug('fileStore.fetchRemote: committed successSnapshot.raw.headerFields:', successSnapshot.raw.headerFields);
            console.debug('fileStore.fetchRemote: committed successSnapshot.raw.file:', successSnapshot.raw.file && { name: successSnapshot.raw.file.name, type: successSnapshot.raw.file.type });
            console.debug('fileStore.fetchRemote: committed successSnapshot.raw.sampleRows (first 2):', (successSnapshot.raw.sampleRows || []).slice(0,2));
          } catch (dbgErr) {
            console.debug('fileStore.fetchRemote: post-commit debug failed:', dbgErr);
          }
          
          // Return the normalized data and raw payload for component use (download, preview)
          // Prefer returning aggregationResult when available, otherwise return raw Open‑Meteo payload
          // if it contains hourly data so callers expecting that shape still work.
          const resultToReturn = normalizedData?.aggregationResult
            ? normalizedData.aggregationResult
            : (payload && payload.hourly ? payload : normalizedData);

          return { currentRequestId, result: resultToReturn, rawPayload: payload };
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
    
    // Return the request info (the promise from startRequest is already correctly structured)
    console.debug('fileStore.fetchRemote: returning promise:', promise);
    return promise;
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
    return promise;
  }

  /**
   * Cancels a request using the request manager
   * @param {string} requestId - The ID of the request to cancel
   * @returns {boolean} True if request was found and cancelled, false otherwise
   */
  function cancel(requestId) {
    return cancelRequest(requestId);
  }
 
  /**
   * Commit parsed file metadata (without running full aggregation).
   * This allows UploadZone to parse headers/samples and let the user
   * verify/change column mapping in ProcessControls before processing.
   *
   * @param {Object} parsed - Parsed metadata from UploadZone
   * @param {File} [parsed.file]
   * @param {string[]} [parsed.headerFields]
   * @param {any[]} [parsed.sampleRows]
   * @param {boolean|null} [parsed.dayFirst]
   * @param {any|null} [parsed.dataSpanInfo]
   */
  function setParsedRaw(parsed = {}) {
    const { file, headerFields, sampleRows, dayFirst, dataSpanInfo } = parsed;
    const currentSnapshot = getSnapshot();
    const newSnapshot = {
      ...currentSnapshot,
      raw: {
        ...currentSnapshot.raw,
        file: file ?? currentSnapshot.raw.file,
        headerFields: headerFields ?? currentSnapshot.raw.headerFields,
        sampleRows: sampleRows ?? currentSnapshot.raw.sampleRows,
        dayFirst: dayFirst ?? currentSnapshot.raw.dayFirst,
        dataSpanInfo: dataSpanInfo ?? currentSnapshot.raw.dataSpanInfo,
        // preserve any existing aggregationResult (do not overwrite)
        aggregationResult: currentSnapshot.raw.aggregationResult
      }
    };
    commit(newSnapshot);
  }

  /**
   * Set full parsed CSV as row objects in the store
   * @param {Array<Object>} data - Parsed rows
   * @param {boolean} resetResults - Whether to reset results (optional)
   */
  function setRawData(data = [], resetResults = true) {
    const currentSnapshot = getSnapshot();
    const newSnapshot = {
      ...currentSnapshot,
      raw: {
        ...currentSnapshot.raw,
        rawData: Array.isArray(data) ? data : []
      }
    };
    commit(newSnapshot);
  }

  /**
   * Commit aggregation result produced by ProcessControls into the store.
   * This will make the charts and exports react to the processed data.
   *
   * @param {Object} aggregationResult - Result object returned by processing
   */
  function setAggregationResult(aggregationResult) {
    const currentSnapshot = getSnapshot();
    const newSnapshot = {
      ...currentSnapshot,
      raw: {
        ...currentSnapshot.raw,
        aggregationResult: aggregationResult
      }
    };
    // Debug log to help trace why TimeSeries stat cards may not appear.
    // Logs aggregationResult keys and a small sample row if present.
    try {
      console.debug('[fileStore] setAggregationResult called - keys:', Object.keys(aggregationResult || {}));
      const sampleRow =
        aggregationResult && aggregationResult.rowsWithDur && aggregationResult.rowsWithDur.length
          ? aggregationResult.rowsWithDur[0]
          : aggregationResult && aggregationResult.rows && aggregationResult.rows.length
          ? aggregationResult.rows[0]
          : aggregationResult && aggregationResult.timeSeries && aggregationResult.timeSeries.length
          ? aggregationResult.timeSeries[0]
          : null;
      console.debug('[fileStore] setAggregationResult sampleRow:', sampleRow);
    } catch (e) {
      console.debug('[fileStore] setAggregationResult logging failed:', e);
    }
    commit(newSnapshot);
  }

  /**
   * Set column mapping configuration on the file store
   * @param {Object} mappingConfig - e.g. { timestamp, temperature, humidity }
   */
  function setMapping(mappingConfig = {}) {
    const currentSnapshot = getSnapshot();
    const newSnapshot = {
      ...currentSnapshot,
      raw: {
        ...currentSnapshot.raw,
        mapping: {
          ...(currentSnapshot.raw.mapping || {}),
          ...(mappingConfig || {})
        }
      }
    };
    commit(newSnapshot);
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
    cancel,
    setParsedRaw,
    setAggregationResult
    ,
    setMapping
  };
}

// Create the default shared instance
export const fileStore = createFileStore();


// PR5 Step A: New readonly derived selectors

/**
 * Readonly time series for charts derived from fileStore snapshot.
 * Returns an array of { ts, value, ... } points or an empty array.
 */
const _timeSeries = derived(fileStore, $s => {
  const agg = $s?.raw?.aggregationResult;
  if (!agg) return [];
  // Safe fallback: expect agg.timeSeries or agg.rowsWithDur
  if (Array.isArray(agg.timeSeries)) return agg.timeSeries;
  if (Array.isArray(agg.rowsWithDur)) return agg.rowsWithDur;
  if (Array.isArray(agg.rows)) return agg.rows.map(r => ({ ts: r[0], value: r[1] }));
  return [];
});
export const timeSeries = readonly(_timeSeries);

/**
 * Raw parsed rows (array of objects) derived from fileStore snapshot.
 * This mirrors previous uiStore.rawData store.
 */
const _rawData = derived(fileStore, $s => $s?.raw?.rawData || []);
export const rawData = readonly(_rawData);

/**
 * Lightweight aggregation summary (counts, min/max) derived from aggregationResult.
 */
const _aggregationSummary = derived(fileStore, $s => {
  const agg = $s?.raw?.aggregationResult;
  if (!agg) return null;
  // Safe fallback: provide basic counts if agg.rowsWithDur or agg.summary present
  if (Array.isArray(agg.summary)) return agg.summary;
  if (Array.isArray(agg.rowsWithDur)) return { rows: agg.rowsWithDur.length };
  if (Array.isArray(agg.rows)) return { rows: agg.rows.length };
  return { present: true };
});
export const aggregationSummary = readonly(_aggregationSummary);

/**
 * isLoading derived from meta.loadingCount
 */
const _isLoading = derived(fileStore, $s => Boolean($s?.meta?.loadingCount > 0));
export const isLoading = readonly(_isLoading);

/**
 * lastError derived from meta.lastError
 */
const _lastError = derived(fileStore, $s => $s?.meta?.lastError ?? null);
export const lastError = readonly(_lastError);

/**
 * Current mapping configuration derived store
 */
const _mapping = derived(fileStore, $s => $s?.raw?.mapping || { timestamp: null, temperature: null, humidity: null });
export const mapping = readonly(_mapping);

/**
 * Derived boolean for mapping complete
 */
const _isMappingComplete = derived(mapping, $m => Boolean($m && $m.timestamp && $m.temperature && $m.humidity));
export const isMappingComplete = readonly(_isMappingComplete);

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