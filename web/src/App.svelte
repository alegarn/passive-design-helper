<script>
  import UploadZone from './components/UploadZone.svelte';
  import ProcessControls from './components/ProcessControls.svelte';
  import PsychroChart from './components/PsychroChart.svelte';
  import TimeSeriesChart from './components/TimeSeriesChart.svelte';
  import FetchOpenMeteo from './components/FetchOpenMeteo.svelte';
  // Tactics catalog removed from main flow; import lazily where needed
  import { fileStore, currentSummaryData, medianTemp, dataMedianTemp, medianOverride } from './stores/fileStore.js';
  import { debounce } from './scripts/ui-bridge.js';

  let sliderValue = $state(28);
  let isProcessingMedian = $state(false);
  
  let medianTimeout;
  function handleSlider(e) {
    isProcessingMedian = true;
    const val = sliderValue; // Use the bound sliderValue directly
    
    // clear previous timeout to debounce
    if (typeof clearTimeout === 'function') clearTimeout(medianTimeout);
    
    medianTimeout = setTimeout(() => {
        medianOverride.set(val);
        // Wait another tick to clear processing state to let UI catch up
        setTimeout(() => isProcessingMedian = false, 50);
    }, 200);
  }

  // Effect to sync slider to store when NOT actively interacting
  $effect(() => {
    // Only auto-sync from stores if the user is not actively dragging the slider
    if (isProcessingMedian) return;

    // Read without creating a dependency loop during processing
    if ($medianOverride !== null && $medianOverride !== undefined) {
      if (sliderValue !== Number($medianOverride)) sliderValue = Number($medianOverride);
    } else if ($dataMedianTemp !== null && $dataMedianTemp !== undefined) {
      if (sliderValue !== Number($dataMedianTemp)) sliderValue = Number($dataMedianTemp);
    } else {
      if (sliderValue !== 28) sliderValue = 28;
    }
  });
  
  // Handle fileparsed event from UploadZone
  function handleFileParsed(event) {
    // Stage parsed metadata already handled by UploadZone -> fileStore.setParsedRaw
    // console.log('File parsed (handled):', event.detail.file);
  }
  
  // Handle dataprocessed event from ProcessControls
  function handleDataProcessed(event) {
    // Commit aggregation result into fileStore so charts and exports react
    const { result } = event.detail;
    try {
      // ProcessControls already commits `aggregationResult` into fileStore
      // console.log('Data processed (event) - fileStore commit is done by ProcessControls', result);
    } catch (e) {
      console.error('App.svelte: failed to save processed data to fileStore:', e);
    }
  }
</script>

<header>
  <h1>Passive Design Tactics</h1>
  <div class="header-info" style="display: flex; flex-direction: column; gap: 1rem; align-items: center; margin-top: 0.5rem;">
    <div class="data-median-display" style="font-size: 1.1rem; font-weight: 500; background: rgba(0,0,0,0.05); padding: 0.5rem 1rem; border-radius: 4px;">
      Data Median T°: {$dataMedianTemp !== null ? `${$dataMedianTemp.toFixed(1)}°C` : '—'}
    </div>
    
    <div class="median-slider" style="width: 100%; max-width: 600px; padding: 1rem; background: rgba(0,0,0,0.02); border-radius: 8px; border: 1px solid rgba(0,0,0,0.05); flex-shrink: 0;">
      <label for="median-slider-input" style="display: block; margin-bottom: 0.5rem; font-weight: 500; text-align: left;">
        Comfort Zones Median T° (-40°C to 40°C) {isProcessingMedian ? ' (Calculating...)' : ''}
      </label>
      <div style="display: flex; flex-direction: column; gap: 0.5rem;">
        <div style="display: flex; align-items: flex-start; gap: 1rem;">
          <div style="flex: 1; display: flex; flex-direction: column; gap: 0.25rem;">
            <input id="median-slider-input" style="width: 100%; height: 2rem; cursor: pointer; display: block; margin: 0;" type="range" min="-40" max="40" step="0.1" bind:value={sliderValue} oninput={handleSlider} />
            
            <!-- Responsive Scale aligned with slider track -->
            <div style="position: relative; width: 100%; height: 20px; font-size: 0.7rem; color: #666; pointer-events: none; margin-top: -0.2rem;">
              {#each [-40, -30, -20, -10, 0, 10, 20, 30, 40] as tick}
                <div style="position: absolute; left: {(tick + 40) * 100 / 80}%; transform: translateX(-50%); display: flex; flex-direction: column; align-items: center;">
                  <div style="width: 1px; height: 4px; background: #ccc; margin-bottom: 2px;"></div>
                  <span>{tick}</span>
                </div>
              {/each}
            </div>
          </div>

          <div style="display: flex; align-items: center; gap: 0.25rem; padding-top: 0.2rem;">
            <input type="number" step="0.1" min="-40" max="40" 
              value={sliderValue} 
              oninput={(e) => { sliderValue = Number(e.target.value); handleSlider(e); }}
              style="width: 70px; padding: 0.3rem; border: 1px solid #ccc; border-radius: 4px; text-align: center; font-size: 0.9rem;"
            />
            <span style="font-size: 0.9rem; font-weight: 500;">°C</span>
          </div>
        </div>

        <div class="median-value" style="display: flex; align-items: center; justify-content: space-between; min-height: 2.5rem; margin-top: 0.5rem;">
          <span style="font-size: 0.9rem;">Current Zones T°: <strong>{($medianOverride ?? $dataMedianTemp ?? 28).toFixed(1)}°C</strong></span>
          <div class="reset-container" style="min-width: 150px; display: flex; justify-content: flex-end;">
            {#if $medianOverride !== null}
              <button type="button" style="padding: 0.4rem 0.8rem; cursor: pointer; border-radius: 4px; border: 1px solid #ccc; background: white; white-space: nowrap; font-size: 0.85rem;" onclick={() => { isProcessingMedian = true; medianOverride.set(null); setTimeout(() => isProcessingMedian = false, 50); sliderValue = $dataMedianTemp ?? 28; }}>Reset to Data Median</button>
            {/if}
          </div>
        </div>
      </div>
    </div>
  </div>
</header>

<main>
  <FetchOpenMeteo />
  
  <UploadZone on:fileparsed={handleFileParsed} />
  
  {#if $fileStore.raw.file && $fileStore.raw.headerFields}
    <ProcessControls
      file={$fileStore.raw.file}
      headerFields={$fileStore.raw.headerFields}
      sampleRows={$fileStore.raw.sampleRows}
      dayFirst={$fileStore.raw.dayFirst}
      dataSpanInfo={$fileStore.raw.dataSpanInfo}
      on:dataprocessed={handleDataProcessed}
    />
  {/if}
  
  {#if $currentSummaryData}
    <!-- Debug: Log what we're passing to PsychroChart -->
    <!-- {#if typeof window !== 'undefined'}
      {console.log('App.svelte: Passing aggregationResult to PsychroChart:', $fileStore.raw.aggregationResult)}
    {/if} -->
    <PsychroChart summaryData={$currentSummaryData} />
    
    <!-- Time Series Chart -->
    {#if $currentSummaryData && $currentSummaryData.rowsWithDur}
      <!-- Example 1: Hourly average day with zones as threshold array -->
      <TimeSeriesChart
        selectedPeriod="hourly"
        zones={[
          { threshold: 30, color: '#ff4444' },  // Hot: red
          { threshold: 25, color: '#ff8844' },  // Warm: orange
          { threshold: 20, color: '#ffcc44' },  // Mild: yellow
          { threshold: 15, color: '#44cc44' },  // Cool: light green
          { threshold: 10, color: '#4488ff' }   // Cold: blue
        ]}
      />
      
      <!-- Example 2: Daily chart with zones as function -->
      <TimeSeriesChart
        selectedPeriod="daily"
        zones={(value) => {
          if (value > 28) return '#ff0000';  // Very hot
          if (value > 24) return '#ff8800';  // Hot
          if (value > 20) return '#ffcc00';  // Warm
          if (value > 16) return '#88ff00';  // Mild
          if (value > 12) return '#00ccff';  // Cool
          return '#0088ff';  // Cold
        }}
      />
    {/if}

    <!-- Tactics catalog is removed from the main flow (displayed in the Tactics page/screen only) -->
  {/if}
</main>

<footer>
  <p>&copy; 2024 Passive Design Tactics by alegarn</p>
</footer>

<style>
  header {
    padding: 1rem;
    background-color: var(--primary-color, #f8f9fa);
    border-bottom: 1px solid #dee2e6;
  }
  
  main {
    flex: 1;
    padding: 1rem;
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .median-slider {
    margin-top: 0.5rem;
    display: flex;
    gap: 1rem;
    align-items: center;
  }
  .median-slider input[type="range"] { flex: 1; }
  .median-value { font-size: 0.9rem; }
  
  footer {
    padding: 1rem;
    background-color: var(--secondary-color, #f8f9fa);
    border-top: 1px solid #dee2e6;
    text-align: center;
  }
</style>