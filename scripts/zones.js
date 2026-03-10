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
import { ZONE_COLORS } from './theme.js';

const ZONES = [
  { 
    id: 'Comfort', 
    color: ZONE_COLORS['Comfort'], 
    type: 'passive',
    poly: [ 
      p(22.8,20), 
      p(22.8,80), 
      p(25,80), 
      p(27.8,67), 
      p(29.8,50), 
      p(29.8,20) 
    ],
    description: 'Comfortable temperature/humidity where occupants are generally comfortable without mechanical systems.',
    complexity: 'Low',
    examples: ['Well-insulated home with balanced windows', 'Low thermal variability interior spaces'],
    icon: '🛋️',
    howToApply: { beginner: ['Maintain insulation and active ventilation when needed', 'Use light clothes, adjust indoor shading'], advanced: ['Use thermostat scheduling and passive design audits', 'Tune HVAC controls to exploit thermal shifts'] }
  },
  { 
    id: 'Ventilation', 
    color: ZONE_COLORS['Ventilation'], 
    type: 'passive',
    poly: [ 
      p(22.8, 80),
      p(22.8, 100),
      p(29.8,100),
      p(34.8,50),
      p(34.8,20),
      p(29.8,20),
      p(29.8,50),
      p(27.8,67),
      p(25,80),
    ],
    description: 'Conditions where increased airflow or cross ventilation improves comfort; uses natural ventilation or low-energy fans.',
    complexity: 'Low',
    examples: ['Openable windows on opposite walls', 'Operable vents and ceiling fans'],
    icon: '💨',
    howToApply: { beginner: ['Open windows on opposite sides to create airflow', 'Use ceiling or pedestal fans to increase comfort'], advanced: ['Design cross-ventilation paths in the plan layout', 'Add controllable vents and night purge strategies'] }
  },
  // Additional zones deduced from the psychrometric chart image
  {
    id: 'Humidification',
    color: ZONE_COLORS['Humidification'],
    type: 'mechanical',
    // Approx DBT 0-22 °C, RH 40-100% — area where humidification may be applied
    poly: [ 
      p(0,0), 
      p(0,20), 
      p(5,20),
      p(10,20),
      p(15,20),
      p(20,20),
      p(22.8,20),
      p(31.3, 0),
      p(0,0)
    ],
    note: 'Humidification applicability (approx)',
    description: 'Dry conditions where adding moisture increases occupant comfort; typically requires mechanical humidification.',
    complexity: 'Low',
    examples: ['Portable humidifiers in bedrooms', 'Central humidification for airtight, sealed homes'],
    icon: '💧',
    howToApply: { beginner: ['Use room humidifiers in occupied spaces or bedrooms', 'Monitor humidity with a hygrometer to avoid over-humidifying'], advanced: ['Install central humidification with sensors and controls', 'Integrate with ventilation to balance moisture'] }
  },
  {
    id: 'Heating',
    color: ZONE_COLORS['Heating'],
    type: 'active',
    // Approx DBT 0-10 °C, RH 10-50%
    poly: [ p(0,0), p(0,100), p(6.8,100), p(6.8,0) ],
    note: 'Heating band (approx)',
    description: 'Zones where space heating is required to maintain comfort; typically uses active systems.',
    complexity: 'Low',
    examples: ['Gas or electric furnaces', 'Hydronic radiant heating'],
    icon: '🔥',
    howToApply: { beginner: ['Improve weatherization: seal gaps and insulate', 'Use programmable thermostats and zone thermostats'], advanced: ['Add high-efficiency heat source with zoning and controls', 'Integrate passive solar and thermal mass to reduce runtime'] }
  },
  {
    id: "Active Solar Heating",
    color: ZONE_COLORS['Active Solar Heating'],
    type: 'mechanical',
    poly: [ p(6.8,0), p(6.8,100), p(10.8,100), p(10.8,0) ],
    note: 'Active solar heating band (approx)',
    description: 'Solar systems that actively collect, store, and distribute heat (e.g., solar thermal panels with pumps).',
    complexity: 'Medium',
    examples: ['Solar thermal collectors with a heat store', 'Pumped loop for hydronic distribution'],
    icon: '☀️⚡',
    howToApply: { beginner: ['Install solar thermal collectors and a simple pump loop', 'Provide a domestic hot water preheat or hydronic distribution'], advanced: ['Add a thermal store and smart controls to shift heating loads', 'Combine with heat pumps and backup gas/electric for peak loads'] }
  },
  {
    id: 'Passive Solar Heating',
    color: ZONE_COLORS['Passive Solar Heating'],
    type: 'passive',
    // Approx DBT 8-16 °C, RH 20-60%
    poly: [ p(10.8,0), p(10.8,100), p(22.8,100), p(22.8,0) ],
    note: 'Passive solar heating region (approx)',
    description: 'Design strategies that use building geometry, glazing and thermal mass to collect and store solar heat without mechanical systems.',
    complexity: 'Medium',
    examples: ['South-facing glazing with thermal mass flooring', 'Overhangs sized for seasonal shading'],
    icon: '☀️',
    howToApply: { beginner: ['Maximize south glazing and use appropriate overhangs', 'Expose north-south thermal mass to store daytime heat'], advanced: ['Optimize orientation and thermal mass distribution', 'Use dynamic shading and operable thermal insulation'] }
  },
  {
    id: 'Internal Gains',
    color: ZONE_COLORS['Internal Gains'],
    type: 'passive',
    // Approx DBT 15-22 °C, RH 30-60%
    poly: [ p(15.3,20), p(15.3,80), p(22.8,80), p(22.8,20) ],
    note: 'Internal gains influence (approx)',
    description: 'When heat from occupants, appliances or equipment helps maintain comfortable temperatures; may reduce heating needs.',
    complexity: 'Low',
    examples: ['Compact apartments with many occupants', 'Kitchen or server rooms providing heat gain'],
    icon: '🏢',
    howToApply: { beginner: ['Consolidate heat producing appliances when possible', 'Use efficient appliances to minimize heat spikes'], advanced: ['Manage internal heat through targeted ventilation and zoning', 'Design plans to keep heat-producing rooms co-located'] }
  },
  { 
    id: 'Mass Cooling', 
    color: ZONE_COLORS['Mass Cooling'], 
    type: 'passive',
    poly: [ 
      p(22.8,20), 
      p(29.8,20), 
      p(29.8,50), 
      p(27.8,67), 
      p(35.8,41.76), 
      p(39.8,30), 
      p(39.8,7) 
    ],
    description: 'Use of thermal mass to dampen daytime heat peaks and release heat when temperatures drop to keep interiors cool.',
    complexity: 'Medium',
    examples: ['Heavy concrete floors exposed to night-time ventilation', 'Thick masonry walls with night purge ventilation'],
    icon: '🪨',
    howToApply: { beginner: ['Expose mass (concrete, masonry) to day/night cycles', 'Provide shading during day to avoid overheating'], advanced: ['Design thermal storage integration and night ventilation control', 'Combine with thermal insulation and controlled glazing'] }
  },
  { 
    id: 'Evaporative Cooling', 
    color: ZONE_COLORS['Evaporative Cooling'], 
    type: 'passive',
    poly: [ 
      p(31.3,0), 
      p(22.8,20), 
      p(29.8,20), 
      p(29.8,50), 
      p(27.8,67), 
      p(38.7,30), 
      p(41.7,20), 
      p(43.8,10), 
      p(43.8,0), 
    ],
    description: 'Cooling via water evaporation, effective in dry climates to reduce indoor temperatures substantially.',
    complexity: 'Low',
    examples: ['Swamp coolers on a single storey house', 'Evaporative pads for controlled indirect cooling'],
    icon: '🌬️💦',
    howToApply: { beginner: ['Use a portable or window-mounted evaporative cooler', 'Ensure external air supply and exhaust for direct evaporative coolers'], advanced: ['Design an indirect evaporative matrix with pre-cooling', 'Size the system and integrate with ventilation to prevent humidity issues'] }
  },
  {
    id: 'Mass Cooling & Night Ventilation (or Air Conditioning)',
    color: ZONE_COLORS['Mass Cooling & Night Ventilation (or Air Conditioning)'],
    type: 'hybrid',
    poly: [
      p(39.8, 7.25),
      p(39.8,30),
      p(35.8,41.76),
      p(42.8, 27.89),
      p(46.86, 20),
      p(46.86, 4.86),
    ],
    description: 'Hybrid strategy using building mass plus night ventilation to cool; when insufficient, AC supplements performance.',
    complexity: 'Medium',
    examples: ['High-mass homes with night purge ventilation', 'Night ventilation combined with zoned AC as backup'],
    icon: '🌙🪟',
    howToApply: { beginner: ['Use night purge ventilation and ceiling fans to cool heavy mass', 'Use AC only as backup when comfort limits exceeded'], advanced: ['Automate ventilation controls to exploit nocturnal cooling', 'Combine with thermal storage and intelligent HVAC staging'] }
  },
  {
    id: 'Air Conditioning + Dehumidifier',
    color: ZONE_COLORS['Air Conditioning + Dehumidifier'], 
    type: 'active',
    // Refined: apply when relative humidity is high (>= ~40%) — ventilation alone insufficient
    // Approx DBT 29.5-50 °C combined with RH 40-100%
    poly: [
      p(34.8, 50),
      p(29.8,100),
      p(34.3,100),
      p(50.0,40.56),
      p(50,18.54),
      p(42.8, 27.89),
      p(35.8, 41.76),
      p(34.8, 44.28),
    ],
    note: 'Air conditioning with dehumidifier — refined to RH >= 40% (ventilation insufficient)',
    description: 'Mechanical cooling with simultaneous dehumidification is required to maintain comfortable humidity and temperature.',
    complexity: 'Medium',
    examples: ['Packaged AC with integrated dehumidifier', 'Separate dehumidifier combined with split AC'],
    icon: '❄️+💧',
    howToApply: { beginner: ['Ensure correct AC sizing and run for humidity control', 'Add portable dehumidifier to remove moisture when needed'], advanced: ['Use dedicated dehumidification integrated into HVAC', 'Add smart humidistat controls and ventilation management'] }
  },
  { 
    id: 'Air Conditioning', 
    color: ZONE_COLORS['Air Conditioning'], 
    type: 'active',
    poly: [
      p(43.8, 0),
      p(43.8, 5.76),
      p(46.86, 4.86),
      p(46.86, 20),
      p(42.8, 27.89),
      p(50.0, 18.54),
      p(50.0,  0)
    ],
    description: 'Mechanical cooling used to lower temperatures and/or manage humidity when passive measures are insufficient.',
    complexity: 'Low',
    examples: ['Split-system AC units', 'Ducted central air conditioning'],
    icon: '❄️',
    howToApply: { beginner: ['Install appropriately sized AC units and maintain filter cleanliness', 'Use efficient setpoints and fan control to minimize runtime'], advanced: ['Implement zoned cooling with variable speed compressors', 'Use smart thermostats for schedule and integration with ventilation'] }
  }
];

// --- Median-based zone shifting constants for CLI ---
const BASELINE_MEDIAN_T = 28.0;
const MEDIAN_SLOPE_C_PER_C = 0.3111111111111111;
const MIN_MEDIAN_T = 10.0;
const MAX_MEDIAN_T = 35.0;
const ANCHOR_MEDIAN_T = 19.0;
const COMFORT_ANCHOR_POINT = { t: 25.0, rh: 80 };
const W_CONST_G_PER_KG = 16.0;
const W_THRESHOLD_GPKG = 1.0;

function clampMedian(median) {
  if (median == null || !Number.isFinite(median)) return BASELINE_MEDIAN_T;
  if (median < MIN_MEDIAN_T) return MIN_MEDIAN_T;
  if (median > MAX_MEDIAN_T) return MAX_MEDIAN_T;
  return median;
}

function rhFromWgPerKg(T, W_g_per_kg, p_hPa = 1013.25) {
  if (!Number.isFinite(T) || !Number.isFinite(W_g_per_kg)) return null;
  const W = Number(W_g_per_kg) / 1000.0; // convert g/kg -> kg/kg
  if (W <= 0) return 0;
  const e_hPa = (W * p_hPa) / (0.62198 + W);
  const es = 6.112 * Math.exp((17.62 * T) / (243.12 + T));
  let rh = (e_hPa / es) * 100;
  if (!Number.isFinite(rh)) return null;
  return Math.max(0, Math.min(100, rh));
}

function wgPerKgFromTRH(T, RH, p_hPa = 1013.25) {
  if (!Number.isFinite(T) || !Number.isFinite(RH)) return null;
  const e = actualVaporPressure_hPa(T, RH);
  if (!e || !Number.isFinite(e.hPa)) return null;
  const w = vaporContent_g_per_kg(e.hPa, p_hPa);
  return w; // g/kg
}

function almostEqual(a,b,eps=1e-9) { return Math.abs(a-b) <= eps; }

function createZonesForMedianTemp(medianTemp, opts={}) {
  const median = clampMedian(medianTemp == null ? BASELINE_MEDIAN_T : Number(medianTemp));
  const offset = (median - BASELINE_MEDIAN_T) * MEDIAN_SLOPE_C_PER_C;
  const useZones = (opts.zones || ZONES);
  const denom = (BASELINE_MEDIAN_T - ANCHOR_MEDIAN_T) || 1;
  const alpha = (median - ANCHOR_MEDIAN_T) / denom;

  return useZones.map(z => {
    if (!z || !z.poly) return { ...z };
    const newPoly = z.poly.map(pt => {
      const t_old = Number(pt[0]); const rh_old = Number(pt[1]);
      if (almostEqual(t_old, 27.8) && almostEqual(rh_old, 67)) {
        const t_base = t_old + offset; const rh_base = rh_old;
        const t_anchor = COMFORT_ANCHOR_POINT.t; const rh_anchor = COMFORT_ANCHOR_POINT.rh;
        const t_new = t_anchor + alpha * (t_base - t_anchor);
        const rh_new = rh_anchor + alpha * (rh_base - rh_anchor);
        const finalRh = (median <= ANCHOR_MEDIAN_T) ? Math.max(rh_new, rh_anchor) : rh_new;
        return [Number(t_new), Number(finalRh)];
      }
      const w_baseline = wgPerKgFromTRH(t_old, rh_old);
      if (Number.isFinite(w_baseline) && Math.abs(w_baseline - W_CONST_G_PER_KG) <= W_THRESHOLD_GPKG) {
        const t_new = t_old + offset;
        const rh_new = rhFromWgPerKg(t_new, W_CONST_G_PER_KG);
        return [Number(t_new), Number(rh_new !== null ? rh_new : rh_old)];
      }
      return [t_old + offset, rh_old];
    });
    return { ...z, poly: newPoly };
  });
}

export { createZonesForMedianTemp };

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

/* Helper: compute minimal Euclidean distance from point to polygon edges */
function distancePointToPoly(px, py, poly) {
  if (!Array.isArray(poly) || poly.length === 0) return Infinity;
  
  let minDist = Infinity;
  const n = poly.length;
  
  for (let i = 0; i < n; i++) {
    const x1 = poly[i][0], y1 = poly[i][1];
    const x2 = poly[(i + 1) % n][0], y2 = poly[(i + 1) % n][1];
    
    // Vector from p1 to p2
    const dx = x2 - x1;
    const dy = y2 - y1;
    
    // Handle degenerate segment (point)
    const segLenSq = dx * dx + dy * dy;
    if (segLenSq < 1e-12) {
      const dist = Math.sqrt((px - x1) * (px - x1) + (py - y1) * (py - y1));
      minDist = Math.min(minDist, dist);
      continue;
    }
    
    // Parameter t for closest point on segment [0,1]
    let t = ((px - x1) * dx + (py - y1) * dy) / segLenSq;
    t = Math.max(0, Math.min(1, t)); // clamp to segment
    
    // Closest point on segment
    const closestX = x1 + t * dx;
    const closestY = y1 + t * dy;
    
    // Distance from point to closest point on segment
    const dist = Math.sqrt((px - closestX) * (px - closestX) + (py - closestY) * (py - closestY));
    minDist = Math.min(minDist, dist);
  }
  
  return minDist;
}

/* Helper: find nearest zone for a point when no zones contain it */
function nearestZoneForPoint(temp, rh) {
  const t = Number(temp);
  const h = Number(rh);
  
  let nearestZone = null;
  let minDist = Infinity;
  
  // Energy ranking: passive (lowest) -> mechanical -> hybrid -> active (highest)
  const rank = { passive: 0, mechanical: 1, hybrid: 2, active: 3 };
  
  for (const zone of ZONES) {
    // Skip zones without polygons (like Cold zone)
    if (!zone.poly) continue;
    
    const dist = distancePointToPoly(t, h, zone.poly);
    
    if (dist < minDist - 1e-9) {
      // Clear winner - much closer
      minDist = dist;
      nearestZone = zone;
    } else if (Math.abs(dist - minDist) <= 1e-9) {
      // Distance tie - apply energy ranking tie-breaker
      const currentRank = rank[nearestZone.type] ?? 99;
      const zoneRank = rank[zone.type] ?? 99;
      
      if (zoneRank < currentRank) {
        // New zone has lower energy rank (preferred)
        nearestZone = zone;
      } else if (zoneRank === currentRank) {
        // Same energy rank - use priority then id as final tie-breaker
        const currentPriority = nearestZone.priority ?? 99;
        const zonePriority = zone.priority ?? 99;
        
        if (zonePriority < currentPriority) {
          nearestZone = zone;
        } else if (zonePriority === currentPriority) {
          // Final tie-breaker: alphabetical id
          if (String(zone.id).localeCompare(String(nearestZone.id)) < 0) {
            nearestZone = zone;
          }
        }
      }
    }
  }
  
  return nearestZone;
}

/* Return list of zone objects that contain the given temp/rh point.
   - For `Cold` (poly === null) we treat as T < 23
*/
function zonesContainingPoint(temp, rh) {
  const t = Number(temp);
  const h = Number(rh);
  const found = [];
  let coldZone = null;
  for (const z of ZONES) {
    if (!z.poly) {
      if (z.id === 'Cold') coldZone = z;
      continue;
    }
    if (pointInPoly(t, h, z.poly)) found.push(z);
  }

  // Add 'Cold' only if no other polygon matched and temperature is below threshold
  if (found.length === 0 && coldZone && t < 23) found.push(coldZone);
  return found;
}

/* Choose preferred zone when multiple zones match.
   Uses `priority` (lower is preferred). If tie, prefer passive type then hybrid then active.
   If no zones contain the point, falls back to nearest zone.
*/
function preferredZoneForPoint(temp, rh) {
  const matches = zonesContainingPoint(temp, rh);
  if (matches.length === 0) {
    // Fallback: use nearest zone when no zones contain the point
    return nearestZoneForPoint(temp, rh);
  }
  
  // Prefer the least-energy option when multiple zones match.
  // Energy ranking: passive (lowest) -> mechanical -> hybrid -> active (highest)
  const rank = { passive: 0, mechanical: 1, hybrid: 2, active: 3 };
  matches.sort((a, b) => {
    const ra = rank[a.type] ?? 99;
    const rb = rank[b.type] ?? 99;
    if (ra !== rb) return ra - rb;
    // fall back to explicit numeric priority if present (lower preferred)
    const pa = a.priority ?? 99;
    const pb = b.priority ?? 99;
    if (pa !== pb) return pa - pb;
    // final tie-breaker: alphabetical id
    return String(a.id).localeCompare(String(b.id));
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
    const pref = preferredZoneForPoint(t, h);
    const prefId = pref ? pref.id : 'Unclassified';
    
    // If no zones contain the point, use the preferred/fallback zone for combos
    let key;
    if (matches.length === 0) {
      // Use fallback zone instead of 'Unclassified'
      key = prefId;
    } else {
      key = matches.join(' & ');
    }
    comboCounts.set(key, (comboCounts.get(key) || 0) + hourPerPoint);

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

export {
  ZONES,
  INF_T,
  pointInPoly,
  zonesContainingPoint,
  preferredZoneForPoint,
  summarizeTimeSeries,
  mergeConsecutive,
  formatMultichoiceTable,
  formatSimplifiedView
};

/**
 * Approximate wet-bulb temperature (°C) from dry-bulb T (°C) and RH (%)
 * Uses Stull (2011) approximation — accurate within ~0.5 °C for typical ranges.
 */
function computeWetBulb(T, RH) {
  // T in °C, RH in %
  const t = Number(T);
  const rh = Math.max(0, Math.min(100, Number(RH)));
  // Stull (2011) approximation
  const part1 = t * Math.atan(0.151977 * Math.sqrt(rh + 8.313659));
  const part2 = Math.atan(t + rh);
  const part3 = Math.atan(rh - 1.676331);
  const part4 = 0.00391838 * Math.pow(rh, 1.5) * Math.atan(0.023101 * rh);
  const tw = part1 + part2 - part3 + part4 - 4.686035;
  return tw;
}

/**
 * Convert saturation vapor pressure (hPa) using Magnus formula and get actual e (hPa)
 * from T (°C) and RH (%). Returns e in hPa and mmHg.
 */
function actualVaporPressure_hPa(T, RH) {
  const t = Number(T);
  const rh = Math.max(0, Math.min(100, Number(RH)));
  // Magnus-Tetens approximation
  const es = 6.112 * Math.exp((17.62 * t) / (243.12 + t)); // hPa
  const e = es * (rh / 100);
  return { hPa: e, mmHg: e * 0.750062 }; // 1 hPa = 0.750062 mmHg
}

/**
 * Approximate mixing ratio (g/kg) from vapor pressure (hPa) and ambient pressure
 * Uses standard sea-level pressure 1013.25 hPa unless overridden.
 */
function vaporContent_g_per_kg(e_hPa, p_hPa = 1013.25) {
  // mixing ratio w = 0.62198 * e / (p - e) in kg/kg -> convert to g/kg
  const e = Number(e_hPa);
  const p = Number(p_hPa);
  if (p <= e) return 0;
  const w = 0.62198 * e / (p - e); // kg/kg
  return w * 1000; // g/kg
}

/**
 * Classify climate strategies for a single climate point (DBT, RH or WBT),
 * following the BBCC rules summarized in the documentation.
 *
 * Input: object with keys: dbt (°C), rh (%) optional, wbt (°C) optional,
 *        vp_mmHg optional, diurnalRange optional, options: {developing:boolean, highMass:boolean}
 * Output: object listing applicability booleans and recommended prioritized list
 */
function classifyClimate(input = {}) {
  const { dbt, rh, wbt, vp_mmHg, diurnalRange } = input;
  const opts = input.options || {};
  const developing = !!opts.developing;
  const highMass = !!opts.highMass;

  const T = Number(dbt);
  const RH = (typeof rh === 'number') ? rh : (input.rh === undefined ? null : Number(input.rh));

  // compute wet-bulb if not provided
  const W = (typeof wbt === 'number') ? wbt : (RH != null ? computeWetBulb(T, RH) : null);

  // compute vapor pressure and vapor content if possible
  let e_hPa = null, vp_mm = null, vap_gkg = null;
  if (RH != null) {
    const e = actualVaporPressure_hPa(T, RH);
    e_hPa = e.hPa;
    vp_mm = e.mmHg;
    vap_gkg = vaporContent_g_per_kg(e_hPa);
  } else if (vp_mmHg != null) {
    vp_mm = Number(vp_mmHg);
    e_hPa = vp_mm / 0.750062;
    vap_gkg = vaporContent_g_per_kg(e_hPa);
  }

  // diurnal range fallback: estimate from vp_mm if provided via T_range = 26 - 0.83*vp
  let range = (typeof diurnalRange === 'number') ? diurnalRange : null;
  if (range == null && vp_mm != null) range = 26 - 0.83 * vp_mm;

  // thresholds (from the literature summary)
  const comfortUpper = developing ? 29 : 27; // °C with still air
  const comfortLower = 20; // °C (summer comfort lower bound)
  const comfortVaporLimit = developing ? 12 : 10; // g/kg for upper temp applicability
  const absoluteVaporLimit = 15; // g/kg absolute upper

  const ventilSpeedLimit = developing ? 32 : 30; // °C with ~2 m/s airspeed

  // Evaporative limits
  const directEvap_wbt_limit = developing ? 24 : 22; // WBT
  const directEvap_db_limit = developing ? 44 : 42; // DBT
  const indirectEvap_wbt_limit = 24; // roof pond extension
  const indirectEvap_db_limit = 44;

  // nocturnal cooling applicability
  const nocturnal_db_limit = 36; // above this night ventilation alone insufficient

  const result = {
    T, RH, W, vp_mm, vap_gkg, diurnalRange: range,
    comfortStillAir: false,
    comfortVentilation: false,
    nocturnalConvectiveCooling: false,
    directEvaporative: false,
    indirectEvaporative: false,
    airConditioningSuggested: false,
    recommended: [],
    reasons: []
  };

  // comfort still-air
  if (T >= comfortLower && T <= comfortUpper) {
    if (vap_gkg == null || vap_gkg <= absoluteVaporLimit) {
      result.comfortStillAir = true;
      result.reasons.push('T within still-air comfort bounds');
    }
  }

  // comfort ventilation (raise airspeed to ~2 m/s)
  if (T <= ventilSpeedLimit) {
    result.comfortVentilation = true;
    result.reasons.push('T within ventilation-extended comfort bounds');
  }

  // direct evaporative cooling
  if (W != null) {
    if (W <= directEvap_wbt_limit && T <= directEvap_db_limit) {
      result.directEvaporative = true;
      result.reasons.push('WBT/DBT within direct evaporative limits');
    }
  }

  // indirect evaporative (roof pond) — looser on humidity
  if (W != null) {
    if (W <= indirectEvap_wbt_limit && T <= indirectEvap_db_limit) {
      result.indirectEvaporative = true;
      result.reasons.push('WBT/DBT within indirect evaporative (roof pond) limits');
    }
  }

  // nocturnal convective cooling: needs highMass true and adequate diurnal range and DBT limit
  if (highMass && range != null && T <= nocturnal_db_limit && range >= 8) {
    // require reasonable diurnal range (>= ~8 K)
    result.nocturnalConvectiveCooling = true;
    result.reasons.push('High-mass building with sufficient diurnal range; nocturnal cooling applicable');
  }

  // suggest air conditioning if none of the passive strategies apply and/or DBT very high
  if (!result.directEvaporative && !result.indirectEvaporative && !result.nocturnalConvectiveCooling && !result.comfortVentilation && !result.comfortStillAir) {
    // in very hot/humid conditions AC likely required
    result.airConditioningSuggested = true;
    result.reasons.push('No suitable passive strategy applies — consider air conditioning');
  }

  // Build prioritized recommendation list (energy-sensitivity: passive -> hybrid -> active)
  if (result.comfortStillAir) result.recommended.push('Comfort (still air)');
  if (result.comfortVentilation) result.recommended.push('Comfort ventilation / fans');
  if (result.nocturnalConvectiveCooling) result.recommended.push('Nocturnal convective cooling (high-mass)');
  if (result.indirectEvaporative) result.recommended.push('Indirect evaporative (roof pond)');
  if (result.directEvaporative) result.recommended.push('Direct evaporative cooling');
  if (result.airConditioningSuggested) result.recommended.push('Air conditioning (with/without dehumidification)');

  return result;
}

// export helper
export { computeWetBulb, actualVaporPressure_hPa, vaporContent_g_per_kg, classifyClimate };