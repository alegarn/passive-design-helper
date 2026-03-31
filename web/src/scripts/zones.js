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

// zones points for 28°C median (BASELINE_MEDIAN_T=28), in °C + % RH.
// Comfort P1 anchor at baseline: T1=22.8, RH1=20%.
// All shifting zones are rebuilt anchor-relative in createZonesForMedianTemp.
const ZONES = [
  // Comfort zone (at 28°C median baseline):
  // T1: 22.8°C / 20% RH  (anchor)
  // T2: 22.8°C / 80% RH  (same T°, upper humidity ~11.7 g/kg)
  // T3: 27.8°C / 67% RH  (T1+5°C / min(80%, 16g/kg) — at 19°C median T3=25°C/80%≈16g/kg)
  // P5: 29.8°C / 50% RH  (T1 + 7°C)
  // P6: 29.8°C / 20% RH  (T1 + 7°C)
  { id: 'Comfort', color: ZONE_COLORS['Comfort'], type: 'passive', poly: [ p(22.8,20), p(22.8,80), p(27.8,67), p(29.8,50), p(29.8,20) ], description: 'Comfortable temperature/humidity where occupants are generally comfortable without mechanical systems.', complexity: 'Low', examples: ['Nothing to do in that condition', 'Mostly found in well-insulated home with balanced windows', 'Found in low thermal variability interior spaces'], icon: '🛋️', howToApply: { beginner: ['Maintain insulation and active ventilation when needed', 'Use light clothes, adjust indoor shading'], advanced: ['Use thermostat scheduling and passive design audits', 'Tune HVAC controls to exploit thermal shifts'] } },
  // Ventilation zone (at 28°C median baseline):
  // Shares Comfort T2/T3/P5/P6 as lower-left boundary (no intermediate P3 vertex).
  // Upper boundary: follows 100% RH from T1+0°C up to T1+7°C (saturation curve),
  //   then drops along 50% line to T1+12°C, then follows 20% line back.
  // NOTE: top points (100% RH) are capped by W=16g/kg in createZonesForMedianTemp.
  { id: 'Ventilation', color: ZONE_COLORS['Ventilation'], type: 'passive', poly: [ p(22.8, 80), p(22.8, 100), p(29.8,100), p(34.8,50), p(34.8,20), p(29.8,20), p(29.8,50), p(27.8,67), ], description: 'Conditions where increased airflow or cross ventilation improves comfort; uses natural ventilation or low-energy fans.', complexity: 'Low', examples: ['Openable windows on opposite walls', 'Operable vents and ceiling fans'], icon: '💨', howToApply: { beginner: ['Open windows on opposite sides to create airflow', 'Use ceiling or pedestal fans to increase comfort'], advanced: ['Design cross-ventilation paths in the plan layout', 'Add controllable vents and night purge strategies'] } },
  { id: 'Humidification', color: ZONE_COLORS['Humidification'], type: 'mechanical', poly: [ p(0,0), p(0,20), p(5,20), p(10,20), p(15,20), p(20,20), p(22.8,20), p(31.3, 0), p(0,0) ], note: 'Humidification applicability (approx)', description: 'Dry conditions where adding moisture increases occupant comfort; typically requires mechanical humidification.', complexity: 'Low', examples: ['Portable humidifiers in bedrooms', 'Central humidification for airtight, sealed homes'], icon: '💧', howToApply: { beginner: ['Use room humidifiers in occupied spaces or bedrooms', 'Monitor humidity with a hygrometer to avoid over-humidifying'], advanced: ['Install central humidification with sensors and controls', 'Integrate with ventilation to balance moisture'] } },
  { id: 'Heating', color: ZONE_COLORS['Heating'], type: 'active', poly: [ p(0,0), p(0,100), p(6.8,100), p(6.8,0) ], note: 'Heating band (approx)', description: 'Zones where space heating is required to maintain comfort; typically uses active systems.', complexity: 'Low', examples: ['Gas or electric furnaces', 'Hydronic radiant heating'], icon: '🔥', howToApply: { beginner: ['Improve weatherization: seal gaps and insulate', 'Use programmable thermostats and zone thermostats'], advanced: ['Add high-efficiency heat source with zoning and controls', 'Integrate passive solar and thermal mass to reduce runtime'] } },
  { id: 'Active Solar Heating', color: ZONE_COLORS['Active Solar Heating'], type: 'mechanical', poly: [ p(6.8,0), p(6.8,100), p(10.8,100), p(10.8,0) ], note: 'Active solar heating band (approx)', description: 'Solar systems that actively collect, store, and distribute heat (e.g., solar thermal panels with pumps).', complexity: 'Medium', examples: ['Solar thermal collectors with a heat store', 'Pumped loop for hydronic distribution'], icon: '☀️⚡', howToApply: { beginner: ['Install solar thermal collectors and a simple pump loop', 'Provide a domestic hot water preheat or hydronic distribution'], advanced: ['Add a thermal store and smart controls to shift heating loads', 'Combine with heat pumps and backup gas/electric for peak loads'] } },
  { id: 'Passive Solar Heating', color: ZONE_COLORS['Passive Solar Heating'], type: 'passive', poly: [ p(10.8,0), p(10.8,100), p(22.8,100), p(22.8,0) ], note: 'Passive solar heating region (approx)', description: 'Design strategies that use building geometry, glazing and thermal mass to collect and store solar heat without mechanical systems.', complexity: 'Medium', examples: ['South-facing glazing with thermal mass flooring', 'Overhangs sized for seasonal shading'], icon: '☀️', howToApply: { beginner: ['Maximize south glazing and use appropriate overhangs', 'Expose north-south thermal mass to store daytime heat'], advanced: ['Optimize orientation and thermal mass distribution', 'Use dynamic shading and operable thermal insulation'] } },
  { id: 'Internal Gains', color: ZONE_COLORS['Internal Gains'], type: 'passive', poly: [ p(15.3,20), p(15.3,80), p(22.8,80), p(22.8,20) ], note: 'Internal gains influence (approx)', description: 'When heat from occupants, appliances or equipment helps maintain comfortable temperatures; may reduce heating needs.', complexity: 'Low', examples: ['Compact apartments with many occupants', 'Kitchen or server rooms providing heat gain'], icon: '🏢', howToApply: { beginner: ['Consolidate heat producing appliances when possible', 'Use efficient appliances to minimize heat spikes'], advanced: ['Manage internal heat through targeted ventilation and zoning', 'Design plans to keep heat-producing rooms co-located'] } },
  { id: 'Mass Cooling', color: ZONE_COLORS['Mass Cooling'], type: 'passive', poly: [ p(22.8,20), p(29.8,20), p(29.8,50), p(27.8,67), p(35.8,41.76), p(39.8,30), p(39.8,12) ], description: 'Use of thermal mass to dampen daytime heat peaks and release heat when temperatures drop to keep interiors cool.', complexity: 'Medium', examples: ['Heavy concrete floors exposed to night-time ventilation', 'Thick masonry walls with night purge ventilation'], icon: '🪨', howToApply: { beginner: ['Expose mass (concrete, masonry) to day/night cycles', 'Provide shading during day to avoid overheating'], advanced: ['Design thermal storage integration and night ventilation control', 'Combine with thermal insulation and controlled glazing'] } },
  { id: 'Evaporative Cooling', color: ZONE_COLORS['Evaporative Cooling'], type: 'passive', poly: [ p(31.3,0), p(22.8,20), p(29.8,20), p(29.8,50), p(27.8,67), p(38.7,30), p(41.7,20), p(43.8,10), p(43.8,0), ], description: 'Cooling via water evaporation, effective in dry climates to reduce indoor temperatures substantially.', complexity: 'Low', examples: ['Swamp coolers on a single storey house', 'Evaporative pads for controlled indirect cooling'], icon: '🌬️💦', howToApply: { beginner: ['Use a portable or window-mounted evaporative cooler', 'Ensure external air supply and exhaust for direct evaporative coolers'], advanced: ['Design an indirect evaporative matrix with pre-cooling', 'Size the system and integrate with ventilation to prevent humidity issues'] } },
  // Mass Cooling & Night Ventilation:
  // Built anchor-relative in createZonesForMedianTemp.
  // At 28°C baseline (P1=22.8°C):
  //   left edge: P1+17°C=39.8°C from 7% RH up to 30% RH (W~16g/kg)
  //   boundary shared with Mass Cooling and Evaporative Cooling below
  //   right edge: P1+24.06°C=46.86°C from 5% RH up to 20% RH (W~16g/kg)
  { id: 'Mass Cooling & Night Ventilation (or AC)', color: ZONE_COLORS['Mass Cooling & Night Ventilation (or AC)'], type: 'hybrid', poly: [ p(39.8, 7), p(39.8, 30), p(35.8, 42), p(42.8, 28), p(46.86, 20), p(46.86, 5), ], description: 'Hybrid strategy using building mass plus night ventilation to cool; when insufficient, AC supplements performance.', complexity: 'Medium', examples: ['High-mass homes with night purge ventilation', 'Night ventilation combined with zoned AC as backup'], icon: '🌙🪟', howToApply: { beginner: ['Use night purge ventilation and ceiling fans to cool heavy mass', 'Use AC only as backup when comfort limits exceeded'], advanced: ['Automate ventilation controls to exploit nocturnal cooling', 'Combine with thermal storage and intelligent HVAC staging'] } },
  // AC + Dehumidifier — ALWAYS above W=16g/kg. Baseline at 28°C (P1=22.8°C):
  //   AC+D P1: P1+7°C=29.8°C / 100% RH  (shared top-left with Ventilation)
  //   AC+D P2: P1+12°C=34.8°C / 50% RH  (shared right edge with Ventilation)
  //   AC+D P3: P1+12°C=34.8°C / W=16g/kg (join Mass Cooling boundary)
  //   AC+D P4: P1+20°C=42.8°C / W=16g/kg (join Mass Cooling+NV boundary)
  // AC + Dehumidifier — "fill the rest" above W=16g/kg, right of Ventilation.
  // Approximate baseline poly; rebuilt by createZonesForMedianTemp with sampled 16g/kg isoline.
  { id: 'Air Conditioning + Dehumidifier', color: ZONE_COLORS['Air Conditioning + Dehumidifier'], type: 'active', poly: [ p(29.8, 100), p(50, 100), p(50, 40), p(42.8, 28), p(34.8, 42), p(34.8, 50), ], note: 'AC+Dehumidifier — always above W=16g/kg; lower boundary follows sampled 16g/kg isoline', description: 'Mechanical cooling with simultaneous dehumidification is required to maintain comfortable humidity and temperature.', complexity: 'Medium', examples: ['Packaged AC with integrated dehumidifier', 'Separate dehumidifier combined with split AC'], icon: '❄️+💧', howToApply: { beginner: ['Ensure correct AC sizing and run for humidity control', 'Add portable dehumidifier to remove moisture when needed'], advanced: ['Use dedicated dehumidification integrated into HVAC', 'Add smart humidistat controls and ventilation management'] } },
  // Air Conditioning — "fill the rest" below W=16g/kg, right of MC+NV and Evap.
  // Approximate baseline poly; rebuilt by createZonesForMedianTemp with sampled 16g/kg isoline.
  { id: 'Air Conditioning', color: ZONE_COLORS['Air Conditioning'], type: 'active', poly: [ p(43.8, 0), p(43.8, 10), p(46.86, 20), p(50, 18), p(50, 0), ], description: 'Mechanical cooling used to lower temperatures and/or manage humidity when passive measures are insufficient.', complexity: 'Low', examples: ['Split-system AC units', 'Ducted central air conditioning'], icon: '❄️', howToApply: { beginner: ['Install appropriately sized AC units and maintain filter cleanliness', 'Use efficient setpoints and fan control to minimize runtime'], advanced: ['Implement zoned cooling with variable speed compressors', 'Use smart thermostats for schedule and integration with ventilation'] } }
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

// W absolute humidity limit (g/kg) – upper boundary of passive strategy zones.
const W_LIMIT_GPKG = 16.0;
// BASELINE_MEDIAN_T is already defined above (28°C) — that's the median for which ZONES polygons were authored.
// Comfort P1 at baseline: T1_BASE = 22.8°C, RH1 = 20%.
// The temperature of P1 shifts linearly with median temperature.
const T1_BASE = 22.8; // Comfort P1 temperature at BASELINE_MEDIAN_T=28°C

/**
 * Compute the Comfort P1 temperature for a given median outdoor temperature.
 * Uses a linear relationship: every 1°C increase in median → MEDIAN_SLOPE_C_PER_C °C shift in T1.
 * At baseline (28°C median) → T1 = 22.8°C.
 */
function comfortT1(median) {
  return T1_BASE + (median - BASELINE_MEDIAN_T) * MEDIAN_SLOPE_C_PER_C;
}

/**
 * Build the full set of zones shifted for a given median outdoor temperature.
 *
 * All zones are rebuilt anchor-relative from Comfort P1 (T1).
 * Shared vertices (all offsets from T1 at 28°C baseline):
 *   T3  = T1+5   / min(80%, 16g/kg)  (comfort T3, ventilation shared lower-right)
 *                At 19°C median T3 = 25°C/80% ≈ 16g/kg; at 28°C median T3 = 27.8°C/67%.
 *   P5  = T1+7   / 50%     (comfort P5, ventilation, mass cooling)
 *   P6  = T1+7   / 20%     (comfort P6, ventilation, mass cooling, evap cooling)
 *   Pv7 = T1+12  / 50%     (ventilation right-upper, AC+D lower-boundary)
 *   Pm  = T1+12  / 16g/kg  (ventilation/AC+D shared lower-right)
 *   Pm_mc = T1+13 / 16g/kg (mass cooling upper-right, 1°C right of Pm)
 *   Pe  = T1+19  / W(T1,20%) (evap/MC+NV/AC bottom triple-point, ≈3.5g/kg)
 *   Pmc = T1+20  / 16g/kg  (MC+NV top-left, AC+D lower)
 *   Pn1 = T1+24  / 16g/kg  (MC+NV top-right, AC top-left — same W, same T)
 *   Pn2 = T1+24  / 20%     (MC+NV right lower, AC left lower)
 *
 * Mass Cooling lowest-W vertex = T1/20% = Comfort P1 (same absolute humidity).
 * Mass Cooling bottom-right: T1+17 / W=W(P6)=W(T1+7,20%) ≈5.2g/kg.
 * MC+NV lowest-W vertex ≈ W(T1,20%) at Pe = T1+19/≈7%.
 */
function createZonesForMedianTemp(medianTemp, opts = {}) {
  const median = clampMedian(medianTemp == null ? BASELINE_MEDIAN_T : Number(medianTemp));
  const useZones = (opts.zones || ZONES);

  const T1 = comfortT1(median);
  const deltaT = T1 - T1_BASE;

  const rhAtWLimit = (T) => rhFromWgPerKg(T, W_LIMIT_GPKG) ?? 80;
  // RH for a given absolute humidity W_g_per_kg (any W, not just 16g/kg)
  const rhAtW = (T, W) => rhFromWgPerKg(T, W) ?? 0;
  const T_chart_max = opts.Tmax || 50;

  // Pre-compute all shared anchor vertices
  const T_p4  = T1 + 5;    const rh_p4  = rhAtWLimit(T_p4);          // P4: on 16g/kg line (MassCool/shared)
  const rh_T3  = Math.min(80, rh_p4);                                   // T3: T1+5 / min(80%, 16g/kg) — top-right Comfort/Ventilation
  const T_p5  = T1 + 7;    // P5/P6: Comfort/Vent/MassCool/Evap corner at T1+7
  const T_pm  = T1 + 12;   const rh_pm  = rhAtWLimit(T_pm);           // Pm: Ventilation right (T1+12/16g/kg)
  // W_P1: absolute humidity at Comfort P1 (T1/20%) — dry-floor isohumidity for MC, MC+NV, Evap, AC
  const W_P1  = wgPerKgFromTRH(T1, 20);        // ≈3.4 g/kg at baseline
  const T_pe  = T1 + 19;   const rh_pe  = rhAtW(T_pe, W_P1 ?? 3.5);  // Pe: triple-point Evap/AC
  const T_pmc = T1 + 20;   const rh_pmc = rhAtWLimit(T_pmc);          // Pmc: MC+NV vertex 4 / AC+D / AC
  const T_pn  = T1 + 24;   // MC+NV right / AC left boundary
  // Shared MC / MC+NV / AC+D anchor points
  const T_mc5      = T1 + 13;  const rh_mc5 = rhAtWLimit(T_mc5);      // Pm_mc: T1+13/16g/kg
  const T_mc_right = T1 + 17;                                           // MC/MC+NV right column
  const rh_mc_dry  = rhAtW(T_mc_right, W_P1 ?? 3.43);                  // T1+17/W_P1 (dry floor)
  const rh_pn_wP1  = rhAtW(T_pn, W_P1 ?? 3.43);                       // T1+24/W_P1 (MC+NV/AC shared)
  const T_ev78     = T1 + 21;                                           // Evap v7/v8 / AC+MC+NV shared T
  const rh_ev78_wP1 = rhAtW(T_ev78, W_P1 ?? 3.43);                    // T1+21/W_P1 (Evap/MC+NV/AC shared)

  return useZones.map(z => {
    if (!z || !z.poly) return { ...z };

    // ── Comfort ────────────────────────────────────────────────────────────────
    if (z.id === 'Comfort') {
      const rh2 = Math.min(80, rhAtWLimit(T1));   // T2: T1 / 80% (capped at W_LIMIT)
      return { ...z, poly: [
        [T1,    20],          // T1: anchor (20°C/20% at median 19°C, ≈3 g/kg)
        [T1,    rh2],         // T2: same T°, 80% RH (≈11.7 g/kg at median 19°C)
        [T_p4,  rh_T3],       // T3: T1+5 / min(80%, 16g/kg) — T3=T4 at 19°C median
        [T_p5,  50],          // P5
        [T_p5,  20],          // P6
      ]};
    }

    // ── Ventilation ────────────────────────────────────────────────────────────
    if (z.id === 'Ventilation') {
      const rh2 = Math.min(80, rhAtWLimit(T1));
      return { ...z, poly: [
        [T1,    rh2],         // shared Comfort T2 (T1 / 80%)
        [T1,    100],         // top-left saturation
        [T_p5,  100],         // peak saturation (T1+7 / 100%)
        [T_pm,  50],          // T1+12 / 50% (shared with AC+D)
        [T_pm,  rh_pm],       // T1+12 / 16g/kg (shared with AC+D and Mass Cooling)
        [T_pm,  20],          // Pv8: right lower
        [T_p5,  20],          // shared Comfort P6  (T_p5 = T1+7)
        [T_p5,  50],          // shared Comfort P5
        [T_p4,  rh_T3],       // shared Comfort T3: T1+5 / min(80%, 16g/kg)
      ]};
    }

    // ── Mass Cooling ───────────────────────────────────────────────────────────
    // Vertex definition (anchor-relative from T1):
    //   1: T1     / 20%      Comfort P1 — driest point (W = W_P1, dry floor base)
    //   2: T1+7   / 20%      Comfort P6 (shared Comfort/Ventilation/Evap)
    //   3: T1+7   / 50%      Comfort P5
    //   4: T1+5   / 16g/kg   Comfort P4 (shared Comfort/Vent)
    //   5: T1+13  / 16g/kg   Pm_mc upper-right (shared MC+NV vertex 3 and AC+D)
    //   6: T1+17  / 30%      (shared MC+NV vertex 2)
    //   7: T1+17  / W_P1     dry floor (shared MC+NV vertex 1; same W as Comfort P1)
    if (z.id === 'Mass Cooling') {
      return { ...z, poly: [
        [T1,          20],          // 1: Comfort P1 (W = W_P1)
        [T_p5,        20],          // 2: Comfort P6 (T1+7 / 20%)
        [T_p5,        50],          // 3: Comfort P5 (T1+7 / 50%)
        [T_p4,        rh_p4],       // 4: Comfort P4 (T1+5 / 16g/kg)
        [T_pm,        rh_pm],        // 4b: T1+12 / 16g/kg (shared Ventilation/AC+D)
        [T_mc5,       rh_mc5],      // 5: T1+13 / 16g/kg (Pm_mc, shared MC+NV/AC+D)
        [T_mc_right,  30],          // 6: T1+17 / 30% (shared MC+NV)
        [T_mc_right,  rh_mc_dry],   // 7: T1+17 / W_P1 (dry floor, shared MC+NV)
      ]};
    }

    // ── Evaporative Cooling ────────────────────────────────────────────────────
    // 9 vertices (anchor-relative from T1):
    //   1: T1     / 20%    Comfort P1 (shared Comfort/Mass Cooling)
    //   2: T1+7   / 20%    Comfort P6 (shared Comfort/Ventilation/Mass Cooling)
    //   3: T1+7   / 50%    Comfort P5 (shared Comfort/Ventilation)
    //   4: T1+5   / 16g/kg Comfort P4 (shared Comfort/Ventilation/Mass Cooling)
    //   5: T1+16  / 30%
    //   6: T1+19  / 20%
    //   7: T1+21  / 10%
    //   8: T1+21  / 0%    (shared with AC bottom boundary)
    //   9: T1+9   / 0%    (shared with Humidification)
    if (z.id === 'Evaporative Cooling') {
      const T_ev5 = T1 + 16;   // vertex 5
      const T_ev6 = T1 + 19;   // vertex 6 (same T as Pe, but 20% RH not W_P1)
      const T_ev78 = T1 + 21;  // vertices 7 & 8
      const T_ev9 = T1 + 9;    // vertex 9 (dry baseline, shared Humidification)
      return { ...z, poly: [
        [T1,      20],          // 1: Comfort P1
        [T_p5,    20],          // 2: Comfort P6 (T1+7 / 20%)
        [T_p5,    50],          // 3: Comfort P5 (T1+7 / 50%)
        [T_p4,    rh_p4],       // 4: Comfort P4 (T1+5 / 16g/kg)
        [T_ev5,   30],          // 5: T1+16 / 30%
        [T_ev6,   20],          // 6: T1+19 / 20%
        [T_ev78,  10],          // 7: T1+21 / 10%
        [T_ev78,  0],           // 8: T1+21 / 0% (shared with AC)
        [T_ev9,   0],           // 9: T1+9  / 0% (shared with Humidification)
      ]};
    }

    // ── Mass Cooling & Night Ventilation ───────────────────────────────────────
    // Vertex definition (anchor-relative from T1):
    //   1: T1+17 / W_P1      driest (shared MC vertex 7; dry floor at W=W_P1)
    //   2: T1+17 / 30%       (shared MC vertex 6)
    //   3: T1+13 / 16g/kg    Pm_mc upper-left (shared MC vertex 5 and AC+D)
    //   4: T1+20 / 16g/kg    Pmc (shared AC+D/AC)
    //   5: T1+24 / 20%       Pn upper-right (shared AC)
    //   6: T1+24 / W_P1      Pn driest (shared AC; dry floor at W=W_P1)
    if (z.id === 'Mass Cooling & Night Ventilation (or AC)') {
      return { ...z, poly: [
        [T_mc_right,  rh_mc_dry],   // 1: T1+17 / W_P1 (shared MC dry floor)
        [T_mc_right,  30],          // 2: T1+17 / 30% (shared MC)
        [T_mc5,       rh_mc5],      // 3: T1+13 / 16g/kg (Pm_mc, shared MC/AC+D)
        [T_pmc,       rh_pmc],      // 4: T1+20 / 16g/kg (shared AC+D/AC)
        [T_pn,        20],          // 5: T1+24 / 20% (shared AC)
        [T_pn,        rh_pn_wP1],   // 6: T1+24 / W_P1 (shared AC)
        [T_ev78,      rh_ev78_wP1], // 7: T1+21 / W_P1 (shared AC and Evap)
      ]};
    }

    // ── Air Conditioning + Dehumidifier ────────────────────────────────────────
    // "Fill the rest" above 16 g/kg: everything above the sampled 16 g/kg
    // isoline not already covered by Ventilation.
    // Left corner: where the Ventilation right edge (T1+7/100% → T1+12/50%)
    //   crosses the 16 g/kg isoline (~T1+11.5 at 19°C median).
    // Top:    100% RH → T_chart_max
    // Bottom: sampled 16 g/kg isoline from T_chart_max back to that intersection
    if (z.id === 'Air Conditioning + Dehumidifier') {
      // Find where line [T_p5,100]→[T_pm,50] crosses the 16g/kg isoline (bisection)
      let tLo = 0, tHi = 1;
      for (let iter = 0; iter < 40; iter++) {
        const tMid = (tLo + tHi) / 2;
        const T_s  = T_p5 + (T_pm - T_p5) * tMid;
        const rh_s = 100  + (50 - 100)     * tMid;
        const w_s  = wgPerKgFromTRH(T_s, rh_s) ?? 0;
        if (w_s > W_LIMIT_GPKG) tLo = tMid; else tHi = tMid;
      }
      const tCross   = (tLo + tHi) / 2;
      const T_cross  = T_p5 + (T_pm - T_p5) * tCross;
      const rh_cross = 100  + (50 - 100)     * tCross;

      const N_ACD = 12;
      const wLine = [];
      for (let i = 0; i <= N_ACD; i++) {
        const T_s = T_cross + (T_chart_max - T_cross) * i / N_ACD;
        wLine.push([T_s, rhAtWLimit(T_s)]);
      }
      return { ...z, poly: [
        [T_cross, rh_cross],         // Ventilation/MassCooling/AC+D triple-point on 16g/kg
        [T_p5, 100],                 // Ventilation top-right   (T1+7  / 100%)
        [T_chart_max, 100],          // chart top-right
        ...wLine.slice().reverse(),  // sampled 16 g/kg from T_chart_max ← T_cross
      ]};
    }

    // ── Air Conditioning ───────────────────────────────────────────────────────
    // "Fill the rest" below 16 g/kg: everything below the sampled 16 g/kg
    // isoline to the right of MC+NV and Evaporative Cooling.
    // Top:    sampled 16 g/kg from MC+NV top-right (T1+20) → T_chart_max
    // Right:  T_chart_max down to 0%
    // Bottom: 0% from T_chart_max ← T1+21 (Evap right edge)
    // Left:   MC+NV right boundary back up to 16 g/kg
    if (z.id === 'Air Conditioning') {
      const N_AC = 10;
      const wLine = [];
      for (let i = 0; i <= N_AC; i++) {
        const T_s = T_pmc + (T_chart_max - T_pmc) * i / N_AC;
        wLine.push([T_s, rhAtWLimit(T_s)]);
      }
      return { ...z, poly: [
        ...wLine,                       // sampled 16 g/kg from T1+20 → T_chart_max
        [T_chart_max, 0],               // chart bottom-right
        [T_ev78,  0],                   // T1+21 / 0%   (shared Evap v8)
        [T_ev78,  rh_ev78_wP1],         // T1+21 / W_P1 (shared MC+NV v7)
        [T_pn,    rh_pn_wP1],           // T1+24 / W_P1 (shared MC+NV v6)
        [T_pn,    20],                  // T1+24 / 20%  (shared MC+NV v5)
      ]};
    }

    // ── All other zones: simple horizontal T shift ─────────────────────────────
    const newPoly = z.poly.map(pt => {
      const t_old = Number(pt[0]);
      const rh_old = Number(pt[1]);
      const t_new = (t_old >= INF_T) ? INF_T : t_old + deltaT;
      return [t_new, rh_old];
    });
    return { ...z, poly: newPoly };
  });
}

export { createZonesForMedianTemp, rhFromWgPerKg };
