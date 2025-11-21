/**
 * Psychrometric calculations module
 * Uses psychrolib when available for improved accuracy, with a safe dynamic loader.
 */

let psychrolib = null;

// Load psychrolib asynchronously; functions will gracefully fallback until loaded.
// Use a computed module specifier to avoid bundlers (vite) trying to statically resolve the import.
(async () => {
  try {
    const spec = 'psychrolib';
    // console.debug('psychro:math attempting dynamic import with specifier ->', spec);
    // Use a static specifier so Vite can remap/bundle the dependency correctly.
    const mod = await import('psychrolib');
    psychrolib = mod.default || mod;
    if (psychrolib && typeof psychrolib.SetUnitSystem === 'function' && psychrolib.SI) {
      try { psychrolib.SetUnitSystem(psychrolib.SI); } catch (e) { /* ignore */ }
    }
    // console.debug('psychro:math loaded psychrolib successfully', !!psychrolib);
  } catch (e) {
    psychrolib = null;
    // console.debug('psychro:math psychrolib not available, using fallbacks', e);
  }
})();

/**
 * Saturation vapor pressure using Magnus-Tetens formula or psychrolib
 * @param {number} T_C - Temperature in Celsius
 * @returns {number} Saturation vapor pressure in Pascals
 */
export function e_s_Pa(T_C) {
  if (psychrolib) {
    // psychrolib exposes different function names across builds; try common ones
    if (typeof psychrolib.GetSatVapPres === 'function') {
      return psychrolib.GetSatVapPres(T_C);
    }
    if (typeof psychrolib.GetSatVapPres_T === 'function') {
      return psychrolib.GetSatVapPres_T(T_C);
    }
  }

  const a = 6.112; // hPa
  const b = 17.62;
  const c = 243.12; // °C
  return a * 100 * Math.exp((b * T_C) / (c + T_C));
}

/**
 * Humidity ratio from vapor pressure
 * @param {number} e - Vapor pressure in Pascals
 * @param {number} p - Atmospheric pressure in Pascals (default 101325 Pa)
 * @returns {number} Humidity ratio (kg water/kg dry air)
 */
export function W_from_e(e, p = 101325) {
  if (psychrolib) {
    if (typeof psychrolib.GetHumRatioFromVapPres === 'function') {
      return psychrolib.GetHumRatioFromVapPres(e, p);
    }
    if (typeof psychrolib.GetHumRatioFromVapPres_Pa === 'function') {
      return psychrolib.GetHumRatioFromVapPres_Pa(e, p);
    }
  }
  return 0.622 * e / (p - e);
}

/**
 * Humidity ratio from relative humidity and temperature
 * @param {number} RH - Relative humidity (0-1, not percentage)
 * @param {number} T_C - Temperature in Celsius
 * @param {number} p - Atmospheric pressure in Pascals (default 101325 Pa)
 * @returns {number} Humidity ratio (kg water/kg dry air)
 */
export function W_from_RH_T(RH, T_C, p = 101325) {
  if (psychrolib) {
    if (typeof psychrolib.GetHumRatioFromRelHum === 'function') {
      return psychrolib.GetHumRatioFromRelHum(T_C, RH, p);
    }
    if (typeof psychrolib.GetHumRatioFromRelHum_T === 'function') {
      return psychrolib.GetHumRatioFromRelHum_T(T_C, RH, p);
    }
  }
  const e_sat = e_s_Pa(T_C);
  const e = RH * e_sat;
  return W_from_e(e, p);
}

/**
 * Dew point temperature from vapor pressure (inverse Magnus) or psychrolib
 * @param {number} e - Vapor pressure in Pascals
 * @returns {number} Dew point temperature in Celsius
 */
export function dewPoint_C_from_e(e) {
  if (psychrolib) {
    if (typeof psychrolib.GetTDewPointFromVapPres === 'function') {
      return psychrolib.GetTDewPointFromVapPres(e);
    }
    if (typeof psychrolib.GetTDewPointFromVapPres_Pa === 'function') {
      return psychrolib.GetTDewPointFromVapPres_Pa(e);
    }
  }

  const e_hPa = e / 100;
  const a = 6.112; // hPa
  const b = 17.62;
  const c = 243.12; // °C
  if (e_hPa <= 0) return -273.15;
  return (c * Math.log(e_hPa / a)) / (b - Math.log(e_hPa / a));
}

/**
 * Specific enthalpy of moist air
 * @param {number} T_C - Dry bulb temperature in Celsius
 * @param {number} W - Humidity ratio (kg water/kg dry air)
 * @returns {number} Specific enthalpy in kJ/kg dry air
 */
export function enthalpy_kJkg(T_C, W) {
  if (psychrolib && typeof psychrolib.GetMoistAirEnthalpy === 'function') {
    // psychrolib returns J/kg for SI; convert to kJ/kg
    return psychrolib.GetMoistAirEnthalpy(T_C, W) / 1000;
  }
  return 1.006 * T_C + W * (2501 + 1.86 * T_C);
}

/**
 * Wet bulb temperature solver using bisection method with psychrolib fallback
 */
export function wetBulbSolver(T_C, RH, p = 101325, tolerance = 0.001, maxIterations = 100) {
  if (psychrolib) {
    if (typeof psychrolib.GetTWetBulbFromRelHum === 'function') {
      return psychrolib.GetTWetBulbFromRelHum(T_C, RH, p);
    }
    if (typeof psychrolib.GetTWetBulbFromHumRatio === 'function') {
      const W = W_from_RH_T(RH, T_C, p);
      return psychrolib.GetTWetBulbFromHumRatio(T_C, W, p);
    }
  }

  let T_wb_min = -20;
  let T_wb_max = Math.max(T_C, 50);
  const W_target = W_from_RH_T(RH, T_C, p);

  for (let i = 0; i < maxIterations; i++) {
    const T_wb_mid = (T_wb_min + T_wb_max) / 2;
    const W_wb = W_from_RH_T(1.0, T_wb_mid, p);
    const h_wb = enthalpy_kJkg(T_wb_mid, W_wb);
    const h_actual = enthalpy_kJkg(T_C, W_target);

    if (Math.abs(h_wb - h_actual) < tolerance) return T_wb_mid;
    if (h_wb > h_actual) T_wb_max = T_wb_mid; else T_wb_min = T_wb_mid;
    if (T_wb_max - T_wb_min < tolerance) return (T_wb_min + T_wb_max) / 2;
  }
  return (T_wb_min + T_wb_max) / 2;
}

// Development-only basic assertions
if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
  const e_20 = e_s_Pa(20);
  console.assert(Math.abs(e_20 - 2338) < 200, `e_s_Pa(20) ≈ 2338 Pa, got ${e_20}`);

  const h_20_01 = enthalpy_kJkg(20, 0.01);
  console.assert(h_20_01 > 0 && h_20_01 < 200, `enthalpy_kJkg(20, 0.01) should be reasonable, got ${h_20_01}`);

  const W_50_20 = W_from_RH_T(0.5, 20);
  console.assert(W_50_20 > 0 && W_50_20 < 0.1, `W_from_RH_T(0.5, 20) should be reasonable, got ${W_50_20}`);

  const dp_20 = dewPoint_C_from_e(e_s_Pa(20) * 0.5);
  console.assert(dp_20 > -50 && dp_20 < 50, `dewPoint_C_from_e at 50% RH should be reasonable, got ${dp_20}`);

  // console.log('Psychrometric math module tests passed (with psychrolib if available)');
}