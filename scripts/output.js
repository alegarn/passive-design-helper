// Refactor derived from logic.js
const { ZONES } = require('./zones');
const { datePartsFactory } = require('./utils');

/**
 * Build timeseries CSV lines from processed rows
 * @param {Array} rows - Array of processed row objects
 * @returns {string[]} Array of CSV lines including header
 */
function buildTimeseriesLines(rows) {
  const lines = ['datetime,temperature,humidity,zone,color'];
  
  for (const row of rows) {
    const zoneColor = (ZONES.find(z => z.id === row.zone) || { color: '#999999' }).color;
    const line = [new Date(row.ts).toISOString(), row.temp, row.rh, row.zone, zoneColor].join(',');
    lines.push(line);
  }
  
  return lines;
}

/**
 * Build timeseries CSV header line
 * @returns {string} CSV header line
 */
function buildTimeseriesHeaderLine() {
  return 'datetime,temperature,humidity,zone,color';
}

/**
 * Build timeseries CSV line for a single row
 * @param {Object} row - Row object with ts, temp, rh, zone properties
 * @returns {string} CSV line for the row
 */
function buildTimeseriesLine(row) {
  const zoneColor = (ZONES.find(z => z.id === row.zone) || { color: '#999999' }).color;
  return [new Date(row.ts).toISOString(), row.temp, row.rh, row.zone, zoneColor].join(',');
}

/**
 * Format summary data as string in specified format
 * @param {Array} summary - Summary data array
 * @param {Object} perBucket - Bucketed data
 * @param {string} timelineUnit - Timeline unit ('month', 'day', 'hour')
 * @param {string} outFormat - Output format ('md', 'txt', 'csv')
 * @param {number} totalMs - Total milliseconds
 * @param {boolean} treatAsUTC - Whether to treat dates as UTC
 * @param {number} startTs - Start timestamp
 * @param {number} endTs - End timestamp
 * @returns {string} Formatted summary content
 */
function formatSummary(summary, perBucket, timelineUnit, outFormat, totalMs, treatAsUTC, startTs, endTs) {
  const dateParts = datePartsFactory(treatAsUTC);
  let content = '';
  
  // Generate period title
  let periodTitle = '';
  if (startTs && endTs) {
    const sdParts = dateParts(startTs);
    const edParts = dateParts(endTs);
    
    if (timelineUnit === 'month') {
      if (sdParts.year === edParts.year && sdParts.month === edParts.month) {
        periodTitle = `${String(sdParts.month).padStart(2, '0')}-${sdParts.year}`;
      } else {
        periodTitle = `${String(sdParts.month).padStart(2, '0')}-${sdParts.year} to ${String(edParts.month).padStart(2, '0')}-${edParts.year}`;
      }
    } else if (timelineUnit === 'day') {
      const sISO = `${sdParts.year}-${String(sdParts.month).padStart(2, '0')}-${String(sdParts.day).padStart(2, '0')}`;
      const eISO = `${edParts.year}-${String(edParts.month).padStart(2, '0')}-${String(edParts.day).padStart(2, '0')}`;
      if (sISO === eISO) {
        periodTitle = sISO;
      } else {
        periodTitle = `${sISO} to ${eISO}`;
      }
    } else if (timelineUnit === 'hour') {
      const sISO = `${sdParts.year}-${String(sdParts.month).padStart(2, '0')}-${String(sdParts.day).padStart(2, '0')}`;
      const eISO = `${edParts.year}-${String(edParts.month).padStart(2, '0')}-${String(edParts.day).padStart(2, '0')}`;
      if (sISO === eISO) {
        periodTitle = sISO;
      } else {
        periodTitle = `${sISO} to ${eISO}`;
      }
    }
  }
  
  // Global summary
  if (outFormat === 'md') {
    content += `## Summary table for ${periodTitle || 'all data'}\n\n`;
    content += `| Zone | Hours | % of time |\n| --- | ---: | ---: |\n`;
    for (const s of summary) {
      content += `| ${s.zone} | ${s.hours} | ${s.percent} % |\n`;
    }
  } else if (outFormat === 'csv') {
    content += `# Summary table for ${periodTitle || 'all data'}\n`;
    content += 'zone,hours,percent\n';
    for (const s of summary) {
      content += `${s.zone},${s.hours},${s.percent}\n`;
    }
  } else {
    content += `Summary table for ${periodTitle || 'all data'}:\n`;
    for (const s of summary) {
      content += `${s.zone}: ${s.hours} h (${s.percent}%)\n`;
    }
  }
  
  // Timeline breakdown
  const bucketKeys = Object.keys(perBucket).sort();
  if (bucketKeys.length > 0) {
    const timelineDesc = timelineUnit === 'month' ? 'per-month' : timelineUnit === 'hour' ? 'per-hour' : 'per-day';
    
    if (outFormat === 'md') {
      content += `\n## Timeline breakdown (${timelineDesc})\n\n`;
    } else if (outFormat === 'csv') {
      content += '\nperiod,zone,hours,percent\n';
    } else {
      content += `\nTimeline breakdown (${timelineDesc}):\n`;
    }
    
    for (const bk of bucketKeys) {
      const bucketTotal = Object.values(perBucket[bk]).reduce((s, v) => s + v, 0) || 1;
      const rowsList = Object.keys(perBucket[bk]).map(z => ({ zone: z, ms: perBucket[bk][z] })).sort((a, b) => b.ms - a.ms);
      
      if (outFormat === 'md') {
        content += `### ${bk}\n\n| Zone | Hours | % of time |\n| --- | ---: | ---: |\n`;
        for (const r of rowsList) {
          const h = Number((r.ms / (1000 * 60 * 60)).toFixed(3));
          const p = Number((r.ms * 100 / bucketTotal).toFixed(2));
          content += `| ${r.zone} | ${h} | ${p} % |\n`;
        }
        content += '\n';
      } else if (outFormat === 'csv') {
        for (const r of rowsList) {
          const h = Number((r.ms / (1000 * 60 * 60)).toFixed(3));
          const p = Number((r.ms * 100 / bucketTotal).toFixed(2));
          content += `${bk},${r.zone},${h},${p}\n`;
        }
      } else {
        content += `-- ${bk} --\n`;
        for (const r of rowsList) {
          const h = Number((r.ms / (1000 * 60 * 60)).toFixed(3));
          const p = Number((r.ms * 100 / bucketTotal).toFixed(2));
          content += `  ${r.zone}: ${h} h (${p}%)\n`;
        }
        content += '\n';
      }
    }
  }
  
  return content;
}

/**
 * Build JSON summary object
 * @param {Array} summary - Summary data array
 * @param {number} totalMs - Total milliseconds
 * @param {string} inputPath - Input file path
 * @returns {Object} JSON summary object
 */
function buildJsonSummary(summary, totalMs, inputPath) {
  return {
    summary,
    total_hours: Number((totalMs / (1000 * 60 * 60)).toFixed(3)),
    generated_at: new Date().toISOString(),
    source: inputPath
  };
}

module.exports = {
  buildTimeseriesLines,
  buildTimeseriesHeaderLine,
  buildTimeseriesLine,
  formatSummary,
  buildJsonSummary
};