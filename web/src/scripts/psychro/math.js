// Psychrometric calculations module
let psychrolib = null;
(async () => {
  try {
    const mod = await import('psychrolib');
    psychrolib = mod.default || mod;
    if (psychrolib && typeof psychrolib.SetUnitSystem === 'function' && psychrolib.SI) {
      try { psychrolib.SetUnitSystem(psychrolib.SI); } catch (e) { /* ignore */ }
    }
  } catch (e) { psychrolib = null; }
})();

export function e_s_Pa(T_C) {
  if (psychrolib) {
    if (typeof psychrolib.GetSatVapPres === 'function') return psychrolib.GetSatVapPres(T_C);
    if (typeof psychrolib.GetSatVapPres_T === 'function') return psychrolib.GetSatVapPres_T(T_C);
  }
  const a = 6.112; const b = 17.62; const c = 243.12;
  return a * 100 * Math.exp((b * T_C) / (c + T_C));
}

export function W_from_e(e, p = 101325) {
  if (psychrolib) {
    if (typeof psychrolib.GetHumRatioFromVapPres === 'function') return psychrolib.GetHumRatioFromVapPres(e, p);
    if (typeof psychrolib.GetHumRatioFromVapPres_Pa === 'function') return psychrolib.GetHumRatioFromVapPres_Pa(e, p);
  }
  return 0.622 * e / (p - e);
}

export function W_from_RH_T(RH, T_C, p = 101325) {
  if (psychrolib) {
    if (typeof psychrolib.GetHumRatioFromRelHum === 'function') return psychrolib.GetHumRatioFromRelHum(T_C, RH, p);
    if (typeof psychrolib.GetHumRatioFromRelHum_T === 'function') return psychrolib.GetHumRatioFromRelHum_T(T_C, RH, p);
  }
  const e_sat = e_s_Pa(T_C); const e = RH * e_sat; return W_from_e(e, p);
}

export function dewPoint_C_from_e(e) {
  if (psychrolib) {
    if (typeof psychrolib.GetTDewPointFromVapPres === 'function') return psychrolib.GetTDewPointFromVapPres(e);
    if (typeof psychrolib.GetTDewPointFromVapPres_Pa === 'function') return psychrolib.GetTDewPointFromVapPres_Pa(e);
  }
  const e_hPa = e / 100;
  const a = 6.112; const b = 17.62; const c = 243.12;
  if (e_hPa <= 0) return -273.15;
  return (c * Math.log(e_hPa / a)) / (b - Math.log(e_hPa / a));
}

export function enthalpy_kJkg(T_C, W) {
  if (psychrolib && typeof psychrolib.GetMoistAirEnthalpy === 'function') return psychrolib.GetMoistAirEnthalpy(T_C, W) / 1000;
  return 1.006 * T_C + W * (2501 + 1.86 * T_C);
}

export function wetBulbSolver(T_C, RH, p = 101325, tolerance = 0.001, maxIterations = 100) {
  if (psychrolib) {
    if (typeof psychrolib.GetTWetBulbFromRelHum === 'function') return psychrolib.GetTWetBulbFromRelHum(T_C, RH, p);
    if (typeof psychrolib.GetTWetBulbFromHumRatio === 'function') { const W = W_from_RH_T(RH, T_C, p); return psychrolib.GetTWetBulbFromHumRatio(T_C, W, p); }
  }
  let T_wb_min = -20; let T_wb_max = Math.max(T_C, 50); const W_target = W_from_RH_T(RH, T_C, p);
  for (let i = 0; i < maxIterations; i++) {
    const T_wb_mid = (T_wb_min + T_wb_max) / 2; const W_wb = W_from_RH_T(1.0, T_wb_mid, p); const h_wb = enthalpy_kJkg(T_wb_mid, W_wb); const h_actual = enthalpy_kJkg(T_C, W_target);
    if (Math.abs(h_wb - h_actual) < tolerance) return T_wb_mid;
    if (h_wb > h_actual) T_wb_max = T_wb_mid; else T_wb_min = T_wb_mid;
    if (T_wb_max - T_wb_min < tolerance) return (T_wb_min + T_wb_max) / 2;
  }
  return (T_wb_min + T_wb_max) / 2;
}
