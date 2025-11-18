<script>
  import { onMount, onDestroy, tick } from 'svelte';
  import { get } from 'svelte/store';
  import { results } from '../stores/uiStore.js';
  import ZoneHours from './ZoneHours.svelte';
  
  export let summaryData = null;
  
  let canvasElement;
  let renderer = null;
  let resizeObserver = null;
  let isLoading = true;
  let error = null;
  let resultsSubscription = null;
  let __origConsole = null; // Store original console methods for restoration later
  
  onMount(async () => {
    try {
      // Ensure the canvas is rendered: reveal loading=false then wait a tick so the bound canvas exists
      isLoading = false;
      await tick();

      // Temporarily suppress console logs during renderer initialization and lifecycle
      // This is a temporary debugging measure to reduce console noise - remove after debugging
      try {
        __origConsole = { log: console.log, trace: console.trace, info: console.info, debug: console.debug };
        console.log = console.trace = console.info = console.debug = () => {};
      } catch(e) { /* ignore */ }

      // Dynamic import of the psychro renderer
      const { createPsychroRenderer } = await import('../../../scripts/psychro/index.js');
      
      // Debug: check canvas reference and parent before using them
      console.log('PsychroChart init: canvasElement ->', canvasElement);
      console.log('PsychroChart init: typeof canvasElement ->', typeof canvasElement);
      try { console.log('PsychroChart init: instanceof HTMLElement ->', canvasElement instanceof HTMLElement); } catch(e){ console.log('PsychroChart init: instanceof check failed', e); }
      console.trace('PsychroChart init stack trace');
      
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
          
          // Re-render data points if available
          const $results = get(results);
          if ($results && $results.psychrometricData) {
            renderer.renderDataPoints($results.psychrometricData);
          }
        }
      });
      
      resizeObserver.observe(canvasElement.parentElement);
      
      // Subscribe to results store and re-render when results change
      resultsSubscription = results.subscribe($results => {
        if (renderer && $results && $results.psychrometricData) {
          renderer.renderDataPoints($results.psychrometricData);
        }
      });
    } catch (err) {
      console.error('Failed to initialize PsychroChart:', err);
      error = 'Failed to load psychrometric chart renderer';
    }
  });
  
  onDestroy(() => {
    // Restore original console methods
    try {
      if (__origConsole) {
        console.log = __origConsole.log;
        console.trace = __origConsole.trace;
        console.info = __origConsole.info;
        console.debug = __origConsole.debug;
      }
    } catch(e) { /* ignore */ }
    
    // Clean up resources
    if (resizeObserver) {
      resizeObserver.disconnect();
    }
    
    if (resultsSubscription) {
      resultsSubscription();
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

{#if (summaryData && summaryData.summary) || ($results && $results.data && $results.data.summary)}
  <div class="zone-hours-container" role="list" aria-label="Zone hours list">
    {#each (summaryData ? summaryData.summary : $results.data.summary) as zoneData (zoneData.zone)}
      <ZoneHours zone={zoneData} />
    {/each}
  </div>
{/if}

<style>
  .psychro-chart-container {
    width: 100%;
    height: 400px;
    position: relative;
  }
  
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
  }
</style>