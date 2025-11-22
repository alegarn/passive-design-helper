// Refactor derived from logic.js
import { ZONES, preferredZoneForPoint } from './zones.js';

function pointOnSegment(px, py, x1, y1, x2, y2) {
  const cross = (px - x1) * (y2 - y1) - (py - y1) * (x2 - x1);
  if (Math.abs(cross) > 1e-8) return false;
  const dot = (px - x1) * (px - x2) + (py - y1) * (py - y2);
  return dot <= 0;
}

function pointInPoly(px, py, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
    if (pointOnSegment(px, py, xi, yi, xj, yj)) return true;
    const intersect = ((yi > py) !== (yj > py)) && (px < (xj - xi) * (py - yi) / (yj - yi + 0.0) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

const ENERGY_PRIORITY = ['Comfort', 'Ventilation', 'Mass Cooling', 'Evaporative Cooling', 'Air Conditioning + Dehumidifier', 'Air Conditioning', 'Cold', 'Unclassified'];

function classifyPoint(temp, rh) {
  const T = Number(temp);
  const H = Number(rh);

  if (T > 43.5) return 'Air Conditioning';
  if (T < 0) return 'Heating';

  const pref = preferredZoneForPoint(T, H);
  if (pref && pref.id) return pref.id;
  if (T < 23) return 'Cold';
  return 'Unclassified';
}

export { pointOnSegment, pointInPoly, classifyPoint };
