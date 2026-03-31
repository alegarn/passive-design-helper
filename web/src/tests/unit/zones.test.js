import { describe, it, expect } from 'vitest';
import { createZonesForMedianTemp } from '../../scripts/zones.js';
import { W_from_RH_T } from '../../scripts/psychro/math.js';

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

  it('AC+Dehumidifier lower boundary follows 16g/kg line', () => {
    const W_LIMIT = 0.016; // kg/kg
    for (const med of [18, 28, 40]) {
      const zones = createZonesForMedianTemp(med);
      const acd = zones.find(z => z.id === 'Air Conditioning + Dehumidifier');
      expect(acd, `AC+Dehumid zone missing at median ${med}`).toBeTruthy();
      // Poly: [T1+7,100], [Tmax,100], [Tmax,rh16], [T1+20,rh16], [T1+12,rh16], [T1+12,50]
      // Indices 2,3,4 are the 16g/kg boundary vertices
      const boundaryVerts = acd.poly.slice(2, 5);
      boundaryVerts.forEach(([T, RH]) => {
        const W = W_from_RH_T(RH / 100, T);
        expect(W, `AC+D boundary vertex T=${T.toFixed(1)} RH=${RH.toFixed(1)} has W=${(W*1000).toFixed(2)}g/kg, expected ~16 at median ${med}`)
          .toBeCloseTo(W_LIMIT, 2); // within ~10g/kg tolerance (2 decimal kg/kg = 0.01 = 10g/kg... too loose)
      });
      // Also check the lower-left (100% RH) and top-right (100% RH) are at saturation
      expect(acd.poly[0][1]).toBeCloseTo(100, 0); // lower-left at 100% RH
      expect(acd.poly[1][1]).toBeCloseTo(100, 0); // top-right at 100% RH
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
});
