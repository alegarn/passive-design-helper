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
  const T = Number(temp);
  const H = Number(rh);
  
  const matches = [];
  for (let zi = 1; zi < ZONES.length; zi++) {
    const zone = ZONES[zi];
    if (!zone.poly) continue;
    if (pointInPoly(temp, rh, zone.poly)) matches.push(zone.id);
  }
  
  if (matches.length === 0) {
    if (T < 23) return 'Cold';
    if (T >= 43.7) return 'Air Conditioning';
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
  
  // Single-month export heuristic: if second component (month) is constant across samples and first component varies,
  // treat as DD/MM/YYYY even if preferDayFirst is false.
  // This handles files like '2024_04_...' where dates are '01/04/2024', '02/04/2024', etc.
  if (!isNaN(d) && s.match(/^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}/)) {
    const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
    if (m) {
      const first = Number(m[1]), second = Number(m[2]);
      // If first component can be a day (>12) and second is a valid month (1-12),
      // assume DD/MM/YYYY format regardless of preferDayFirst flag.
      if (first > 12 && second >= 1 && second <= 12) {
        const iso = `${m[3].length === 2 ? '20'+m[3] : m[3]}-${String(second).padStart(2,'0')}-${String(first).padStart(2,'0')}T${m[4] || '00:00:00'}`;
        const dt = Date.parse(iso);
        if (!isNaN(dt)) return dt;
      }
    }
  }
  
  if (!isNaN(d) && preferDayFirst && s.match(/^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}/)) {
  } else if (!isNaN(d)) {
    // record sample mapping when browser bundle runs
    try {
      window._dateParseMappings = window._dateParseMappings || [];
      if (window._dateParseMappings.length < 10) {
        window._dateParseMappings.push({ raw: String(raw), iso: new Date(d).toISOString() });
        console.debug(`DateParse(bundle): "${raw}" -> ${new Date(d).toISOString()}`);
      }
    } catch (e) {}
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

// === psychro/math.js ===
/**
 * Saturation vapor pressure using Magnus-Tetens formula
 * @param {number} T_C - Temperature in Celsius
 * @returns {number} Saturation vapor pressure in Pascals
 */
function e_s_Pa(T_C) {
  // Magnus-Tetens formula for saturation vapor pressure
  // Valid for 0°C to 50°C
  const a = 6.112; // hPa
  const b = 17.62;
  const c = 243.12; // °C
  
  // Convert hPa to Pa (1 hPa = 100 Pa)
  return a * 100 * Math.exp((b * T_C) / (c + T_C));
}

/**
 * Humidity ratio from vapor pressure
 * @param {number} e - Vapor pressure in Pascals
 * @param {number} p - Atmospheric pressure in Pascals (default 101325 Pa)
 * @returns {number} Humidity ratio (kg water/kg dry air)
 */
function W_from_e(e, p = 101325) {
  return 0.622 * e / (p - e);
}

/**
 * Humidity ratio from relative humidity and temperature
 * @param {number} RH - Relative humidity (0-1, not percentage)
 * @param {number} T_C - Temperature in Celsius
 * @param {number} p - Atmospheric pressure in Pascals (default 101325 Pa)
 * @returns {number} Humidity ratio (kg water/kg dry air)
 */
function W_from_RH_T(RH, T_C, p = 101325) {
  const e_sat = e_s_Pa(T_C);
  const e = RH * e_sat;
  return W_from_e(e, p);
}

/**
 * Dew point temperature from vapor pressure (inverse Magnus)
 * @param {number} e - Vapor pressure in Pascals
 * @returns {number} Dew point temperature in Celsius
 */
function dewPoint_C_from_e(e) {
  // Convert Pa to hPa for the formula
  const e_hPa = e / 100;
  
  // Inverse Magnus formula
  const a = 6.112; // hPa
  const b = 17.62;
  const c = 243.12; // °C
  
  // Only valid if e_hPa > 0
  if (e_hPa <= 0) return -273.15; // Absolute zero as fallback
  
  return (c * Math.log(e_hPa / a)) / (b - Math.log(e_hPa / a));
}

/**
 * Specific enthalpy of moist air
 * @param {number} T_C - Dry bulb temperature in Celsius
 * @param {number} W - Humidity ratio (kg water/kg dry air)
 * @returns {number} Specific enthalpy in kJ/kg dry air
 */
function enthalpy_kJkg(T_C, W) {
  // h = 1.006*T + W*(2501 + 1.86*T)
  return 1.006 * T_C + W * (2501 + 1.86 * T_C);
}

/**
 * Wet bulb temperature solver using bisection method
 * @param {number} T_C - Dry bulb temperature in Celsius
 * @param {number} RH - Relative humidity (0-1)
 * @param {number} p - Atmospheric pressure in Pascals (default 101325 Pa)
 * @param {number} tolerance - Convergence tolerance (default 0.001°C)
 * @param {number} maxIterations - Maximum iterations (default 100)
 * @returns {number} Wet bulb temperature in Celsius
 */
function wetBulbSolver(T_C, RH, p = 101325, tolerance = 0.001, maxIterations = 100) {
  // Initial bounds for wet bulb temperature
  let T_wb_min = -20; // °C
  let T_wb_max = Math.max(T_C, 50); // Can't be higher than dry bulb or 50°C
  
  // Target humidity ratio
  const W_target = W_from_RH_T(RH, T_C, p);
  
  // Bisection method
  for (let i = 0; i < maxIterations; i++) {
    const T_wb_mid = (T_wb_min + T_wb_max) / 2;
    
    // Calculate humidity ratio at wet bulb conditions (100% RH)
    const W_wb = W_from_RH_T(1.0, T_wb_mid, p);
    
    // Calculate enthalpy at wet bulb conditions
    const h_wb = enthalpy_kJkg(T_wb_mid, W_wb);
    
    // Calculate enthalpy at actual conditions
    const h_actual = enthalpy_kJkg(T_C, W_target);
    
    // Check convergence
    if (Math.abs(h_wb - h_actual) < tolerance) {
      return T_wb_mid;
    }
    
    // Adjust bounds
    if (h_wb > h_actual) {
      T_wb_max = T_wb_mid;
    } else {
      T_wb_min = T_wb_mid;
    }
    
    // Check if bounds are too close
    if (T_wb_max - T_wb_min < tolerance) {
      return (T_wb_min + T_wb_max) / 2;
    }
  }
  
  // Return best estimate if convergence not achieved
  return (T_wb_min + T_wb_max) / 2;
}

// === psychro/curveCache.js ===
/**
 * Simple LRU (Least Recently Used) cache for curve data
 */
class CurveCache {
  /**
   * Create a new curve cache
   * @param {number} maxSize - Maximum number of entries to cache (default 20)
   */
  constructor(maxSize = 20) {
    this.maxSize = maxSize;
    this.cache = new Map();
  }

  /**
   * Get cached value or compute and cache it
   * @param {string|Object} key - Cache key (will be JSON.stringify'd if object)
   * @param {Function} computeFn - Function to compute value if not in cache
   * @returns {*} Cached or computed value
   */
  getOrCompute(key, computeFn) {
    const stringKey = typeof key === 'string' ? key : JSON.stringify(key);
    
    if (this.cache.has(stringKey)) {
      // Move to end (mark as recently used)
      const value = this.cache.get(stringKey);
      this.cache.delete(stringKey);
      this.cache.set(stringKey, value);
      return value;
    }
    
    // Compute new value
    const value = computeFn();
    
    // Add to cache
    this.cache.set(stringKey, value);
    
    // Enforce size limit
    if (this.cache.size > this.maxSize) {
      // Remove oldest entry (first in Map)
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    
    return value;
  }

  /**
   * Invalidate a specific cache entry
   * @param {string|Object} key - Cache key to invalidate
   * @returns {boolean} True if entry was found and removed
   */
  invalidate(key) {
    const stringKey = typeof key === 'string' ? key : JSON.stringify(key);
    return this.cache.delete(stringKey);
  }

  /**
   * Clear all cache entries
   */
  clear() {
    this.cache.clear();
  }

  /**
   * Get current cache size
   * @returns {number} Number of entries in cache
   */
  size() {
    return this.cache.size;
  }

  /**
   * Check if cache contains key
   * @param {string|Object} key - Cache key to check
   * @returns {boolean} True if key exists in cache
   */
  has(key) {
    const stringKey = typeof key === 'string' ? key : JSON.stringify(key);
    return this.cache.has(stringKey);
  }

  /**
   * Get all cache keys (for debugging)
   * @returns {Array<string>} Array of cache keys
   */
  keys() {
    return Array.from(this.cache.keys());
  }
}

// === psychro/renderer.js ===
/**
 * Create a psychrometric chart renderer
 * @param {HTMLElement} containerEl - Container element for the chart
 * @param {Object} options - Configuration options
 * @returns {Object} Renderer instance with methods
 */
function createPsychroRenderer(containerEl, options = {}) {
  // Default options
  const opts = {
    Tmin: 0,
    Tmax: 50,
    Wmax: 0.03,
    p: 101325,
    samplingN: 200,
    dprCap: 2.0,
    rafThrottleThreshold: 500,
    resizeDebounceMs: 150,
    ...options
  };

  // Validate samplingN range
  opts.samplingN = Math.max(100, Math.min(400, opts.samplingN));
  
  // Store options for later access
  const rendererOptions = { ...opts };

  // State
  let canvas, offscreenCanvas, ctx, offscreenCtx;
  let width, height;
  let curveCache = new CurveCache();
  let resizeTimeout;
  let rafId;
  let lastFrameTime = 0;
  let dataPoints = [];

  /**
   * Initialize renderer and create canvases
   */
  function init() {
    // Clear any existing canvases first
    containerEl.innerHTML = '';
    
    // Create main canvas
    canvas = document.createElement('canvas');
    canvas.className = 'psychro-canvas';
    containerEl.appendChild(canvas);

    // Get DPR (device pixel ratio) with cap
    const dpr = Math.min(window.devicePixelRatio || 1, opts.dprCap);

    // Set initial size
    resize();

    // Get contexts
    ctx = canvas.getContext('2d');

    // Create offscreen canvas (not appended to DOM)
    if (typeof OffscreenCanvas !== 'undefined') {
      offscreenCanvas = new OffscreenCanvas(width * dpr, height * dpr);
      offscreenCtx = offscreenCanvas.getContext('2d');
    } else {
      // Fallback to in-memory canvas (not appended to DOM)
      offscreenCanvas = document.createElement('canvas');
      offscreenCanvas.width = width * dpr;
      offscreenCanvas.height = height * dpr;
      offscreenCtx = offscreenCanvas.getContext('2d');
    }

    // Handle resize with debounce
    window.addEventListener('resize', handleResize);

    // Initial render
    renderBackground();
  }

  /**
   * Handle window resize with debouncing
   */
  function handleResize() {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
      resize();
      renderBackground();
      renderDataPoints(dataPoints);
    }, opts.resizeDebounceMs);
  }

  /**
   * Resize canvases to container dimensions
   */
  function resize(w, h) {
    if (w !== undefined && h !== undefined) {
      width = w;
      height = h;
    } else {
      const rect = containerEl.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
    }

    const dpr = Math.min(window.devicePixelRatio || 1, opts.dprCap);

    // Update main canvas
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    // Update contexts
    if (ctx) {
      ctx.scale(dpr, dpr);
    }

    // Update offscreen canvas
    if (offscreenCanvas) {
      offscreenCanvas.width = width * dpr;
      offscreenCanvas.height = height * dpr;
    }
    if (offscreenCtx) {
      offscreenCtx.scale(dpr, dpr);
    }

    // Invalidate curve cache on resize
    curveCache.clear();
  }

  /**
   * Convert psychrometric coordinates to canvas coordinates
   * @param {number} T - Temperature in Celsius
   * @param {number} W - Humidity ratio
   * @returns {Object} Canvas coordinates {x, y}
   */
  function psychroToCanvas(T, W) {
    const x = ((T - opts.Tmin) / (opts.Tmax - opts.Tmin)) * width;
    const y = height - (W / opts.Wmax) * height;
    return { x, y };
  }

  /**
   * Generate constant temperature curve (vertical lines)
   * @param {number} T - Temperature in Celsius
   * @returns {Path2D} Path object for the curve
   */
  function generateConstantTempCurve(T) {
    const path = new Path2D();
    const start = psychroToCanvas(T, 0);
    path.moveTo(start.x, start.y);
    const end = psychroToCanvas(T, opts.Wmax);
    path.lineTo(end.x, end.y);
    return path;
  }

  /**
   * Generate constant humidity ratio curve (horizontal lines)
   * @param {number} W - Humidity ratio
   * @returns {Path2D} Path object for the curve
   */
  function generateConstantWHumidCurve(W) {
    const path = new Path2D();
    const start = psychroToCanvas(opts.Tmin, W);
    path.moveTo(start.x, start.y);
    const end = psychroToCanvas(opts.Tmax, W);
    path.lineTo(end.x, end.y);
    return path;
  }

  /**
   * Generate constant relative humidity curve
   * @param {number} RH - Relative humidity (0-1)
   * @returns {Path2D} Path object for the curve
   */
  function generateConstantRHCureve(RH) {
    const path = new Path2D();
    let firstPoint = true;

    for (let i = 0; i <= opts.samplingN; i++) {
      const T = opts.Tmin + (opts.Tmax - opts.Tmin) * (i / opts.samplingN);
      const W = W_from_RH_T(RH, T, opts.p);
      
      if (W <= opts.Wmax) {
        const point = psychroToCanvas(T, W);
        if (firstPoint) {
          path.moveTo(point.x, point.y);
          firstPoint = false;
        } else {
          path.lineTo(point.x, point.y);
        }
      }
    }
    return path;
  }

  /**
   * Generate constant enthalpy curve
   * @param {number} h - Enthalpy in kJ/kg
   * @returns {Path2D} Path object for the curve
   */
  function generateConstantEnthalpyCurve(h) {
    const path = new Path2D();
    let firstPoint = true;

    for (let i = 0; i <= opts.samplingN; i++) {
      const T = opts.Tmin + (opts.Tmax - opts.Tmin) * (i / opts.samplingN);
      
      // Solve for W from enthalpy equation: h = 1.006*T + W*(2501 + 1.86*T)
      const W = (h - 1.006 * T) / (2501 + 1.86 * T);
      
      if (W > 0 && W <= opts.Wmax) {
        const point = psychroToCanvas(T, W);
        if (firstPoint) {
          path.moveTo(point.x, point.y);
          firstPoint = false;
        } else {
          path.lineTo(point.x, point.y);
        }
      }
    }
    return path;
  }

  /**
   * Render background grid and curves
   */
  function renderBackground() {
    if (!offscreenCtx) return;

    // Clear canvas
    offscreenCtx.clearRect(0, 0, width, height);

    // Set styles
    offscreenCtx.strokeStyle = '#e0e0e0';
    offscreenCtx.lineWidth = 1;

    // Draw temperature lines (vertical)
    for (let T = Math.ceil(opts.Tmin); T <= opts.Tmax; T += 5) {
      const curveKey = `temp_${T}`;
      const path = curveCache.getOrCompute(curveKey, () => generateConstantTempCurve(T));
      offscreenCtx.stroke(path);
    }

    // Draw humidity ratio lines (horizontal)
    for (let W = 0.005; W <= opts.Wmax; W += 0.005) {
      const curveKey = `w_${W.toFixed(3)}`;
      const path = curveCache.getOrCompute(curveKey, () => generateConstantWHumidCurve(W));
      offscreenCtx.stroke(path);
    }

    // Draw relative humidity curves
    offscreenCtx.strokeStyle = '#a0a0a0';
    for (let RH = 0.1; RH <= 1.0; RH += 0.1) {
      const curveKey = `rh_${RH.toFixed(1)}`;
      const path = curveCache.getOrCompute(curveKey, () => generateConstantRHCureve(RH));
      offscreenCtx.stroke(path);
    }

    // Draw enthalpy lines
    offscreenCtx.strokeStyle = '#808080';
    offscreenCtx.setLineDash([5, 5]);
    for (let h = 20; h <= 100; h += 10) {
      const curveKey = `h_${h}`;
      const path = curveCache.getOrCompute(curveKey, () => generateConstantEnthalpyCurve(h));
      offscreenCtx.stroke(path);
    }
    offscreenCtx.setLineDash([]);

    // Draw border
    offscreenCtx.strokeStyle = '#333';
    offscreenCtx.lineWidth = 2;
    offscreenCtx.strokeRect(0, 0, width, height);

    // Copy to main canvas
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(offscreenCanvas, 0, 0, width, height);
  }

  /**
   * Render zones on the chart
   */
  function renderZones() {
    if (!ctx || !window.TacticsBundle || !window.TacticsBundle.ZONES) return;

    // Create coordinate mapping functions
    const mapTempToX = (T) => ((T - opts.Tmin) / (opts.Tmax - opts.Tmin)) * width;
    const mapWToY = (W) => height - (W / opts.Wmax) * height;

    // Draw each zone
    window.TacticsBundle.ZONES.forEach(zone => {
      if (zone.poly && zone.poly.length > 0) {
        ctx.fillStyle = zone.color + '40'; // Add transparency
        ctx.strokeStyle = zone.color;
        ctx.lineWidth = 2;
        ctx.beginPath();

        zone.poly.forEach((pt, i) => {
          // Convert RH to W (humidity ratio) if needed
          const W = window.TacticsBundle.W_from_RH_T(pt[1]/100, pt[0]);
          const x = mapTempToX(pt[0]);
          const y = mapWToY(W);

          if (i === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
        });

        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
    });
  }

  /**
   * Render data points with RAF throttling
   * @param {Array} points - Array of data points with T, W properties
   */
  function renderDataPoints(points) {
    dataPoints = points || [];

    // Throttle based on point count
    const useThrottle = dataPoints.length > opts.rafThrottleThreshold;
    const targetFPS = useThrottle ? 30 : 60;
    const frameInterval = 1000 / targetFPS;

    const render = (timestamp) => {
      if (typeof timestamp !== 'number' || !isFinite(timestamp)) {
        timestamp = (typeof performance !== 'undefined' && typeof performance.now === 'function') ? performance.now() : Date.now();
      }
      if (timestamp - lastFrameTime >= frameInterval) {
        // Redraw background
        ctx.clearRect(0, 0, width, height);
        ctx.drawImage(offscreenCanvas, 0, 0, width, height);

        // Draw zones
        renderZones();

        // Draw points
        ctx.fillStyle = '#ff4444';
        dataPoints.forEach(point => {
          const canvasPoint = psychroToCanvas(point.T, point.W);
          ctx.beginPath();
          ctx.arc(canvasPoint.x, canvasPoint.y, 4, 0, 2 * Math.PI);
          ctx.fill();
        });

        lastFrameTime = timestamp;
      }

      if (useThrottle) {
        rafId = requestAnimationFrame(render);
      }
    };

    // Cancel any existing animation
    if (rafId) {
      cancelAnimationFrame(rafId);
    }

    if (useThrottle) {
      rafId = requestAnimationFrame(render);
    } else {
      render((typeof performance !== 'undefined' && typeof performance.now === 'function') ? performance.now() : Date.now());
    }
  }

  /**
   * Clean up resources
   */
  function destroy() {
    if (rafId) {
      cancelAnimationFrame(rafId);
    }
    window.removeEventListener('resize', handleResize);
    clearTimeout(resizeTimeout);
    if (canvas && canvas.parentNode) {
      canvas.parentNode.removeChild(canvas);
    }
    // Clear all canvases in the container to prevent duplicates
    if (containerEl) {
      containerEl.innerHTML = '';
    }
    curveCache.clear();
  }

  // Return public API
  return {
    init,
    renderBackground,
    renderDataPoints,
    renderZones,
    resize,
    destroy,
    getCanvas: () => canvas,
    getContext: () => ctx,
    getOptions: () => rendererOptions
  };
}

// === psychro/index.js ===
/**
 * Initialize a psychrometric chart in the specified container
 * @param {string} containerSelector - CSS selector for the container element
 * @param {Object} options - Configuration options for the chart
 * @returns {Object} Renderer instance with methods
 */
function initPsychroChart(containerSelector, options = {}) {
  // Find container element
  const containerEl = document.querySelector(containerSelector);
  if (!containerEl) {
    throw new Error(`Container element not found: ${containerSelector}`);
  }

  // Create renderer with default options
  const defaultOptions = {
    Tmin: 0,
    Tmax: 50,
    Wmax: 0.03,
    p: 101325,
    samplingN: 200,
    dprCap: 2.0,
    rafThrottleThreshold: 500,
    resizeDebounceMs: 150
  };

  const mergedOptions = { ...defaultOptions, ...options };

  // Create and initialize renderer
  const renderer = createPsychroRenderer(containerEl, mergedOptions);
  renderer.init();

  return renderer;
}

/**
 * Create sample data points for testing
 * @param {number} count - Number of sample points to generate
 * @returns {Array} Array of sample points with T and W properties
 */
function createSampleDataPoints(count = 10) {
  const points = [];
  for (let i = 0; i < count; i++) {
    points.push({
      T: Math.random() * 50, // 0-50°C
      W: Math.random() * 0.03, // 0-0.03 kg/kg
      id: i
    });
  }
  return points;
}

// Enable psychrometric chart feature flag
window.DEV_PSYCHRO_CHART = true;

// Export all functions for use in app.js
// Added psychro modules to support psychrometric chart functionality in production bundle
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
  buildJsonSummary,
  // Psychrometric chart functions
  e_s_Pa,
  W_from_e,
  W_from_RH_T,
  dewPoint_C_from_e,
  enthalpy_kJkg,
  wetBulbSolver,
  CurveCache,
  createPsychroRenderer,
  initPsychroChart,
  createSampleDataPoints
};