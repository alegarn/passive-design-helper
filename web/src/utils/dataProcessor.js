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
import { csvSplitLine } from '../../../scripts/csv.js';

/**
 * Parse CSV stream to extract header and sample rows without reading entire file
 *
 * @param {File|Blob} file - File or Blob to parse
 * @param {Object} options - Parsing options
 * @param {number} options.sampleRows - Number of sample rows to collect (default: 50)
 * @param {number} options.headerRowIndex - Index of header row (default: 0)
 * @param {string} options.encoding - Text encoding (default: 'utf-8')
 * @returns {Promise<Object>} Object containing headerFields, sampleRows, dayFirst, and samplesUsed
 */
export async function parseCsvStream(file, options = {}) {
  const {
    sampleRows = 50,
    headerRowIndex = 0,
    encoding = 'utf-8'
  } = options;
  
  return new Promise((resolve, reject) => {
    const reader = file.stream().getReader();
    const decoder = new TextDecoder(encoding);
    let buffer = '';
    let lines = [];
    let headerFields = [];
    let samplesUsed = 0;
    let lineCount = 0;
    
    // Function to process buffer and extract complete lines
    function processBuffer() {
      const newLines = buffer.split(/\r?\n/);
      buffer = newLines.pop() || ''; // Keep incomplete line in buffer
      
      for (const line of newLines) {
        if (lineCount === headerRowIndex) {
          // Parse header row
          headerFields = csvSplitLine(line);
        } else if (lineCount > headerRowIndex && samplesUsed < sampleRows) {
          // Collect sample rows
          lines.push(line);
          samplesUsed++;
        }
        lineCount++;
      }
    }
    
    function readChunk() {
      reader.read().then(({ done, value }) => {
        if (done) {
          // Process any remaining buffer content
          if (buffer.trim()) {
            if (lineCount === headerRowIndex) {
              headerFields = csvSplitLine(buffer);
            } else if (lineCount > headerRowIndex && samplesUsed < sampleRows) {
              lines.push(buffer);
              samplesUsed++;
            }
          }
          
          // Detect day-first from samples
          const dateSamples = lines
            .map(line => {
              const fields = csvSplitLine(line);
              return fields[0] || ''; // Assume first column is date
            })
            .filter(Boolean);
          
          const dayFirst = detectDayFirstFromSamples(dateSamples, file.name);
          
          // Analyze timestamps in sample rows to detect time span
          let minDate = null;
          let maxDate = null;
          let validTimestamps = 0;
          
          // Try to find time column index
          const timeColIndex = headerFields.findIndex(h =>
            h.toLowerCase().includes('time') ||
            h.toLowerCase().includes('date') ||
            h.toLowerCase().includes('datetime')
          );
          
          if (timeColIndex !== -1) {
            for (const line of lines) {
              const fields = csvSplitLine(line);
              const dateStr = fields[timeColIndex];
              
              if (dateStr) {
                try {
                  const ts = parseTimestampOrThrow(dateStr, dayFirst, file.name);
                  const normalizedTs = normalizeToUTC(ts, false); // Don't treat as UTC for analysis
                  
                  if (!minDate || normalizedTs < minDate) {
                    minDate = normalizedTs;
                  }
                  if (!maxDate || normalizedTs > maxDate) {
                    maxDate = normalizedTs;
                  }
                  validTimestamps++;
                } catch (e) {
                  // Skip invalid timestamps
                }
              }
            }
          }
          
          // Calculate estimated span and samples per day
          let estimatedSpanDays = 0;
          let samplesPerDay = 0;
          
          if (minDate && maxDate && validTimestamps > 1) {
            estimatedSpanDays = (maxDate - minDate) / (1000 * 60 * 60 * 24);
            samplesPerDay = validTimestamps / estimatedSpanDays;
          }
          
          resolve({
            headerFields,
            sampleRows: lines,
            dayFirst,
            samplesUsed,
            minDate,
            maxDate,
            estimatedSpanDays,
            samplesPerDay
          });
          return;
        }
        
        // Decode chunk and add to buffer
        buffer += decoder.decode(value, { stream: true });
        processBuffer();
        
        // Continue reading if we need more samples
        if (samplesUsed < sampleRows) {
          readChunk();
        } else {
          // We have enough samples, but we need to finish reading to properly close the stream
          reader.cancel();
          const dayFirst = detectDayFirstFromSamples(
            lines.map(line => csvSplitLine(line)[0] || '').filter(Boolean),
            file.name
          );
          
          // Analyze timestamps in sample rows to detect time span
          let minDate = null;
          let maxDate = null;
          let validTimestamps = 0;
          
          // Try to find time column index
          const timeColIndex = headerFields.findIndex(h =>
            h.toLowerCase().includes('time') ||
            h.toLowerCase().includes('date') ||
            h.toLowerCase().includes('datetime')
          );
          
          if (timeColIndex !== -1) {
            for (const line of lines) {
              const fields = csvSplitLine(line);
              const dateStr = fields[timeColIndex];
              
              if (dateStr) {
                try {
                  const ts = parseTimestampOrThrow(dateStr, dayFirst, file.name);
                  const normalizedTs = normalizeToUTC(ts, false); // Don't treat as UTC for analysis
                  
                  if (!minDate || normalizedTs < minDate) {
                    minDate = normalizedTs;
                  }
                  if (!maxDate || normalizedTs > maxDate) {
                    maxDate = normalizedTs;
                  }
                  validTimestamps++;
                } catch (e) {
                  // Skip invalid timestamps
                }
              }
            }
          }
          
          // Calculate estimated span and samples per day
          let estimatedSpanDays = 0;
          let samplesPerDay = 0;
          
          if (minDate && maxDate && validTimestamps > 1) {
            estimatedSpanDays = (maxDate - minDate) / (1000 * 60 * 60 * 24);
            samplesPerDay = validTimestamps / estimatedSpanDays;
          }
          
          resolve({
            headerFields,
            sampleRows: lines,
            dayFirst,
            samplesUsed,
            minDate,
            maxDate,
            estimatedSpanDays,
            samplesPerDay
          });
        }
      }).catch(reject);
    }
    
    readChunk();
  });
}

/**
 * Detect timeline granularity from sampled deltas
 *
 * @param {number[]} deltasSample - Array of time deltas in milliseconds
 * @returns {string} Timeline unit: 'hour', 'day', or 'month'
 */
export function detectGranularityFromSampledDeltas(deltasSample) {
  if (!deltasSample || deltasSample.length === 0) {
    return 'day'; // Default fallback
  }
  
  // Calculate median delta
  const sorted = [...deltasSample].sort((a, b) => a - b);
  const medianDelta = sorted[Math.floor(sorted.length / 2)];
  
  // Apply thresholds from spec
  if (medianDelta <= 90 * 60 * 1000) { // <= 90 minutes
    return 'hour';
  } else if (medianDelta <= 36 * 3600 * 1000) { // <= 36 hours
    return 'day';
  } else {
    return 'month';
  }
}

/**
 * Detect data span and generate descriptive information about the time range and granularity
 *
 * @param {Array} records - Array of records with timestamps or sample timestamps
 * @param {Object} options - Options for detection
 * @param {number} options.confidenceThreshold - Minimum confidence threshold (default: 0.8)
 * @returns {Object} Object containing time span information and description
 */
export function detectDataSpan(records, options = {}) {
  const { confidenceThreshold = 0.8 } = options;
  
  if (!records || records.length === 0) {
    return {
      minDate: null,
      maxDate: null,
      totalDays: 0,
      likelyGranularity: 'day',
      dataDescription: 'No data available',
      confidence: 0
    };
  }
  
  // Extract timestamps from records
  let timestamps = [];
  if (records.length > 0 && typeof records[0] === 'object' && records[0].ts) {
    // Records are objects with ts property
    timestamps = records.map(r => r.ts).filter(ts => ts && !isNaN(ts));
  } else if (records.length > 0 && typeof records[0] === 'number') {
    // Records are already timestamps
    timestamps = records.filter(ts => ts && !isNaN(ts));
  }
  
  if (timestamps.length === 0) {
    return {
      minDate: null,
      maxDate: null,
      totalDays: 0,
      likelyGranularity: 'day',
      dataDescription: 'No valid timestamps found',
      confidence: 0
    };
  }
  
  // Sort timestamps
  timestamps.sort((a, b) => a - b);
  
  // Calculate min/max dates and total days
  const minDate = new Date(timestamps[0]);
  const maxDate = new Date(timestamps[timestamps.length - 1]);
  const totalDays = (maxDate - minDate) / (1000 * 60 * 60 * 24);
  
  // Analyze timestamp patterns to infer granularity
  let likelyGranularity = 'day';
  let confidence = 0;
  
  if (timestamps.length > 1) {
    // Calculate time intervals between consecutive timestamps
    const intervals = [];
    for (let i = 1; i < timestamps.length; i++) {
      intervals.push(timestamps[i] - timestamps[i - 1]);
    }
    
    // Calculate median interval
    const sortedIntervals = [...intervals].sort((a, b) => a - b);
    const medianInterval = sortedIntervals[Math.floor(sortedIntervals.length / 2)];
    
    // Determine granularity based on median interval
    if (medianInterval <= 90 * 60 * 1000) { // <= 90 minutes
      likelyGranularity = 'hour';
    } else if (medianInterval <= 36 * 3600 * 1000) { // <= 36 hours
      likelyGranularity = 'day';
    } else {
      likelyGranularity = 'month';
    }
    
    // Calculate confidence based on pattern consistency
    const expectedInterval = likelyGranularity === 'hour' ? 3600000 :
                            likelyGranularity === 'day' ? 86400000 : 30 * 86400000;
    
    // Count how many intervals are close to the expected interval
    const tolerance = expectedInterval * 0.2; // 20% tolerance
    const consistentIntervals = intervals.filter(interval =>
      Math.abs(interval - expectedInterval) <= tolerance
    ).length;
    
    confidence = consistentIntervals / intervals.length;
  }
  
  // Generate human-readable description based on date range and granularity
  let dataDescription = '';
  
  if (totalDays <= 31) {
    // Single month format
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                       'July', 'August', 'September', 'October', 'November', 'December'];
    dataDescription = `${monthNames[minDate.getMonth()]} ${minDate.getFullYear()} ${likelyGranularity}ly data`;
  } else if (totalDays <= 90) {
    // Quarter format
    const quarter = Math.floor(minDate.getMonth() / 3) + 1;
    dataDescription = `Q${quarter} ${minDate.getFullYear()} ${likelyGranularity}ly data`;
  } else if (totalDays <= 400) {
    // Year format
    dataDescription = `${minDate.getFullYear()} ${likelyGranularity}ly data`;
  } else {
    // Multi-year format
    const endYear = maxDate.getFullYear();
    const startYear = minDate.getFullYear();
    if (startYear === endYear) {
      dataDescription = `${startYear} ${likelyGranularity}ly data`;
    } else {
      dataDescription = `${startYear}-${endYear} ${likelyGranularity}ly data`;
    }
  }
  
  // Fix common typo for "daily" granularity
  if (likelyGranularity === 'day') {
    dataDescription = dataDescription.replace('dayly data', 'daily data');
  }
  
  return {
    minDate: minDate.toISOString(),
    maxDate: maxDate.toISOString(),
    totalDays: Math.round(totalDays * 100) / 100, // Round to 2 decimal places
    likelyGranularity,
    dataDescription,
    confidence: Math.round(confidence * 100) / 100 // Round to 2 decimal places
  };
}

/**
 * Aggregate CSV data using streaming processing without loading entire file into memory
 *
 * @param {File|Blob} file - File or Blob to process
 * @param {Function} classifyRow - Function to classify rows (temp, rh) => zone
 * @param {Object} options - Processing options
 * @param {number} options.sampleRows - Number of sample rows for analysis (default: 50)
 * @param {number} options.deltaReservoirSize - Size of delta reservoir for median calculation (default: 2000)
 * @param {number} options.rowSampleLimitForOutput - Limit of rows to store with duration (default: 500)
 * @param {string} options.timelineUnit - Timeline unit or 'auto' (default: 'auto')
 * @param {number} options.capMultiplier - Duration cap multiplier (default: 4)
 * @param {number} options.headerRowIndex - Header row index (default: 0)
 * @param {boolean} options.treatAsUTC - Treat dates as UTC (default: false)
 * @param {string} options.filename - Filename hint for date parsing (optional)
 * @param {boolean} options.preferDayFirst - Force day-first parsing (default: null)
 * @returns {Promise<Object>} Aggregation result with perBucket, summary, etc.
 */
export async function aggregateCsvStream(file, classifyRow, options = {}) {
  const {
    sampleRows = 50,
    deltaReservoirSize = 2000,
    rowSampleLimitForOutput = 500,
    timelineUnit = 'auto',
    capMultiplier = 4,
    headerRowIndex = 0,
    treatAsUTC = false,
    filename = file.name,
    preferDayFirst = null
  } = options;
  
  // First pass: parse header and samples to detect configuration
  const { headerFields, sampleRows: samples, dayFirst } = await parseCsvStream(file, {
    sampleRows,
    headerRowIndex
  });
  
  // Detect column indices
  const timeCol = headerFields.findIndex(h =>
    h.toLowerCase().includes('time') ||
    h.toLowerCase().includes('date') ||
    h.toLowerCase().includes('datetime')
  );
  const tempCol = headerFields.findIndex(h =>
    h.toLowerCase().includes('temp') ||
    h.toLowerCase().includes('temperature')
  );
  const rhCol = headerFields.findIndex(h =>
    h.toLowerCase().includes('rh') ||
    h.toLowerCase().includes('humidity')
  );
  
  if (timeCol === -1 || tempCol === -1 || rhCol === -1) {
    throw new Error('Required columns (time, temperature, humidity) not found in CSV');
  }
  
  // Determine day-first preference
  const finalPreferDayFirst = preferDayFirst !== null ? preferDayFirst : dayFirst;
  
  // Parse sample rows to detect timeline unit
  const sampleData = [];
  for (const line of samples) {
    const fields = csvSplitLine(line);
    const dateStr = fields[timeCol];
    const temp = parseFloat(fields[tempCol]);
    const rh = parseFloat(fields[rhCol]);
    
    if (dateStr && !isNaN(temp) && !isNaN(rh)) {
      try {
        const ts = parseTimestampOrThrow(dateStr, finalPreferDayFirst, filename);
        const normalizedTs = normalizeToUTC(ts, treatAsUTC);
        sampleData.push({ ts: normalizedTs, temp, rh });
      } catch (e) {
        // Skip invalid rows
      }
    }
  }
  
  // Detect timeline unit if auto
  let finalTimelineUnit = timelineUnit;
  if (timelineUnit === 'auto' && sampleData.length > 1) {
    const deltas = [];
    for (let i = 0; i < sampleData.length - 1; i++) {
      deltas.push(sampleData[i + 1].ts - sampleData[i].ts);
    }
    finalTimelineUnit = detectGranularityFromSampledDeltas(deltas);
  }
  
  // Second pass: stream processing with aggregation
  return new Promise((resolve, reject) => {
    const reader = file.stream().getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    let lineCount = 0;
    
    // Streaming state
    let previousRow = null;
    let deltaReservoir = [];
    let perBucket = {};
    let zoneTotals = {};
    let rowsWithDur = [];
    let totalMs = 0;
    let firstTs = null;
    let lastTs = null;
    let processedRows = 0;
    
    // Date parts factory for bucket keys
    const dateParts = (ts) => {
      const date = new Date(ts);
      return {
        year: treatAsUTC ? date.getUTCFullYear() : date.getFullYear(),
        month: treatAsUTC ? date.getUTCMonth() : date.getMonth(),
        day: treatAsUTC ? date.getUTCDate() : date.getDate(),
        hours: treatAsUTC ? date.getUTCHours() : date.getHours()
      };
    };
    
    // Bucket key function
    const getBucketKey = (ts) => {
      const parts = dateParts(ts);
      if (finalTimelineUnit === 'month') {
        return `${parts.year}-${String(parts.month + 1).padStart(2, '0')}`;
      }
      if (finalTimelineUnit === 'day') {
        return `${parts.year}-${String(parts.month + 1).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
      }
      // hour
      return `${parts.year}-${String(parts.month + 1).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}T${String(parts.hours).padStart(2, '0')}:00`;
    };
    
    // Function to process buffer and extract complete lines
    function processBuffer() {
      const newLines = buffer.split(/\r?\n/);
      buffer = newLines.pop() || ''; // Keep incomplete line in buffer
      
      for (const line of newLines) {
        if (lineCount <= headerRowIndex) {
          lineCount++;
          continue; // Skip header
        }
        
        const fields = csvSplitLine(line);
        if (fields.length <= Math.max(timeCol, tempCol, rhCol)) {
          lineCount++;
          continue; // Skip malformed rows
        }
        
        const dateStr = fields[timeCol];
        const temp = parseFloat(fields[tempCol]);
        const rh = parseFloat(fields[rhCol]);
        
        if (!dateStr || isNaN(temp) || isNaN(rh)) {
          lineCount++;
          continue; // Skip invalid rows
        }
        
        try {
          const ts = parseTimestampOrThrow(dateStr, finalPreferDayFirst, filename);
          const normalizedTs = normalizeToUTC(ts, treatAsUTC);
          const zone = classifyRow(temp, rh);
          const currentRow = { ts: normalizedTs, temp, rh, zone };
          
          if (!firstTs) firstTs = normalizedTs;
          lastTs = normalizedTs;
          
          if (previousRow) {
            // Calculate duration for previous row
            let delta = currentRow.ts - previousRow.ts;
            if (delta < 0) delta = 0; // Ensure non-negative
            
            // Add to delta reservoir
            if (deltaReservoir.length < deltaReservoirSize) {
              deltaReservoir.push(delta);
            }
            
            // Calculate median delta for capping
            const sortedDeltas = [...deltaReservoir].sort((a, b) => a - b);
            const medianDelta = sortedDeltas[Math.floor(sortedDeltas.length / 2)] ||
                              (finalTimelineUnit === 'hour' ? 3600000 :
                               finalTimelineUnit === 'day' ? 86400000 : 30 * 86400000);
            
            // Apply duration cap
            const cappedDelta = Math.min(delta, medianDelta * capMultiplier);
            
            // Update aggregates
            zoneTotals[previousRow.zone] = (zoneTotals[previousRow.zone] || 0) + cappedDelta;
            totalMs += cappedDelta;
            
            // Update per-bucket aggregates
            const bucketKey = getBucketKey(previousRow.ts);
            perBucket[bucketKey] = perBucket[bucketKey] || {};
            perBucket[bucketKey][previousRow.zone] = (perBucket[bucketKey][previousRow.zone] || 0) + cappedDelta;
            
            // Store row with duration (sampled)
            if (rowsWithDur.length < rowSampleLimitForOutput) {
              rowsWithDur.push({ ...previousRow, dur: cappedDelta });
            }
            
            processedRows++;
          }
          
          previousRow = currentRow;
        } catch (e) {
          // Skip rows with parsing errors
        }
        
        lineCount++;
      }
    }
    
    function readChunk() {
      reader.read().then(({ done, value }) => {
        if (done) {
          // Process any remaining buffer content
          if (buffer.trim()) {
            processBuffer();
          }
          
          // Handle the last row
          if (previousRow) {
            const sortedDeltas = [...deltaReservoir].sort((a, b) => a - b);
            const medianDelta = sortedDeltas[Math.floor(sortedDeltas.length / 2)] ||
                              (finalTimelineUnit === 'hour' ? 3600000 :
                               finalTimelineUnit === 'day' ? 86400000 : 30 * 86400000);
            
            const lastDuration = medianDelta;
            
            // Update aggregates for last row
            zoneTotals[previousRow.zone] = (zoneTotals[previousRow.zone] || 0) + lastDuration;
            totalMs += lastDuration;
            
            // Update per-bucket aggregates
            const bucketKey = getBucketKey(previousRow.ts);
            perBucket[bucketKey] = perBucket[bucketKey] || {};
            perBucket[bucketKey][previousRow.zone] = (perBucket[bucketKey][previousRow.zone] || 0) + lastDuration;
            
            // Store last row with duration
            if (rowsWithDur.length < rowSampleLimitForOutput) {
              rowsWithDur.push({ ...previousRow, dur: lastDuration });
            }
          }
          
          // Build summary
          const summary = Object.entries(zoneTotals).map(([zone, ms]) => {
            const hours = ms / (1000 * 60 * 60);
            return {
              zone,
              hours: Number(hours.toFixed(3)),
              percent: Number((ms * 100 / totalMs).toFixed(2)),
              milliseconds: ms,
              color: ZONE_COLORS[zone] || '#999999'
            };
          }).sort((a, b) => b.hours - a.hours);
          
          // Detect data span information using the processed rows
          const dataSpan = detectDataSpan(rowsWithDur.map(row => row.ts));
          
          resolve({
            perBucket,
            summary,
            rowsWithDur,
            totalMs,
            firstTs,
            lastTs,
            timelineUnit: finalTimelineUnit,
            rowsCount: processedRows,
            dataSpan
          });
          return;
        }
        
        // Decode chunk and add to buffer
        buffer += decoder.decode(value, { stream: true });
        processBuffer();
        readChunk();
      }).catch(reject);
    }
    
    readChunk();
  });
}

/**
 * Format summary as markdown (unchanged but compatible with streaming results)
 *
 * @param {Object} result - Result object from aggregateCsvStream
 * @returns {string} Markdown formatted summary
 */
export function formatSummaryMd(result) {
  const { summary, totalMs, firstTs, lastTs, timelineUnit, dataSpan } = result;
  
  let md = '# Passive Design Tactics Analysis\n\n';
  md += `## Summary\n\n`;
  md += `Total duration: ${(totalMs / (1000 * 60 * 60)).toFixed(1)} hours\n`;
  md += `Timeline unit: ${timelineUnit}\n`;
  md += `Period: ${new Date(firstTs).toISOString()} to ${new Date(lastTs).toISOString()}\n\n`;
  
  // Add data span information if available
  if (dataSpan && dataSpan.dataDescription) {
    md += `## Data Span Information\n\n`;
    md += `**Description:** ${dataSpan.dataDescription}\n`;
    md += `**Time Range:** ${new Date(dataSpan.minDate).toLocaleDateString()} to ${new Date(dataSpan.maxDate).toLocaleDateString()}\n`;
    md += `**Total Days:** ${dataSpan.totalDays}\n`;
    md += `**Detected Granularity:** ${dataSpan.likelyGranularity}\n`;
    
    // Include confidence if less than 100%
    if (dataSpan.confidence < 1.0) {
      md += `**Confidence:** ${(dataSpan.confidence * 100).toFixed(1)}%\n`;
    }
    
    md += '\n';
  }
  
  md += `## Zone Distribution\n\n`;
  md += `| Zone | Hours | Percentage |\n`;
  md += `|------|-------|------------|\n`;
  
  for (const item of summary) {
    md += `| ${item.zone} | ${item.hours.toFixed(1)} | ${item.percent}% |\n`;
  }
  
  return md;
}

/**
 * Build time series CSV from records
 *
 * @param {Array} records - Array of records with ts, temp, rh, durMs?, zone?, raw?
 * @param {Object} options - Options for CSV generation
 * @param {boolean} options.includeDur - Include duration column (default: true)
 * @param {boolean} options.tsIso - Use ISO timestamp format (default: true)
 * @param {string} options.tz - Timezone for timestamp (default: 'UTC')
 * @returns {string} CSV string with header row
 */
export function buildTimeSeriesCsv(records, options = {}) {
  const {
    includeDur = true,
    tsIso = true,
    tz = 'UTC'
  } = options;
  
  if (!records || !Array.isArray(records) || records.length === 0) {
    return '';
  }
  
  // Build header
  let csv = 'timestamp,temp,rh';
  if (includeDur) {
    csv += ',dur_hours';
  }
  csv += ',zone,raw\n';
  
  // Process each record
  for (const record of records) {
    const { ts, temp, rh, dur, durMs, zone, raw } = record;
    
    // Format timestamp
    const timestamp = tsIso ? new Date(ts).toISOString() : new Date(ts).toString();
    
    // Format temperature and humidity
    const tempStr = String(temp || '');
    const rhStr = String(rh || '');
    
    // Format duration (check both dur and durMs for compatibility)
    const durationMs = dur !== undefined ? dur : durMs;
    const durStr = includeDur && durationMs !== undefined ?
      (durationMs / 3600000).toFixed(3) : '';
    
    // Format zone and raw
    const zoneStr = zone !== undefined ? String(zone) : '';
    const rawStr = raw !== undefined ? String(raw) : '';
    
    // Helper to escape CSV fields
    const escapeField = (field) => {
      const fieldStr = String(field || '');
      if (fieldStr === '') return '';
      if (fieldStr.includes(',') || fieldStr.includes('"') || fieldStr.includes('\n')) {
        return `"${fieldStr.replace(/"/g, '""')}"`;
      }
      return fieldStr;
    };
    
    // Build row
    const row = [
      escapeField(timestamp),
      escapeField(tempStr),
      escapeField(rhStr)
    ];
    
    if (includeDur) {
      row.push(escapeField(durStr));
    }
    
    row.push(escapeField(zoneStr));
    row.push(escapeField(rawStr));
    
    csv += row.join(',') + '\n';
  }
  
  return csv;
}

/**
 * Build summary JSON from aggregation result
 *
 * @param {Object} aggregationResult - Result from aggregateCsvStream
 * @param {Object} options - Options for JSON generation
 * @param {boolean} options.includeRowsWithDur - Include rowsWithDur in output (default: false)
 * @returns {string} Pretty-formatted JSON string
 */
export function buildSummaryJson(aggregationResult, options = {}) {
  const {
    includeRowsWithDur = false
  } = options;
  
  if (!aggregationResult || typeof aggregationResult !== 'object') {
    return JSON.stringify({}, null, 2);
  }
  
  // Create a copy of the result to avoid modifying the original
  const result = { ...aggregationResult };
  
  // Remove rowsWithDur if not requested
  if (!includeRowsWithDur && result.rowsWithDur) {
    result.rowsWithDur = undefined;
  }
  
  // Convert to pretty JSON
  return JSON.stringify(result, null, 2);
}

/**
 * Build summary Markdown from aggregation result
 *
 * @param {Object} aggregationResult - Result from aggregateCsvStream
 * @returns {string} Markdown formatted summary
 */
export function buildSummaryMd(aggregationResult) {
  // Use the existing formatSummaryMd function
  return formatSummaryMd(aggregationResult);
}

/**
 * Download content as a file using Blob API
 *
 * @param {string} filename - Name of the file to download
 * @param {string} content - Content to download
 * @param {string} mime - MIME type of the content
 */
export function downloadBlob(filename, content, mime) {
  // Create a blob with the content
  const blob = new Blob([content], { type: mime });
  
  // Create a URL for the blob
  const url = URL.createObjectURL(blob);
  
  // Create a temporary anchor element to trigger download
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  
  // Add to DOM, click, and remove
  document.body.appendChild(a);
  a.click();
  
  // Clean up
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 100);
}

/**
 * Export all file types (CSV, JSON, MD) from aggregation result
 *
 * @param {string} baseName - Base name for exported files
 * @param {Object} aggregationResult - Result from aggregateCsvStream
 * @param {Object} options - Options for export
 * @param {boolean} options.includeRowsWithDur - Include rowsWithDur in JSON (default: false)
 * @param {boolean} options.includeDur - Include duration in CSV (default: true)
 * @param {boolean} options.tsIso - Use ISO timestamp format in CSV (default: true)
 * @returns {Object} Object with created blob references
 */
export function exportAllFiles(baseName, aggregationResult, options = {}) {
  const {
    includeRowsWithDur = false,
    includeDur = true,
    tsIso = true
  } = options;
  
  // Build CSV content
  const csvContent = buildTimeSeriesCsv(aggregationResult.rowsWithDur || [], {
    includeDur,
    tsIso
  });
  const csvBlob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  
  // Build JSON content
  const jsonContent = buildSummaryJson(aggregationResult, {
    includeRowsWithDur
  });
  const jsonBlob = new Blob([jsonContent], { type: 'application/json;charset=utf-8;' });
  
  // Build Markdown content
  const mdContent = buildSummaryMd(aggregationResult);
  const mdBlob = new Blob([mdContent], { type: 'text/markdown;charset=utf-8;' });
  
  // Trigger downloads
  downloadBlob(`${baseName}_time_series.csv`, csvContent, 'text/csv;charset=utf-8;');
  downloadBlob(`${baseName}_summary.json`, jsonContent, 'application/json;charset=utf-8;');
  downloadBlob(`${baseName}_summary.md`, mdContent, 'text/markdown;charset=utf-8;');
  
  // Return blob references for testing
  return {
    csvBlob,
    jsonBlob,
    mdBlob
  };
}

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

/*
USAGE EXAMPLES:

// Example 1: Parse CSV header and samples
const fileInput = document.querySelector('input[type="file"]');
const file = fileInput.files[0];

const { headerFields, sampleRows, dayFirst, samplesUsed } = await parseCsvStream(file, {
  sampleRows: 50,
  headerRowIndex: 0
});

console.log('Headers:', headerFields);
console.log('Samples collected:', samplesUsed);
console.log('Day-first format detected:', dayFirst);

// Example 2: Aggregate CSV with streaming
const result = await aggregateCsvStream(file, (temp, rh) => {
  // Simple classification - all points go to Z1 for testing
  return 'Z1';
}, {
  timelineUnit: 'auto',
  deltaReservoirSize: 2000,
  rowSampleLimitForOutput: 500,
  capMultiplier: 4,
  treatAsUTC: false
});

console.log('Timeline unit detected:', result.timelineUnit);
console.log('Total hours:', result.totalMs / 3600000);
console.log('Per-bucket keys:', Object.keys(result.perBucket));

// Example 3: Format results as markdown
const markdown = formatSummaryMd(result);
console.log(markdown);

TESTING INSTRUCTIONS:

// Test 1: Parse CSV stream on 2024_04_si_samrong_hourly.csv
const parseResult = await parseCsvStream(file);
console.assert(parseResult.sampleRows.length === 50, 'Should collect 50 sample rows');
console.assert(parseResult.dayFirst === false, 'Should detect month-first format');

// Test 2: Aggregate with classifyRow = (t,r)=>'Z1'
const aggResult = await aggregateCsvStream(file, (t, r) => 'Z1');
console.assert(aggResult.timelineUnit === 'hour', 'Should detect hourly granularity');
console.assert(Object.keys(aggResult.perBucket).some(k => k.includes('2024-04-01T08:00')), 'Should have hourly buckets');

// Test 3: Verify summary hours calculation
const expectedHours = aggResult.totalMs / 3600000;
const actualHours = aggResult.summary.reduce((sum, item) => sum + item.hours, 0);
console.assert(Math.abs(expectedHours - actualHours) < 0.01, 'Summary hours should match total');
*/