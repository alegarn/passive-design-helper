/**
 * Psychrometric chart renderer module
 */

import { e_s_Pa, W_from_RH_T, dewPoint_C_from_e, enthalpy_kJkg, wetBulbSolver } from './math.js';
import { CurveCache } from './curveCache.js';
import { ZONES } from '../zones.js';

try { console.debug = console.trace = () => {}; } catch (e) { }

export function createPsychroRenderer(containerEl, options = {}) {
  const opts = { Tmin: 0, Tmax: 50, Wmax: 0.03, p: 101325, samplingN: 200, dprCap: 2.0, rafThrottleThreshold: 500, resizeDebounceMs: 150, canvasEl: null, ...options };
  opts.samplingN = Math.max(100, Math.min(400, opts.samplingN));
  let canvas, offscreenCanvas, ctx, offscreenCtx, width, height, curveCache = new CurveCache(); let resizeTimeout; let rafId; let lastFrameTime = 0; let dataPoints = [];

  function init() {
    if (opts.canvasEl instanceof HTMLCanvasElement) { canvas = opts.canvasEl; if (canvas.parentElement !== containerEl) containerEl.appendChild(canvas); canvas.classList.add('psychro-canvas'); } else { canvas = document.createElement('canvas'); canvas.className = 'psychro-canvas'; containerEl.appendChild(canvas); }
    const dpr = Math.min(window.devicePixelRatio || 1, opts.dprCap); resize(); ctx = canvas.getContext('2d'); if (!ctx) throw new Error('Failed to obtain 2D context from canvas');
    if (typeof OffscreenCanvas !== 'undefined') { offscreenCanvas = new OffscreenCanvas(width * dpr, height * dpr); offscreenCtx = offscreenCanvas.getContext('2d'); } else { offscreenCanvas = document.createElement('canvas'); offscreenCanvas.width = width * dpr; offscreenCanvas.height = height * dpr; offscreenCtx = offscreenCanvas.getContext('2d'); }
    window.addEventListener('resize', handleResize);
    renderBackground();
  }
  function handleResize() { clearTimeout(resizeTimeout); resizeTimeout = setTimeout(() => { resize(); renderBackground(); renderDataPoints(dataPoints); }, opts.resizeDebounceMs); }
  function resize(w, h) { if (w !== undefined && h !== undefined) { width = w; height = h; } else { const rectSource = (canvas && canvas.getBoundingClientRect) ? canvas.getBoundingClientRect() : null; const rectContainer = (containerEl && containerEl.getBoundingClientRect) ? containerEl.getBoundingClientRect() : null; const rect = rectSource && rectSource.width > 0 ? rectSource : rectContainer; width = rect ? rect.width : 300; height = rect ? rect.height : 150; }
    const dpr = Math.min(window.devicePixelRatio || 1, opts.dprCap);
    canvas.width = width * dpr; canvas.height = height * dpr; canvas.style.width = `${width}px`; canvas.style.height = `${height}px`;
    if (ctx) try { ctx.setTransform(1,0,0,1,0,0); } catch (e) {} ctx.scale(dpr, dpr);
    if (offscreenCanvas) { offscreenCanvas.width = width * dpr; offscreenCanvas.height = height * dpr; } if (offscreenCtx) try { offscreenCtx.setTransform(1,0,0,1,0,0); } catch (e) {} offscreenCtx.scale(dpr, dpr);
    curveCache.clear();
  }
  function psychroToCanvas(T, W) { let x = ((T - opts.Tmin) / (opts.Tmax - opts.Tmin)) * width; let y = height - (W / opts.Wmax) * height; if (!isFinite(x) || !isFinite(y)) { }
    x = Math.max(0.5, Math.min(x, width - 0.5)); y = Math.max(0.5, Math.min(y, height - 0.5)); return { x, y };
  }
  function generateConstantTempCurve(T) { const path = new Path2D(); const start = psychroToCanvas(T, 0); path.moveTo(start.x, start.y); const end = psychroToCanvas(T, opts.Wmax); path.lineTo(end.x, end.y); return path; }
  function generateConstantWHumidCurve(W) { const path = new Path2D(); const start = psychroToCanvas(opts.Tmin, W); path.moveTo(start.x, start.y); const end = psychroToCanvas(opts.Tmax, W); path.lineTo(end.x, end.y); return path; }
  function generateConstantRHCureve(RH) { const path = new Path2D(); let firstPoint = true; for (let i = 0; i <= opts.samplingN; i++) { const T = opts.Tmin + (opts.Tmax - opts.Tmin) * (i / opts.samplingN); const W = W_from_RH_T(RH, T, opts.p); const Wclamped = Math.min(W, opts.Wmax * 1.000001); const point = psychroToCanvas(T, Wclamped); if (firstPoint) { path.moveTo(point.x, point.y); firstPoint = false; } else { path.lineTo(point.x, point.y); } } return path; }
  function generateConstantEnthalpyCurve(h) { const path = new Path2D(); let firstPoint = true; for (let i = 0; i <= opts.samplingN; i++) { const T = opts.Tmin + (opts.Tmax - opts.Tmin) * (i / opts.samplingN); const W = (h - 1.006 * T) / (2501 + 1.86 * T); if (W > 0) { const Wclamped = Math.min(W, opts.Wmax * 1.000001); const point = psychroToCanvas(T, Wclamped); if (firstPoint) { path.moveTo(point.x, point.y); firstPoint = false; } else { path.lineTo(point.x, point.y); } } } return path; }
  function renderBackground() {
    if (!offscreenCtx) return;
    offscreenCtx.clearRect(0, 0, width, height);
    try {
      offscreenCtx.save();
      for (const zone of (ZONES || [])) { if (!zone || !zone.poly || zone.poly.length === 0) continue; const path = new Path2D(); let first = true; for (const pt of zone.poly) { const T = Number(pt[0]); const RH = Number(pt[1]); const W = (typeof W_from_RH_T === 'function') ? W_from_RH_T(RH / 100, T, opts.p) : null; const Wclamped = (typeof W === 'number' && Number.isFinite(W)) ? Math.min(W, opts.Wmax * 1.000001) : null; const canvasPt = (Wclamped !== null) ? psychroToCanvas(T, Wclamped) : psychroToCanvas(T, Math.max(0, opts.Wmax * 0.5)); if (first) { path.moveTo(canvasPt.x, canvasPt.y); first = false; } else { path.lineTo(canvasPt.x, canvasPt.y); } } path.closePath(); try { const fillColor = zone.color || 'rgba(200,200,200,0.15)'; offscreenCtx.fillStyle = fillColor; offscreenCtx.globalAlpha = 0.12; offscreenCtx.fill(path); offscreenCtx.globalAlpha = 1.0; offscreenCtx.strokeStyle = zone.color || '#666'; offscreenCtx.lineWidth = 1; offscreenCtx.stroke(path); } catch (e) {} }
      offscreenCtx.restore();
    } catch (e) {}
    offscreenCtx.strokeStyle = '#e0e0e0'; offscreenCtx.lineWidth = 1;
    for (let T = Math.ceil(opts.Tmin/5)*5; T <= opts.Tmax; T += 5) { const curveKey = `temp_${T}`; const path = curveCache.getOrCompute(curveKey, () => generateConstantTempCurve(T)); offscreenCtx.stroke(path); }
    for (let W = 0.005; W <= opts.Wmax; W += 0.005) { const curveKey = `w_${W.toFixed(3)}`; const path = curveCache.getOrCompute(curveKey, () => generateConstantWHumidCurve(W)); offscreenCtx.stroke(path); }
    offscreenCtx.strokeStyle = '#a0a0a0'; for (let RH = 0.1; RH <= 1.0; RH += 0.1) { const curveKey = `rh_${RH.toFixed(1)}`; const path = curveCache.getOrCompute(curveKey, () => generateConstantRHCureve(RH)); offscreenCtx.stroke(path); }
    offscreenCtx.strokeStyle = '#808080'; offscreenCtx.setLineDash([5, 5]); for (let h = 20; h <= 100; h += 10) { const curveKey = `h_${h}`; const path = curveCache.getOrCompute(curveKey, () => generateConstantEnthalpyCurve(h)); offscreenCtx.stroke(path); } offscreenCtx.setLineDash([]);
    offscreenCtx.strokeStyle = '#333'; offscreenCtx.lineWidth = 2; offscreenCtx.strokeRect(0, 0, width, height);
    ctx.clearRect(0, 0, width, height); try { ctx.drawImage(offscreenCanvas, 0, 0, width, height); } catch (e) {}
    drawLabels(ctx);
  }
  function drawLabels(ctx) {
    try { const debugInfo = { dpr: window.devicePixelRatio || 1, width, height, Tmin: opts.Tmin, Tmax: opts.Tmax, Wmax: opts.Wmax }; } catch (e) {}
    const dpr = Math.max(1, window.devicePixelRatio || 1); ctx.save(); const tickFontPx = Math.round(12 * dpr); const titleFontPx = Math.round(14 * dpr); ctx.fillStyle = 'rgba(0,0,0,0.85)'; ctx.strokeStyle = 'white'; ctx.lineWidth = Math.max(2, Math.round(3 * dpr)); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = `${tickFontPx}px sans-serif`;
    for (let T = Math.ceil(opts.Tmin/5)*5; T <= opts.Tmax; T += 5) { const sampleW = Math.min(opts.Wmax, Math.max(1e-6, opts.Wmax * 0.02)); const p = psychroToCanvas(T, sampleW); const labelY = Math.min(height - 8 * dpr, Math.max(8 * dpr, p.y + 10 * dpr)); ctx.lineWidth = Math.max(2, Math.round(3 * dpr)); ctx.strokeText(`${T}°C`, p.x, labelY); ctx.fillText(`${T}°C`, p.x, labelY); }
    ctx.font = `${titleFontPx}px sans-serif`; const titleY = Math.min(height - 4 * dpr, height - 14 * dpr); ctx.strokeText('Temperature (°C)', width / 2, titleY); ctx.fillText('Temperature (°C)', width / 2, titleY);
    ctx.font = `${tickFontPx}px sans-serif`; ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; const wStep = (opts.Wmax - 0) / 8; for (let W = 0; W <= opts.Wmax + 1e-12; W += wStep) { const p = psychroToCanvas(opts.Tmin + (opts.Tmax - opts.Tmin) * 0.02, W); const gx = Math.max(6 * dpr, p.x - 6 * dpr); const label = `${(W * 1000).toFixed(1)} g/kg`; ctx.lineWidth = Math.max(2, Math.round(3 * dpr)); ctx.strokeText(label, gx, p.y); ctx.fillText(label, gx, p.y); }
    ctx.save(); ctx.font = `${titleFontPx}px sans-serif`; ctx.translate(12 * dpr, height / 2); ctx.rotate(-Math.PI / 2); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineWidth = Math.max(2, Math.round(3 * dpr)); ctx.strokeText('Humidity ratio (g/kg)', 0, 0); ctx.fillText('Humidity ratio (g/kg)', 0, 0); ctx.restore(); ctx.font = `${Math.round(11 * dpr)}px sans-serif`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; for (let rh = 0.1; rh < 1.0 + 1e-12; rh += 0.1) { const sampleT = Math.max(opts.Tmin, opts.Tmax - 2); const sampleW = (typeof W_from_RH_T === 'function') ? W_from_RH_T(rh, sampleT, opts.p) : null; if (sampleW === null || !Number.isFinite(sampleW)) continue; const p = psychroToCanvas(sampleT, sampleW); const ox = Math.min(width - 6 * dpr, p.x + 6 * dpr); const label = `${Math.round(rh * 100)}%`; ctx.lineWidth = Math.max(2, Math.round(3 * dpr)); ctx.strokeText(label, ox, p.y); ctx.fillText(label, ox, p.y); }
    ctx.restore();
  }
  function renderDataPoints(points) { dataPoints = points || [];
    try {
      const pointsExceedingWmax = dataPoints.filter(p => p && typeof p.W === 'number' && p.W > opts.Wmax);
      const maxWInPoints = dataDataMaxW(dataPoints);
      const actualMaxW = Math.max(maxWInPoints, pointsExceedingWmax.length > 0 ? Math.max(...pointsExceedingWmax.map(p => p.W)) : 0);
      const targetWmax = Math.max(opts.Wmax, actualMaxW * 1.2);
      if (targetWmax > opts.Wmax) { opts.Wmax = targetWmax; curveCache.clear(); renderBackground(); }
    } catch (e) {}
    try {
      const validTs = dataPoints.filter(p => p && typeof p.T === 'number' && Number.isFinite(p.T)).map(p => p.T);
      if (validTs.length > 0) { const minT = Math.min(...validTs); const maxT = Math.max(...validTs); const marginT = (opts.Tmax - opts.Tmin) * 0.05; const desiredTmin = Math.min(opts.Tmin, minT - marginT); const desiredTmax = Math.max(opts.Tmax, maxT + marginT); if (desiredTmin !== opts.Tmin || desiredTmax !== opts.Tmax) { opts.Tmin = desiredTmin; opts.Tmax = desiredTmax; curveCache.clear(); renderBackground(); } }
    } catch (e) {}
    const useThrottle = dataPoints.length > opts.rafThrottleThreshold; const targetFPS = useThrottle ? 30 : 60; const frameInterval = 1000 / targetFPS;
    const render = (timestamp) => { if (typeof timestamp !== 'number' || !isFinite(timestamp)) timestamp = performance && typeof performance.now === 'function' ? performance.now() : Date.now(); if (timestamp - lastFrameTime >= frameInterval) { ctx.clearRect(0, 0, width, height); try { ctx.drawImage(offscreenCanvas, 0, 0, width, height); } catch(e){ } drawLabels(ctx); ctx.fillStyle = '#ff4444'; dataPoints.forEach((point, i) => { if (!point || typeof point.T !== 'number' || typeof point.W !== 'number') return; if (!Number.isFinite(point.W) || point.W < 0) return; const Wclamped = Math.min(point.W, opts.Wmax * 1.000001); const canvasPoint = psychroToCanvas(point.T, Wclamped); const { x, y } = canvasPoint; const rSafe = (typeof r !== 'undefined' && r > 0) ? r : 2; const fillSafe = (typeof fill !== 'undefined' && fill) ? fill : '#333'; const opacitySafe = (typeof opacity !== 'undefined') ? opacity : 1; const className = 'data-point'; if (canvasPoint.x < -10 || canvasPoint.x > width + 10 || canvasPoint.y < -10 || canvasPoint.y > height + 10) return; ctx.beginPath(); ctx.arc(canvasPoint.x, canvasPoint.y, rSafe, 0, 2 * Math.PI); ctx.fill(); }); lastFrameTime = timestamp; } if (useThrottle) rafId = requestAnimationFrame(render); };
    if (rafId) cancelAnimationFrame(rafId);
    if (useThrottle) rafId = requestAnimationFrame(render); else render(performance && typeof performance.now === 'function' ? performance.now() : Date.now());
  }

  function dataDataMaxW(pointsArr) { if (!pointsArr || pointsArr.length === 0) return 0; let max = 0; for (const pt of pointsArr) { if (!pt || typeof pt.W !== 'number') continue; if (!Number.isFinite(pt.W)) continue; if (pt.W > max) max = pt.W; } return max; }
  function destroy() { if (rafId) cancelAnimationFrame(rafId); window.removeEventListener('resize', handleResize); clearTimeout(resizeTimeout); if (canvas && canvas.parentNode && (!opts.canvasEl || canvas !== opts.canvasEl)) { canvas.parentNode.removeChild(canvas); } curveCache.clear(); }
  return { init, renderBackground, renderDataPoints, resize, destroy };
}
