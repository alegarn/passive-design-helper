// Refactor derived from logic.js
import { ZONES, preferredZoneForPoint } from './zones.js';

/**
 * Check if a point lies on a line segment
 * @param {number} px - Point X coordinate
 * @param {number} py - Point Y coordinate
 * @param {number} x1 - Segment start X
 * @param {number} y1 - Segment start Y
 * @param {number} x2 - Segment end X
 * @param {number} y2 - Segment end Y
 * @returns {boolean} True if point is on segment
 */
function pointOnSegment(px, py, x1, y1, x2, y2) {
  const cross = (px - x1) * (y2 - y1) - (py - y1) * (x2 - x1);
  if (Math.abs(cross) > 1e-8) return false;
  const dot = (px - x1) * (px - x2) + (py - y1) * (py - y2);
  return dot <= 0;
}

/**
 * Check if a point is inside a polygon using ray casting algorithm
 * @param {number} px - Point X coordinate
 * @param {number} py - Point Y coordinate
 * @param {number[][]} poly - Polygon as array of [x,y] points
 * @returns {boolean} True if point is inside polygon
 */
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

/**
 * Energy priority for tie-breaking (least energy consuming preferred)
 */
const ENERGY_PRIORITY = ['Comfort', 'Ventilation', 'Mass Cooling', 'Evaporative Cooling', 'Air Conditioning + Dehumidifier', 'Air Conditioning', 'Cold', 'Unclassified'];

/**
 * Classify a temperature/humidity point into a zone
 * @param {number} temp - Temperature in Celsius
 * @param {number} rh - Relative humidity in percent
 * @returns {string} Zone ID
 */
function classifyPoint(temp, rh) {
  // Cold zone is simple temperature threshold
  if (Number(temp) < 23) return 'Cold';

  // Use the shared preferredZoneForPoint logic from zones.js which
  // applies the project's energy-priority tie-breaking and any
  // explicit priority metadata on zones.
  const pref = preferredZoneForPoint(temp, rh);
  if (pref && pref.id) return pref.id;

  // Fallback for very high temperatures
  if (Number(temp) >= 43.7) return 'Air Conditioning';

  return 'Unclassified';
}

export { pointOnSegment, pointInPoly, classifyPoint };