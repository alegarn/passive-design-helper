// DEV-ONLY module — labelled vertex markers on the psychrometric canvas.
// NEVER import unconditionally. Use only inside an import.meta.env.DEV branch:
//   if (import.meta.env.DEV) { const m = await import('./dev-annotations.js'); }

import { W_from_RH_T } from './math.js';

const ZONE_PREFIXES = {
  'Comfort': 'C',
  'Ventilation': 'V',
  'Humidification': 'Hm',
  'Heating': 'Ht',
  'Active Solar Heating': 'AS',
  'Passive Solar Heating': 'PS',
  'Internal Gains': 'IG',
  'Mass Cooling': 'MC',
  'Evaporative Cooling': 'EC',
  'Mass Cooling & Night Ventilation (or AC)': 'MN',
  'Air Conditioning + Dehumidifier': 'ACD',
  'Air Conditioning': 'AC',
};

/**
 * Returns the short label prefix for a zone id.
 * Falls back to first 3 uppercase chars if no mapping exists.
 * @param {string} zoneId
 * @returns {string}
 */
export function zonePrefix(zoneId) {
  if (ZONE_PREFIXES[zoneId] !== undefined) return ZONE_PREFIXES[zoneId];
  return zoneId.replace(/[^A-Z]/g, '').slice(0, 3);
}

/**
 * Generates labelled vertex descriptors for a zone polygon.
 * @param {string} zoneId
 * @param {Array<[number, number]>} poly  - array of [T, RH] pairs (RH in %)
 * @returns {Array<{name: string, T: number, RH: number}>}
 */
export function zonePointNames(zoneId, poly) {
  const prefix = zonePrefix(zoneId);
  return poly.map(([T, RH], i) => ({ name: `${prefix}${i + 1}`, T, RH }));
}

/**
 * Draws transparent point labels on ctx using the renderer's own psychroToCanvas fn.
 * @param {CanvasRenderingContext2D} ctx
 * @param {Array}   zones           - zone objects with .id, .poly, .color
 * @param {Function} psychroToCanvas  - (T:number, W:number)=>{x,y} from renderer closure
 * @param {number}  [p=101325]      - atmospheric pressure in Pa
 */
export function drawPointLabels(ctx, zones, psychroToCanvas, p = 101325) {
  if (!ctx || !zones) return;

  ctx.save();

  for (const zone of zones) {
    if (!zone.poly || !zone.poly.length) continue;

    const points = zonePointNames(zone.id, zone.poly);

    for (const point of points) {
      const { name, T, RH } = point;
      if (!isFinite(T) || !isFinite(RH)) continue;

      let canvasPos;
      try {
        const W = W_from_RH_T(RH / 100, T, p);
        canvasPos = psychroToCanvas(T, W);
      } catch (e) {
        continue;
      }

      const { x, y } = canvasPos;

      // (a) small dot in zone.color at 40% opacity
      ctx.globalAlpha = 0.4;
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, 2 * Math.PI);
      ctx.fillStyle = zone.color;
      ctx.fill();

      // (b) vertex name with white halo for readability, zone.color fill, 50% opacity
      ctx.font = 'bold 9px monospace';
      ctx.globalAlpha = 0.5;
      ctx.strokeStyle = 'white';
      ctx.lineWidth = 2;
      ctx.strokeText(name, x + 4, y - 1);
      ctx.fillStyle = zone.color;
      ctx.fillText(name, x + 4, y - 1);
    }
  }

  ctx.globalAlpha = 1.0;
  ctx.restore();
}
