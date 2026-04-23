<script>
  import { tick } from 'svelte';
  import UploadZone from './components/UploadZone.svelte';
  import ProcessControls from './components/ProcessControls.svelte';
  import PsychroChart from './components/PsychroChart.svelte';
  import TimeSeriesChart from './components/TimeSeriesChart.svelte';
  import FetchOpenMeteo from './components/FetchOpenMeteo.svelte';
  // Tactics catalog removed from main flow; import lazily where needed
  import { fileStore, currentSummaryData, medianTemp, dataMedianTemp, medianOverride } from './stores/fileStore.js';

  let sliderValue = $state(28);
  let isProcessingMedian = $state(false);
  let analyzeRequestId = $state(0);
  
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
  async function handleDataProcessed(event) {
    const { result } = event.detail;
    try {
      if (!result) return;

      await tick();
      document
        .querySelector('.psychro-chart-container')
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (e) {
      console.error('App.svelte: failed to scroll to processed chart:', e);
    }
  }

  function handleRemoteAnalyze() {
    analyzeRequestId += 1;
  }
</script>

<header>
  <div class="header-brand">
    <h1>Passive Design Tactics</h1>
    <p class="app-tagline">Upload hourly climate data to map your site on a psychrometric chart and identify passive design tactics — natural ventilation, shading, and thermal mass.</p>
  </div>
  {#if $dataMedianTemp !== null}
    <small class="data-median-display">Data Median T°: {$dataMedianTemp.toFixed(1)}°C</small>
  {/if}
</header>

<main>
  <FetchOpenMeteo onAnalyze={handleRemoteAnalyze} />
  
  <UploadZone on:fileparsed={handleFileParsed} />
  
  {#if $fileStore.raw.file && $fileStore.raw.headerFields}
    <ProcessControls
      file={$fileStore.raw.file}
      headerFields={$fileStore.raw.headerFields}
      sampleRows={$fileStore.raw.sampleRows}
      dayFirst={$fileStore.raw.dayFirst}
      dataSpanInfo={$fileStore.raw.dataSpanInfo}
      analyzeRequestId={analyzeRequestId}
      on:dataprocessed={handleDataProcessed}
    />
  {/if}
  
  {#if $currentSummaryData}
    <div class="median-controls">
      <label for="median-slider-input" class="median-controls__label">
        Comfort Zones Median T° (-15°C to 40°C){isProcessingMedian ? ' (Calculating...)' : ''}
      </label>
      <div class="median-controls__row">
        <div class="median-controls__slider-wrap">
          <input id="median-slider-input" class="median-controls__range" type="range" min="-15" max="40" step="0.1" bind:value={sliderValue} oninput={handleSlider} />
          <div class="median-controls__ticks">
            {#each [-15, -10, 0, 10, 20, 30, 40] as tick}
              <div class="median-controls__tick" style="left: {(tick + 15) * 100 / 55}%">
                <div class="median-controls__tick-mark"></div>
                <span>{tick}</span>
              </div>
            {/each}
          </div>
        </div>
        <div class="median-controls__number-wrap">
          <input class="median-controls__number" type="number" step="0.1" min="-15" max="40"
            value={sliderValue}
            oninput={(e) => { sliderValue = Number(e.target.value); handleSlider(e); }}
          />
          <span class="median-controls__unit">°C</span>
        </div>
      </div>
      <div class="median-controls__footer">
        <span>Current Zones T°: <strong>{($medianOverride ?? $dataMedianTemp ?? 28).toFixed(1)}°C</strong></span>
        {#if $medianOverride !== null}
          <button class="median-controls__reset" type="button" onclick={() => { isProcessingMedian = true; medianOverride.set(null); setTimeout(() => isProcessingMedian = false, 50); sliderValue = $dataMedianTemp ?? 28; }}>Reset to Data Median</button>
        {/if}
      </div>
    </div>

    <PsychroChart summaryData={$currentSummaryData} />
    
    <!-- Time Series Chart -->
    {#if $currentSummaryData && $currentSummaryData.rowsWithDur}
      <TimeSeriesChart
        selectedPeriod="hourly"
        median={$medianTemp}
      />
      
      <TimeSeriesChart
        selectedPeriod="daily"
        median={$medianTemp}
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
    background: #fff;
    border-bottom: 3px solid var(--color-primary, #5e81ac);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1rem;
    padding: 1.5rem 1rem 1rem;
  }

  .header-brand {
    text-align: center;
  }

  header h1 {
    margin: 0;
    font-size: clamp(1.4rem, 4vw, 2rem);
    font-weight: 700;
    color: var(--color-primary, #5e81ac);
    letter-spacing: -0.01em;
    line-height: 1.2;
  }

  .app-tagline {
    margin: 0.4rem auto 0;
    font-size: 0.85rem;
    color: var(--color-text-muted, #4c566a);
    max-width: 560px;
    line-height: 1.5;
  }

  .data-median-display {
    font-size: 0.95rem;
    font-weight: 500;
    background: rgba(0,0,0,0.05);
    padding: 0.35rem 0.75rem;
    border-radius: 4px;
  }

  main {
    flex: 1;
    padding: 1rem;
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .median-controls {
    background: var(--color-bg, #eceff4);
    border: 1px solid rgba(0,0,0,0.08);
    border-radius: 8px;
    padding: 0.75rem 1rem;
    max-width: 680px;
  }

  .median-controls__label {
    display: block;
    font-weight: 500;
    font-size: 0.9rem;
    margin-bottom: 0.4rem;
  }

  .median-controls__row {
    display: flex;
    align-items: flex-start;
    gap: 0.75rem;
  }

  .median-controls__slider-wrap {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
  }

  .median-controls__range {
    width: 100%;
    height: 1.5rem;
    cursor: pointer;
    margin: 0;
  }

  .median-controls__ticks {
    position: relative;
    width: 100%;
    height: 18px;
    font-size: 0.65rem;
    color: #666;
    pointer-events: none;
  }

  .median-controls__tick {
    position: absolute;
    transform: translateX(-50%);
    display: flex;
    flex-direction: column;
    align-items: center;
  }

  .median-controls__tick-mark {
    width: 1px;
    height: 4px;
    background: #ccc;
    margin-bottom: 1px;
  }

  .median-controls__number-wrap {
    display: flex;
    align-items: center;
    gap: 0.2rem;
    padding-top: 0.1rem;
  }

  .median-controls__number {
    width: 65px;
    padding: 0.25rem;
    border: 1px solid #ccc;
    border-radius: 4px;
    text-align: center;
    font-size: 0.85rem;
  }

  .median-controls__unit {
    font-size: 0.85rem;
    font-weight: 500;
  }

  .median-controls__footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 0.85rem;
    margin-top: 0.4rem;
  }

  .median-controls__reset {
    padding: 0.3rem 0.7rem;
    cursor: pointer;
    border-radius: 4px;
    border: 1px solid #ccc;
    background: white;
    white-space: nowrap;
    font-size: 0.8rem;
  }
  
  footer {
    padding: 1rem;
    background-color: var(--secondary-color, #f8f9fa);
    border-top: 1px solid #dee2e6;
    text-align: center;
  }
</style>