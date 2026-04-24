/**
 * Psychrometric chart renderer module (web)
 * Canvas2D implementation with offscreen rendering and curve caching
 * Derived from canonical renderer with drawLabels adapted for responsive small screens
 */

/* eslint-env browser */
import { W_from_RH_T } from './math.js';
import { CurveCache } from './curveCache.js';
import { ZONES as BASE_ZONES } from '../zones.js';

// Silence verbose renderer debug logs (non-destructive)
try {
  // In some hosted environments a console may be readonly — ensure we disable verbose logs safely
  console.debug = console.trace = () => {};
} catch (err) { if (typeof console !== 'undefined' && typeof console.warn === 'function') console.warn('Unable to set console.handlers', err); }

const SHORT_LABELS = {
  'Comfort': 'COMFORT\nZONE',
  'Ventilation': 'NATURAL\nVENTILATION',
  'Humidification': 'HUMIDIFICATION',
  'Heating': 'HEATING',
  'Active Solar Heating': 'ACTIVE\nSOLAR',
  'Passive Solar Heating': 'PASSIVE SOLAR\nHEATING',
  'Internal Gains': 'INTERNAL\nGAINS',
  'Mass Cooling': 'MASS\nCOOLING',
  'Evaporative Cooling': 'EVAPORATIVE COOLING',
  'Mass Cooling & Night Ventilation (or AC)': 'MASS COOLING &\nNIGHT VENTILATION',
  'Air Conditioning + Dehumidifier': 'AIR-CONDITIONING &\nDEHUMIDIFICATION',
  'Air Conditioning': 'AIR-\nCONDITIONING',
};

const ROTATED_ZONES = {
  'Ventilation': 60,
  'Natural Ventilation': 60,
  'Heating': 90,
  'Active Solar Heating': 90,
  'Passive Solar Heating': 90,
  'Internal Gains': 90,
};

export function createPsychroRenderer(containerEl, options = {}) {
  const opts = {
    Tmin: 0,
    Tmax: 50,
    Wmax: 0.03,
    p: 101325,
    samplingN: 200,
    dprCap: 2.0,
    rafThrottleThreshold: 500,
    resizeDebounceMs: 150,
    canvasEl: null,
    ...options
  };

  opts.samplingN = Math.max(100, Math.min(400, opts.samplingN));

  let canvas, offscreenCanvas, ctx, offscreenCtx;
  let width = 300, height = 150;
  let curveCache = new CurveCache();
  let currentZones = opts.zones || BASE_ZONES;
  let resizeTimeout;
  let rafId;
  let lastFrameTime = 0;
  let dataPoints = [];
  let padLeft = 48, padRight = 30, padTop = 6, padBottom = 24;
  // ── Dev-only annotation module ─────────────────────────────────────────────
  // _devAnnotations is per-renderer so each instance triggers its own re-render
  // after the async load. Vite dead-code-eliminates all DEV branches in prod.
  let _devAnnotations = null;

  function computePadding() {
    const baseWidth = 420, baseHeight = 300;
    const sizeScale = Math.max(0.45, Math.min(1.0, Math.min(width / baseWidth, height / baseHeight)));
    padLeft   = Math.round(Math.max(40, 52 * sizeScale));
    padRight  = Math.round(Math.max(28, 34 * sizeScale));
    padTop    = Math.round(Math.max(4,   8 * sizeScale));
    padBottom = Math.round(Math.max(28, 36 * sizeScale));
    return sizeScale;
  }

  function init() {
    if (opts.canvasEl instanceof HTMLCanvasElement) {
      canvas = opts.canvasEl;
      if (canvas.parentElement !== containerEl) containerEl.appendChild(canvas);
      canvas.classList.add('psychro-canvas');
    } else {
      canvas = document.createElement('canvas');
      canvas.className = 'psychro-canvas';
      containerEl.appendChild(canvas);
    }

    const dpr = Math.min((typeof window !== 'undefined' && window.devicePixelRatio) ? window.devicePixelRatio : 1, opts.dprCap);

    ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Failed to obtain 2D context from canvas');

    resize();
    if (typeof OffscreenCanvas !== 'undefined') {
      offscreenCanvas = new OffscreenCanvas(width * dpr, height * dpr);
      offscreenCtx = offscreenCanvas.getContext('2d');
    } else {
      offscreenCanvas = document.createElement('canvas');
      offscreenCanvas.width = width * dpr;
      offscreenCanvas.height = height * dpr;
      offscreenCtx = offscreenCanvas.getContext('2d');
    }

    window.addEventListener('resize', handleResize);
    renderBackground();
    // Dev-only: load annotation module then re-render so labels appear even
    // before any data is loaded (renderBackground already ran above without labels).
    if (import.meta.env.DEV) {
      import('./dev-annotations.js').then(m => { _devAnnotations = m; renderBackground(); });
    }
  }

  function handleResize() {
    if (typeof clearTimeout === 'function') clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
      resize();
      renderBackground();
      renderDataPoints(dataPoints);
    }, opts.resizeDebounceMs);
  }

  function resize(w, h) {
    if (w !== undefined && h !== undefined) { width = w; height = h; }
    else {
      const rectSource = (canvas && canvas.getBoundingClientRect) ? canvas.getBoundingClientRect() : null;
      const rectContainer = (containerEl && containerEl.getBoundingClientRect) ? containerEl.getBoundingClientRect() : null;
      const rect = rectSource && rectSource.width > 0 ? rectSource : rectContainer;
      width = rect ? rect.width : 300;
      height = rect ? rect.height : 150;
    }

    const dpr = Math.min((typeof window !== 'undefined' && window.devicePixelRatio) ? window.devicePixelRatio : 1, opts.dprCap);

    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    if (ctx) {
      try { ctx.setTransform(1, 0, 0, 1, 0, 0); } catch (err) { if (typeof console !== 'undefined' && typeof console.debug === 'function') console.debug('ctx.setTransform not available', err); }
      ctx.scale(dpr, dpr);
    }
    if (offscreenCanvas) { offscreenCanvas.width = width * dpr; offscreenCanvas.height = height * dpr; }
    if (offscreenCtx) { try { offscreenCtx.setTransform(1, 0, 0, 1, 0, 0); } catch (err) { if (typeof console !== 'undefined' && typeof console.debug === 'function') console.debug('offscreenCtx.setTransform not available', err); } offscreenCtx.scale(dpr, dpr); }
    curveCache.clear();
  }

  function psychroToCanvas(T, W) {
    const plotW = width - padLeft - padRight;
    const plotH = height - padTop - padBottom;
    let x = padLeft + ((T - opts.Tmin) / (opts.Tmax - opts.Tmin)) * plotW;
    let y = padTop + plotH - (W / opts.Wmax) * plotH;
    x = Math.max(padLeft + 0.5, Math.min(x, padLeft + plotW - 0.5));
    y = Math.max(padTop + 0.5, Math.min(y, padTop + plotH - 0.5));
    return { x, y };
  }

  function generateConstantTempCurve(T) {
    const path = new Path2D();
    const start = psychroToCanvas(T, 0);
    path.moveTo(start.x, start.y);
    const end = psychroToCanvas(T, opts.Wmax);
    path.lineTo(end.x, end.y);
    return path;
  }
  function generateConstantWHumidCurve(W) {
    const path = new Path2D();
    const start = psychroToCanvas(opts.Tmin, W);
    path.moveTo(start.x, start.y);
    const end = psychroToCanvas(opts.Tmax, W);
    path.lineTo(end.x, end.y);
    return path;
  }
  function generateConstantRHCureve(RH) {
    const path = new Path2D();
    let firstPoint = true;
    for (let i = 0; i <= opts.samplingN; i++) {
      const T = opts.Tmin + (opts.Tmax - opts.Tmin) * (i / opts.samplingN);
      const W = W_from_RH_T(RH, T, opts.p);
      const Wclamped = Math.min(W, opts.Wmax * 1.000001);
      const point = psychroToCanvas(T, Wclamped);
      if (firstPoint) { path.moveTo(point.x, point.y); firstPoint = false; } else { path.lineTo(point.x, point.y); }
    }
    return path;
  }
  function generateConstantEnthalpyCurve(h) {
    const path = new Path2D();
    let firstPoint = true;
    for (let i = 0; i <= opts.samplingN; i++) {
      const T = opts.Tmin + (opts.Tmax - opts.Tmin) * (i / opts.samplingN);
      const W = (h - 1.006 * T) / (2501 + 1.86 * T);
      if (W > 0) {
        const Wclamped = Math.min(W, opts.Wmax * 1.000001);
        const point = psychroToCanvas(T, Wclamped);
        if (firstPoint) { path.moveTo(point.x, point.y); firstPoint = false; } else { path.lineTo(point.x, point.y); }
      }
    }
    return path;
  }

  function renderBackground() {
    if (!offscreenCtx) return;
    computePadding();
    offscreenCtx.clearRect(0, 0, width, height);
    try {
      offscreenCtx.save();
      for (const zone of (currentZones || [])) {
        if (!zone || !zone.poly || zone.poly.length === 0) continue;
        const path = new Path2D();
        let first = true;
        
        // Helper to interpolate between two points if RH is constant
        const interpolateEdge = (pt1, pt2) => {
          const [T1, RH1] = pt1;
          const [T2, RH2] = pt2;
          
          // Draw straight line if RH is different, or if very small segment
          if (Math.abs(RH1 - RH2) > 0.01 || Math.abs(T1 - T2) < 0.5) {
            const W = (typeof W_from_RH_T === 'function') ? W_from_RH_T(RH2 / 100, T2, opts.p) : null; 
            const Wclamped = (typeof W === 'number' && Number.isFinite(W)) ? Math.min(W, opts.Wmax * 1.000001) : null; 
            const canvasPt = (Wclamped !== null) ? psychroToCanvas(T2, Wclamped) : psychroToCanvas(T2, Math.max(0, opts.Wmax * 0.5)); 
            path.lineTo(canvasPt.x, canvasPt.y);
            return;
          }
          
          // Interpolate constant RH curve
          const steps = Math.max(2, Math.ceil(Math.abs(T2 - T1) * 2)); // ~2 steps per °C
          for (let i = 1; i <= steps; i++) {
            const tInterp = T1 + (T2 - T1) * (i / steps);
            const W = (typeof W_from_RH_T === 'function') ? W_from_RH_T(RH2 / 100, tInterp, opts.p) : null; 
            const Wclamped = (typeof W === 'number' && Number.isFinite(W)) ? Math.min(W, opts.Wmax * 1.000001) : null; 
            const canvasPt = (Wclamped !== null) ? psychroToCanvas(tInterp, Wclamped) : psychroToCanvas(tInterp, Math.max(0, opts.Wmax * 0.5)); 
            path.lineTo(canvasPt.x, canvasPt.y);
          }
        };

        for (let i = 0; i < zone.poly.length; i++) {
          const pt = zone.poly[i];
          const T = Number(pt[0]); const RH = Number(pt[1]); 
          
          if (first) { 
            const W = (typeof W_from_RH_T === 'function') ? W_from_RH_T(RH / 100, T, opts.p) : null; 
            const Wclamped = (typeof W === 'number' && Number.isFinite(W)) ? Math.min(W, opts.Wmax * 1.000001) : null; 
            const canvasPt = (Wclamped !== null) ? psychroToCanvas(T, Wclamped) : psychroToCanvas(T, Math.max(0, opts.Wmax * 0.5)); 
            path.moveTo(canvasPt.x, canvasPt.y); 
            first = false; 
          } else { 
            interpolateEdge(zone.poly[i-1], pt);
          } 
        }
        
        // Close polygon properly by checking connection to first point
        if (zone.poly.length > 2) {
          interpolateEdge(zone.poly[zone.poly.length - 1], zone.poly[0]);
        }
        
        path.closePath();
        try { const fillColor = zone.color || 'rgba(200,200,200,0.15)'; offscreenCtx.fillStyle = fillColor; offscreenCtx.globalAlpha = 0.12; offscreenCtx.fill(path); offscreenCtx.globalAlpha = 1.0; offscreenCtx.strokeStyle = zone.color || '#666'; offscreenCtx.lineWidth = 1; offscreenCtx.stroke(path); } catch (err) { if (typeof console !== 'undefined' && typeof console.debug === 'function') console.debug('Failed to draw zone poly', err); }
      }
      offscreenCtx.restore();
    } catch (err) { if (typeof console !== 'undefined' && typeof console.debug === 'function') console.debug('renderBackground failed', err); }

    // Dotted T° vertical grid lines
    offscreenCtx.strokeStyle = '#c8c8c8'; offscreenCtx.lineWidth = 1; offscreenCtx.setLineDash([3, 5]);
    for (let T = Math.ceil(opts.Tmin); T <= opts.Tmax; T += 5) { const curveKey = `temp_${T}`; const path = curveCache.getOrCompute(curveKey, () => generateConstantTempCurve(T)); offscreenCtx.stroke(path); }
    // Dotted humidity horizontal grid lines
    for (let W = 0.005; W <= opts.Wmax; W += 0.005) { const curveKey = `w_${W.toFixed(3)}`; const path = curveCache.getOrCompute(curveKey, () => generateConstantWHumidCurve(W)); offscreenCtx.stroke(path); }
    offscreenCtx.setLineDash([]);
    offscreenCtx.strokeStyle = '#a0a0a0'; for (let RH = 0.1; RH <= 1.0; RH += 0.1) { const curveKey = `rh_${RH.toFixed(1)}`; const path = curveCache.getOrCompute(curveKey, () => generateConstantRHCureve(RH)); offscreenCtx.stroke(path); }
    offscreenCtx.strokeStyle = '#808080'; offscreenCtx.setLineDash([5, 5]); for (let h = 20; h <= 100; h += 10) { const curveKey = `h_${h}`; const path = curveCache.getOrCompute(curveKey, () => generateConstantEnthalpyCurve(h)); offscreenCtx.stroke(path); } offscreenCtx.setLineDash([]);
    // Border around the plot area only
    offscreenCtx.strokeStyle = '#333'; offscreenCtx.lineWidth = 2; offscreenCtx.strokeRect(padLeft, padTop, width - padLeft - padRight, height - padTop - padBottom);
    ctx.clearRect(0, 0, width, height); try { ctx.drawImage(offscreenCanvas, 0, 0, width, height); } catch (err) { if (typeof console !== 'undefined' && typeof console.debug === 'function') console.debug('drawImage offscreen failed', err); }
    drawLabels(ctx);
    drawZoneLabels(ctx);
    // Dev-only: draw vertex names for every zone polygon
    if (import.meta.env.DEV && _devAnnotations) {
      _devAnnotations.drawPointLabels(ctx, currentZones, psychroToCanvas, opts.p);
    }
  }

  function setZones(newZones) {
    currentZones = newZones || BASE_ZONES;
    curveCache.clear();
    renderBackground();
  }

  function drawLabels(ctx) {
    const baseWidth = 420, baseHeight = 300;
    const sizeScale = Math.max(0.45, Math.min(1.0, Math.min(width / baseWidth, height / baseHeight)));
    computePadding();
    const plotW = width - padLeft - padRight;
    const plotH = height - padTop - padBottom;

    ctx.save();
    const tickFontPx = Math.max(8, Math.round(10 * sizeScale));
    const titleFontPx = Math.max(10, Math.round(13 * sizeScale));
    const tickLen = Math.round(4 * sizeScale);
    const lw = Math.max(1, Math.round(1 * sizeScale));
    ctx.lineWidth = lw;

    // --- Temperature axis (x axis, below plot) ---
    const tempStep = width < 320 ? 10 : 5;
    ctx.font = `${tickFontPx}px sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    for (let T = Math.ceil(opts.Tmin / tempStep) * tempStep; T <= opts.Tmax; T += tempStep) {
      const x = padLeft + ((T - opts.Tmin) / (opts.Tmax - opts.Tmin)) * plotW;
      const y0 = padTop + plotH;
      ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x, y0 + tickLen); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = lw; ctx.strokeText(`${T}°C`, x, y0 + tickLen + 1);
      ctx.fillStyle = 'rgba(0,0,0,0.75)'; ctx.fillText(`${T}°C`, x, y0 + tickLen + 1);
    }

    // Temperature axis title
    ctx.font = `${titleFontPx}px sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    const titleText = width < 300 ? 'Temp (°C)' : 'Temperature (°C)';
    ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.strokeText(titleText, padLeft + plotW / 2, height - 2);
    ctx.fillStyle = 'rgba(0,0,0,0.75)'; ctx.fillText(titleText, padLeft + plotW / 2, height - 2);

    // --- Humidity ratio axis (y axis, left of plot) ---
    const maxWTicks = plotH < 200 ? 4 : 6;
    const wStep = opts.Wmax / maxWTicks;
    ctx.font = `${tickFontPx}px sans-serif`;
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    for (let W = 0; W <= opts.Wmax + 1e-12; W += wStep) {
      const y = padTop + plotH - (W / opts.Wmax) * plotH;
      ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.moveTo(padLeft, y); ctx.lineTo(padLeft - tickLen, y); ctx.stroke();
      const label = `${(W * 1000).toFixed(1)}`;
      ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = lw; ctx.strokeText(label, padLeft - tickLen - 2, y);
      ctx.fillStyle = 'rgba(0,0,0,0.75)'; ctx.fillText(label, padLeft - tickLen - 2, y);
    }
    // Unit header for W axis
    ctx.font = `${Math.max(7, Math.round(9 * sizeScale))}px sans-serif`;
    ctx.textAlign = 'right'; ctx.textBaseline = 'top';
    ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillText('g/kg', padLeft - tickLen - 2, padTop);

    // Humidity ratio axis title (rotated, in left margin)
    ctx.save();
    ctx.font = `${titleFontPx}px sans-serif`;
    ctx.translate(Math.round(11 * sizeScale), padTop + plotH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.strokeText('Humidity ratio (g/kg)', 0, 0);
    ctx.fillStyle = 'rgba(0,0,0,0.75)'; ctx.fillText('Humidity ratio (g/kg)', 0, 0);
    ctx.restore();

    // --- RH% labels (right of plot, in right margin) ---
    ctx.font = `${Math.max(8, Math.round(10 * sizeScale))}px sans-serif`;
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    const rhStep = width < 360 ? 0.2 : 0.1;
    for (let rh = 0.1; rh <= 1.0 + 1e-12; rh += rhStep) {
      const sampleW = (typeof W_from_RH_T === 'function') ? W_from_RH_T(rh, opts.Tmax, opts.p) : null;
      if (sampleW === null || !Number.isFinite(sampleW) || sampleW < 0) continue;
      const Wclamped = Math.min(sampleW, opts.Wmax);
      const y = padTop + plotH - (Wclamped / opts.Wmax) * plotH;
      if (y < padTop - 2 || y > padTop + plotH + 2) continue;
      ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = lw; ctx.strokeText(`${Math.round(rh * 100)}%`, padLeft + plotW + 3, y);
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillText(`${Math.round(rh * 100)}%`, padLeft + plotW + 3, y);
    }

    ctx.restore();
  }

  function drawZoneLabels(ctx) {
    if (!currentZones || currentZones.length === 0) return;
    const baseWidth = 420;
    const baseHeight = 300;
    const sizeScale = Math.max(0.45, Math.min(1.0, Math.min(width / baseWidth, height / baseHeight)));
    const fontPx = Math.max(7, Math.round(9 * sizeScale));
    const lineHeight = fontPx * 1.25;

    for (const zone of currentZones) {
      if (!zone || !zone.poly || zone.poly.length < 3) continue;

      // Compute centroid in canvas coords
      let cx = 0, cy = 0, count = 0;
      for (const pt of zone.poly) {
        const T = Number(pt[0]);
        const RH = Number(pt[1]);
        const W = (typeof W_from_RH_T === 'function') ? W_from_RH_T(RH / 100, T, opts.p) : null;
        if (W === null || !Number.isFinite(W)) continue;
        const Wclamped = Math.min(W, opts.Wmax * 1.000001);
        const cp = psychroToCanvas(T, Wclamped);
        cx += cp.x;
        cy += cp.y;
        count++;
      }
      if (count === 0) continue;
      cx /= count;
      cy /= count;

      // Skip if centroid is outside visible canvas
      if (cx < 0 || cx > width || cy < 0 || cy > height) continue;

      const label = SHORT_LABELS[zone.id] || zone.id.toUpperCase();
      const lines = label.split('\n');
      const rotation = ROTATED_ZONES[zone.id] || 0;
      const rotRad = rotation * Math.PI / 180;

      // Parse zone color and apply higher opacity
      let fillColor = zone.color || 'rgba(100,100,100,0.8)';
      try {
        const m = fillColor.match(/rgba?\(([^)]+)\)/);
        if (m) {
          const parts = m[1].split(',').map(s => s.trim());
          fillColor = `rgba(${parts[0]}, ${parts[1]}, ${parts[2]}, 0.75)`;
        }
      } catch (_) { /* use as-is */ }

      ctx.save();
      ctx.font = `bold ${fontPx}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = fillColor;
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.lineWidth = Math.max(1, Math.round(1.5 * sizeScale));
      ctx.lineJoin = 'round';

      ctx.translate(cx, cy);
      if (rotRad !== 0) ctx.rotate(-rotRad);

      const totalHeight = lines.length * lineHeight;
      const startY = -(totalHeight - lineHeight) / 2;

      for (let i = 0; i < lines.length; i++) {
        const ly = startY + i * lineHeight;
        ctx.strokeText(lines[i], 0, ly);
        ctx.fillText(lines[i], 0, ly);
      }

      ctx.restore();
    }
  }

  function renderDataPoints(points) {
    dataPoints = points || [];
    try {
      const pointsExceedingWmax = dataPoints.filter(p => p && typeof p.W === 'number' && p.W > opts.Wmax);
      const maxWInPoints = dataDataMaxW(dataPoints);
      const actualMaxW = Math.max(maxWInPoints, pointsExceedingWmax.length > 0 ? Math.max(...pointsExceedingWmax.map(p => p.W)) : 0);
      const targetWmax = Math.max(opts.Wmax, actualMaxW * 1.2);
      if (targetWmax > opts.Wmax) { opts.Wmax = targetWmax; curveCache.clear(); renderBackground(); }
    } catch (err) { if (typeof console !== 'undefined' && typeof console.debug === 'function') console.debug('renderDataPoints failed', err); }
    try {
      const validTs = dataPoints.filter(p => p && typeof p.T === 'number' && Number.isFinite(p.T)).map(p => p.T);
      if (validTs.length > 0) {
        const minT = Math.min(...validTs);
        const maxT = Math.max(...validTs);
        const marginT = (opts.Tmax - opts.Tmin) * 0.05;
        const desiredTmin = Math.min(opts.Tmin, minT - marginT);
        const desiredTmax = Math.max(opts.Tmax, maxT + marginT);
        if (desiredTmin !== opts.Tmin || desiredTmax !== opts.Tmax) { opts.Tmin = desiredTmin; opts.Tmax = desiredTmax; curveCache.clear(); renderBackground(); }
      }
    } catch (err) { if (typeof console !== 'undefined' && typeof console.debug === 'function') console.debug('renderDataPoints bounds calc failed', err); }
    const useThrottle = dataPoints.length > opts.rafThrottleThreshold;
    const targetFPS = useThrottle ? 30 : 60;
    const frameInterval = 1000 / targetFPS;
    const render = (timestamp) => {
      if (typeof timestamp !== 'number' || !isFinite(timestamp)) timestamp = (typeof performance !== 'undefined' && typeof performance.now === 'function') ? performance.now() : Date.now();
      if (timestamp - lastFrameTime >= frameInterval) {
        ctx.clearRect(0, 0, width, height);
        try { ctx.drawImage(offscreenCanvas, 0, 0, width, height); } catch (err) { if (typeof console !== 'undefined' && typeof console.debug === 'function') console.debug('ctx.drawImage failed', err); }
        drawLabels(ctx);
        drawZoneLabels(ctx);
        // Dev-only: vertex point labels redrawn every frame so data dots don't overwrite them
        if (import.meta.env.DEV && _devAnnotations) {
          _devAnnotations.drawPointLabels(ctx, currentZones, psychroToCanvas, opts.p);
        }
        ctx.fillStyle = '#ff4444';
        dataPoints.forEach((point, i) => {
          if (!point || typeof point.T !== 'number' || typeof point.W !== 'number') return;
          if (!Number.isFinite(point.W) || point.W < 0) return;
          const Wclamped = Math.min(point.W, opts.Wmax * 1.000001);
          const canvasPoint = psychroToCanvas(point.T, Wclamped);
          const { x, y } = canvasPoint;
          const rSafe = 2;
          if (x < -10 || x > width + 10 || y < -10 || y > height + 10) return;
          ctx.beginPath(); ctx.arc(x, y, rSafe, 0, 2 * Math.PI); ctx.fill();
        });
        lastFrameTime = timestamp;
      }
      if (useThrottle) rafId = (typeof requestAnimationFrame === 'function') ? requestAnimationFrame(render) : setTimeout(() => render(Date.now()), 1000 / 30);
    };
    if (rafId) { if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(rafId); else clearTimeout(rafId); }
    if (useThrottle) rafId = (typeof requestAnimationFrame === 'function') ? requestAnimationFrame(render) : setTimeout(() => render(Date.now()), 1000 / 30); else render((typeof performance !== 'undefined' && typeof performance.now === 'function') ? performance.now() : Date.now());
  }

  function dataDataMaxW(pointsArr) { if (!pointsArr || pointsArr.length === 0) return 0; let max = 0; for (const pt of pointsArr) { if (!pt || typeof pt.W !== 'number') continue; if (!Number.isFinite(pt.W)) continue; if (pt.W > max) max = pt.W; } return max; }

  function destroy() {
    if (rafId) { if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(rafId); else clearTimeout(rafId); }
    if (typeof window !== 'undefined' && window.removeEventListener) window.removeEventListener('resize', handleResize);
    if (typeof clearTimeout === 'function') clearTimeout(resizeTimeout);
    if (canvas && canvas.parentNode && (!opts.canvasEl || canvas !== opts.canvasEl)) { canvas.parentNode.removeChild(canvas); }
    curveCache.clear();
  }

  return { init, renderBackground, renderDataPoints, resize, destroy, setZones };
};
