import { writable, derived, readonly, get } from 'svelte/store';
import { start as startRequest, cancel as cancelRequest } from './requestManager.js';
import { normalizeOpenMeteoToFileData, parseCsvText, aggregateCsvStream } from '../utils/dataProcessor.js';
import { preferredZoneForPoint, ZONES, createZonesForMedianTemp } from '../scripts/zones.js';
import { classifyPoint } from '../scripts/classify.js';
import { ZONE_COLORS } from '../scripts/theme.js';
import { W_from_RH_T } from '../scripts/psychro/math.js';

// Selected month state exported for UI controls (YYYY-MM format or null for all)
export const selectedMonth = writable(null);

// Optional user override: allow UI to set a median temp to preview zones
export const medianOverride = writable(null);

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
            // console.debug('fileStore.fetchRemote: response.json() failed, falling back to text:', parseErr);
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
              // console.debug('fileStore.fetchRemote: normalizedData keys:', Object.keys(normalizedData || {}));
              // console.debug('fileStore.fetchRemote: normalizedData.headerFields:', normalizedData.headerFields);
              // console.debug('fileStore.fetchRemote: normalizedData.sampleRows (first 3):', (normalizedData.sampleRows || []).slice(0,3));
              // console.debug('fileStore.fetchRemote: normalizedData.file:', normalizedData.file && { name: normalizedData.file.name, type: normalizedData.file.type });
            } catch (dbgErr) {
              // console.debug('fileStore.fetchRemote: debug logging failed:', dbgErr);
            }
          } catch (e) {
            // Fallback: use raw payload as aggregationResult
            // console.debug('Normalizer failed, using raw payload:', e);
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
              aggregationResult: null // clear any existing aggregationResult
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
            // console.debug('fileStore.fetchRemote: committed successSnapshot.raw.headerFields:', successSnapshot.raw.headerFields);
            // console.debug('fileStore.fetchRemote: committed successSnapshot.raw.file:', successSnapshot.raw.file && { name: successSnapshot.raw.file.name, type: successSnapshot.raw.file.type });
            // console.debug('fileStore.fetchRemote: committed successSnapshot.raw.sampleRows (first 2):', (successSnapshot.raw.sampleRows || []).slice(0,2));
          } catch (dbgErr) {
            // console.debug('fileStore.fetchRemote: post-commit debug failed:', dbgErr);
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
            // console.debug('Request aborted:', currentRequestId);
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
            // console.debug('Request failed:', error);
          }
          
          throw error;
        }
      }
    });
    
    // Return the request info (the promise from startRequest is already correctly structured)
    // console.debug('fileStore.fetchRemote: returning promise:', promise);
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
            // console.debug('CSV loading aborted:', currentRequestId);
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
            // console.debug('CSV loading failed:', error);
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
        aggregationResult: null // clear existing aggregationResult
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
   * UI ephemeral state container (migrated from uiStore)
   */
  function setResults(resultsData) {
    const currentSnapshot = getSnapshot();
    const newSnapshot = {
      ...currentSnapshot,
      ui: {
        ...currentSnapshot.ui,
        results: resultsData
      }
    };
    commit(newSnapshot);
  }

  /**
   * Set a UI-level meta.lastError value on the store snapshot
   * @param {string|null} message - Error message or null to clear
   */
  function setMetaLastError(message = null) {
    const currentSnapshot = getSnapshot();
    const newSnapshot = {
      ...currentSnapshot,
      meta: {
        ...currentSnapshot.meta,
        lastError: message
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
    // If we received an aggregation result, recompute the `summary` using
    // preferredZoneForPoint to avoid legacy 'Cold' labels from older CLI outputs
    let adjustedAggregation = aggregationResult;
    try {
      if (aggregationResult && Array.isArray(aggregationResult.rowsWithDur)) {
        // Compute median from incoming rows and create dynamically shifted zones for classification.
        // If user has supplied a median override, prefer that instead so 'Process' honors preview settings.
        const overrideMedian = get(medianOverride);
        const temps = aggregationResult.rowsWithDur.map(r => Number(r.temp)).filter(Number.isFinite).sort((a,b)=>a-b);
        const computedMedian = temps.length ? (temps.length % 2 ? temps[Math.floor(temps.length/2)] : ((temps[temps.length/2-1] + temps[temps.length/2]) / 2)) : 28;
        const med = (typeof overrideMedian === 'number' && Number.isFinite(overrideMedian)) ? overrideMedian : computedMedian;
        const dynamicZones = createZonesForMedianTemp(med);
        const totals = {};
        const classifyCache = new Map(); // small per-processing cache to avoid repeated classifyPoint work for identical values
        for (const r of aggregationResult.rowsWithDur) {
          const t = Number(r.temp);
          const h = Number(r.rh);
          if (!Number.isFinite(t) || !Number.isFinite(h)) continue;
          // Cache classification on rounded values (to 0.1) to reduce duplicate work
          const key = `${Math.round(t*10)}_${Math.round(h*10)}`;
          let id;
          if (classifyCache.has(key)) {
            id = classifyCache.get(key);
          } else {
            id = classifyPoint ? classifyPoint(t, h, dynamicZones) : (r.zone || 'Unclassified');
            classifyCache.set(key, id);
          }
          totals[id] = (totals[id] || 0) + (r.dur || r.durMs || 0);
        }
        const totalMs = Object.values(totals).reduce((s, v) => s + v, 0) || 1;
        const summary = Object.keys(totals).map(k => ({ zone: k, hours: Number((totals[k] / (1000*60*60)).toFixed(3)), percent: Number((totals[k] * 100 / totalMs).toFixed(2)), milliseconds: totals[k], color: ZONE_COLORS[k] || '#999999' })).sort((a,b) => b.hours - a.hours);
        adjustedAggregation = { ...aggregationResult, summary };
      }
    } catch (e) {
      // If re-computation fails, just continue with original aggregation
      adjustedAggregation = aggregationResult;
    }

    const newSnapshot = {
      ...currentSnapshot,
      raw: {
        ...currentSnapshot.raw,
        aggregationResult: adjustedAggregation
      }
    };
    // Debug log to help trace why TimeSeries stat cards may not appear.
    // Logs aggregationResult keys and a small sample row if present.
    try {
      // console.debug('[fileStore] setAggregationResult called - keys:', Object.keys(aggregationResult || {}));
      const sampleRow =
        aggregationResult && aggregationResult.rowsWithDur && aggregationResult.rowsWithDur.length
          ? aggregationResult.rowsWithDur[0]
          : aggregationResult && aggregationResult.rows && aggregationResult.rows.length
          ? aggregationResult.rows[0]
          : aggregationResult && aggregationResult.timeSeries && aggregationResult.timeSeries.length
          ? aggregationResult.timeSeries[0]
          : null;
      // console.debug('[fileStore] setAggregationResult sampleRow:', sampleRow);
    } catch (e) {
      // console.debug('[fileStore] setAggregationResult logging failed:', e);
    }
    commit(newSnapshot);
    // Reset selected month to 'all' when a new aggregation result is set to avoid stale selections
    try { selectedMonth.set(null); } catch (err) { if (typeof console !== 'undefined' && typeof console.debug === 'function') console.debug('selectedMonth.set failed', err); }
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

  /**
   * Set selectedMonth value (YYYY-MM or null) - kept in module-level store `selectedMonth`.
   * Provided here to keep callers using fileStore API able to set the current month selection.
   * @param {string|null} monthKey
   */
  function setSelectedMonth(monthKey = null) {
    try {
      selectedMonth.set(monthKey);
    } catch (e) {
      // in case selectedMonth is not available, write directly to internal store snapshot
      const currentSnapshot = getSnapshot();
      const newSnapshot = {
        ...currentSnapshot,
        ui: {
          ...(currentSnapshot.ui || {}),
          selectedMonth: monthKey
        }
      };
      commit(newSnapshot);
    }
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
    setAggregationResult,
    setMapping,
    setResults,
    setMetaLastError,
    // New UI store helpers
    setSelectedMonth
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
 * UI ephemeral results derived from fileStore.ui.results
 */
const _results = derived(fileStore, $s => $s?.ui?.results || { psychrometricData: null, comfortZones: null, tactics: null });
export const results = readonly(_results);

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

// selectedMonth is a module-level writable declared earlier

/**
 * Available months derived from the aggregation result: an array of YYYY-MM strings.
 */
const _availableMonths = derived(fileStore, $s => {
  const agg = $s?.raw?.aggregationResult;
  if (!agg) return [];
  // Prefer explicit months list from aggregationResult
  if (Array.isArray(agg.months) && agg.months.length) return agg.months;
  // Fallback: try computing from perMonth, perBucket or rowsWithDur
  if (agg.perMonth && typeof agg.perMonth === 'object') return Object.keys(agg.perMonth).sort();
  if (agg.perBucket && typeof agg.perBucket === 'object') {
    // If perBucket keys are month-like (YYYY-MM), use them
    const keys = Object.keys(agg.perBucket).filter(k => /^\d{4}-\d{2}$/.test(k)).sort();
    if (keys.length) return keys;
  }
  if (Array.isArray(agg.rowsWithDur) && agg.rowsWithDur.length) {
    const months = new Set();
    for (const r of agg.rowsWithDur) {
      try {
        const d = new Date(r.ts);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        months.add(key);
      } catch (err) { if (typeof console !== 'undefined' && typeof console.debug === 'function') console.debug('availableMonths row conversion failed', err); }
    }
    return Array.from(months).sort();
  }
  return [];
});
export const availableMonths = readonly(_availableMonths);

/**
 * Filtered timeSeries derived from fileStore.timeSeries and selectedMonth selection.
 * When selectedMonth is null, returns the full timeSeries.
 */
const _filteredTimeSeries = derived([timeSeries, selectedMonth], ([$ts, $sel]) => {
  if (!$ts || !$ts.length) return [];
  if (!$sel) return $ts;
  // Filter rows with month matching selectedMonth
  try {
    const [y, m] = $sel.split('-').map(n => Number(n));
    const start = new Date(y, m - 1, 1).getTime();
    const end = new Date(y, m, 0, 23, 59, 59, 999).getTime();
    return $ts.filter(r => {
      try {
        const tsMs = typeof r.ts === 'number' ? r.ts : new Date(r.ts).getTime();
        return tsMs >= start && tsMs <= end;
      } catch (e) { return false; }
    });
  } catch (e) {
    return $ts;
  }
});
export const filteredTimeSeries = readonly(_filteredTimeSeries);

/**
 * Median temperature derived store: derive median temperature (°C) from current data
 * Prefers `rowsWithDur` from aggregation result, fallbacks to `filteredTimeSeries`.
 * If no temperature data available, returns BASELINE_MEDIAN (28°C) as a neutral default.
 */
const _dataMedianTemp = derived([fileStore, selectedMonth, filteredTimeSeries], ([$s, $selected, $filtered]) => {
  let rows = [];
  const agg = $s?.raw?.aggregationResult;
  if (agg) {
    if ($selected && agg.perMonth && agg.perMonth[$selected]) {
      rows = agg.perMonth[$selected].rows || [];
    } else if (agg.rowsWithDur) {
      if ($selected) {
        rows = agg.rowsWithDur.filter(r => {
          const d = new Date(r.ts);
          return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` === $selected;
        });
      } else {
        rows = agg.rowsWithDur;
      }
    }
  }
  if (!rows.length) {
    rows = $filtered || [];
  }
  const temps = [];
  for (const r of rows) {
    const v = r.temp ?? r.T ?? r.t ?? r.temperature ?? r.temp_c ?? r.temp_celsius;
    const val = typeof v === 'number' ? v : (v ? Number(String(v).replace(/[^0-9.+-eE-]/g, '')) : NaN);
    if (Number.isFinite(val)) temps.push(Number(val));
  }
  if (!temps.length) return null; // fallback to null if no data
  temps.sort((a,b)=>a-b);
  const mid = Math.floor((temps.length - 1) / 2);
  const computedMedian = temps.length % 2 ? temps[mid] : ((temps[mid] + temps[mid+1]) / 2);
  return computedMedian;
});
export const dataMedianTemp = readonly(_dataMedianTemp);

/**
 * Combined median for logic (comfort zones): prefers user override over actual data median.
 */
const _medianTemp = derived([_dataMedianTemp, medianOverride], ([$dataMedian, $medianOverride]) => {
  return $medianOverride ?? $dataMedian ?? 28;
});
export const medianTemp = readonly(_medianTemp);

/**
 * Current summary data depending on the selected month
 * If no selectedMonth, returns full aggregationResult; if a month is selected, returns
 * an object with summary and psychrometricData limited to that month.
 */
const _currentSummaryData = derived([fileStore, selectedMonth, _medianTemp], ([$s, $selected, $median]) => {
  const Object = window.Object || globalThis.Object; // just sanity
  const agg = $s?.raw?.aggregationResult;
  if (!agg) return null;

  const dynamicZones = createZonesForMedianTemp($median);
  const computeZoneAndColor = (r) => {
    const t = r.temp;
    const rh = (r.rh || r.rhPercent || 0); // note: agg uses rh in %, but `preferredZoneForPoint` expects logic as per how zone classify works, which is % usually or fraction? Actually, W_from_RH_T takes fraction `rh/100`. Let's check `preferredZoneForPoint` arguments in other places. Usually `t, rh` where rh is %.
    // Let's look at `classifyPoint(t, rh, ...)` in `classify.js`.
    const zone = classifyPoint(t, rh, dynamicZones) || 'Unclassified';
    return { zone, color: ZONE_COLORS[zone] || '#999999' };
  };

  if (!$selected) {
    if (agg.rowsWithDur) {
      const rows = agg.rowsWithDur;
      const psychrometricData = rows.map(r => {
        const zc = computeZoneAndColor(r);
        return {
          T: r.temp,
          W: W_from_RH_T((r.rh || r.rhPercent || 0) / 100, r.temp),
          zone: zc.zone,
          color: zc.color
        };
      });
      const zoneTotals = {};
      for (const r of rows) {
        const z = computeZoneAndColor(r).zone;
        zoneTotals[z] = (zoneTotals[z] || 0) + (r.dur || r.durMs || 0);
      }
      const msTotal = Object.values(zoneTotals).reduce((sum, v) => sum + v, 0) || 1;
      const summary = Object.entries(zoneTotals)
        .map(([zone, ms]) => ({ zone, hours: Number((ms / 3600000).toFixed(3)), percent: Number(((ms * 100) / msTotal).toFixed(2)), milliseconds: ms, color: ZONE_COLORS[zone] || '#999999' }))
        .sort((a, b) => b.hours - a.hours);
      
      return {
        ...agg,
        summary,
        psychrometricData
      };
    }
    return agg;
  }
  // If we find perMonth data from aggregationResult, prefer it
  const perMonth = agg.perMonth && agg.perMonth[$selected];
  if (perMonth) {
    // Build psychrometricData from perMonth.rows
    const rows = perMonth.rows || [];
    const zoneTotals = {};
    const psychrometricData = rows.map(r => {
      const zc = computeZoneAndColor(r);
      const z = zc.zone;
      zoneTotals[z] = (zoneTotals[z] || 0) + (r.dur || r.durMs || 0);
      return {
        T: r.temp,
        W: W_from_RH_T((r.rh || r.rhPercent || 0) / 100, r.temp),
        zone: z,
        color: zc.color
      };
    });
    
    const msTotal = Object.values(zoneTotals).reduce((sum, v) => sum + v, 0) || 1;
    const summary = Object.entries(zoneTotals)
      .map(([zone, ms]) => ({ zone, hours: Number((ms / 3600000).toFixed(3)), percent: Number(((ms * 100) / msTotal).toFixed(2)), milliseconds: ms, color: ZONE_COLORS[zone] || '#999999' }))
      .sort((a, b) => b.hours - a.hours);

    return {
      rowsWithDur: rows,
      summary: summary,
      perMonth: perMonth,
      psychrometricData
    };
  }
  // Fallback: filter rowsWithDur
  if (Array.isArray(agg.rowsWithDur)) {
    const rows = agg.rowsWithDur.filter(r => {
      const d = new Date(r.ts);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      return key === $selected;
    });
    const zoneTotals = {};
    const psychrometricData = rows.map(r => {
      const zc = computeZoneAndColor(r);
      const z = zc.zone;
      zoneTotals[z] = (zoneTotals[z] || 0) + (r.dur || r.durMs || 0);
      return {
        T: r.temp,
        W: W_from_RH_T((r.rh || r.rhPercent || 0) / 100, r.temp),
        zone: z,
        color: zc.color
      };
    });
    // Derive simple summary from rows
    const msTotal = Object.values(zoneTotals).reduce((sum, v) => sum + v, 0) || 1;
    const summary = Object.entries(zoneTotals).map(([zone, ms]) => ({ zone, hours: Number((ms / (1000 * 60 * 60)).toFixed(3)), percent: Number(((ms * 100) / msTotal).toFixed(2)), milliseconds: ms, color: ZONE_COLORS[zone] || '#999999' })).sort((a, b) => b.hours - a.hours);
    return {
      rowsWithDur: rows,
      summary,
      psychrometricData
    };
  }
  return null;
});
export const currentSummaryData = readonly(_currentSummaryData);

/**
 * Max metrics derived store: returns the maximum temperature and maximum RH in
 * currentSummaryData (per-month when selected, otherwise global)
 * { maxTemp, maxTempTs, maxRh, maxRhTs }
 */
const _maxMetrics = derived([currentSummaryData, filteredTimeSeries], ([$current, $filteredTS]) => {
  if (!$current) return { maxTemp: null, maxTempTs: null, maxRh: null, maxRhTs: null };
  // Prefer rowsWithDur when available - they contain temp & rh values
  const rows = $current?.rowsWithDur || $current?.rows || $filteredTS || [];
  let maxTemp = null;
  let maxTempTs = null;
  let maxRh = null;
  let maxRhTs = null;

  const parseNumber = (value) => {
    if (value === undefined || value === null) return NaN;
    if (typeof value === 'number') return value;
    // Try to parse strings or numeric-like values
    const n = Number(String(value).replace(/[^0-9.+-eE]/g, ''));
    return Number.isFinite(n) ? n : NaN;
  };

  for (const r of rows) {
    // Attempt to find temperature and RH values by property names heuristics
    function findNumericByParts(obj, parts) {
      for (const key of Object.keys(obj || {})) {
        const lower = String(key || '').toLowerCase();
        for (const p of parts) {
          if (lower === p || lower.includes(p)) {
            const val = parseNumber(obj[key]);
            if (Number.isFinite(val)) return val;
          }
        }
      }
      return NaN;
    }

    const t = findNumericByParts(r, ['temp', 'temperature', 'air_temp', 'temp_c', 'temp_celsius']);
    let rh = findNumericByParts(r, ['rh', 'relative_humidity', 'humidity', 'hum', 'rhpercent', 'rh_pct']);

    // If RH is a fraction (0 to 1), scale to percentage
    if (Number.isFinite(rh) && rh > 0 && rh <= 1) {
      rh = rh * 100;
    }

    const ts = r.ts !== undefined ? (typeof r.ts === 'number' ? r.ts : (new Date(r.ts)).getTime()) : null;

    // Fallback scanning: if not found by key heuristic, scan all numeric properties
    let tCandidates = Number.isFinite(t) ? [t] : [];
    let rhCandidates = Number.isFinite(rh) ? [rh] : [];
    if (!Number.isFinite(t) || !Number.isFinite(rh)) {
      for (const key of Object.keys(r || {})) {
        if (key === 'ts' || key === 'dur' || key === 'durMs' || key === 'zone' || key === 'raw') continue;
        const val = parseNumber(r[key]);
        if (!Number.isFinite(val)) continue;
        // classify by plausible ranges
        if (!Number.isFinite(t) && val >= -50 && val <= 80) {
          tCandidates.push(val);
        }
        if (!Number.isFinite(rh) && val >= 0 && val <= 100) {
          rhCandidates.push(val);
        }
      }
    }
    // If still not found, do a shallow recursive scan of nested objects
    function deepFindNumericByParts(obj, parts, depth = 0, maxDepth = 2) {
      if (!obj || typeof obj !== 'object' || depth > maxDepth) return NaN;
      for (const key of Object.keys(obj)) {
        const val = obj[key];
        const lower = String(key || '').toLowerCase();
        for (const p of parts) {
          if (lower === p || lower.includes(p)) {
            const n = parseNumber(val);
            if (Number.isFinite(n)) return n;
          }
        }
        if (typeof val === 'object') {
          const found = deepFindNumericByParts(val, parts, depth + 1, maxDepth);
          if (Number.isFinite(found)) return found;
        }
      }
      return NaN;
    }
    if (tCandidates.length === 0) {
      const deepT = deepFindNumericByParts(r, ['temp', 'temperature', 'air_temp', 'temp_c', 'temp_celsius']);
      if (Number.isFinite(deepT)) tCandidates.push(deepT);
    }
    if (rhCandidates.length === 0) {
      const deepRh = deepFindNumericByParts(r, ['rh', 'relative_humidity', 'humidity', 'hum']);
      if (Number.isFinite(deepRh)) rhCandidates.push(deepRh);
    }
    const tFinal = tCandidates.length ? Math.max(...tCandidates) : NaN;
    const rhFinal = rhCandidates.length ? Math.max(...rhCandidates) : NaN;

    if (Number.isFinite(tFinal)) {
      if (maxTemp === null || tFinal > maxTemp) {
        maxTemp = tFinal;
        maxTempTs = ts;
      }
    }
    if (Number.isFinite(rhFinal)) {
      if (maxRh === null || rhFinal > maxRh) {
        maxRh = rhFinal;
        maxRhTs = ts;
      }
    }
  }

  // Guard: convert NaN to null for stability
  if (!Number.isFinite(maxTemp)) maxTemp = null;
  if (!Number.isFinite(maxRh)) maxRh = null;

  return { maxTemp, maxTempTs, maxRh, maxRhTs };
});
export const maxMetrics = readonly(_maxMetrics);

/**
 * Min metrics derived store: returns the minimum temperature and minimum RH in
 * currentSummaryData (per-month when selected, otherwise global)
 * { minTemp, minTempTs, minRh, minRhTs }
 */
const _minMetrics = derived([currentSummaryData, filteredTimeSeries], ([$current, $filteredTS]) => {
  if (!$current) return { minTemp: null, minTempTs: null, minRh: null, minRhTs: null };
  const rows = $current?.rowsWithDur || $current?.rows || $filteredTS || [];
  let minTemp = null;
  let minTempTs = null;
  let minRh = null;
  let minRhTs = null;

  const parseNumber = (value) => {
    if (value === undefined || value === null) return NaN;
    if (typeof value === 'number') return value;
    const n = Number(String(value).replace(/[^0-9.+-eE]/g, ''));
    return Number.isFinite(n) ? n : NaN;
  };

  const findNumericByParts = (obj, parts) => {
    for (const key of Object.keys(obj || {})) {
      const lower = String(key || '').toLowerCase();
      for (const p of parts) {
        if (lower === p || lower.includes(p)) {
          const val = parseNumber(obj[key]);
          if (Number.isFinite(val)) return val;
        }
      }
    }
    return NaN;
  };

  function deepFindNumericByParts(obj, parts, depth = 0, maxDepth = 2) {
    if (!obj || typeof obj !== 'object' || depth > maxDepth) return NaN;
    for (const key of Object.keys(obj)) {
      const val = obj[key];
      const lower = String(key || '').toLowerCase();
      for (const p of parts) {
        if (lower === p || lower.includes(p)) {
          const n = parseNumber(val);
          if (Number.isFinite(n)) return n;
        }
      }
      if (typeof val === 'object') {
        const found = deepFindNumericByParts(val, parts, depth + 1, maxDepth);
        if (Number.isFinite(found)) return found;
      }
    }
    return NaN;
  }

  for (const r of rows) {
    const t = findNumericByParts(r, ['temp', 'temperature', 'air_temp', 'temp_c', 'temp_celsius']);
    let rh = findNumericByParts(r, ['rh', 'relative_humidity', 'humidity', 'hum', 'rhpercent', 'rh_pct']);
    if (Number.isFinite(rh) && rh > 0 && rh <= 1) rh = rh * 100;
    const ts = r.ts !== undefined ? (typeof r.ts === 'number' ? r.ts : (new Date(r.ts)).getTime()) : null;

    let tCandidates = Number.isFinite(t) ? [t] : [];
    let rhCandidates = Number.isFinite(rh) ? [rh] : [];
    if (!Number.isFinite(t) || !Number.isFinite(rh)) {
      for (const key of Object.keys(r || {})) {
        if (key === 'ts' || key === 'dur' || key === 'durMs' || key === 'zone' || key === 'raw') continue;
        const val = parseNumber(r[key]);
        if (!Number.isFinite(val)) continue;
        if (!Number.isFinite(t) && val >= -100 && val <= 100) tCandidates.push(val);
        if (!Number.isFinite(rh) && val >= 0 && val <= 100) rhCandidates.push(val);
      }
    }
    if (tCandidates.length === 0) {
      const deepT = deepFindNumericByParts(r, ['temp', 'temperature', 'air_temp', 'temp_c', 'temp_celsius']);
      if (Number.isFinite(deepT)) tCandidates.push(deepT);
    }
    if (rhCandidates.length === 0) {
      const deepRh = deepFindNumericByParts(r, ['rh', 'relative_humidity', 'humidity', 'hum']);
      if (Number.isFinite(deepRh)) rhCandidates.push(deepRh);
    }
    const tFinal = tCandidates.length ? Math.min(...tCandidates) : NaN;
    const rhFinal = rhCandidates.length ? Math.min(...rhCandidates) : NaN;

    if (Number.isFinite(tFinal)) {
      if (minTemp === null || tFinal < minTemp) {
        minTemp = tFinal;
        minTempTs = ts;
      }
    }
    if (Number.isFinite(rhFinal)) {
      if (minRh === null || rhFinal < minRh) {
        minRh = rhFinal;
        minRhTs = ts;
      }
    }
  }

  if (!Number.isFinite(minTemp)) minTemp = null;
  if (!Number.isFinite(minRh)) minRh = null;
  return { minTemp, minTempTs, minRh, minRhTs };
});
export const minMetrics = readonly(_minMetrics);

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