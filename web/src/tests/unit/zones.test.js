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

function hasUpwardMoveOnTemperatureColumn(poly, target) {
  return poly.some(([temp, rh], index) => {
    const next = poly[index + 1];
    return next
      && Math.abs(temp - target) < EPS
      && Math.abs(next[0] - target) < EPS
      && next[1] > rh + EPS;
  });
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

  it('keeps shared-ceiling boundaries aligned at cool medians', () => {
    for (const med of [17, 19]) {
      const zones = createZonesForMedianTemp(med);
      const sharedUpperW_gpkg = comfortSharedCeilingW(zones);
      const mass = zoneById(zones, 'Mass Cooling');
      const evap = zoneById(zones, 'Evaporative Cooling');
      const mcnv = zoneById(zones, 'Mass Cooling & Night Ventilation (or AC)');
      const acd = zoneById(zones, 'Air Conditioning + Dehumidifier');
      const ac = zoneById(zones, 'Air Conditioning');

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
        expectHumidityRatioNear(point, 16, label, med);
      });

      acd.poly.slice(3).forEach((point, index) => {
        expectHumidityRatioNear(point, 16, `AC+D ceiling sample ${index}`, med);
      });

      airConditioningCeiling(ac.poly).forEach((point, index) => {
        expectHumidityRatioNear(point, 16, `AC ceiling sample ${index}`, med);
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

  it('below the threshold Ventilation has no upward move on the T_pm column', () => {
    const zones = createZonesForMedianTemp(19);
    const vent = zoneById(zones, 'Ventilation');
    const tPm = rightmostTemperature(vent.poly);
    const rightColumn = pointsAtTemperature(vent.poly, tPm);

    expect(hasUpwardMoveOnTemperatureColumn(vent.poly, tPm)).toBe(false);
    expect(rightColumn).toHaveLength(1);
    expect(rightColumn[0][1]).toBeCloseTo(20, 6);
  });

  it('below the threshold Ventilation and AC+D share the same crossover point', () => {
    const zones = createZonesForMedianTemp(19);
    const vent = zoneById(zones, 'Ventilation');
    const acd = zoneById(zones, 'Air Conditioning + Dehumidifier');
    const sharedUpperW_gpkg = comfortSharedCeilingW(zones);
    const tPeak = Math.max(...vent.poly.filter(([, rh]) => Math.abs(rh - 100) < EPS).map(([temp]) => temp));
    const tPm = rightmostTemperature(vent.poly);
    const ventCrossover = vent.poly.find(([temp, rh]) => temp > tPeak + EPS && temp < tPm - EPS && rh > 50 + EPS);

    expect(ventCrossover).toBeDefined();
    expect(acd.poly[0][0]).toBeLessThan(tPm);
    expect(acd.poly[0][0]).toBeCloseTo(ventCrossover[0], 6);
    expect(acd.poly[0][1]).toBeCloseTo(ventCrossover[1], 6);
    expectHumidityRatioNear(acd.poly[0], sharedUpperW_gpkg, 'AC+D crossover', 19);
  });

  it('at warm medians Ventilation keeps the T_pm endpoint stack', () => {
    const zones = createZonesForMedianTemp(24);
    const vent = zoneById(zones, 'Ventilation');
    const tPm = rightmostTemperature(vent.poly);
    const rightColumn = pointsAtTemperature(vent.poly, tPm);

    expect(rightColumn).toHaveLength(3);
    expect(rightColumn.some(([, rh]) => Math.abs(rh - 50) < EPS)).toBe(true);
    expect(rightColumn.some(([, rh]) => Math.abs(rh - 20) < EPS)).toBe(true);
    expect(rightColumn.some(([, rh]) => rh > 20 + EPS && rh < 50 - EPS)).toBe(true);
  });
});
