// Refactor derived from logic.js
const { datePartsFactory } = require('./utils');
const { classifyPoint } = require('./classify');

/**
 * Compute duration for each row using median rule and ensure non-negative duration
 * @param {Array} rows - Array of row objects with ts property
 * @returns {Array} Rows with dur property added
 */
function computeDurations(rows) {
  if (rows.length === 0) return rows;
  
  // Sort by timestamp
  rows.sort((a, b) => a.ts - b.ts);
  
  // Calculate time differences
  const diffs = [];
  for (let i = 0; i < rows.length - 1; i++) {
    diffs.push(rows[i + 1].ts - rows[i].ts);
  }
  
  // Get median difference
  const medianDiff = diffs.length ? diffs.sort((a, b) => a - b)[Math.floor(diffs.length / 2)] : 0;
  
  // Assign durations
  for (let i = 0; i < rows.length; i++) {
    if (i < rows.length - 1) {
      rows[i].dur = rows[i + 1].ts - rows[i].ts;
    } else {
      rows[i].dur = medianDiff || 0;
    }
    // Ensure non-negative duration
    if (rows[i].dur < 0) rows[i].dur = 0;
  }
  
  return rows;
}

/**
 * Detect sampling resolution from median time difference
 * @param {number} medianDiff - Median time difference in milliseconds
 * @returns {Object} Detection result with unit and medianDiff
 */
function detectSampling(medianDiff) {
  const medianSeconds = Math.round((medianDiff || 0) / 1000);
  let sampling = 'irregular';
  
  if (medianDiff >= 22 * 3600 * 1000) {
    sampling = 'daily';
  } else if (medianDiff >= 40 * 60 * 1000 && medianDiff <= 80 * 60 * 1000) {
    sampling = 'hourly';
  } else if (medianDiff > 0) {
    sampling = `${Math.round(medianDiff / 1000)}s`;
  }
  
  // More granular detection for timeline grouping
  let samplingUnit = 'irregular';
  if (medianDiff === 0) {
    samplingUnit = 'single';
  } else if (medianDiff <= 90 * 1000) {
    samplingUnit = 'seconds';
  } else if (medianDiff <= 90 * 60 * 1000) {
    samplingUnit = 'minutes';
  } else if (medianDiff <= 3 * 3600 * 1000) {
    samplingUnit = 'hour';
  } else if (medianDiff <= 2 * 24 * 3600 * 1000) {
    samplingUnit = 'day';
  } else {
    samplingUnit = 'month+';
  }
  
  return { sampling, samplingUnit, medianDiff };
}

/**
 * Build bucketed aggregation data
 * @param {Array} rows - Array of row objects with ts, zone, dur properties
 * @param {string} timelineUnit - Timeline unit ('month', 'day', 'hour')
 * @param {boolean} treatAsUTC - Whether to treat dates as UTC
 * @returns {Object} Aggregated data per bucket
 */
function buildBuckets(rows, timelineUnit, treatAsUTC) {
  const dateParts = datePartsFactory(treatAsUTC);
  const perBucket = {};
  
  for (const row of rows) {
    const bk = bucketKey(row.ts, timelineUnit, dateParts);
    perBucket[bk] = perBucket[bk] || {};
    perBucket[bk][row.zone] = (perBucket[bk][row.zone] || 0) + row.dur;
  }
  
  return perBucket;
}

/**
 * Generate bucket key for a given timestamp and timeline unit
 * @param {number} ts - Timestamp in milliseconds
 * @param {string} timelineUnit - Timeline unit ('month', 'day', 'hour')
 * @param {Function} dateParts - Date parts function
 * @returns {string} Bucket key
 */
function bucketKey(ts, timelineUnit, dateParts) {
  const parts = dateParts(ts);
  if (timelineUnit === 'month') {
    return `${parts.year}-${String(parts.month).padStart(2, '0')}`;
  }
  if (timelineUnit === 'day') {
    return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
  }
  // hour
  return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')} ${String(parts.hours).padStart(2, '0')}:00`;
}

/**
 * Create a streaming aggregator that processes rows one at a time
 * @param {Object} options - Configuration options
 * @returns {Object} Aggregator object with pushRow and finish methods
 */
function createAggregator(options = {}) {
  const {
    maxDeltasForMedian = 1000,
    treatAsUTC = false
  } = options;
  
  const dateParts = datePartsFactory(treatAsUTC);
  
  // Internal state
  let previousRow = null;
  let deltas = [];
  let agg = {};
  let perBucket = {};
  let rowsCount = 0;
  let totalMs = 0;
  let firstTs = null;
  let lastTs = null;
  let timelineUnit = null;
  let rowsWithDur = []; // Store rows with duration for bucket building
  
  /**
   * Process a single row
   * @param {Object} row - Row object with ts, temp, rh properties
   */
  function pushRow(row) {
    // Classify the point
    row.zone = classifyPoint(row.temp, row.rh);
    
    // Handle first row
    if (!previousRow) {
      firstTs = row.ts;
      previousRow = row;
      rowsCount++;
      return;
    }
    
    // Calculate duration
    const delta = row.ts - previousRow.ts;
    const duration = delta > 0 ? delta : 0;
    
    // Store delta for median calculation (up to maxDeltasForMedian)
    if (deltas.length < maxDeltasForMedian) {
      deltas.push(delta);
    }
    
    // Update aggregation
    agg[row.zone] = (agg[row.zone] || 0) + duration;
    totalMs += duration;
    lastTs = row.ts;
    rowsCount++;
    
    // Store row with duration for bucket building
    rowsWithDur.push({ ...row, dur: duration });
    
    // Update previous row for next iteration
    previousRow = row;
  }
  
  /**
   * Set timeline unit and build per-bucket data
   * @param {string} unit - Timeline unit ('month', 'day', 'hour')
   */
  function setTimelineUnit(unit) {
    timelineUnit = unit;
  }
  
  /**
   * Finalize aggregation and return results
   * @returns {Object} Final aggregation results
   */
  function finish() {
    // Handle the last row duration
    if (previousRow && deltas.length > 0) {
      const sortedDeltas = [...deltas].sort((a, b) => a - b);
      const medianDelta = sortedDeltas[Math.floor(sortedDeltas.length / 2)] || 0;
      const lastDuration = medianDelta > 0 ? medianDelta : 0;
      
      // Add duration for the last row
      agg[previousRow.zone] = (agg[previousRow.zone] || 0) + lastDuration;
      totalMs += lastDuration;
      
      // Add last row to rowsWithDur for bucket building
      rowsWithDur.push({ ...previousRow, dur: lastDuration });
    }
    
    // Build per-bucket data if timeline unit is set
    if (timelineUnit) {
      perBucket = {};
      for (const row of rowsWithDur) {
        const bk = bucketKey(row.ts, timelineUnit, dateParts);
        perBucket[bk] = perBucket[bk] || {};
        perBucket[bk][row.zone] = (perBucket[bk][row.zone] || 0) + row.dur;
      }
    }
    
    return {
      agg,
      perBucket,
      summary: Object.keys(agg).map(k => {
        const ms = agg[k];
        const h = ms / (1000 * 60 * 60);
        return { zone: k, hours: Number(h.toFixed(3)), percent: Number((ms * 100 / totalMs).toFixed(2)), milliseconds: ms };
      }).sort((a, b) => b.hours - a.hours),
      rowsCount,
      totalMs,
      firstTs,
      lastTs,
      medianDelta: deltas.length > 0 ? [...deltas].sort((a, b) => a - b)[Math.floor(deltas.length / 2)] : 0
      ,rowsWithDur
    };
  }
  
  return {
    pushRow,
    finish,
    setTimelineUnit
  };
}

module.exports = {
  computeDurations,
  detectSampling,
  buildBuckets,
  bucketKey,
  createAggregator
};