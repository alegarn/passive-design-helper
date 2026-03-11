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
});
