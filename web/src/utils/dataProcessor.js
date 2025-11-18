/**
 * Data Processing Module
 * 
 * This module bridges the existing logic scripts with the Svelte app by processing
 * raw CSV data according to column mappings and preparing it for visualization.
 */

import { parseTimestampOrThrow, detectDayFirstFromSamples, normalizeToUTC } from '../../../scripts/dateParser.js';
import { createAggregator } from '../../../scripts/aggregate.js';
import { classifyPoint } from '../../../scripts/classify.js';

/**
 * Process raw CSV data with column mapping configuration
 * 
 * @param {Array} rawData - Array of objects containing raw CSV data
 * @param {Object} mapping - Column mapping configuration object
 * @param {Object} options - Additional processing options
 * @param {boolean} options.treatAsUTC - Whether to treat dates as UTC (default: false)
 * @param {string} options.timelineUnit - Timeline unit for aggregation ('month', 'day', 'hour')
 * @returns {Promise<Object>} Processed data results
 * @throws {Error} When mapping is invalid or data processing fails
 */
export async function processData(rawData, mapping, options = {}) {
  // Validate inputs
  if (!rawData || !Array.isArray(rawData) || rawData.length === 0) {
    throw new Error('Invalid or empty raw data provided');
  }
  
  if (!mapping || typeof mapping !== 'object') {
    throw new Error('Invalid column mapping provided');
  }
  
  const {
    treatAsUTC = false,
    timelineUnit = 'day'
  } = options;
  
  try {
    // Step 1: Transform raw data using column mapping
    const transformedData = transformData(rawData, mapping);
    
    // Step 2: Detect date format preference from sample data
    const dateSamples = transformedData
      .slice(0, Math.min(20, transformedData.length))
      .map(row => row.dateStr)
      .filter(Boolean);
    
    const preferDayFirst = detectDayFirstFromSamples(dateSamples, '');
    
    // Step 3: Parse dates and prepare data for aggregation
    const parsedData = parseDates(transformedData, preferDayFirst, treatAsUTC);
    
    // Step 4: Aggregate and classify the data
    const aggregator = createAggregator({ treatAsUTC });
    aggregator.setTimelineUnit(timelineUnit);
    
    // Process each row
    for (const row of parsedData) {
      aggregator.pushRow(row);
    }
    
    // Step 5: Get final results
    const results = aggregator.finish();
    
    // Step 6: Return structured result object
    return {
      success: true,
      data: {
        aggregated: results.agg,
        perBucket: results.perBucket,
        summary: results.summary,
        stats: {
          rowsCount: results.rowsCount,
          totalMs: results.totalMs,
          firstTs: results.firstTs,
          lastTs: results.lastTs,
          medianDelta: results.medianDelta
        },
        rowsWithDur: results.rowsWithDur
      },
      metadata: {
        preferDayFirst,
        treatAsUTC,
        timelineUnit,
        mapping
      }
    };
  } catch (error) {
    // Handle and re-throw with additional context
    if (error.message.startsWith('DateParseError:')) {
      throw new Error(`Date parsing failed: ${error.message}`);
    }
    
    throw new Error(`Data processing failed: ${error.message}`);
  }
}

/**
 * Transform raw CSV data using column mapping
 * 
 * @param {Array} rawData - Raw CSV data
 * @param {Object} mapping - Column mapping configuration
 * @returns {Array} Transformed data with standardized field names
 */
function transformData(rawData, mapping) {
  return rawData.map((row, index) => {
    try {
      return {
        index,
        dateStr: row[mapping.timestamp] || '',
        temp: parseFloat(row[mapping.temperature]) || 0,
        rh: parseFloat(row[mapping.humidity]) || 0
      };
    } catch (error) {
      throw new Error(`Row transformation failed at index ${index}: ${error.message}`);
    }
  }).filter(row => row.dateStr); // Filter out rows without dates
}

/**
 * Parse dates in transformed data
 * 
 * @param {Array} transformedData - Data with standardized field names
 * @param {boolean} preferDayFirst - Whether to prefer day-first date parsing
 * @param {boolean} treatAsUTC - Whether to treat dates as UTC
 * @returns {Array} Data with parsed timestamps
 */
function parseDates(transformedData, preferDayFirst, treatAsUTC) {
  return transformedData.map((row, index) => {
    try {
      // Parse timestamp
      let ts = parseTimestampOrThrow(row.dateStr, preferDayFirst);
      
      // Normalize to UTC if requested
      ts = normalizeToUTC(ts, treatAsUTC);
      
      return {
        ...row,
        ts
      };
    } catch (error) {
      throw new Error(`Date parsing failed at row ${index}: ${error.message}`);
    }
  });
}