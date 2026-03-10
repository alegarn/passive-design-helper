// Refactor derived from logic.js
const INF_T = 1e6;
// Median-based zone shifting constants
const BASELINE_MEDIAN_T = 28.0; // baseline median for which the polygon coordinates were authored
const MEDIAN_SLOPE_C_PER_C = 0.3111111111111111; // degrees C shift per 1C median change (approx 0.3111)
const MIN_MEDIAN_T = -40.0; // soft-clamp below
const MAX_MEDIAN_T = 40.0; // soft-clamp above
function p(t, rh) {
  if (typeof t === 'string' && t.trim().endsWith('+')) {
    return [INF_T, Number(rh)];
  }
  return [Number(t), Number(rh)];
}
import { ZONE_COLORS } from './theme.js';

const ZONES = [
  { id: 'Comfort', color: ZONE_COLORS['Comfort'], type: 'passive', poly: [ p(22.8,20), p(22.8,80), p(25,80), p(27.8,67), p(29.8,50), p(29.8,20) ], description: 'Comfortable temperature/humidity where occupants are generally comfortable without mechanical systems.', complexity: 'Low', examples: ['Nothing to do in that condition', 'Mostly found in well-insulated home with balanced windows', 'Found in low thermal variability interior spaces'], icon: '🛋️', howToApply: { beginner: ['Maintain insulation and active ventilation when needed', 'Use light clothes, adjust indoor shading'], advanced: ['Use thermostat scheduling and passive design audits', 'Tune HVAC controls to exploit thermal shifts'] } },
  { id: 'Ventilation', color: ZONE_COLORS['Ventilation'], type: 'passive', poly: [ p(22.8, 80), p(22.8, 100), p(29.8,100), p(34.8,50), p(34.8,20), p(29.8,20), p(29.8,50), p(27.8,67), p(25,80), ], description: 'Conditions where increased airflow or cross ventilation improves comfort; uses natural ventilation or low-energy fans.', complexity: 'Low', examples: ['Openable windows on opposite walls', 'Operable vents and ceiling fans'], icon: '💨', howToApply: { beginner: ['Open windows on opposite sides to create airflow', 'Use ceiling or pedestal fans to increase comfort'], advanced: ['Design cross-ventilation paths in the plan layout', 'Add controllable vents and night purge strategies'] } },
  { id: 'Humidification', color: ZONE_COLORS['Humidification'], type: 'mechanical', poly: [ p(0,0), p(0,20), p(5,20), p(10,20), p(15,20), p(20,20), p(22.8,20), p(31.3, 0), p(0,0) ], note: 'Humidification applicability (approx)', description: 'Dry conditions where adding moisture increases occupant comfort; typically requires mechanical humidification.', complexity: 'Low', examples: ['Portable humidifiers in bedrooms', 'Central humidification for airtight, sealed homes'], icon: '💧', howToApply: { beginner: ['Use room humidifiers in occupied spaces or bedrooms', 'Monitor humidity with a hygrometer to avoid over-humidifying'], advanced: ['Install central humidification with sensors and controls', 'Integrate with ventilation to balance moisture'] } },
  { id: 'Heating', color: ZONE_COLORS['Heating'], type: 'active', poly: [ p(0,0), p(0,100), p(6.8,100), p(6.8,0) ], note: 'Heating band (approx)', description: 'Zones where space heating is required to maintain comfort; typically uses active systems.', complexity: 'Low', examples: ['Gas or electric furnaces', 'Hydronic radiant heating'], icon: '🔥', howToApply: { beginner: ['Improve weatherization: seal gaps and insulate', 'Use programmable thermostats and zone thermostats'], advanced: ['Add high-efficiency heat source with zoning and controls', 'Integrate passive solar and thermal mass to reduce runtime'] } },
  { id: 'Active Solar Heating', color: ZONE_COLORS['Active Solar Heating'], type: 'mechanical', poly: [ p(6.8,0), p(6.8,100), p(10.8,100), p(10.8,0) ], note: 'Active solar heating band (approx)', description: 'Solar systems that actively collect, store, and distribute heat (e.g., solar thermal panels with pumps).', complexity: 'Medium', examples: ['Solar thermal collectors with a heat store', 'Pumped loop for hydronic distribution'], icon: '☀️⚡', howToApply: { beginner: ['Install solar thermal collectors and a simple pump loop', 'Provide a domestic hot water preheat or hydronic distribution'], advanced: ['Add a thermal store and smart controls to shift heating loads', 'Combine with heat pumps and backup gas/electric for peak loads'] } },
  { id: 'Passive Solar Heating', color: ZONE_COLORS['Passive Solar Heating'], type: 'passive', poly: [ p(10.8,0), p(10.8,100), p(22.8,100), p(22.8,0) ], note: 'Passive solar heating region (approx)', description: 'Design strategies that use building geometry, glazing and thermal mass to collect and store solar heat without mechanical systems.', complexity: 'Medium', examples: ['South-facing glazing with thermal mass flooring', 'Overhangs sized for seasonal shading'], icon: '☀️', howToApply: { beginner: ['Maximize south glazing and use appropriate overhangs', 'Expose north-south thermal mass to store daytime heat'], advanced: ['Optimize orientation and thermal mass distribution', 'Use dynamic shading and operable thermal insulation'] } },
  { id: 'Internal Gains', color: ZONE_COLORS['Internal Gains'], type: 'passive', poly: [ p(15.3,20), p(15.3,80), p(22.8,80), p(22.8,20) ], note: 'Internal gains influence (approx)', description: 'When heat from occupants, appliances or equipment helps maintain comfortable temperatures; may reduce heating needs.', complexity: 'Low', examples: ['Compact apartments with many occupants', 'Kitchen or server rooms providing heat gain'], icon: '🏢', howToApply: { beginner: ['Consolidate heat producing appliances when possible', 'Use efficient appliances to minimize heat spikes'], advanced: ['Manage internal heat through targeted ventilation and zoning', 'Design plans to keep heat-producing rooms co-located'] } },
  { id: 'Mass Cooling', color: ZONE_COLORS['Mass Cooling'], type: 'passive', poly: [ p(22.8,20), p(29.8,20), p(29.8,50), p(27.8,67), p(35.8,41.76), p(39.8,30), p(39.8,7) ], description: 'Use of thermal mass to dampen daytime heat peaks and release heat when temperatures drop to keep interiors cool.', complexity: 'Medium', examples: ['Heavy concrete floors exposed to night-time ventilation', 'Thick masonry walls with night purge ventilation'], icon: '🪨', howToApply: { beginner: ['Expose mass (concrete, masonry) to day/night cycles', 'Provide shading during day to avoid overheating'], advanced: ['Design thermal storage integration and night ventilation control', 'Combine with thermal insulation and controlled glazing'] } },
  { id: 'Evaporative Cooling', color: ZONE_COLORS['Evaporative Cooling'], type: 'passive', poly: [ p(31.3,0), p(22.8,20), p(29.8,20), p(29.8,50), p(27.8,67), p(38.7,30), p(41.7,20), p(43.8,10), p(43.8,0), ], description: 'Cooling via water evaporation, effective in dry climates to reduce indoor temperatures substantially.', complexity: 'Low', examples: ['Swamp coolers on a single storey house', 'Evaporative pads for controlled indirect cooling'], icon: '🌬️💦', howToApply: { beginner: ['Use a portable or window-mounted evaporative cooler', 'Ensure external air supply and exhaust for direct evaporative coolers'], advanced: ['Design an indirect evaporative matrix with pre-cooling', 'Size the system and integrate with ventilation to prevent humidity issues'] } },
  { id: 'Mass Cooling & Night Ventilation (or AC)', color: ZONE_COLORS['Mass Cooling & Night Ventilation (or AC)'], type: 'hybrid', poly: [ p(39.8, 7.25), p(39.8,30), p(35.8,41.76), p(42.8, 27.89), p(46.86, 20), p(46.86, 4.86), ], description: 'Hybrid strategy using building mass plus night ventilation to cool; when insufficient, AC supplements performance.', complexity: 'Medium', examples: ['High-mass homes with night purge ventilation', 'Night ventilation combined with zoned AC as backup'], icon: '🌙🪟', howToApply: { beginner: ['Use night purge ventilation and ceiling fans to cool heavy mass', 'Use AC only as backup when comfort limits exceeded'], advanced: ['Automate ventilation controls to exploit nocturnal cooling', 'Combine with thermal storage and intelligent HVAC staging'] } },
  { id: 'Air Conditioning + Dehumidifier', color: ZONE_COLORS['Air Conditioning + Dehumidifier'], type: 'active', poly: [ p(34.8, 50), p(29.8,100), p(34.3,100), p(50.0,40.56), p(50,18.54), p(42.8, 27.89), p(35.8, 41.76), p(34.8, 44.28), ], note: 'Air conditioning with dehumidifier — refined to RH >= 40% (ventilation insufficient)', description: 'Mechanical cooling with simultaneous dehumidification is required to maintain comfortable humidity and temperature.', complexity: 'Medium', examples: ['Packaged AC with integrated dehumidifier', 'Separate dehumidifier combined with split AC'], icon: '❄️+💧', howToApply: { beginner: ['Ensure correct AC sizing and run for humidity control', 'Add portable dehumidifier to remove moisture when needed'], advanced: ['Use dedicated dehumidification integrated into HVAC', 'Add smart humidistat controls and ventilation management'] } },
  { id: 'Air Conditioning', color: ZONE_COLORS['Air Conditioning'], type: 'active', poly: [ p(43.8, 0), p(43.8, 5.76), p(46.86, 4.86), p(46.86, 20), p(42.8, 27.89), p(50.0, 18.54), p(50.0,  0) ], description: 'Mechanical cooling used to lower temperatures and/or manage humidity when passive measures are insufficient.', complexity: 'Low', examples: ['Split-system AC units', 'Ducted central air conditioning'], icon: '❄️', howToApply: { beginner: ['Install appropriately sized AC units and maintain filter cleanliness', 'Use efficient setpoints and fan control to minimize runtime'], advanced: ['Implement zoned cooling with variable speed compressors', 'Use smart thermostats for schedule and integration with ventilation'] } }
];

function isPointOnSegment(px, py, x1, y1, x2, y2) {
  if ((px < Math.min(x1, x2) - 1e-9) || (px > Math.max(x1, x2) + 1e-9) || (py < Math.min(y1, y2) - 1e-9) || (py > Math.max(y1, y2) + 1e-9)) return false;
  const cross = (py - y1) * (x2 - x1) - (px - x1) * (y2 - y1);
  return Math.abs(cross) < 1e-9;
}

function pointInPoly(px, py, poly) {
  if (!Array.isArray(poly) || poly.length === 0) return false;
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], yi = poly[i][1];
    const xj = poly[j][0], yj = poly[j][1];
    if (isPointOnSegment(px, py, xi, yi, xj, yj)) return true;
    const intersect = ((yi > py) !== (yj > py)) && (px < (xj - xi) * (py - yi) / ((yj - yi) || 1e-12) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

function distancePointToPoly(px, py, poly) {
  if (!Array.isArray(poly) || poly.length === 0) return Infinity;
  let minDist = Infinity;
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    const x1 = poly[i][0], y1 = poly[i][1];
    const x2 = poly[(i + 1) % n][0], y2 = poly[(i + 1) % n][1];
    const dx = x2 - x1, dy = y2 - y1;
    const segLenSq = dx * dx + dy * dy;
    if (segLenSq < 1e-12) {
      const dist = Math.sqrt((px - x1) * (px - x1) + (py - y1) * (py - y1));
      minDist = Math.min(minDist, dist);
      continue;
    }
    let t = ((px - x1) * dx + (py - y1) * dy) / segLenSq;
    t = Math.max(0, Math.min(1, t));
    const closestX = x1 + t * dx, closestY = y1 + t * dy;
    const dist = Math.sqrt((px - closestX) * (px - closestX) + (py - closestY) * (py - closestY));
    minDist = Math.min(minDist, dist);
  }
  return minDist;
}

function nearestZoneForPoint(temp, rh, zones = ZONES) {
  const t = Number(temp), h = Number(rh);
  let nearestZone = null, minDist = Infinity;
  const rank = { passive: 0, mechanical: 1, hybrid: 2, active: 3 };
  for (const zone of zones) {
    if (!zone.poly) continue;
    const dist = distancePointToPoly(t, h, zone.poly);
    if (dist < minDist - 1e-9) { minDist = dist; nearestZone = zone; }
    else if (Math.abs(dist - minDist) <= 1e-9) {
      const currentRank = rank[nearestZone.type] ?? 99;
      const zoneRank = rank[zone.type] ?? 99;
      if (zoneRank < currentRank) nearestZone = zone;
      else if (zoneRank === currentRank) {
        const currentPriority = nearestZone.priority ?? 99;
        const zonePriority = zone.priority ?? 99;
        if (zonePriority < currentPriority) nearestZone = zone;
        else if (zonePriority === currentPriority) if (String(zone.id).localeCompare(String(nearestZone.id)) < 0) nearestZone = zone;
      }
    }
  }
  return nearestZone;
}

function zonesContainingPoint(temp, rh, zones = ZONES) {
  const t = Number(temp), h = Number(rh);
  const found = []; let coldZone = null;
  for (const z of zones) {
    if (!z.poly) { if (z.id === 'Cold') coldZone = z; continue; }
    if (pointInPoly(t, h, z.poly)) found.push(z);
  }
  if (found.length === 0 && coldZone && t < 23) found.push(coldZone);
  return found;
}

function preferredZoneForPoint(temp, rh, zones = ZONES) {
  const matches = zonesContainingPoint(temp, rh, zones);
  if (matches.length === 0) return nearestZoneForPoint(temp, rh, zones);
  const rank = { passive: 0, mechanical: 1, hybrid: 2, active: 3 };
  matches.sort((a, b) => {
    const ra = rank[a.type] ?? 99, rb = rank[b.type] ?? 99;
    if (ra !== rb) return ra - rb; const pa = a.priority ?? 99, pb = b.priority ?? 99; if (pa !== pb) return pa - pb; return String(a.id).localeCompare(String(b.id));
  });
  return matches[0];
}

function summarizeTimeSeries(points, hourPerPoint = 1, zones = ZONES) {
  const comboCounts = new Map(); const preferredCounts = new Map(); const timeline = [];
  for (const entry of points) {
    let t, h; if (Array.isArray(entry)) { t = entry[0]; h = entry[1]; } else { t = entry.t ?? entry.temp; h = entry.rh ?? entry.humidity; }
    const matches = zonesContainingPoint(t, h, zones).map(z => z.id).sort();
    const pref = preferredZoneForPoint(t, h, zones); const prefId = pref ? pref.id : 'Unclassified';
    let key; if (matches.length === 0) key = prefId; else key = matches.join(' & ');
    comboCounts.set(key, (comboCounts.get(key) || 0) + hourPerPoint);
    preferredCounts.set(prefId, (preferredCounts.get(prefId) || 0) + hourPerPoint);
    timeline.push({ t: Number(t), rh: Number(h), matches, preferred: prefId });
  }
  const merged = mergeConsecutive(timeline, hourPerPoint);
  const combos = {}; for (const [k, v] of comboCounts.entries()) combos[k] = v; const preferred = {}; for (const [k, v] of preferredCounts.entries()) preferred[k] = v;
  return { combos, preferred, timeline, merged };
}

function mergeConsecutive(timeline, hourPerPoint = 1) {
  if (!timeline.length) return [];
  const out = []; let start = 0;
  for (let i = 1; i <= timeline.length; i++) {
    const a = timeline[i - 1]; const b = timeline[i]; const same = b && arrayEqual(a.matches, b.matches) && a.preferred === b.preferred;
    if (!same) { const duration = (i - start) * hourPerPoint; out.push({ startIndex: start, endIndex: i - 1, durationHours: duration, matches: timeline[start].matches, preferred: timeline[start].preferred, firstPoint: timeline[start] }); start = i; }
  }
  return out;
}

function arrayEqual(a, b) { if (a === b) return true; if (!a || !b || a.length !== b.length) return false; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false; return true; }

function formatMultichoiceTable(summary, options = {}) { const combos = (summary && summary.combos) || {}; const total = options.totalHours != null ? options.totalHours : Object.values(combos).reduce((a, b) => a + b, 0); const rows = Object.keys(combos).map(k => ({ key: k, hours: combos[k] })); rows.sort((a, b) => b.hours - a.hours); const lines = []; lines.push('Multichoice summary:'); lines.push('Options -> Hours (percent)'); for (const r of rows) { const pct = total ? (r.hours / total * 100) : 0; const label = r.key === 'Unclassified' ? 'Unclassified' : r.key; lines.push(`${label} -> ${r.hours} h (${pct.toFixed(1)}%)`); } return lines.join('\n'); }

function formatSimplifiedView(summary, options = {}) { const pref = (summary && summary.preferred) || {}; let computed = pref; if (!Object.keys(pref).length && summary && summary.timeline) { computed = {}; for (const t of summary.timeline) computed[t.preferred] = (computed[t.preferred] || 0) + 1; } const total = options.totalHours != null ? options.totalHours : Object.values(computed).reduce((a, b) => a + b, 0); const rows = Object.keys(computed).map(k => ({ key: k, hours: computed[k] })); rows.sort((a, b) => b.hours - a.hours); const lines = []; lines.push('Simplified preferred-zone summary:'); lines.push('Preferred -> Hours (percent)'); for (const r of rows) { const pct = total ? (r.hours / total * 100) : 0; lines.push(`${r.key} -> ${r.hours} h (${pct.toFixed(1)}%)`); } if (options.showOptions) { lines.push('\n' + formatMultichoiceTable(summary, { totalHours: total })); } return lines.join('\n'); }

export { ZONES, INF_T, pointInPoly, zonesContainingPoint, preferredZoneForPoint, summarizeTimeSeries, mergeConsecutive, formatMultichoiceTable, formatSimplifiedView };

function computeWetBulb(T, RH) {
  const t = Number(T);
  const rh = Math.max(0, Math.min(100, Number(RH)));
  const part1 = t * Math.atan(0.151977 * Math.sqrt(rh + 8.313659));
  const part2 = Math.atan(t + rh);
  const part3 = Math.atan(rh - 1.676331);
  const part4 = 0.00391838 * Math.pow(rh, 1.5) * Math.atan(0.023101 * rh);
  const tw = part1 + part2 - part3 + part4 - 4.686035;
  return tw;
}

function actualVaporPressure_hPa(T, RH) {
  const t = Number(T); const rh = Math.max(0, Math.min(100, Number(RH)));
  const es = 6.112 * Math.exp((17.62 * t) / (243.12 + t));
  const e = es * (rh / 100);
  return { hPa: e, mmHg: e * 0.750062 };
}

function vaporContent_g_per_kg(e_hPa, p_hPa = 1013.25) {
  const e = Number(e_hPa); const p = Number(p_hPa);
  if (p <= e) return 0; const w = 0.62198 * e / (p - e); return w * 1000;
}

function classifyClimate(input = {}) {
  const { dbt, rh, wbt, vp_mmHg, diurnalRange } = input; const opts = input.options || {}; const developing = !!opts.developing; const highMass = !!opts.highMass; const T = Number(dbt); const RH = (typeof rh === 'number') ? rh : (input.rh === undefined ? null : Number(input.rh)); const W = (typeof wbt === 'number') ? wbt : (RH != null ? computeWetBulb(T, RH) : null);
  let e_hPa = null, vp_mm = null, vap_gkg = null;
  if (RH != null) { const e = actualVaporPressure_hPa(T, RH); e_hPa = e.hPa; vp_mm = e.mmHg; vap_gkg = vaporContent_g_per_kg(e_hPa); } else if (vp_mmHg != null) { vp_mm = Number(vp_mmHg); e_hPa = vp_mm / 0.750062; vap_gkg = vaporContent_g_per_kg(e_hPa); }
  let range = (typeof diurnalRange === 'number') ? diurnalRange : null; if (range == null && vp_mm != null) range = 26 - 0.83 * vp_mm;
  const comfortUpper = developing ? 29 : 27; const comfortLower = 20; const comfortVaporLimit = developing ? 12 : 10; const absoluteVaporLimit = 15; const ventilSpeedLimit = developing ? 32 : 30; const directEvap_wbt_limit = developing ? 24 : 22; const directEvap_db_limit = developing ? 44 : 42; const indirectEvap_wbt_limit = 24; const indirectEvap_db_limit = 44; const nocturnal_db_limit = 36;
  const result = { T, RH, W, vp_mm, vap_gkg, diurnalRange: range, comfortStillAir: false, comfortVentilation: false, nocturnalConvectiveCooling: false, directEvaporative: false, indirectEvaporative: false, airConditioningSuggested: false, recommended: [], reasons: [] };
  if (T >= comfortLower && T <= comfortUpper) { if (vap_gkg == null || vap_gkg <= absoluteVaporLimit) { result.comfortStillAir = true; result.reasons.push('T within still-air comfort bounds'); } }
  if (T <= ventilSpeedLimit) { result.comfortVentilation = true; result.reasons.push('T within ventilation-extended comfort bounds'); }
  if (W != null) { if (W <= directEvap_wbt_limit && T <= directEvap_db_limit) { result.directEvaporative = true; result.reasons.push('WBT/DBT within direct evaporative limits'); } }
  if (W != null) { if (W <= indirectEvap_wbt_limit && T <= indirectEvap_db_limit) { result.indirectEvaporative = true; result.reasons.push('WBT/DBT within indirect evaporative (roof pond) limits'); } }
  if (highMass && range != null && T <= nocturnal_db_limit && range >= 8) { result.nocturnalConvectiveCooling = true; result.reasons.push('High-mass building with sufficient diurnal range; nocturnal cooling applicable'); }
  if (!result.directEvaporative && !result.indirectEvaporative && !result.nocturnalConvectiveCooling && !result.comfortVentilation && !result.comfortStillAir) { result.airConditioningSuggested = true; result.reasons.push('No suitable passive strategy applies — consider air conditioning'); }
  if (result.comfortStillAir) result.recommended.push('Comfort (still air)'); if (result.comfortVentilation) result.recommended.push('Comfort ventilation / fans'); if (result.nocturnalConvectiveCooling) result.recommended.push('Nocturnal convective cooling (high-mass)'); if (result.indirectEvaporative) result.recommended.push('Indirect evaporative (roof pond)'); if (result.directEvaporative) result.recommended.push('Direct evaporative cooling'); if (result.airConditioningSuggested) result.recommended.push('Air conditioning (with/without dehumidification)');
  return result;
}

export { computeWetBulb, actualVaporPressure_hPa, vaporContent_g_per_kg, classifyClimate };

// --- New helpers and median-based zone factory ---

function clampMedian(median) {
  if (median == null || !Number.isFinite(median)) return BASELINE_MEDIAN_T;
  if (median < MIN_MEDIAN_T) {
    console.warn(`createZonesForMedianTemp: median ${median}°C below MIN_MEDIAN_T (${MIN_MEDIAN_T}°C); clamping`);
    return MIN_MEDIAN_T;
  }
  if (median > MAX_MEDIAN_T) {
    console.warn(`createZonesForMedianTemp: median ${median}°C above MAX_MEDIAN_T (${MAX_MEDIAN_T}°C); clamping`);
    return MAX_MEDIAN_T;
  }
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

// Anchor interpolation for comfort-related points
const ANCHOR_MEDIAN_T = 19.0;
const COMFORT_ANCHOR_POINT = { t: 25.0, rh: 80 };

function almostEqual(a,b,eps=1e-9) { return Math.abs(a-b) <= eps; }

function createZonesForMedianTemp(medianTemp, opts={}) {
  const median = clampMedian(medianTemp == null ? BASELINE_MEDIAN_T : Number(medianTemp));
  const offset = (median - BASELINE_MEDIAN_T) * MEDIAN_SLOPE_C_PER_C; // positive if median>BASELINE
  const useZones = (opts.zones || ZONES);
  // compute anchor alpha: 0 when median == ANCHOR_MEDIAN_T, 1 when median==BASELINE_MEDIAN_T
  const denom = (BASELINE_MEDIAN_T - ANCHOR_MEDIAN_T) || 1;
  const alpha = Math.max(0, Math.min(1, (median - ANCHOR_MEDIAN_T) / denom));
  // Detect W-constant points based on baseline W ~= 16 g/kg
  const W_CONST_G_PER_KG = 16.0; // The intended horizontal limit
  const W_THRESHOLD_GPKG = 2.0; // +/- 2.0 g/kg threshold catches the 14.37 to 15.5 baseline points

  const outZones = useZones.map(z => {
    if (!z || !z.poly) return { ...z };
    const newPoly = z.poly.map(pt => {
      const t_old = Number(pt[0]); const rh_old = Number(pt[1]);
      // First, check if this point corresponds to the comfort anchor (near 27.8,67)
      if (almostEqual(t_old, 27.8) && almostEqual(rh_old, 67)) {
        // Interpolate in T/RH between baseline and anchor
        const t_base = t_old + offset; // baseline point shifted by offset alone
        const rh_base = rh_old;
        const t_anchor = COMFORT_ANCHOR_POINT.t;
        const rh_anchor = COMFORT_ANCHOR_POINT.rh;
        // linear interpolation by alpha
        const t_new = t_anchor + alpha * (t_base - t_anchor);
        const rh_new = rh_anchor + alpha * (rh_base - rh_anchor);
        // if median <= anchor, enforce at least anchor RH
        const finalRh = (median <= ANCHOR_MEDIAN_T) ? Math.max(rh_new, rh_anchor) : rh_new;
        return [Number(t_new), Number(finalRh)];
      }
      // Else: check if this point is W-constant (around 16 g/kg)
      const w_baseline = wgPerKgFromTRH(t_old, rh_old);
      if (Number.isFinite(w_baseline) && Math.abs(w_baseline - W_CONST_G_PER_KG) <= W_THRESHOLD_GPKG) {
        // Keep W constant at W_CONST_G_PER_KG while shifting T accordingly
        const t_new = t_old + offset;
        const rh_new = rhFromWgPerKg(t_new, W_CONST_G_PER_KG);
        return [Number(t_new), Number(rh_new !== null ? rh_new : rh_old)];
      }
      // Default: shift T by offset only, keep RH unchanged
      return [t_old + offset, rh_old];
    });
    return { ...z, poly: newPoly };
  });
  return outZones;
}

export { createZonesForMedianTemp, rhFromWgPerKg };
