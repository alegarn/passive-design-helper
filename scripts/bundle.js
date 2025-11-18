// Bundled version for browser compatibility
// All modules combined into single file to avoid CORS issues

// === zones.js ===
const INF_T = 1e6;

function p(t, rh) {
  if (typeof t === 'string' && t.trim().endsWith('+')) {
    return [INF_T, Number(rh)];
  }
  return [Number(t), Number(rh)];
}

const ZONES = [
  { 
    id: 'Cold', 
    color: '#88c0d0', 
    poly: null, 
    note: 'T < 23°C' 
  },
  { 
    id: 'Comfort', 
    color: '#a3be8c', 
    poly: [ 
      p(23,20), 
      p(23,80), 
      p(25,80), 
      p(28,67), 
      p(29.5,50), 
      p(29.5,20) 
    ]
  },
  { 
    id: 'Ventilation', 
    color: '#ebcb8b', 
    poly: [ 
      p(23,80), 
      p(23,100), 
      p(29.5,100), 
      p(34.5,50), 
      p(34.5,20), 
      p(29.5,20), 
      p(29.5,50), 
      p(28,67), 
      p(25,80) 
    ]
  },
  { 
    id: 'Mass Cooling', 
    color: '#5e81ac', 
    poly: [ 
      p(23,20), 
      p(29.5,20), 
      p(29.5,50), 
      p(28,67), 
      p(36,33), 
      p(39.5,30), 
      p(39.5,7) 
    ]
  },
  { 
    id: 'Evaporative Cooling', 
    color: '#88c0d0', 
    poly: [ 
      p(23,20), 
      p(29.5,20), 
      p(29.5,50), 
      p(28,67), 
      p(39,30), 
      p(42.7,20), 
      p(43.7,10), 
      p(43.7,0), 
      p(31.3,0) 
    ]
  },
  {
    id: 'Mass Cooling & Night Ventilation (or Air Conditioning)',
    color: '#5e81ac',
    poly: [
      p(39.6, 7),
      p(39.6,30),
      p(35.9,42),
      p(43.0,27),
      p(47.8,20),
      p(47.8, 5)
    ]
  },
  {
    id: 'Air Conditioning + Dehumidifier',
    color: '#bf616a', 
    poly: [
      p(34.7, 45),
      p(34.7, 50),
      p(29.8,100),
      p(34.3,100),
      p(50.0,100),
      p(50.0,16)
    ]
  },
  { 
    id: 'Air Conditioning', 
    color: '#d08770', 
    poly: [
      p(43.7,  0),
      p(43.7,  6),
      p(47.3,  6),
      p(47.3, 20),
      p(44.0, 27),
      p(50.0, 17),
      p(50.0,  0)
    ]
  }
];

function pointInPoly(px, py, poly) {
  if (!Array.isArray(poly) || poly.length === 0) return false;
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], yi = poly[i][1];
    const xj = poly[j][0], yj = poly[j][1];

    if (isPointOnSegment(px, py, xi, yi, xj, yj)) return true;

    const intersect = ((yi > py) !== (yj > py)) &&
      (px < (xj - xi) * (py - yi) / ((yj - yi) || 1e-12) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

function isPointOnSegment(px, py, x1, y1, x2, y2) {
  if ((px < Math.min(x1, x2) - 1e-9) || (px > Math.max(x1, x2) + 1e-9) ||
      (py < Math.min(y1, y2) - 1e-9) || (py > Math.max(y1, y2) + 1e-9)) {
    return false;
  }
  const cross = (py - y1) * (x2 - x1) - (px - x1) * (y2 - y1);
  return Math.abs(cross) < 1e-9;
}

// === classify.js ===
const ENERGY_PRIORITY = ['Comfort', 'Ventilation', 'Mass Cooling', 'Evaporative Cooling', 'Air Conditioning + Dehumidifier', 'Air Conditioning', 'Cold', 'Unclassified'];

function classifyPoint(temp, rh) {
  if (temp < 23) return 'Cold';
  
  const matches = [];
  for (let zi = 1; zi < ZONES.length; zi++) {
    const zone = ZONES[zi];
    if (!zone.poly) continue;
    if (pointInPoly(temp, rh, zone.poly)) matches.push(zone.id);
  }
  
  if (matches.length === 0) {
    if (temp >= 43.7) return 'Air Conditioning';
    return 'Unclassified';
  }
  
  matches.sort((a,b) => ENERGY_PRIORITY.indexOf(a) - ENERGY_PRIORITY.indexOf(b));
  return matches[0];
}

// === csv.js ===
function csvSplitLine(line) {
  const out = [];
  let cur = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"' ) {
      if (inQuotes && line[i+1] === '"') {
        cur += '"';
        i++;
        continue;
      }
      inQuotes = !inQuotes;
      continue;
    }
    if (ch === ',' && !inQuotes) {
      out.push(cur);
      cur = '';
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out;
}

function parseHeader(lines) {
  if (lines.length === 0) {
    throw new Error('No lines provided for header parsing');
  }
  
  const headerLine = lines[0];
  const headers = csvSplitLine(headerLine).map(h => h.trim().toLowerCase());
  return headers;
}

function findBestColumn(headers, candidates) {
  for (const candidate of candidates) {
    const idx = headers.findIndex(h => h.includes(candidate));
    if (idx >= 0) return idx;
  }
  return -1;
}

// === dateParser.js ===
function tryParseDate(raw, preferDayFirst) {
  if (!raw || !raw.trim()) return NaN;
  const s = raw.trim();
  
  let d = Date.parse(s);
  
  if (!isNaN(d) && preferDayFirst && s.match(/^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}/)) {
  } else if (!isNaN(d)) {
    return d;
  }
  
  const norm = s.replace(/\s+/g, ' ').trim();
  
  const m = norm.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})(?:[ T](\d{1,2}:\d{2}(?::\d{2})?))?$/);
  
  if (m) {
    const a = Number(m[1]), b = Number(m[2]), y = Number(m[3]);
    const timePart = m[4] || '00:00:00';
    if (preferDayFirst) {
      const iso = `${y.toString().padStart(4,'0')}-${String(b).padStart(2,'0')}-${String(a).padStart(2,'0')}T${timePart}`;
      const dt = Date.parse(iso);
      if (!isNaN(dt)) return dt;
      const iso2 = `${y.toString().padStart(4,'0')}-${String(a).padStart(2,'0')}-${String(b).padStart(2,'0')}T${timePart}`;
      const dt2 = Date.parse(iso2);
      if (!isNaN(dt2)) return dt2;
    } else {
      const iso2 = `${y.toString().padStart(4,'0')}-${String(a).padStart(2,'0')}-${String(b).padStart(2,'0')}T${timePart}`;
      const dt2 = Date.parse(iso2);
      if (!isNaN(dt2)) return dt2;
      const iso = `${y.toString().padStart(4,'0')}-${String(b).padStart(2,'0')}-${String(a).padStart(2,'0')}T${timePart}`;
      const dt = Date.parse(iso);
      if (!isNaN(dt)) return dt;
    }
  }
  
  const onlyDigits = s.replace(/[^0-9]/g, '');
  if (onlyDigits.length >= 10) {
    const n = Number(s);
    if (!isNaN(n)) return n;
  }
  
  return NaN;
}

// === utils.js ===
function datePartsFactory(treatAsUTC) {
  return function(ts) {
    const d = new Date(ts);
    if (treatAsUTC) {
      return {
        year: d.getUTCFullYear(),
        month: d.getUTCMonth() + 1,
        day: d.getUTCDate(),
        hours: d.getUTCHours(),
        minutes: d.getUTCMinutes(),
        seconds: d.getUTCSeconds()
      };
    } else {
      return {
        year: d.getFullYear(),
        month: d.getMonth() + 1,
        day: d.getDate(),
        hours: d.getHours(),
        minutes: d.getMinutes(),
        seconds: d.getSeconds()
      };
    }
  };
}

// === aggregate.js ===
function createAggregator(options = {}) {
  const {
    maxDeltasForMedian = 1000,
    treatAsUTC = false
  } = options;
  
  const dateParts = datePartsFactory(treatAsUTC);
  
  let previousRow = null;
  let deltas = [];
  let agg = {};
  let perBucket = {};
  let rowsCount = 0;
  let totalMs = 0;
  let firstTs = null;
  let lastTs = null;
  let timelineUnit = null;
  let rowsWithDur = [];
  
  function pushRow(row) {
    row.zone = classifyPoint(row.temp, row.rh);
    
    if (!previousRow) {
      firstTs = row.ts;
      previousRow = row;
      rowsCount++;
      return;
    }
    
    const delta = row.ts - previousRow.ts;
    const duration = delta > 0 ? delta : 0;
    
    if (deltas.length < maxDeltasForMedian) {
      deltas.push(delta);
    }
    
    agg[row.zone] = (agg[row.zone] || 0) + duration;
    totalMs += duration;
    lastTs = row.ts;
    rowsCount++;
    
    rowsWithDur.push({ ...row, dur: duration });
    
    previousRow = row;
  }
  
  function setTimelineUnit(unit) {
    timelineUnit = unit;
  }
  
  function finish() {
    if (previousRow && deltas.length > 0) {
      const sortedDeltas = [...deltas].sort((a, b) => a - b);
      const medianDelta = sortedDeltas[Math.floor(sortedDeltas.length / 2)] || 0;
      const lastDuration = medianDelta > 0 ? medianDelta : 0;
      
      agg[previousRow.zone] = (agg[previousRow.zone] || 0) + lastDuration;
      totalMs += lastDuration;
      
      rowsWithDur.push({ ...previousRow, dur: lastDuration });
    }
    
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
      medianDelta: deltas.length > 0 ? [...deltas].sort((a, b) => a - b)[Math.floor(deltas.length / 2)] : 0,
      rowsWithDur
    };
  }
  
  function bucketKey(ts, timelineUnit, dateParts) {
    const parts = dateParts(ts);
    if (timelineUnit === 'month') {
      return `${parts.year}-${String(parts.month).padStart(2, '0')}`;
    }
    if (timelineUnit === 'day') {
      return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
    }
    return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')} ${String(parts.hours).padStart(2, '0')}:00`;
  }
  
  return {
    pushRow,
    finish,
    setTimelineUnit
  };
}

// === output.js ===
function buildTimeseriesLines(rows) {
  const lines = ['datetime,temperature,humidity,zone,color'];
  
  for (const row of rows) {
    const zoneColor = (ZONES.find(z => z.id === row.zone) || { color: '#999999' }).color;
    const line = [new Date(row.ts).toISOString(), row.temp, row.rh, row.zone, zoneColor].join(',');
    lines.push(line);
  }
  
  return lines;
}

function formatSummary(summary, perBucket, timelineUnit, outFormat, totalMs, treatAsUTC, startTs, endTs) {
  const opts = arguments.length > 8 && typeof arguments[8] === 'object' ? arguments[8] : {};
  const dateParts = datePartsFactory(treatAsUTC);
  let content = '';
  
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

function buildJsonSummary(summary, totalMs, inputPath) {
  return {
    summary,
    total_hours: Number((totalMs / (1000 * 60 * 60)).toFixed(3)),
    generated_at: new Date().toISOString(),
    source: inputPath
  };
}

// Export all functions for use in app.js
window.TacticsBundle = {
  ZONES,
  INF_T,
  pointInPoly,
  classifyPoint,
  csvSplitLine,
  parseHeader,
  findBestColumn,
  tryParseDate,
  datePartsFactory,
  createAggregator,
  buildTimeseriesLines,
  formatSummary,
  buildJsonSummary
};