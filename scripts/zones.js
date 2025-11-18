// Refactor derived from logic.js

/**
 * Infinite temperature constant for extending zone polygons
 */
const INF_T = 1e6;

/**
 * Helper function to create temperature/RH points, handling '+' suffix for infinite temperature
 * @param {number|string} t - Temperature value (number or string with '+' suffix)
 * @param {number} rh - Relative humidity value
 * @returns {number[]} [temperature, humidity] pair
 */
function p(t, rh) {
  if (typeof t === 'string' && t.trim().endsWith('+')) {
    return [INF_T, Number(rh)];
  }
  return [Number(t), Number(rh)];
}

/**
 * Zone definitions for passive design tactics
 * Each zone has id, color, polygon points, and optional note
 */
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

/* Utility: inclusive segment check and ray-casting point-in-polygon */

function isPointOnSegment(px, py, x1, y1, x2, y2) {
  // quick bbox reject
  if ((px < Math.min(x1, x2) - 1e-9) || (px > Math.max(x1, x2) + 1e-9) ||
      (py < Math.min(y1, y2) - 1e-9) || (py > Math.max(y1, y2) + 1e-9)) {
    return false;
  }
  // cross product near zero => colinear
  const cross = (py - y1) * (x2 - x1) - (px - x1) * (y2 - y1);
  return Math.abs(cross) < 1e-9;
}

function pointInPoly(px, py, poly) {
  if (!Array.isArray(poly) || poly.length === 0) return false;
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], yi = poly[i][1];
    const xj = poly[j][0], yj = poly[j][1];

    // inclusive edge check
    if (isPointOnSegment(px, py, xi, yi, xj, yj)) return true;

    // ray-casting: check edge intersects horizontal ray to the right of point
    const intersect = ((yi > py) !== (yj > py)) &&
      (px < (xj - xi) * (py - yi) / ((yj - yi) || 1e-12) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

/* Return list of zone objects that contain the given temp/rh point.
   - For `Cold` (poly === null) we treat as T < 23
*/
function zonesContainingPoint(temp, rh) {
  const t = Number(temp);
  const h = Number(rh);
  const found = [];

  for (const z of ZONES) {
    if (!z.poly) {
      // special Cold zone
      if (z.id === 'Cold' && t < 23) found.push(z);
      continue;
    }
    if (pointInPoly(t, h, z.poly)) found.push(z);
  }
  return found;
}

/* Choose preferred zone when multiple zones match.
   Uses `priority` (lower is preferred). If tie, prefer passive type then hybrid then active.
*/
function preferredZoneForPoint(temp, rh) {
  const matches = zonesContainingPoint(temp, rh);
  if (matches.length === 0) return null;
  matches.sort((a, b) => {
    const pa = a.priority ?? 99;
    const pb = b.priority ?? 99;
    if (pa !== pb) return pa - pb;
    const rank = { passive: 0, hybrid: 1, active: 2 };
    return (rank[a.type] ?? 3) - (rank[b.type] ?? 3);
  });
  return matches[0];
}

/* Summarize a time series (array of [t, rh] or {t,rh}) into:
   - combos: durations for each combination of matching zones (keys are sorted "A & B & C")
   - preferred: durations for preferred zone chosen per point
   - timeline: per input point details (t, rh, matches[], preferred)
   - merged: consecutive identical combos merged into intervals with duration (hours)
*/
function summarizeTimeSeries(points, hourPerPoint = 1) {
  const comboCounts = new Map();
  const preferredCounts = new Map();
  const timeline = [];

  for (const entry of points) {
    let t, h;
    if (Array.isArray(entry)) { t = entry[0]; h = entry[1]; }
    else { t = entry.t ?? entry.temp; h = entry.rh ?? entry.humidity; }

    const matches = zonesContainingPoint(t, h).map(z => z.id).sort();
    const key = matches.length ? matches.join(' & ') : 'Unclassified';
    comboCounts.set(key, (comboCounts.get(key) || 0) + hourPerPoint);

    const pref = preferredZoneForPoint(t, h);
    const prefId = pref ? pref.id : 'Unclassified';
    preferredCounts.set(prefId, (preferredCounts.get(prefId) || 0) + hourPerPoint);

    timeline.push({ t: Number(t), rh: Number(h), matches, preferred: prefId });
  }

  const merged = mergeConsecutive(timeline, hourPerPoint);

  // convert maps to plain objects
  const combos = {};
  for (const [k, v] of comboCounts.entries()) combos[k] = v;
  const preferred = {};
  for (const [k, v] of preferredCounts.entries()) preferred[k] = v;

  return { combos, preferred, timeline, merged };
}

/* Merge consecutive timeline entries that have identical matches & preferred.
   Returns array of { startIndex, endIndex, durationHours, matches, preferred, firstPoint }
*/
function mergeConsecutive(timeline, hourPerPoint = 1) {
  if (!timeline.length) return [];
  const out = [];
  let start = 0;
  for (let i = 1; i <= timeline.length; i++) {
    const a = timeline[i - 1];
    const b = timeline[i];
    const same = b && arrayEqual(a.matches, b.matches) && a.preferred === b.preferred;
    if (!same) {
      const duration = (i - start) * hourPerPoint;
      out.push({
        startIndex: start,
        endIndex: i - 1,
        durationHours: duration,
        matches: timeline[start].matches,
        preferred: timeline[start].preferred,
        firstPoint: timeline[start]
      });
      start = i;
    }
  }
  return out;
}

function arrayEqual(a, b) {
  if (a === b) return true;
  if (!a || !b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/* Produce a human-readable multichoice table from summarizeTimeSeries output.
   - summary: result returned by `summarizeTimeSeries`
   - options.totalHours: override total hours for percentage calculation
   Returns a plain string suitable for console or logs.
*/
function formatMultichoiceTable(summary, options = {}) {
  const combos = (summary && summary.combos) || {};
  const total = options.totalHours != null
    ? options.totalHours
    : Object.values(combos).reduce((a, b) => a + b, 0);

  const rows = Object.keys(combos).map(k => ({ key: k, hours: combos[k] }));
  rows.sort((a, b) => b.hours - a.hours);

  const lines = [];
  lines.push('Multichoice summary:');
  lines.push('Options -> Hours (percent)');
  for (const r of rows) {
    const pct = total ? (r.hours / total * 100) : 0;
    const label = r.key === 'Unclassified' ? 'Unclassified' : r.key;
    lines.push(`${label} -> ${r.hours} h (${pct.toFixed(1)}%)`);
  }
  return lines.join('\n');
}

/* Produce a simplified view (preferred zone breakdown) followed by an optional
   multichoice table. The simplified view uses `summary.preferred` (hours per
   preferred zone) and defaults to showing the simplified view only. Pass
   `options.showOptions = true` to append the multichoice table.
   Returns a plain string suitable for console output.
*/
function formatSimplifiedView(summary, options = {}) {
  const pref = (summary && summary.preferred) || {};
  // if preferred is empty, try to compute from summarizeTimeSeries
  let computed = pref;
  if (!Object.keys(pref).length && summary && summary.timeline) {
    // derive preferred counts from timeline
    computed = {};
    for (const t of summary.timeline) computed[t.preferred] = (computed[t.preferred] || 0) + 1;
  }

  const total = options.totalHours != null
    ? options.totalHours
    : Object.values(computed).reduce((a, b) => a + b, 0);

  const rows = Object.keys(computed).map(k => ({ key: k, hours: computed[k] }));
  rows.sort((a, b) => b.hours - a.hours);

  const lines = [];
  lines.push('Simplified preferred-zone summary:');
  lines.push('Preferred -> Hours (percent)');
  for (const r of rows) {
    const pct = total ? (r.hours / total * 100) : 0;
    lines.push(`${r.key} -> ${r.hours} h (${pct.toFixed(1)}%)`);
  }

  if (options.showOptions) {
    lines.push('\n' + formatMultichoiceTable(summary, { totalHours: total }));
  }

  return lines.join('\n');
}

module.exports = {
  ZONES,
  INF_T,
  pointInPoly,
  zonesContainingPoint,
  preferredZoneForPoint,
  summarizeTimeSeries,
  mergeConsecutive
  ,formatMultichoiceTable
  ,formatSimplifiedView
};