// Refactor derived from logic.js
function tryParseDate(raw, preferDayFirst) {
  if (!raw || !raw.trim()) return NaN;
  const s = raw.trim();

  let d = Date.parse(s);
  if (!isNaN(d)) {
    // If preferDayFirst is set and the unqualified parse looks like day-first, refuse the fast path
    if (!(preferDayFirst && s.match(/^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}/))) {
      return d;
    }
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

function detectDayFirstFromSamples(samplesArray, filenameHint) {
  let dayFirstLikely = false;
  
  for (const sd of samplesArray) {
    const m = sd && sd.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
    if (m) {
      const a = Number(m[1]);
      if (a > 12) { dayFirstLikely = true; break; }
    }
  }
  
  if (!dayFirstLikely && samplesArray && samplesArray.length > 0) {
    const comps = samplesArray.map(s => {
      const m = s && s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
      return m ? { day: Number(m[1]), month: Number(m[2]) } : null;
    }).filter(Boolean);

    if (comps.length > 0) {
      const uniqueFirsts = [...new Set(comps.map(c => c.day))].length;
      const uniqueSeconds = [...new Set(comps.map(c => c.month))].length;
      const countDayGt12 = comps.filter(c => c.day > 12).length;

      if (uniqueSeconds <= 2 && uniqueFirsts > 12) {
        dayFirstLikely = true;
      }
      if (!dayFirstLikely) {
        const uniqueMonths = [...new Set(comps.map(c => c.month))];
        if (uniqueMonths.length === 1 && countDayGt12 > 0) {
          dayFirstLikely = true;
        }
      }
    }
  }

  const filename = (filenameHint || '').toLowerCase();
  const isSingleMonthFile = filename.includes('_01_') || filename.includes('_02_') || filename.includes('_03_') ||
                           filename.includes('_04_') || filename.includes('_05_') || filename.includes('_06_') ||
                           filename.includes('_07_') || filename.includes('_08_') || filename.includes('_09_') ||
                           filename.includes('_10_') || filename.includes('_11_') || filename.includes('_12_');

  if (isSingleMonthFile && !dayFirstLikely) {
    for (const sd of samplesArray) {
      const m = sd && sd.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
      if (m) {
        const day = Number(m[1]);
        const month = Number(m[2]);
        const filenameMonthMatch = filename.match(/_(\d{2})_/);
        if (filenameMonthMatch) {
          const filenameMonth = Number(filenameMonthMatch[1]);
          if (month === filenameMonth && day <= 31) {
            dayFirstLikely = true; break;
          }
        }
        if (day > 12) { dayFirstLikely = true; break; }
      }
    }
  }

  return dayFirstLikely;
}

function normalizeToUTC(tsMs, treatAsUTC) {
  if (!treatAsUTC) return tsMs;
  const dt = new Date(tsMs);
  return Date.UTC(dt.getFullYear(), dt.getMonth(), dt.getDate(), dt.getHours(), dt.getMinutes(), dt.getSeconds(), dt.getMilliseconds());
}

function parseTimestampOrThrow(raw, preferDayFirst, filenameHint = '') {
  let tms = tryParseDate(raw, preferDayFirst);
  if (isNaN(tms) && raw && raw.trim().match(/^(\d+)$/)) {
    const n = Number(raw.trim());
    if (n > 1000000000) tms = n; // ms
  }

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
        const m = raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})(?:[ T](\d{1,2})(?::(\d{2}))?)?/);
        if (m) {
          const day = Number(m[1]), month = Number(m[2]), year = Number(m[3].length === 2 ? '20'+m[3] : m[3]);
          if (month !== filenameMonth) {
            const hour = m[4] ? Number(m[4]) : 0;
            const minute = m[5] ? Number(m[5]) : 0;
            tms = Date.UTC(year, month - 1, day, hour, minute);
          }
        }
      }
    }
  }

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

  const _globalContext = (typeof globalThis !== 'undefined') ? globalThis : {};
  try {
    _globalContext._dateParseMappings = _globalContext._dateParseMappings || [];
    if (_globalContext._dateParseMappings.length < 10) {
      _globalContext._dateParseMappings.push({ raw: String(raw), iso: new Date(tms).toISOString() });
      try { if (_globalContext._dateParseDebug) console.debug && console.debug(`DateParse: "${raw}" -> ${new Date(tms).toISOString()}`); } catch (err) { if (typeof console !== 'undefined' && typeof console.debug === 'function') console.debug('dateParse debug log failed', err); }
    }
  } catch (err) { if (typeof console !== 'undefined' && typeof console.debug === 'function') console.debug('dateParse mappings push failed', err); }
  
  return tms;
}

export { tryParseDate, detectDayFirstFromSamples, normalizeToUTC, parseTimestampOrThrow };
