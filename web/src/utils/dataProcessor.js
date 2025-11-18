/**
 * Data Processing Module
 * 
 * This module bridges the existing logic scripts with the Svelte app by processing
 * raw CSV data according to column mappings and preparing it for visualization.
 */

import { parseTimestampOrThrow, detectDayFirstFromSamples, normalizeToUTC } from '../../../scripts/dateParser.js';
import { createAggregator, detectSampling } from '../../../scripts/aggregate.js';
import { classifyPoint } from '../../../scripts/classify.js';
import { ZONE_COLORS } from '../../../scripts/theme.js';

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
    timelineUnit = null // Will be determined from sampling if not provided
  } = options;
  // Allow caller to pass source filename to help disambiguate date formats (e.g., single-month files)
  const sourceFilename = options.sourceFilename || options.filename || '';
  
  try {
    // Step 1: Transform raw data using column mapping
    const transformedData = transformData(rawData, mapping);
    
    // Step 2: Detect date format preference from sample data
    const dateSamples = transformedData
      .slice(0, Math.min(20, transformedData.length))
      .map(row => row.dateStr)
      .filter(Boolean);
    
    // Pass sourceFilename to detection so single-month files (e.g. _04_) are recognized
    let preferDayFirst = detectDayFirstFromSamples(dateSamples, sourceFilename);
    
    // Extra, conservative heuristic: if samples show a single constant second component
    // across most rows (likely the month in DD/MM/YYYY) then prefer day-first parsing.
    // This handles exports like "01/04/2024 ..." where month=04 is constant.
    if (!preferDayFirst && dateSamples.length > 0) {
      const comps = dateSamples.map(s => {
        const m = s && s.trim().match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
        return m ? { day: Number(m[1]), month: Number(m[2]) } : null;
      }).filter(Boolean);
      if (comps.length > 0) {
        const uniqueMonths = [...new Set(comps.map(c => c.month))];
        // If second component is constant (single-month export) prefer day-first
        if (uniqueMonths.length === 1) {
          preferDayFirst = true;
        }
      }
    }
    
    // Step 3: Parse dates and prepare data for aggregation
    const parsedData = parseDates(transformedData, preferDayFirst, treatAsUTC, sourceFilename);
    
    // Step 4: Detect sampling to determine appropriate timeline unit if not provided
    let finalTimelineUnit = timelineUnit;
    if (!finalTimelineUnit && parsedData.length > 1) {
      // Calculate time differences between consecutive rows
      const diffs = [];
      for (let i = 0; i < parsedData.length - 1; i++) {
        diffs.push(parsedData[i + 1].ts - parsedData[i].ts);
      }
      
      // Get median difference for sampling detection
      const medianDiff = diffs.length ? diffs.sort((a, b) => a - b)[Math.floor(diffs.length / 2)] : 0;
      const { samplingUnit } = detectSampling(medianDiff);
      
      // prefer detected sampling unit to avoid coarse bucket defaults
      if (samplingUnit === 'hour') {
        finalTimelineUnit = 'hour'; // prefer detected sampling unit to avoid coarse bucket defaults
      } else if (samplingUnit === 'day') {
        finalTimelineUnit = 'day';
      } else {
        finalTimelineUnit = 'day'; // Default fallback
      }
    } else if (!finalTimelineUnit) {
      finalTimelineUnit = 'day'; // Default fallback
    }
    
    // Step 5: Aggregate and classify the data
    const aggregator = createAggregator({ treatAsUTC });
    aggregator.setTimelineUnit(finalTimelineUnit);
    
    // Process each row
    for (const row of parsedData) {
      aggregator.pushRow(row);
    }
    
    // Step 6: Get final results
    const results = aggregator.finish();

    // Attach color information to each summary item so UI components can render color bars
    if (results && Array.isArray(results.summary)) {
      results.summary = results.summary.map(s => ({
        ...s,
        color: ZONE_COLORS[s.zone] || '#999999'
      }));
    }
    
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
        timelineUnit: finalTimelineUnit,
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
function parseDates(transformedData, preferDayFirst, treatAsUTC, sourceFilename = '') {
  return transformedData.map((row, index) => {
    try {
      // Parse timestamp (use sourceFilename hint to disambiguate day/month ordering)
      let ts = parseTimestampOrThrow(row.dateStr, preferDayFirst, sourceFilename || '');
      
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