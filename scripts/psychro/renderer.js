/**
 * Psychrometric chart renderer module
 * Canvas2D implementation with offscreen rendering and curve caching
 */

import { e_s_Pa, W_from_RH_T, dewPoint_C_from_e, enthalpy_kJkg, wetBulbSolver } from './math.js';
import { CurveCache } from './curveCache.js';

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
    // Create main canvas
    canvas = document.createElement('canvas');
    canvas.className = 'psychro-canvas';
    containerEl.appendChild(canvas);

    // debug: log canvas insertion and computed style
    try {
      console.debug('psychro:init canvas appended', {
        containerRect: containerEl.getBoundingClientRect ? containerEl.getBoundingClientRect() : null,
        canvasClass: canvas.className,
        canvasStyle: window.getComputedStyle ? window.getComputedStyle(canvas) : null
      });
    } catch (e) {
      console.debug('psychro:init debug failed', e);
    }

    // Get DPR (device pixel ratio) with cap
    const dpr = Math.min(window.devicePixelRatio || 1, opts.dprCap);

    // Set initial size
    resize();

    // Get contexts
    ctx = canvas.getContext('2d');

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
      const rect = containerEl.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
    }

    const dpr = Math.min(window.devicePixelRatio || 1, opts.dprCap);

    // Update main canvas
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    // Update contexts
    if (ctx) {
      ctx.scale(dpr, dpr);
    }

    // Update offscreen canvas
    if (offscreenCanvas) {
      offscreenCanvas.width = width * dpr;
      offscreenCanvas.height = height * dpr;
    }
    if (offscreenCtx) {
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
    const x = ((T - opts.Tmin) / (opts.Tmax - opts.Tmin)) * width;
    const y = height - (W / opts.Wmax) * height;
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
      
      if (W <= opts.Wmax) {
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
      
      if (W > 0 && W <= opts.Wmax) {
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
    ctx.drawImage(offscreenCanvas, 0, 0, width, height);
    
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
      console.debug('psychro:drawLabels start', debugInfo);

      // compute a few sample positions to verify psychroToCanvas mapping
      const sampleT1 = Math.ceil(opts.Tmin/5)*5;
      const sampleW = Math.min(opts.Wmax, Math.max(1e-6, opts.Wmax * 0.02));
      const p1 = psychroToCanvas(sampleT1, sampleW);
      const sampleTn = Math.max(opts.Tmin, opts.Tmax - 2);
      const sampleWrh = (typeof W_from_RH_T === 'function') ? W_from_RH_T(0.9, sampleTn, opts.p) : null;
      console.debug('psychro:drawLabels samplePositions', { sampleT1, p1, sampleTn, sampleWrh });
    } catch (e) {
      console.debug('psychro:drawLabels debug failed', e);
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
        console.debug('psychro:label temp sample', { T, x: p.x, y: p.y, labelY });
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
      if (Math.abs(rh - 0.1) < 1e-12) {
        console.debug('psychro:label RH sample', { rh, sampleT, sampleW, p, ox });
      }
      const ox = Math.min(width - 6 * dpr, p.x + 6 * dpr);
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

    // Throttle based on point count
    const useThrottle = dataPoints.length > opts.rafThrottleThreshold;
    const targetFPS = useThrottle ? 30 : 60;
    const frameInterval = 1000 / targetFPS;

    const render = (timestamp) => {
      if (timestamp - lastFrameTime >= frameInterval) {
        // Redraw background
        ctx.clearRect(0, 0, width, height);
        ctx.drawImage(offscreenCanvas, 0, 0, width, height);
        
        // Draw labels
        drawLabels(ctx);

        // Draw points
        ctx.fillStyle = '#ff4444';
        dataPoints.forEach(point => {
          const canvasPoint = psychroToCanvas(point.T, point.W);
          ctx.beginPath();
          ctx.arc(canvasPoint.x, canvasPoint.y, 4, 0, 2 * Math.PI);
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
      render(0);
    }
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
    if (canvas && canvas.parentNode) {
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