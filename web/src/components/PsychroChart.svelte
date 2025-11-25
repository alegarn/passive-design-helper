<script>
  import { onMount, onDestroy, tick } from 'svelte';
  import ZoneHours from './ZoneHours.svelte';
  // Dynamic import for TacticModal - load only when needed
  let TacticModalComponent = $state(null);
  async function loadTacticModal() {
    if (!TacticModalComponent) {
      const mod = await import('./TacticModal.svelte');
      TacticModalComponent = mod.default;
    }
  }
  import { ZONES } from '../scripts/zones.js';

  let { summaryData = null } = $props();
  
  let canvasElement = $state();
  let selectedZoneId = $state(null);
  // No JS variable needed for size equalization; using simple CSS defaults
  let renderer = null;
  let resizeObserver = null;
  let isLoading = $state(true);
  let error = $state(null);
  let __origConsole = null; // Store original console methods for restoration later
  
  // Create a derived value to ensure reactivity
  const psychrometricPoints = $derived(() => {
    const data = summaryData;
    const rawPoints = data?.psychrometricData || [];
    const points = sanitizePoints(rawPoints);
    // console.log('PsychroChart: $derived recomputed, points.length:', points.length);
    return points;
  });

  // Sanitize incoming psychrometric points:
  // - Ensure numeric T and W
  // - Coerce strings to numbers where possible
  // - Log offending items (first 10) to help trace upstream issues
  function sanitizePoints(rawPoints) {
    const arr = Array.isArray(rawPoints) ? rawPoints : [];
    const out = [];
    const bad = [];
    for (let i = 0; i < arr.length; i++) {
      const p = arr[i];
      if (!p) continue;
      const T = Number(p.T);
      const W = Number(p.W);
      const zone = p.zone;
      const color = p.color;
      if (!Number.isFinite(T) || !Number.isFinite(W)) {
        bad.push({ index: i, original: p });
        continue;
      }
      out.push({ T, W, zone, color });
    }
    if (bad.length > 0) {
      console.warn('PsychroChart: sanitizePoints found invalid items (first 10):', bad.slice(0, 10));
    }
    return out;
  }
  
  onMount(async () => {
    try {
      // Ensure the canvas is rendered: reveal loading=false then wait a tick so the bound canvas exists
      isLoading = false;
      await tick();


      // Dynamic import of the psychro renderer
      const { createPsychroRenderer } = await import('../scripts/psychro/index.js');
      
      
      if (!canvasElement) {
        console.error('PsychroChart init: canvasElement is undefined. Aborting initialization.');
        throw new Error('canvasElement undefined');
      }
      if (!canvasElement.parentElement) {
        console.error('PsychroChart init: canvasElement.parentElement is undefined. Aborting initialization.');
        throw new Error('canvasElement.parentElement undefined');
      }

      // Initialize the renderer with the Svelte-bound canvas element
      renderer = createPsychroRenderer(canvasElement.parentElement, {
        canvasEl: canvasElement,
        Tmin: 0,
        Tmax: 50,
        Wmax: 0.03,
        p: 101325,
        samplingN: 200,
        dprCap: 2.0,
        rafThrottleThreshold: 500,
        resizeDebounceMs: 150
      });
      
      renderer.init();
      
      // Set up resize observer to handle canvas resizing
      resizeObserver = new ResizeObserver(() => {
        if (renderer) {
          const rect = canvasElement.parentElement.getBoundingClientRect();
          renderer.resize(rect.width, rect.height);
          renderer.renderBackground();
          
          // Re-render data points if available (sanitize before rendering)
          const points = psychrometricPoints();
          
          // Local diagnostics: compute simple pixel mapping using renderer defaults to detect off-canvas / range issues
          try {
            const width = rect.width;
            const height = rect.height;
            const Tmin = 0, Tmax = 50, Wmax = 0.03;
            const psychroToCanvasLocal = (T, W) => {
              const x = ((T - Tmin) / (Tmax - Tmin)) * width;
              const y = height - (W / Wmax) * height;
              return { x, y };
            };
            points.slice(0,5).forEach((pt, idx) => {
              const T = Number(pt.T);
              const W = Number(pt.W);
              const inRange = Number.isFinite(T) && Number.isFinite(W) && T >= Tmin && T <= Tmax && W >= 0;
              const { x, y } = psychroToCanvasLocal(T, W);
              const insideCanvas = x >= -10 && x <= width + 10 && y >= -10 && y <= height + 10;
            });
          } catch (e) {
            console.warn('PsychroChart: resize diagnostics failed', e);
          }
          
          if (points.length > 0) {
            // console.log('PsychroChart: about to call renderer.renderDataPoints, renderer.ok?', !!(renderer && renderer.renderDataPoints));
            let renderPoints = points;
            // Ensure we trigger the renderer's RAF path for large batches (>= threshold)
            if (points.length >= 500) {
              renderPoints = points.concat(points[0] ? { ...points[0] } : [{ T: 0, W: 0, zone: '', color: '#000' }]);
              console.warn('PsychroChart: added temporary duplicate point to trigger RAF rendering (workaround) during resize. length->', renderPoints.length);
            }
            renderer.renderDataPoints(renderPoints);
          }
        }
      });
      
      resizeObserver.observe(canvasElement.parentElement);
    } catch (err) {
      console.error('Failed to initialize PsychroChart:', err);
      error = 'Failed to load psychrometric chart renderer';
    }
  });

  $effect(() => {
    if (selectedZoneId) loadTacticModal();
  });

  // No JS equalization needed — use CSS-only min-width/height defaults

  // Reactive effect to handle psychrometric points changes
  $effect(() => {
    const points = psychrometricPoints();
    // console.log('PsychroChart: $effect triggered with', points.length, 'points from derived');
    // console.log('PsychroChart: First 3 points:', points.slice(0, 3));
    
    if (renderer) {
      if (points.length > 0) {
        renderer.renderDataPoints(points);
        // Log pixel mapping for up to 5 sample points using local mapping (matches renderer psychroToCanvas)
        try {
          const rect = canvasElement?.parentElement?.getBoundingClientRect ? canvasElement.parentElement.getBoundingClientRect() : { width: 300, height: 150 };
          const width = rect.width;
          const height = rect.height;
          const Tmin = 0, Tmax = 50, Wmax = 0.03;
          const psychroToCanvasLocal = (T, W) => {
            const x = ((T - Tmin) / (Tmax - Tmin)) * width;
            const y = height - (W / Wmax) * height;
            return { x, y };
          };
          points.slice(0, 5).forEach((pt, idx) => {
            const T = Number(pt.T), W = Number(pt.W), color = pt.color;
            const { x, y } = psychroToCanvasLocal(T, W);
          });
        } catch (e) {
          console.warn('PsychroChart: pixel mapping logs failed', e);
        }
      } else {
        // Clear points when no data is available
        renderer.renderDataPoints([]);
        // console.log('PsychroChart: Cleared data points (no data available)');
      }
    } else {
      // console.log('PsychroChart: Renderer not yet initialized');
    }
  });

  // Re-equalize zone hours whenever the summary data or container size changes
  // No JS-driven ResizeObserver; CSS provides a simple, responsive layout.

  // Re-run equalization when summaryData changes
  // No JS-driven equalization; rely on CSS-only approach for card sizes.
  
  
  onDestroy(() => {
    // Restore original console methods
    try {
      if (__origConsole) {
        // console.log = __orig// console.log;
        console.trace = __origConsole.trace;
        console.info = __origConsole.info;
        console.debug = __origConsole.debug;
      }
    } catch(e) { /* ignore */ }
    
    // Clean up resources
    if (resizeObserver) {
      resizeObserver.disconnect();
    }
    
    if (renderer) {
      renderer.destroy();
    }
  });
</script>

<div class="psychro-chart-container">
  {#if isLoading}
    <div class="loading-state">
      <p>Loading psychrometric chart...</p>
    </div>
  {:else if error}
    <div class="error-state">
      <p>{error}</p>
    </div>
  {:else}
    <canvas bind:this={canvasElement} class="psychro-chart"></canvas>
  {/if}
</div>

  {#if summaryData && summaryData.summary}
  <div class="zone-hours-container" role="list" aria-label="Zone hours list">
    {#each summaryData.summary as zoneData (zoneData.zone)}
      <button type="button" class="zone-hour-btn" onclick={() => selectedZoneId = zoneData.zone} aria-label={`Open details for zone ${zoneData.zone}`}>
        <ZoneHours {zoneData} />
      </button>
    {/each}
  </div>
{/if}

{#if selectedZoneId}
  {#if selectedZoneId}
    {#if TacticModalComponent}
      <TacticModalComponent tactic={ZONES.find(z => z.id === selectedZoneId)} onClose={() => selectedZoneId = null} />
    {:else}
      <div class="modal-loading">Loading details…</div>
    {/if}
  {/if}
{/if}

<style>
  .psychro-chart-container {
    width: 100%;
    height: 400px;
    position: relative;
  }

  /* rely on global default variables for tactic cards */
  
  .psychro-chart {
    width: 100%;
    height: 100%;
    display: block;
  }
  
  .loading-state, .error-state {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    background-color: #f5f5f5;
    border: 1px solid #ddd;
    border-radius: 4px;
  }
  
  .error-state {
    background-color: #fff5f5;
    border-color: #ffcccc;
    color: #d63031;
  }
  
  .zone-hours-container {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-md, 1rem);
    margin-top: var(--space-lg, 1.5rem);
    width: 100%;
    align-items: stretch;
    justify-content: center;
    /* Ensure children can wrap into multiple columns, controlled by global card variables */
  }

  @media (max-width: 480px) {
    .zone-hours-container { gap: 0.5rem; }
    .zone-hour-btn { min-width: 100%; }
  }
  /* On large screens, use global --tactic-card-height-large so we can configure across the app */
  @media (min-width: 1200px) {
    :global(.zone-hours-container) { --tactic-card-height: var(--tactic-card-height-large); }
  }
  @media (max-width: 480px) {
    :global(.zone-hours-container) { --tactic-card-min: 100%; }
  }
  .zone-hour-btn {
    all: unset;
    display: block;
    flex: 0 1 var(--tactic-card-basis);
    min-width: var(--tactic-card-min);
    max-width: var(--tactic-card-max);
    width: 100%;
    min-height: var(--tactic-card-height, auto);
    cursor: pointer;
    box-sizing: border-box;
  }
  .zone-hour-btn :global(.stat-card) { min-height: var(--tactic-card-height); }
  .zone-hour-btn:focus { outline: 2px solid rgba(0,123,255,0.4); outline-offset: 2px; }
</style>