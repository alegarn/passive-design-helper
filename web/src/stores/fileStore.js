import { writable, derived } from 'svelte/store';
import { normalizeOpenMeteoToFileData, parseCsvStream } from '../utils/dataProcessor.js';

/**
 * Initial state for file data
 */
const initialState = {
  file: null,
  headerFields: [],
  sampleRows: [],
  dayFirst: null,
  dataSpanInfo: null,
  aggregationResult: null
};

/**
 * Writable store for file data
 * @type {import('svelte/store').Writable<Object>}
 */
export const fileData = writable(initialState);

/**
 * Writable store for loading state
 * @type {import('svelte/store').Writable<boolean>}
 */
export const loading = writable(false);

/**
 * Writable store for error state
 * @type {import('svelte/store').Writable<string>}
 */
export const error = writable('');

/**
 * Derived store to check if file data is available
 * @type {import('svelte/store').Derived<boolean>}
 */
export const hasFileData = derived(
  fileData,
  $fileData => $fileData && $fileData.file && $fileData.headerFields && $fileData.headerFields.length > 0
);

/**
 * Derived store to check if aggregation result is available
 * @type {import('svelte/store').Derived<boolean>}
 */
export const hasAggregationResult = derived(
  fileData,
  $fileData => $fileData && $fileData.aggregationResult
);

/**
 * Fetch data from Open-Meteo API and normalize it
 * @param {Object} params - Parameters for the API call
 * @param {string} params.url - Direct API URL (optional if using other params)
 * @param {number} params.latitude - Latitude (optional if using url)
 * @param {number} params.longitude - Longitude (optional if using url)
 * @param {string} params.start_date - Start date in YYYY-MM-DD format (optional if using url)
 * @param {string} params.end_date - End date in YYYY-MM-DD format (optional if using url)
 * @param {string} params.hourly - Comma-separated list of hourly variables (optional if using url)
 * @param {string} params.format - Output format ('csv' or 'json', default: 'csv')
 * @returns {Promise<void>}
 */
export async function fetchOpenMeteo(params) {
  loading.set(true);
  error.set('');
  
  try {
    let targetUrl;
    
    if (params.url) {
      targetUrl = params.url;
    } else {
      // Build URL from parameters
      const baseUrl = 'https://archive-api.open-meteo.com/v1/archive';
      const urlParams = new URLSearchParams({
        latitude: params.latitude,
        longitude: params.longitude,
        start_date: params.start_date,
        end_date: params.end_date,
        hourly: params.hourly
      });
      targetUrl = `${baseUrl}?${urlParams.toString()}`;
    }
    
    const response = await fetch(targetUrl);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    // Generate filename based on date range
    const startDate = params.start_date || data.hourly?.time?.[0]?.split('T')?.[0] || 'unknown';
    const endDate = params.end_date || data.hourly?.time?.[data.hourly.time.length - 1]?.split('T')?.[0] || 'unknown';
    const format = params.format || 'csv';
    const filename = `open-meteo-${startDate}-${endDate}.${format}`;
    
    // Normalize the data using the utility function
    const normalizedData = normalizeOpenMeteoToFileData(data, filename, format);
    
    // Update file data store
    fileData.update(current => ({
      ...current,
      ...normalizedData
    }));
    
    // TODO: Implement caching for repeated requests with same parameters
    
  } catch (err) {
    error.set(`Failed to fetch data: ${err.message}`);
    console.error('Open-Meteo fetch error:', err);
  } finally {
    loading.set(false);
  }
}

/**
 * Load and parse a file from the UploadZone component
 * @param {File} file - File object from file input
 * @returns {Promise<void>}
 */
export async function loadFile(file) {
  loading.set(true);
  error.set('');
  
  try {
    // Parse the CSV file to extract header and sample data
    const { headerFields, sampleRows, dayFirst, minDate, maxDate, totalDays } = await parseCsvStream(file, {
      sampleRows: 50,
      headerRowIndex: 0
    });
    
    // Build data span info
    const dataSpanInfo = {
      totalRows: totalDays ? Math.round(totalDays * 24) : 0, // Estimate based on days
      dateRange: minDate && maxDate ? {
        start: minDate.toISOString(),
        end: maxDate.toISOString()
      } : null
    };
    
    // Update file data store
    fileData.update(current => ({
      ...current,
      file,
      headerFields,
      sampleRows,
      dayFirst,
      dataSpanInfo
    }));
    
    // TODO: Implement file parsing for JSON files if needed
    
  } catch (err) {
    error.set(`Failed to load file: ${err.message}`);
    console.error('File load error:', err);
  } finally {
    loading.set(false);
  }
}

/**
 * Update aggregation result in the file data store
 * @param {Object} result - Aggregation result from ProcessControls
 */
export function updateAggregationResult(result) {
  console.log('fileStore: updateAggregationResult called with:', result);
  console.log('fileStore: psychrometricData length:', result?.psychrometricData?.length);
  fileData.update(current => ({
    ...current,
    aggregationResult: result
  }));
}

/**
 * Reset the file data store to initial state
 */
export function resetFileData() {
  fileData.set(initialState);
  error.set('');
}

/**
 * TODO: Implement caching mechanism for API requests
 * This could use a Map or IndexedDB to store responses by URL/parameters
 */

/**
 * TODO: Implement retry mechanism for failed requests
 * This could use exponential backoff and configurable retry limits
 */