import { writable, derived } from 'svelte/store';

/**
 * RequestManager - Manages in-flight requests with deduplication and cancellation support
 *
 * Provides deduplication for requests with the same dedupeKey and AbortController-based
 * cancellation for in-flight requests.
 */

// Internal storage for in-flight requests
const inFlight = new Map();
const dedupeMap = new Map();

// Writable store for reactive access to in-flight requests
export const inFlightStore = writable({});

/**
 * Generate a unique request ID
 * @returns {string} Unique request identifier
 */
function generateRequestId() {
  return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Update the reactive store with current in-flight requests
 */
function updateInFlightStore() {
  const snapshot = {};
  
  for (const [requestId, request] of inFlight) {
    snapshot[requestId] = {
      requestId: request.requestId,
      dedupeKey: request.dedupeKey,
      startedAt: request.startedAt
    };
  }
  
  inFlightStore.set(snapshot);
}

/**
 * Start a new request with optional deduplication
 * @param {Object} options - Request options
 * @param {string} [options.dedupeKey] - Optional key for deduplication
 * @param {Function} options.executor - Function that receives AbortSignal and requestId and returns Promise
 * @returns {Object} { requestId: string, promise: Promise<any> }
 */
export function start({ dedupeKey, executor }) {
  // Check for deduplication
  if (dedupeKey && dedupeMap.has(dedupeKey)) {
    const existingRequestId = dedupeMap.get(dedupeKey);
    const existingRequest = inFlight.get(existingRequestId);
    if (existingRequest) {
      return {
        requestId: existingRequestId,
        promise: existingRequest.promise
      };
    }
  }

  // Create new request
  const controller = new AbortController();
  const requestId = generateRequestId();
  const startedAt = new Date().toISOString();

  // Create the promise that will execute the user's executor
  const promise = new Promise((resolve, reject) => {
    try {
      const result = executor(controller.signal, requestId);
      // Handle both sync and async executors
      if (result && typeof result.then === 'function') {
        // Async executor - chain cleanup so it runs after the async work settles
        result.then(resolve, reject);
      } else {
        // Sync executor - resolve immediately
        resolve(result);
      }
    } catch (error) {
      reject(error);
    }
  }).finally(() => {
    // Cleanup when promise settles (works correctly for both sync and async)
    cleanup(requestId, dedupeKey);
  });

  // Store request details
  const requestEntry = {
    requestId,
    dedupeKey,
    controller,
    promise,
    startedAt
  };

  inFlight.set(requestId, requestEntry);
  
  if (dedupeKey) {
    dedupeMap.set(dedupeKey, requestId);
  }

  // Update reactive store
  updateInFlightStore();

  return {
    requestId,
    promise
  };
}

/**
 * Cancel an in-flight request
 * @param {string} requestId - Request ID to cancel
 * @returns {boolean} True if request was found and cancelled, false otherwise
 */
export function cancel(requestId) {
  const request = inFlight.get(requestId);
  if (!request) {
    return false;
  }

  // Abort the request
  request.controller.abort();
  
  // Clean up entries
  cleanup(requestId, request.dedupeKey);
  
  return true;
}

/**
 * Get snapshot of in-flight requests for debugging/testing
 * @returns {Record<string, { requestId: string, dedupeKey: string, startedAt: string }>}
 */
export function getInFlight() {
  const snapshot = {};
  
  for (const [requestId, request] of inFlight) {
    snapshot[requestId] = {
      requestId: request.requestId,
      dedupeKey: request.dedupeKey,
      startedAt: request.startedAt
    };
  }
  
  return snapshot;
}

/**
 * Derived store to get count of in-flight requests
 */
export const inFlightCount = derived(
  inFlightStore,
  $inFlightStore => Object.keys($inFlightStore).length
);

/**
 * Internal cleanup function to remove request from tracking maps
 * @param {string} requestId - Request ID to clean up
 * @param {string} [dedupeKey] - Optional dedupe key to clean up
 */
function cleanup(requestId, dedupeKey) {
  inFlight.delete(requestId);
  
  if (dedupeKey && dedupeMap.get(dedupeKey) === requestId) {
    dedupeMap.delete(dedupeKey);
  }

  // Update reactive store
  updateInFlightStore();
}