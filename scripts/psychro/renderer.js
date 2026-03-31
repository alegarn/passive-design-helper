/**
 * Psychrometric chart renderer module
 * Canvas2D implementation with offscreen rendering and curve caching
 */

import { e_s_Pa, W_from_RH_T, dewPoint_C_from_e, enthalpy_kJkg, wetBulbSolver } from './math.js';
import { CurveCache } from './curveCache.js';
import { ZONES } from '../zones.js';

// Silence verbose renderer debug logs (non-destructive)
try {
  console.debug = console.trace = () => {};
} catch (e) { /* ignore if console is read-only */ }

/**
 * Create a psychrometric chart renderer
 * @param {HTMLElement} containerEl - Container element for the chart
 * @param {Object} options - Configuration options
 * @returns {Object} Renderer instance with methods
 */
export function createPsychroRenderer(containerEl, options = {}) {
  // Default options
  const opts = {
    Tmin: 0,
    Tmax: 50,
    Wmax: 0.03,
    p: 101325,
    samplingN: 200,
    dprCap: 2.0,
    rafThrottleThreshold: 500,
    resizeDebounceMs: 150,
    // allow passing an existing canvas element (Svelte bound) to avoid creating a new one
    canvasEl: null,
    ...options
  };

  // Validate samplingN range
  opts.samplingN = Math.max(100, Math.min(400, opts.samplingN));

  // State
  let canvas, offscreenCanvas, ctx, offscreenCtx;
  let width, height;
  let curveCache = new CurveCache();
  let resizeTimeout;
  let rafId;
  let lastFrameTime = 0;
  let dataPoints = [];

  /**
   * Initialize renderer and create canvases
   */
  function init() {
    // Use passed-in canvasEl if provided, otherwise create main canvas
    if (opts.canvasEl instanceof HTMLCanvasElement) {
      canvas = opts.canvasEl;
      // If canvas not inside container, append it
      if (canvas.parentElement !== containerEl) {
        containerEl.appendChild(canvas);
      }
      canvas.classList.add('psychro-canvas');
    } else {
      // Create main canvas
      canvas = document.createElement('canvas');
      canvas.className = 'psychro-canvas';
      containerEl.appendChild(canvas);
    }

    // debug: log canvas insertion and computed style
    try {
      /* console.debug('psychro:init canvas appended', {
        containerRect: containerEl.getBoundingClientRect ? containerEl.getBoundingClientRect() : null,
        canvasClass: canvas.className,
        canvasStyle: window.getComputedStyle ? window.getComputedStyle(canvas) : null
      }); */
    } catch (e) {
      // console.debug('psychro:init debug failed', e);
    }

    // Get DPR (device pixel ratio) with cap
    const dpr = Math.min(window.devicePixelRatio || 1, opts.dprCap);

    // Get contexts early so that resize can scale them
    ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Failed to obtain 2D context from canvas');
    }

    // Set initial size
    resize();

    // Create offscreen canvas
    if (typeof OffscreenCanvas !== 'undefined') {
      offscreenCanvas = new OffscreenCanvas(width * dpr, height * dpr);
      offscreenCtx = offscreenCanvas.getContext('2d');
    } else {
      // Fallback to in-memory canvas
      offscreenCanvas = document.createElement('canvas');
      offscreenCanvas.width = width * dpr;
      offscreenCanvas.height = height * dpr;
      offscreenCtx = offscreenCanvas.getContext('2d');
    }

    // Handle resize with debounce
    window.addEventListener('resize', handleResize);

    // Initial render
    renderBackground();
  }

  /**
   * Handle window resize with debouncing
   */
  function handleResize() {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
      resize();
      renderBackground();
      renderDataPoints(dataPoints);
    }, opts.resizeDebounceMs);
  }

  /**
   * Resize canvases to container dimensions
   */
  function resize(w, h) {
    if (w !== undefined && h !== undefined) {
      width = w;
      height = h;
    } else {
      // Prefer canvas client size if available (handles explicit CSS sizing)
      const rectSource = (canvas && canvas.getBoundingClientRect) ? canvas.getBoundingClientRect() : null;
      const rectContainer = (containerEl && containerEl.getBoundingClientRect) ? containerEl.getBoundingClientRect() : null;
      const rect = rectSource && rectSource.width > 0 ? rectSource : rectContainer;
      width = rect ? rect.width : 300;
      height = rect ? rect.height : 150;
    }

    const dpr = Math.min(window.devicePixelRatio || 1, opts.dprCap);

    // Update main canvas
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    // Update contexts
    if (ctx) {
      // Reset any existing transform before applying scale to avoid cumulative scaling
      try { ctx.setTransform(1, 0, 0, 1, 0, 0); } catch (e) { /* ignore */ }
      ctx.scale(dpr, dpr);
    }

    // Update offscreen canvas
    if (offscreenCanvas) {
      offscreenCanvas.width = width * dpr;
      offscreenCanvas.height = height * dpr;
    }
    if (offscreenCtx) {
      // Reset transform to avoid cumulative scaling on repeated resizes
      try { offscreenCtx.setTransform(1, 0, 0, 1, 0, 0); } catch (e) { /* ignore */ }
      offscreenCtx.scale(dpr, dpr);
    }

    // Invalidate curve cache on resize
    curveCache.clear();
  }

  /**
   * Convert psychrometric coordinates to canvas coordinates
   * @param {number} T - Temperature in Celsius
   * @param {number} W - Humidity ratio
   * @returns {Object} Canvas coordinates {x, y}
   */
  function psychroToCanvas(T, W) {
    let x = ((T - opts.Tmin) / (opts.Tmax - opts.Tmin)) * width;
    let y = height - (W / opts.Wmax) * height;
    
    // We don't clamp here to allow natural clipping at canvas edge
    return { x, y };
  }

  /**
   * Generate constant temperature curve (vertical lines)
   * @param {number} T - Temperature in Celsius
   * @returns {Path2D} Path object for the curve
   */
  function generateConstantTempCurve(T) {
    const path = new Path2D();
    const start = psychroToCanvas(T, 0);
    path.moveTo(start.x, start.y);
    const end = psychroToCanvas(T, opts.Wmax);
    path.lineTo(end.x, end.y);
    return path;
  }

  /**
   * Generate constant humidity ratio curve (horizontal lines)
   * @param {number} W - Humidity ratio
   * @returns {Path2D} Path object for the curve
   */
  function generateConstantWHumidCurve(W) {
    const path = new Path2D();
    const start = psychroToCanvas(opts.Tmin, W);
    path.moveTo(start.x, start.y);
    const end = psychroToCanvas(opts.Tmax, W);
    path.lineTo(end.x, end.y);
    return path;
  }

  /**
   * Generate constant relative humidity curve
   * @param {number} RH - Relative humidity (0-1)
   * @returns {Path2D} Path object for the curve
   */
  function generateConstantRHCureve(RH) {
    const path = new Path2D();
    let firstPoint = true;

    for (let i = 0; i <= opts.samplingN; i++) {
      const T = opts.Tmin + (opts.Tmax - opts.Tmin) * (i / opts.samplingN);
      const W = W_from_RH_T(RH, T, opts.p);
      
      const point = psychroToCanvas(T, W);
      if (firstPoint) {
        path.moveTo(point.x, point.y);
        firstPoint = false;
      } else {
        path.lineTo(point.x, point.y);
      }
    }
    return path;
  }

  /**
   * Generate constant enthalpy curve
   * @param {number} h - Enthalpy in kJ/kg
   * @returns {Path2D} Path object for the curve
   */
  function generateConstantEnthalpyCurve(h) {
    const path = new Path2D();
    let firstPoint = true;

    for (let i = 0; i <= opts.samplingN; i++) {
      const T = opts.Tmin + (opts.Tmax - opts.Tmin) * (i / opts.samplingN);
      
      // Solve for W from enthalpy equation: h = 1.006*T + W*(2501 + 1.86*T)
      const W = (h - 1.006 * T) / (2501 + 1.86 * T);
      
      if (W > 0) {
        const point = psychroToCanvas(T, W);
        if (firstPoint) {
          path.moveTo(point.x, point.y);
          firstPoint = false;
        } else {
          path.lineTo(point.x, point.y);
        }
      }
    }
    return path;
  }

  /**
   * Render background grid and curves
   */
  function renderBackground() {
      if (!offscreenCtx) return;
   
      // Clear canvas
      offscreenCtx.clearRect(0, 0, width, height);
  
      // Draw zone polygons (filled behind grid). Use semi-transparent fills and stroked borders.
      try {
        offscreenCtx.save();
        for (const zone of (ZONES || [])) {
          if (!zone || !zone.poly || zone.poly.length === 0) continue;
          // build path in canvas coordinates from zone.poly points ([T, RH])
          const path = new Path2D();
          let prevT = null;
          let prevRH = null;

          for (let i = 0; i < zone.poly.length; i++) {
            const pt = zone.poly[i];
            const T = Number(pt[0]);
            const RH = Number(pt[1]);
            const W = (typeof W_from_RH_T === 'function') ? W_from_RH_T(RH / 100, T, opts.p) : 0;
            const canvasPt = psychroToCanvas(T, W);

            if (i === 0) {
              path.moveTo(canvasPt.x, canvasPt.y);
            } else {
              // Saturation-Aware Path Drawing
              // If both consecutive points are at 100% RH, interpolate along the saturation curve
              if (Math.abs(RH - 100) < 0.01 && Math.abs(prevRH - 100) < 0.01) {
                const steps = 10;
                for (let s = 1; s <= steps; s++) {
                  const interT = prevT + (T - prevT) * (s / steps);
                  const interW = W_from_RH_T(1.0, interT, opts.p);
                  const interPt = psychroToCanvas(interT, interW);
                  path.lineTo(interPt.x, interPt.y);
                }
              } else {
                path.lineTo(canvasPt.x, canvasPt.y);
              }
            }
            prevT = T;
            prevRH = RH;
          }
          path.closePath();
          // fill with color at low opacity
          try {
            const fillColor = zone.color || 'rgba(200,200,200,0.15)';
            // ensure an rgba string with alpha if color is hex
            let fill = fillColor;
            if (!/^rgba?\(/i.test(fillColor)) {
              // convert simple hex to rgba fallback
              fill = fillColor + '22'; // append low-alpha hex fallback (may not be perfect)
            }
            offscreenCtx.fillStyle = fillColor;
            offscreenCtx.globalAlpha = 0.12;
            offscreenCtx.fill(path);
            offscreenCtx.globalAlpha = 1.0;
            offscreenCtx.strokeStyle = zone.color || '#666';
            offscreenCtx.lineWidth = 1;
            offscreenCtx.stroke(path);
          } catch (e) {
            // ignore drawing errors per-zone
            // console.debug('psychro:zone draw failed for', zone && zone.id, e);
          }
        }
        offscreenCtx.restore();
      } catch (e) {
        // console.debug('psychro:drawZones failed', e);
      }

    // Set styles
    offscreenCtx.strokeStyle = '#e0e0e0';
    offscreenCtx.lineWidth = 1;

    // Draw temperature lines (vertical)
    for (let T = Math.ceil(opts.Tmin); T <= opts.Tmax; T += 5) {
      const curveKey = `temp_${T}`;
      const path = curveCache.getOrCompute(curveKey, () => generateConstantTempCurve(T));
      offscreenCtx.stroke(path);
    }

    // Draw humidity ratio lines (horizontal)
    for (let W = 0.005; W <= opts.Wmax; W += 0.005) {
      const curveKey = `w_${W.toFixed(3)}`;
      const path = curveCache.getOrCompute(curveKey, () => generateConstantWHumidCurve(W));
      offscreenCtx.stroke(path);
    }

    // Draw relative humidity curves
    offscreenCtx.strokeStyle = '#a0a0a0';
    for (let RH = 0.1; RH <= 1.0; RH += 0.1) {
      const curveKey = `rh_${RH.toFixed(1)}`;
      const path = curveCache.getOrCompute(curveKey, () => generateConstantRHCureve(RH));
      offscreenCtx.stroke(path);
    }

    // Draw enthalpy lines
    offscreenCtx.strokeStyle = '#808080';
    offscreenCtx.setLineDash([5, 5]);
    for (let h = 20; h <= 100; h += 10) {
      const curveKey = `h_${h}`;
      const path = curveCache.getOrCompute(curveKey, () => generateConstantEnthalpyCurve(h));
      offscreenCtx.stroke(path);
    }
    offscreenCtx.setLineDash([]);

    // Draw border
    offscreenCtx.strokeStyle = '#333';
    offscreenCtx.lineWidth = 2;
    offscreenCtx.strokeRect(0, 0, width, height);

    // Copy to main canvas
    ctx.clearRect(0, 0, width, height);
    try {
      ctx.drawImage(offscreenCanvas, 0, 0, width, height);
    } catch (e) {
      // console.debug('psychro:drawImage failed', e);
    }
    
    // Draw labels on the visible canvas
    drawLabels(ctx);
  }

  /**
   * Draw axis labels and RH curve labels
   */
  function drawLabels(ctx) {
    // debug: log that labels routine is running and key values
    try {
      const debugInfo = { dpr: window.devicePixelRatio || 1, width, height, Tmin: opts.Tmin, Tmax: opts.Tmax, Wmax: opts.Wmax };
      // console.debug('psychro:drawLabels start', debugInfo);

      // compute a few sample positions to verify psychroToCanvas mapping
      const sampleT1 = Math.ceil(opts.Tmin/5)*5;
      const sampleW = Math.min(opts.Wmax, Math.max(1e-6, opts.Wmax * 0.02));
      const p1 = psychroToCanvas(sampleT1, sampleW);
      const sampleTn = Math.max(opts.Tmin, opts.Tmax - 2);
      const sampleWrh = (typeof W_from_RH_T === 'function') ? W_from_RH_T(0.9, sampleTn, opts.p) : null;
      // console.debug('psychro:drawLabels samplePositions', { sampleT1, p1, sampleTn, sampleWrh });
    } catch (e) {
      // console.debug('psychro:drawLabels debug failed', e);
    }

    const dpr = Math.max(1, window.devicePixelRatio || 1);
    ctx.save();

    // Ensure text is sharp on high-DPI canvases: set explicit fonts scaled by dpr
    const tickFontPx = Math.round(12 * dpr);
    const titleFontPx = Math.round(14 * dpr);
    ctx.fillStyle = 'rgba(0,0,0,0.85)';
    ctx.strokeStyle = 'white';
    ctx.lineWidth = Math.max(2, Math.round(3 * dpr));
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Draw temperature (x) tick labels and title
    ctx.font = `${tickFontPx}px sans-serif`;
    for (let T = Math.ceil(opts.Tmin/5)*5; T <= opts.Tmax; T += 5) {
      // place label near bottom: use a small W slightly above Wmin
      const sampleW = Math.min(opts.Wmax, Math.max(0 + 1e-6, 0 + (opts.Wmax - 0) * 0.02));
      const p = psychroToCanvas(T, sampleW);
      const labelY = Math.min(height - 8 * dpr, Math.max(8 * dpr, p.y + 10 * dpr));
      if (T === Math.ceil(opts.Tmin/5)*5) {
        // console.debug('psychro:label temp sample', { T, x: p.x, y: p.y, labelY });
      }
      ctx.lineWidth = Math.max(2, Math.round(3 * dpr));
      ctx.strokeText(`${T}°C`, p.x, labelY);
      ctx.fillText(`${T}°C`, p.x, labelY);
    }
    // Title
    ctx.font = `${titleFontPx}px sans-serif`;
    const titleY = Math.min(height - 4 * dpr, height - 14 * dpr);
    ctx.strokeText('Temperature (°C)', width / 2, titleY);
    ctx.fillText('Temperature (°C)', width / 2, titleY);

    // Draw humidity-ratio (W) tick labels and title (left side)
    ctx.font = `${tickFontPx}px sans-serif`;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    // choose ticks similar to grid (attempt step), fall back to 0.005 if step not available
    const wStep = typeof WtickStep !== 'undefined' ? WtickStep : (opts.Wmax - 0) / 8;
    for (let W = 0; W <= opts.Wmax + 1e-12; W += wStep) {
      const p = psychroToCanvas(opts.Tmin + (opts.Tmax - opts.Tmin) * 0.02, W);
      const gx = Math.max(6 * dpr, p.x - 6 * dpr);
      // show as g/kg (multiply kg/kg by 1000)
      const label = `${(W * 1000).toFixed(1)} g/kg`;
      ctx.lineWidth = Math.max(2, Math.round(3 * dpr));
      ctx.strokeText(label, gx, p.y);
      ctx.fillText(label, gx, p.y);
    }
    // Y axis title (rotated)
    ctx.save();
    ctx.font = `${titleFontPx}px sans-serif`;
    ctx.translate(12 * dpr, height / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = Math.max(2, Math.round(3 * dpr));
    ctx.strokeText('Humidity ratio (g/kg)', 0, 0);
    ctx.fillText('Humidity ratio (g/kg)', 0, 0);
    ctx.restore();

    // Draw RH labels near right side of curves
    ctx.font = `${Math.round(11 * dpr)}px sans-serif`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    for (let rh = 0.1; rh < 1.0 + 1e-12; rh += 0.1) {
      const sampleT = Math.max(opts.Tmin, opts.Tmax - 2);
      // use existing RH->W conversion available in renderer scope (same helper used for RH curves)
      const sampleW = (typeof W_from_RH_T === 'function') ? W_from_RH_T(rh, sampleT, opts.p) : (window.TacticsBundle && window.TacticsBundle.W_from_RH_T) ? window.TacticsBundle.W_from_RH_T(rh, sampleT, opts.p) : null;
      if (sampleW === null || !Number.isFinite(sampleW)) continue;
      const p = psychroToCanvas(sampleT, sampleW);
      const ox = Math.min(width - 6 * dpr, p.x + 6 * dpr);
      if (Math.abs(rh - 0.1) < 1e-12) {
        // console.debug('psychro:label RH sample', { rh, sampleT, sampleW, p, ox });
      }
      const label = `${Math.round(rh * 100)}%`;
      ctx.lineWidth = Math.max(2, Math.round(3 * dpr));
      ctx.strokeText(label, ox, p.y);
      ctx.fillText(label, ox, p.y);
    }

    ctx.restore();
  }

  /**
   * Render data points with RAF throttling
   * @param {Array} points - Array of data points with T, W properties
   */
  function renderDataPoints(points) {
  dataPoints = points || [];

  // If incoming points contain W values > current opts.Wmax, expand Wmax and re-render background
  try {
    // Log all data points to understand what we're working with
    
    // Check for any points that exceed current Wmax directly
    const pointsExceedingWmax = dataPoints.filter(p => p && typeof p.W === 'number' && p.W > opts.Wmax);
    const maxWInPoints = dataDataMaxW(dataPoints);
    
    // Log a few sample W values to understand the data
    if (dataPoints.length > 0) {
      const sampleWs = dataPoints.slice(0, 5).map(p => p.W);
    }
    
    // Use the maximum of both calculations to ensure we catch all high W values
    const actualMaxW = Math.max(maxWInPoints, pointsExceedingWmax.length > 0 ? Math.max(...pointsExceedingWmax.map(p => p.W)) : 0);
    const targetWmax = Math.max(opts.Wmax, actualMaxW * 1.2);
    
    if (targetWmax > opts.Wmax) {
      const oldWmax = opts.Wmax;
      opts.Wmax = targetWmax;
      // clear cache so curves are re-generated with new Wmax
      curveCache.clear();
      renderBackground();
    } else {
    }
  } catch (e) {
    // console.debug('psychro:renderDataPoints Wmax adjust failed', e);
  }

    // Also consider auto-scaling for temperature range if points go outside current Tmin/Tmax
    try {
      const validTs = dataPoints.filter(p => p && typeof p.T === 'number' && Number.isFinite(p.T)).map(p => p.T);
      if (validTs.length > 0) {
        const minT = Math.min(...validTs);
        const maxT = Math.max(...validTs);
        // add a small margin to avoid points sitting exactly at the edge
        const marginT = (opts.Tmax - opts.Tmin) * 0.05;
        const desiredTmin = Math.min(opts.Tmin, minT - marginT);
        const desiredTmax = Math.max(opts.Tmax, maxT + marginT);
        if (desiredTmin !== opts.Tmin || desiredTmax !== opts.Tmax) {
          const oldTmin = opts.Tmin, oldTmax = opts.Tmax;
          opts.Tmin = desiredTmin;
          opts.Tmax = desiredTmax;
          curveCache.clear();
          renderBackground();
        }
      }
    } catch (e) {
      // don't let temperature autoscale failure break rendering
      // console.debug('psychro:autoscale Tmin/Tmax failed', e);
    }

  // Throttle based on point count
  const useThrottle = dataPoints.length > opts.rafThrottleThreshold;
  const targetFPS = useThrottle ? 30 : 60;
  const frameInterval = 1000 / targetFPS;

  const render = (timestamp) => {
    // Support being called without a timestamp (manual call path) by using current time
    if (typeof timestamp !== 'number' || !isFinite(timestamp)) {
      timestamp = performance && typeof performance.now === 'function' ? performance.now() : Date.now();
    }
    if (timestamp - lastFrameTime >= frameInterval) {
      // Redraw background
      ctx.clearRect(0, 0, width, height);
      try { ctx.drawImage(offscreenCanvas, 0, 0, width, height); } catch(e){ /* ignore */ }
      
      // Draw labels
      drawLabels(ctx);

      // Draw points (skip points outside visible W range)
      ctx.fillStyle = '#ff4444';
      dataPoints.forEach((point, i) => {
        if (!point || typeof point.T !== 'number' || typeof point.W !== 'number') {
          return;
        }
        if (!Number.isFinite(point.W) || point.W < 0) {
          return;
        }
        
        // Log all points to understand the data
        
        // Note: clamp W instead of dropping points to avoid hiding valid cold/high-RH points
        // Do not drop points — clamp W to visible range to avoid mapping outside viewport.
        const Wclamped = Math.min(point.W, opts.Wmax * 1.000001); // tiny epsilon to avoid fp issues
        const canvasPoint = psychroToCanvas(point.T, Wclamped);
        const { x, y } = canvasPoint;
        const rSafe = (typeof r !== 'undefined' && r > 0) ? r : 2; // guarantee visible size
        const fillSafe = (typeof fill !== 'undefined' && fill) ? fill : '#333';
        const opacitySafe = (typeof opacity !== 'undefined') ? opacity : 1;
        const className = 'data-point';
        // ensure point is inside canvas bounds
        if (canvasPoint.x < -10 || canvasPoint.x > width + 10 || canvasPoint.y < -10 || canvasPoint.y > height + 10) return;
        ctx.beginPath();
        ctx.arc(canvasPoint.x, canvasPoint.y, rSafe, 0, 2 * Math.PI);
        ctx.fill();
      });

      lastFrameTime = timestamp;
    }

    if (useThrottle) {
      rafId = requestAnimationFrame(render);
    }
  };

  // Cancel any existing animation
  if (rafId) {
    cancelAnimationFrame(rafId);
  }

  if (useThrottle) {
    rafId = requestAnimationFrame(render);
  } else {
    // Call render immediately with a proper high-resolution timestamp so the
    // initial draw is executed (guard for the timestamp check inside render).
    render(performance && typeof performance.now === 'function' ? performance.now() : Date.now());
  }
}

// Helper: compute max W from data points safely
function dataDataMaxW(pointsArr) {
  if (!pointsArr || pointsArr.length === 0) return 0;
  let max = 0;
  for (const pt of pointsArr) {
    if (!pt || typeof pt.W !== 'number') continue;
    if (!Number.isFinite(pt.W)) continue;
    if (pt.W > max) max = pt.W;
  }
  return max;
}

  /**
   * Clean up resources
   */
  function destroy() {
    if (rafId) {
      cancelAnimationFrame(rafId);
    }
    window.removeEventListener('resize', handleResize);
    clearTimeout(resizeTimeout);
    // Only remove canvas if renderer created it (i.e. not supplied via options.canvasEl)
    if (canvas && canvas.parentNode && (!opts.canvasEl || canvas !== opts.canvasEl)) {
      canvas.parentNode.removeChild(canvas);
    }
    curveCache.clear();
  }

  // Return public API
  return {
    init,
    renderBackground,
    renderDataPoints,
    resize,
    destroy
  };
}