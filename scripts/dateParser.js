// Refactor derived from logic.js
// const path = require('path'); // Not needed in browser

/**
 * Try to parse a date string using multiple strategies
 * @param {string} raw - Raw date string
 * @param {boolean} preferDayFirst - Whether to prefer day-first parsing for ambiguous dates
 * @returns {number} Timestamp in milliseconds or NaN if parsing fails
 */
function tryParseDate(raw, preferDayFirst) {
  if (!raw || !raw.trim()) return NaN;
  const s = raw.trim();
  
  // 1) ISO direct - but skip if we prefer day-first and this looks like ambiguous format
  let d = Date.parse(s);
  
  // If we prefer day-first and this looks like DD/MM/YYYY format, don't use direct parse
  // because Date.parse() will interpret as MM/DD/YYYY
  if (!isNaN(d) && preferDayFirst && s.match(/^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}/)) {
    // Skip direct parse and force regex parsing
  } else if (!isNaN(d)) {
    return d;
  }
  
  // normalize spaces and trim
  const norm = s.replace(/\s+/g, ' ').trim();
  
  // pattern: DD/MM/YYYY HH:MM:SS or MM/DD/YYYY HH:MM:SS
  const m = norm.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})(?:[ T](\d{1,2}:\d{2}(?::\d{2})?))?$/);
  
  if (m) {
    const a = Number(m[1]), b = Number(m[2]), y = Number(m[3]);
    const timePart = m[4] || '00:00:00';
    if (preferDayFirst) {
      const iso = `${y.toString().padStart(4,'0')}-${String(b).padStart(2,'0')}-${String(a).padStart(2,'0')}T${timePart}`;
      const dt = Date.parse(iso);
      if (!isNaN(dt)) return dt;
      // try month-first as fallback
      const iso2 = `${y.toString().padStart(4,'0')}-${String(a).padStart(2,'0')}-${String(b).padStart(2,'0')}T${timePart}`;
      const dt2 = Date.parse(iso2);
      if (!isNaN(dt2)) return dt2;
    } else {
      // try month-first first
      const iso2 = `${y.toString().padStart(4,'0')}-${String(a).padStart(2,'0')}-${String(b).padStart(2,'0')}T${timePart}`;
      const dt2 = Date.parse(iso2);
      if (!isNaN(dt2)) return dt2;
      // try day-first as fallback
      const iso = `${y.toString().padStart(4,'0')}-${String(b).padStart(2,'0')}-${String(a).padStart(2,'0')}T${timePart}`;
      const dt = Date.parse(iso);
      if (!isNaN(dt)) return dt;
    }
  }
  
  // try epoch seconds or ms
  const onlyDigits = s.replace(/[^0-9]/g, '');
  if (onlyDigits.length >= 10) {
    const n = Number(s);
    if (!isNaN(n)) return n;
  }
  
  return NaN;
}

/**
 * Detect if dates should be parsed as day-first from sample data
 * @param {string[]} samplesArray - Array of date string samples
 * @param {string} filenameHint - Filename to use as hint for detection
 * @returns {boolean} True if day-first parsing is likely
 */
function detectDayFirstFromSamples(samplesArray, filenameHint) {
  // Try to detect day-first vs month-first by heuristics: if day>12 appears -> day-first
  let dayFirstLikely = false;

  // Heuristic A: if any sample's first component > 12 -> it's day-first (e.g., 13/04)
  for (const sd of samplesArray) {
    const m = sd && sd.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
    if (m) {
      const a = Number(m[1]);
      if (a > 12) {
        dayFirstLikely = true;
        break;
      }
    }
  }

  // Heuristic B: analyze component variability to detect single-month exports
  // If the second component (interpreted as month in DD/MM) is nearly constant across samples
  // while the first component varies widely (1..31), prefer day-first parsing.
  if (!dayFirstLikely && samplesArray && samplesArray.length > 0) {
    const comps = samplesArray.map(s => {
      const m = s && s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
      return m ? { day: Number(m[1]), month: Number(m[2]) } : null;
    }).filter(Boolean);

    if (comps.length > 0) {
      const uniqueFirsts = [...new Set(comps.map(c => c.day))].length;
      const uniqueSeconds = [...new Set(comps.map(c => c.month))].length;
      const countDayGt12 = comps.filter(c => c.day > 12).length;

      // If second component is nearly constant (single-month) and first component varies,
      // treat as day-first even if no day>12 sample exists.
      if (uniqueSeconds <= 2 && uniqueFirsts > 12) {
        dayFirstLikely = true;
      }

      // Existing check: if many day values > 12 and second component is single-month
      if (!dayFirstLikely) {
        const uniqueMonths = [...new Set(comps.map(c => c.month))];
        if (uniqueMonths.length === 1 && countDayGt12 > 0) {
          dayFirstLikely = true;
        }
      }
    }
  }

  // Additional heuristic: filename hint indicates single-month export (fallback)
  const filename = (filenameHint || '').toLowerCase();
  const isSingleMonthFile = filename.includes('_01_') || filename.includes('_02_') || filename.includes('_03_') ||
                           filename.includes('_04_') || filename.includes('_05_') || filename.includes('_06_') ||
                           filename.includes('_07_') || filename.includes('_08_') || filename.includes('_09_') ||
                           filename.includes('_10_') || filename.includes('_11_') || filename.includes('_12_');

  if (isSingleMonthFile && !dayFirstLikely) {
    // Check if any date has day > 12 or if month in filename matches second component
    for (const sd of samplesArray) {
      const m = sd && sd.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
      if (m) {
        const day = Number(m[1]);
        const month = Number(m[2]);
        // Extract month from filename (e.g., _04_ from 2024_04_si_samrong_hourly.csv)
        const filenameMonthMatch = filename.match(/_(\d{2})_/);
        if (filenameMonthMatch) {
          const filenameMonth = Number(filenameMonthMatch[1]);
          if (month === filenameMonth && day <= 31) {
            dayFirstLikely = true;
            break;
          }
        }
        if (day > 12) {
          dayFirstLikely = true;
          break;
        }
      }
    }
  }

  return dayFirstLikely;
}

/**
 * Normalize timestamp to UTC if requested
 * @param {number} tsMs - Timestamp in milliseconds
 * @param {boolean} treatAsUTC - Whether to treat as UTC
 * @returns {number} Normalized timestamp
 */
function normalizeToUTC(tsMs, treatAsUTC) {
  if (!treatAsUTC) return tsMs;
  
  // convert parsed time to milliseconds UTC (if parsed as local)
  const dt = new Date(tsMs);
  return Date.UTC(dt.getFullYear(), dt.getMonth(), dt.getDate(), dt.getHours(), dt.getMinutes(), dt.getSeconds(), dt.getMilliseconds());
}

/**
 * Parse timestamp or throw error
 * @param {string} raw - Raw timestamp string
 * @param {boolean} preferDayFirst - Whether to prefer day-first parsing
 * @returns {number} Timestamp in milliseconds
 * @throws {Error} With 'DateParseError:' prefix if parsing fails
 */
function parseTimestampOrThrow(raw, preferDayFirst, filenameHint = '') {
  let tms = tryParseDate(raw, preferDayFirst);
  
  // Try epoch seconds if direct parsing failed
  if (isNaN(tms) && raw && raw.trim().match(/^(\d+)$/)) {
    const n = Number(raw.trim());
    if (n > 1000000000) tms = n; // ms
  }
  
  // Deterministic parsing for single-month files with ambiguous dates
  if (isNaN(tms) && filenameHint) {
    const filename = filenameHint.toLowerCase();
    const isSingleMonthFile = filename.includes('_01_') || filename.includes('_02_') || filename.includes('_03_') ||
                             filename.includes('_04_') || filename.includes('_05_') || filename.includes('_06_') ||
                             filename.includes('_07_') || filename.includes('_08_') || filename.includes('_09_') ||
                             filename.includes('_10_') || filename.includes('_11_') || filename.includes('_12_');
    
    if (isSingleMonthFile && raw.match(/^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}/)) {
      const mF = (filename || '').match(/_(\d{2})_/);
      if (mF && raw.match(/^\d{1,2}[\/\-](\d{1,2})[\/\-](\d{2,4})$/)) {
        const filenameMonth = Number(mF[1]);
        // parse with regex to get parts:
        const m = raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})(?:[ T](\d{1,2})(?::(\d{2}))?)?/);
        if (m) {
          const day = Number(m[1]), month = Number(m[2]), year = Number(m[3].length === 2 ? '20'+m[3] : m[3]);
          // if second component !== filenameMonth then treat as day-first (DD/MM/YYYY)
          if (month !== filenameMonth) {
            const hour = m[4] ? Number(m[4]) : 0;
            const minute = m[5] ? Number(m[5]) : 0;
            // Correct deterministic construction: Date.UTC(year, monthIndex, day, hour, minute)
            // First component is day, second is month -> monthIndex = month - 1
            tms = Date.UTC(year, month - 1, day, hour, minute);
          }
        }
      }
    }
  }
  
  // if still NaN, try with swapped day/month if dayFirstLikely
  if (isNaN(tms) && preferDayFirst) {
    const m = raw && raw.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
    if (m) {
      const a = Number(m[1]), b = Number(m[2]), y = Number(m[3]);
      const iso = `${y.toString().padStart(4,'0')}-${String(b).padStart(2,'0')}-${String(a).padStart(2,'0')}T00:00:00`;
      const d = Date.parse(iso);
      if (!isNaN(d)) tms = d;
    }
  }
  
  if (isNaN(tms)) {
    throw new Error(`DateParseError: Unable to parse date "${raw}"`);
  }
  
  // Record mapping for debugging (browser or Node). Keep only first 10 mappings to avoid noisy logs.
  const _globalContext = (typeof window !== 'undefined') ? window : (typeof global !== 'undefined' ? global : {});
  try {
    _globalContext._dateParseMappings = _globalContext._dateParseMappings || [];
    if (_globalContext._dateParseMappings.length < 10) {
      _globalContext._dateParseMappings.push({ raw: String(raw), iso: new Date(tms).toISOString() });
      // Also emit a console.debug for immediate visibility
      console.debug(`DateParse: "${raw}" -> ${new Date(tms).toISOString()}`);
    }
  } catch (e) {
    // Ignore any debugging errors
  }
  
  return tms;
}

export { tryParseDate, detectDayFirstFromSamples, normalizeToUTC, parseTimestampOrThrow };