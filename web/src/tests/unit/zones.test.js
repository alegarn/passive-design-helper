import { describe, it, expect } from 'vitest';
import { createZonesForMedianTemp } from '../../scripts/zones.js';
import { W_from_RH_T } from '../../scripts/psychro/math.js';

const EPS = 1e-6;
const W_TOLERANCE_GPKG = 0.1;

function zoneById(zones, id) {
  return zones.find(zone => zone.id === id);
}

function humidityRatioGpkg([temp, rh]) {
  return W_from_RH_T(rh / 100, temp) * 1000;
}

function comfortSharedCeilingPoint(zones) {
  const comfort = zoneById(zones, 'Comfort');
  return comfort.poly[comfort.poly.length - 3];
}

function comfortSharedCeilingW(zones) {
  return humidityRatioGpkg(comfortSharedCeilingPoint(zones));
}

function airConditioningCeiling(poly) {
  const firstZeroIndex = poly.findIndex(([, rh]) => Math.abs(rh) < EPS);
  return firstZeroIndex === -1 ? poly : poly.slice(0, firstZeroIndex);
}

function airConditioningDehumidifierBoundary(poly) {
  return poly.slice(3);
}

function expectHumidityRatioNear(point, expectedW_gpkg, label, median) {
  const actualW_gpkg = humidityRatioGpkg(point);
  expect(
    Math.abs(actualW_gpkg - expectedW_gpkg),
    `${label} at median ${median}°C has W=${actualW_gpkg.toFixed(3)} g/kg, expected ${expectedW_gpkg.toFixed(3)} g/kg`,
  ).toBeLessThanOrEqual(W_TOLERANCE_GPKG);
}

function rightmostTemperature(poly) {
  return Math.max(...poly.map(([temp]) => temp));
}

function pointsAtTemperature(poly, target) {
  return poly.filter(([temp]) => Math.abs(temp - target) < EPS);
}

function pointAtTemperature(poly, target, label) {
  const matches = pointsAtTemperature(poly, target);
  expect(matches.length, `${label} is missing a point at T=${target.toFixed(3)}°C`).toBeGreaterThan(0);
  return matches[0];
}

function ventilationHottestColumn(poly) {
  const hotTemperature = rightmostTemperature(poly);
  const column = pointsAtTemperature(poly, hotTemperature).slice().sort((a, b) => b[1] - a[1]);
  return {
    hotTemperature,
    column,
    upper: column[0],
    lower: column[column.length - 1],
  };
}

function expectSamePoint(actual, expected, label) {
  expect(actual[0], `${label} temperature`).toBeCloseTo(expected[0], 6);
  expect(actual[1], `${label} RH`).toBeCloseTo(expected[1], 6);
}

function expectPointOnSegment(actual, start, end, label) {
  const [x, y] = actual;
  const [x1, y1] = start;
  const [x2, y2] = end;
  const cross = (y - y1) * (x2 - x1) - (x - x1) * (y2 - y1);

  expect(Math.abs(cross), `${label} is not on the expected segment`).toBeLessThanOrEqual(1e-3);
  expect(x, `${label} temperature is left of the segment`).toBeGreaterThanOrEqual(Math.min(x1, x2) - EPS);
  expect(x, `${label} temperature is right of the segment`).toBeLessThanOrEqual(Math.max(x1, x2) + EPS);
  expect(y, `${label} RH is below the segment`).toBeGreaterThanOrEqual(Math.min(y1, y2) - EPS);
  expect(y, `${label} RH is above the segment`).toBeLessThanOrEqual(Math.max(y1, y2) + EPS);
}

describe('Zone Adaptive Logic', () => {
  it('shifts zones based on median temperature', () => {
    const zones20 = createZonesForMedianTemp(20);
    const zones28 = createZonesForMedianTemp(28);
    const zones18 = createZonesForMedianTemp(18);

    const comfort20 = zones20.find(z => z.id === 'Comfort');
    const comfort28 = zones28.find(z => z.id === 'Comfort');
    const comfort18 = zones18.find(z => z.id === 'Comfort');

    // Comfort zone should shift right as median T increases
    expect(comfort28.poly[0][0]).toBeGreaterThan(comfort20.poly[0][0]);
    // Comfort zone should shift left as median T decreases
    expect(comfort18.poly[0][0]).toBeLessThan(comfort20.poly[0][0]);
  });

  it('enforces humidity ratio (W) ceiling for comfort zone', () => {
    const zones40 = createZonesForMedianTemp(40);
    const comfort40 = zones40.find(z => z.id === 'Comfort');

    // Check all points in Comfort zone at 40°C median
    comfort40.poly.forEach(pt => {
      const T = pt[0];
      const RH = pt[1];
      const W = W_from_RH_T(RH / 100, T);
      // Ceiling is 16 g/kg (0.016 kg/kg)
      expect(W).toBeLessThanOrEqual(0.0165); // Allowing a small epsilon
    });
  });

  it('ensures all zone points are within 0-100% RH', () => {
    const medians = [10, 18, 28, 35, 45];
    medians.forEach(m => {
      const zones = createZonesForMedianTemp(m);
      zones.forEach(z => {
        z.poly.forEach(pt => {
          expect(pt[1]).toBeGreaterThanOrEqual(0);
          expect(pt[1]).toBeLessThanOrEqual(100.1); // Precision epsilon
        });
      });
    });
  });

  it('maintains Natural Ventilation peak below saturation', () => {
    const zones28 = createZonesForMedianTemp(28);
    const vent28 = zones28.find(z => z.id === 'Ventilation');
    
    // The peak points of Ventilation (indices 1, 2 in original poly)
    expect(vent28.poly[1][1]).toBeLessThanOrEqual(100);
    expect(vent28.poly[2][1]).toBeLessThanOrEqual(100);
  });

  it('Ventilation zone reaches 100% RH at peak (not capped by 16g/kg)', () => {
    for (const med of [18, 28, 40]) {
      const zones = createZonesForMedianTemp(med);
      const vent = zones.find(z => z.id === 'Ventilation');
      expect(vent, `Ventilation zone missing at median ${med}`).toBeTruthy();
      // Index 1 = top-left (T1/100%), index 2 = peak (T1+7/100%)
      expect(vent.poly[1][1]).toBeCloseTo(100, 0);
      expect(vent.poly[2][1]).toBeCloseTo(100, 0);
    }
  });

  it('keeps the lowered left-side cap shared between Comfort, Mass Cooling, and Evaporative Cooling at cool medians', () => {
    for (const med of [17, 19]) {
      const zones = createZonesForMedianTemp(med);
      const sharedUpperW_gpkg = comfortSharedCeilingW(zones);
      const comfort = zoneById(zones, 'Comfort');
      const mass = zoneById(zones, 'Mass Cooling');
      const evap = zoneById(zones, 'Evaporative Cooling');
      const tP4 = comfort.poly[0][0] + 5;

      expect(sharedUpperW_gpkg).toBeLessThan(16);

      [
        ['Comfort T1+5', pointAtTemperature(comfort.poly, tP4, 'Comfort T1+5')],
        ['Mass Cooling T1+5', pointAtTemperature(mass.poly, tP4, 'Mass Cooling T1+5')],
        ['Evaporative Cooling T1+5', pointAtTemperature(evap.poly, tP4, 'Evaporative Cooling T1+5')],
      ].forEach(([label, point]) => {
        expectHumidityRatioNear(point, sharedUpperW_gpkg, label, med);
      });
    }
  });

  it('keeps the same shared-ceiling boundaries near 16g/kg at warm medians', () => {
    for (const med of [28, 35]) {
      const zones = createZonesForMedianTemp(med);
      const sharedUpperW_gpkg = comfortSharedCeilingW(zones);
      const mass = zoneById(zones, 'Mass Cooling');
      const evap = zoneById(zones, 'Evaporative Cooling');
      const mcnv = zoneById(zones, 'Mass Cooling & Night Ventilation (or AC)');
      const acd = zoneById(zones, 'Air Conditioning + Dehumidifier');
      const ac = zoneById(zones, 'Air Conditioning');

      expect(Math.abs(sharedUpperW_gpkg - 16)).toBeLessThanOrEqual(W_TOLERANCE_GPKG);

      [
        ['Comfort shared ceiling', comfortSharedCeilingPoint(zones)],
        ['Mass Cooling T1+5', mass.poly[3]],
        ['Mass Cooling T1+12', mass.poly[4]],
        ['Mass Cooling T1+13', mass.poly[5]],
        ['Evaporative Cooling T1+5', evap.poly[3]],
        ['MC+NV T1+13', mcnv.poly[2]],
        ['MC+NV T1+20', mcnv.poly[3]],
      ].forEach(([label, point]) => {
        expectHumidityRatioNear(point, sharedUpperW_gpkg, label, med);
      });

      acd.poly.slice(3).forEach((point, index) => {
        expectHumidityRatioNear(point, sharedUpperW_gpkg, `AC+D ceiling sample ${index}`, med);
      });

      airConditioningCeiling(ac.poly).forEach((point, index) => {
        expectHumidityRatioNear(point, sharedUpperW_gpkg, `AC ceiling sample ${index}`, med);
      });
    }
  });

  it('Ventilation zone lower boundary (shared with Comfort) stays at or below W=16g/kg', () => {
    const W_LIMIT = 0.016; // kg/kg
    for (const med of [18, 28, 40]) {
      const zones = createZonesForMedianTemp(med);
      const vent = zones.find(z => z.id === 'Ventilation');
      expect(vent, `Ventilation zone missing at median ${med}`).toBeTruthy();
      // The shared boundary with Comfort is the LAST 3 vertices (P4, P5 on 16g/kg + P3)
      // poly: [P2, top-left, peak, right-upper=50%, right-lower, P6, P5, P4, P3]
      // Shared-with-Comfort vertices: indices 6 (P5=50%), 7 (P4=on 16g/kg), 8 (P3=on 16g/kg)
      const sharedVerts = vent.poly.slice(6); // P5, P4, P3
      sharedVerts.forEach(([T, RH]) => {
        const W = W_from_RH_T(RH / 100, T);
        expect(W, `Ventilation shared vertex T=${T.toFixed(1)} RH=${RH.toFixed(1)} has W=${(W*1000).toFixed(2)}g/kg > 16 at median ${med}`)
          .toBeLessThanOrEqual(W_LIMIT + 0.001);
      });
    }
  });

  it('keeps a two-point hottest Ventilation column and places AC+D on the Ventilation diagonal at the shared cap for cool medians', () => {
    for (const med of [17, 19]) {
      const zones = createZonesForMedianTemp(med);
      const comfort = zoneById(zones, 'Comfort');
      const vent = zoneById(zones, 'Ventilation');
      const acd = zoneById(zones, 'Air Conditioning + Dehumidifier');
      const sharedUpperW_gpkg = comfortSharedCeilingW(zones);
      const tPm = comfort.poly[0][0] + 12;
      const { hotTemperature, column, upper, lower } = ventilationHottestColumn(vent.poly);
      const acd1 = acd.poly[0];
      const acd2 = acd.poly[1];

      expect(sharedUpperW_gpkg).toBeLessThan(16);
      expect(column).toHaveLength(2);
      expect(upper[1]).toBeCloseTo(50, 6);
      expect(lower[1]).toBeCloseTo(20, 6);
      expect(upper[0]).toBeCloseTo(lower[0], 6);
      expect(upper[1]).toBeGreaterThan(lower[1]);
      expect(hotTemperature).toBeCloseTo(tPm, 6);
      expectSamePoint(upper, [tPm, 50], `Ventilation hottest point at median ${med}`);
      expectSamePoint(lower, [tPm, 20], `Ventilation hottest lower point at median ${med}`);
      expectSamePoint(acd2, vent.poly[2], `AC+D upper-left point at median ${med}`);
      expectPointOnSegment(acd1, acd2, upper, `AC+D join at median ${med}`);
      expectHumidityRatioNear(acd1, sharedUpperW_gpkg, 'AC+D join', med);
      expect(acd1[0]).toBeLessThan(tPm);
      expect(acd1[1]).toBeGreaterThan(50);
    }
  });

  it('keeps the AC+D lower boundary and other hot-side points on the shared moving cap', () => {
    for (const med of [12, 17, 23, 28]) {
      const zones = createZonesForMedianTemp(med);
      const comfort = zoneById(zones, 'Comfort');
      const vent = zoneById(zones, 'Ventilation');
      const mass = zoneById(zones, 'Mass Cooling');
      const mcnv = zoneById(zones, 'Mass Cooling & Night Ventilation (or AC)');
      const acd = zoneById(zones, 'Air Conditioning + Dehumidifier');
      const ac = zoneById(zones, 'Air Conditioning');
      const sharedUpperW_gpkg = comfortSharedCeilingW(zones);
      const t1 = comfort.poly[0][0];
      const tPm = t1 + 12;
      const tMc5 = t1 + 13;
      const tPmc = t1 + 20;
      const { upper: ventUpper } = ventilationHottestColumn(vent.poly);
      const massAtTpm = pointAtTemperature(mass.poly, tPm, 'Mass Cooling T1+12');
      const mcnvAtTmc5 = pointAtTemperature(mcnv.poly, tMc5, 'MC+NV T1+13');
      const mcnvAtTpmc = pointAtTemperature(mcnv.poly, tPmc, 'MC+NV T1+20');
      const acdBoundary = airConditioningDehumidifierBoundary(acd.poly);
      const acdBoundaryStart = acdBoundary[acdBoundary.length - 1];
      const acCeiling = airConditioningCeiling(ac.poly);
      const acAtTpmc = ac.poly[0];

      expectSamePoint(ventUpper, [tPm, 50], `Ventilation hottest point at median ${med}`);
      expectHumidityRatioNear(massAtTpm, sharedUpperW_gpkg, 'Mass Cooling T1+12', med);
      expectHumidityRatioNear(mcnvAtTmc5, sharedUpperW_gpkg, 'MC+NV T1+13', med);
      expectHumidityRatioNear(mcnvAtTpmc, sharedUpperW_gpkg, 'MC+NV T1+20', med);
      expect(acdBoundaryStart[0]).toBeCloseTo(tPm, 6);
      expectHumidityRatioNear(acdBoundaryStart, sharedUpperW_gpkg, 'AC+D lower-boundary start', med);
      expect(acdBoundary.every(([temp]) => temp + EPS >= tPm)).toBe(true);
      acdBoundary.forEach((point, index) => {
        expectHumidityRatioNear(point, sharedUpperW_gpkg, `AC+D lower-boundary sample ${index}`, med);
      });
      expect(acAtTpmc[0]).toBeCloseTo(tPmc, 6);
      expectHumidityRatioNear(acAtTpmc, sharedUpperW_gpkg, 'AC T1+20', med);
      acCeiling.forEach((point, index) => {
        expectHumidityRatioNear(point, sharedUpperW_gpkg, `AC ceiling sample ${index}`, med);
      });
      expect(
        Math.abs(massAtTpm[0] - ventUpper[0]) < EPS && Math.abs(massAtTpm[1] - ventUpper[1]) < EPS,
      ).toBe(false);

      if (med < 23) {
        expect(sharedUpperW_gpkg).toBeLessThan(16);
        expect(acdBoundaryStart[1]).toBeGreaterThan(ventUpper[1]);
      } else {
        expect(Math.abs(sharedUpperW_gpkg - 16)).toBeLessThanOrEqual(W_TOLERANCE_GPKG);
        expect(acdBoundaryStart[1]).toBeLessThan(ventUpper[1]);
      }
    }
  });

  it('lets AC+D meet V4 when the Ventilation diagonal stays above the shared cap at warm medians', () => {
    for (const med of [23, 28]) {
      const zones = createZonesForMedianTemp(med);
      const comfort = zoneById(zones, 'Comfort');
      const vent = zoneById(zones, 'Ventilation');
      const acd = zoneById(zones, 'Air Conditioning + Dehumidifier');
      const sharedUpperW_gpkg = comfortSharedCeilingW(zones);
      const { upper } = ventilationHottestColumn(vent.poly);

      expect(Math.abs(sharedUpperW_gpkg - 16)).toBeLessThanOrEqual(W_TOLERANCE_GPKG);
      expectSamePoint(acd.poly[0], upper, `AC+D join at median ${med}`);
    }
  });
});
