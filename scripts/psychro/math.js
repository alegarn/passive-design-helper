/**
 * Psychrometric calculations module
 * Implements fundamental psychrometric formulas and calculations
 */

// Optional import for psychrolib (commented out as per requirements)
// import * as psychrolib from 'psychrolib';

/**
 * Saturation vapor pressure using Magnus-Tetens formula
 * @param {number} T_C - Temperature in Celsius
 * @returns {number} Saturation vapor pressure in Pascals
 */
export function e_s_Pa(T_C) {
  // Magnus-Tetens formula for saturation vapor pressure
  // Valid for 0°C to 50°C
  const a = 6.112; // hPa
  const b = 17.62;
  const c = 243.12; // °C
  
  // Convert hPa to Pa (1 hPa = 100 Pa)
  return a * 100 * Math.exp((b * T_C) / (c + T_C));
}

/**
 * Humidity ratio from vapor pressure
 * @param {number} e - Vapor pressure in Pascals
 * @param {number} p - Atmospheric pressure in Pascals (default 101325 Pa)
 * @returns {number} Humidity ratio (kg water/kg dry air)
 */
export function W_from_e(e, p = 101325) {
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
  const e_sat = e_s_Pa(T_C);
  const e = RH * e_sat;
  return W_from_e(e, p);
}

/**
 * Dew point temperature from vapor pressure (inverse Magnus)
 * @param {number} e - Vapor pressure in Pascals
 * @returns {number} Dew point temperature in Celsius
 */
export function dewPoint_C_from_e(e) {
  // Convert Pa to hPa for the formula
  const e_hPa = e / 100;
  
  // Inverse Magnus formula
  const a = 6.112; // hPa
  const b = 17.62;
  const c = 243.12; // °C
  
  // Only valid if e_hPa > 0
  if (e_hPa <= 0) return -273.15; // Absolute zero as fallback
  
  return (c * Math.log(e_hPa / a)) / (b - Math.log(e_hPa / a));
}

/**
 * Specific enthalpy of moist air
 * @param {number} T_C - Dry bulb temperature in Celsius
 * @param {number} W - Humidity ratio (kg water/kg dry air)
 * @returns {number} Specific enthalpy in kJ/kg dry air
 */
export function enthalpy_kJkg(T_C, W) {
  // h = 1.006*T + W*(2501 + 1.86*T)
  return 1.006 * T_C + W * (2501 + 1.86 * T_C);
}

/**
 * Wet bulb temperature solver using bisection method
 * @param {number} T_C - Dry bulb temperature in Celsius
 * @param {number} RH - Relative humidity (0-1)
 * @param {number} p - Atmospheric pressure in Pascals (default 101325 Pa)
 * @param {number} tolerance - Convergence tolerance (default 0.001°C)
 * @param {number} maxIterations - Maximum iterations (default 100)
 * @returns {number} Wet bulb temperature in Celsius
 */
export function wetBulbSolver(T_C, RH, p = 101325, tolerance = 0.001, maxIterations = 100) {
  // Initial bounds for wet bulb temperature
  let T_wb_min = -20; // °C
  let T_wb_max = Math.max(T_C, 50); // Can't be higher than dry bulb or 50°C
  
  // Target humidity ratio
  const W_target = W_from_RH_T(RH, T_C, p);
  
  // Bisection method
  for (let i = 0; i < maxIterations; i++) {
    const T_wb_mid = (T_wb_min + T_wb_max) / 2;
    
    // Calculate humidity ratio at wet bulb conditions (100% RH)
    const W_wb = W_from_RH_T(1.0, T_wb_mid, p);
    
    // Calculate enthalpy at wet bulb conditions
    const h_wb = enthalpy_kJkg(T_wb_mid, W_wb);
    
    // Calculate enthalpy at actual conditions
    const h_actual = enthalpy_kJkg(T_C, W_target);
    
    // Check convergence
    if (Math.abs(h_wb - h_actual) < tolerance) {
      return T_wb_mid;
    }
    
    // Adjust bounds
    if (h_wb > h_actual) {
      T_wb_max = T_wb_mid;
    } else {
      T_wb_min = T_wb_mid;
    }
    
    // Check if bounds are too close
    if (T_wb_max - T_wb_min < tolerance) {
      return (T_wb_min + T_wb_max) / 2;
    }
  }
  
  // Return best estimate if convergence not achieved
  return (T_wb_min + T_wb_max) / 2;
}

// Development-only basic assertions
if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
  // Test e_s_Pa at 20°C should be approximately 2338 Pa
  const e_20 = e_s_Pa(20);
  console.assert(Math.abs(e_20 - 2338) < 50, `e_s_Pa(20) ≈ 2338 Pa, got ${e_20}`);
  
  // Test enthalpy calculation
  const h_20_01 = enthalpy_kJkg(20, 0.01);
  console.assert(h_20_01 > 20 && h_20_01 < 50, `enthalpy_kJkg(20, 0.01) should be reasonable, got ${h_20_01}`);
  
  // Test humidity ratio calculations
  const W_50_20 = W_from_RH_T(0.5, 20);
  console.assert(W_50_20 > 0 && W_50_20 < 0.02, `W_from_RH_T(0.5, 20) should be reasonable, got ${W_50_20}`);
  
  // Test dew point calculation
  const dp_20 = dewPoint_C_from_e(e_s_Pa(20) * 0.5);
  console.assert(dp_20 > 0 && dp_20 < 20, `dewPoint_C_from_e at 50% RH should be between 0 and 20°C, got ${dp_20}`);
  
  console.log('Psychrometric math module tests passed');
}