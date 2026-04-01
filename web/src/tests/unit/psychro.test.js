import { describe, it, expect } from 'vitest';
import { e_s_Pa, W_from_e, W_from_RH_T, enthalpy_kJkg } from '../../scripts/psychro/math.js';

describe('Psychrometric Math', () => {
  it('calculates saturation vapor pressure (e_s_Pa)', () => {
    // Known value: at 20°C, e_s is approx 2332-2339 Pa depending on formula
    const es = e_s_Pa(20);
    expect(es).toBeGreaterThan(2330);
    expect(es).toBeLessThan(2345);
  });

  it('calculates humidity ratio (W_from_e)', () => {
    // Standard pressure 101325 Pa, e = 2339 Pa
    const w = W_from_e(2339, 101325);
    expect(w).toBeGreaterThan(0.014);
    expect(w).toBeLessThan(0.015);
  });

  it('calculates humidity ratio from RH and T (W_from_RH_T)', () => {
    // 20°C, 50% RH
    const w = W_from_RH_T(0.5, 20);
    expect(w).toBeCloseTo(0.0072, 3);
  });

  it('calculates enthalpy (enthalpy_kJkg)', () => {
    const w = W_from_RH_T(0.5, 20);
    const h = enthalpy_kJkg(20, w);
    // Approx 38.5 kJ/kg
    expect(h).toBeCloseTo(38.5, 0);
  });

  it('handles extremely high/low humidity correctly', () => {
    // 0% RH
    const w0 = W_from_RH_T(0, 25);
    expect(w0).toBeCloseTo(0, 5); // allow tiny floating-point from psychrolib
    expect(enthalpy_kJkg(25, w0)).toBeCloseTo(25.15, 1); // Only dry air enthalpy

    // 100% RH
    const w100 = W_from_RH_T(1.0, 30);
    expect(w100).toBeGreaterThan(0.026);
    expect(w100).toBeLessThan(0.028);

    // Over 100% (supersaturated) — psychrolib enforces [0,1]; expect a throw
    expect(() => W_from_RH_T(1.1, 25)).toThrow();
  });

  it('handles pressure variations correctly', () => {
    // Sea level vs altitude
    const wSea = W_from_RH_T(0.5, 25, 101325);
    const wHigh = W_from_RH_T(0.5, 25, 80000); // Higher altitude, lower pressure
    
    // At lower pressure, same RH and T should result in higher humidity ratio
    expect(wHigh).toBeGreaterThan(wSea);
  });

  it('handles extreme temperatures comfortably', () => {
    // Below zero
    const wCold = W_from_RH_T(0.5, -10);
    expect(wCold).toBeGreaterThan(0);
    expect(wCold).toBeLessThan(0.002);
    
    // Very hot
    const wHot = W_from_RH_T(0.5, 60);
    expect(wHot).toBeGreaterThan(0.06);
  });
});
