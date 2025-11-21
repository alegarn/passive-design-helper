<script>
  import UploadZone from './components/UploadZone.svelte';
  import ProcessControls from './components/ProcessControls.svelte';
  import PsychroChart from './components/PsychroChart.svelte';
  import TimeSeriesChart from './components/TimeSeriesChart.svelte';
  import FetchOpenMeteo from './components/FetchOpenMeteo.svelte';
  import { fileStore } from './stores/fileStore.js';
  
  // Handle fileparsed event from UploadZone
  function handleFileParsed(event) {
    // TODO: Implement loadFromCsv when available
    console.log('File parsed:', event.detail.file);
    // For now, we'll handle this through the fetchRemote functionality
  }
  
  // Handle dataprocessed event from ProcessControls
  function handleDataProcessed(event) {
    // For now, just log the processed data
    // TODO: This will be handled properly when loadFromCsv is implemented
    console.log('Data processed:', event.detail.result);
  }
</script>

<header>
  <h1>Passive Design Tactics</h1>
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
  
  {#if $fileStore.raw.aggregationResult}
    <!-- Debug: Log what we're passing to PsychroChart -->
    {#if typeof window !== 'undefined'}
      {console.log('App.svelte: Passing aggregationResult to PsychroChart:', $fileStore.raw.aggregationResult)}
    {/if}
    <PsychroChart summaryData={$fileStore.raw.aggregationResult} />
    
    <!-- Time Series Chart -->
    {#if $fileStore.raw.aggregationResult.rowsWithDur}
      <!-- Example 1: Hourly average day with zones as threshold array -->
      <TimeSeriesChart
        timeSeriesData={$fileStore.raw.aggregationResult.rowsWithDur}
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
        timeSeriesData={$fileStore.raw.aggregationResult.rowsWithDur}
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
  {/if}
</main>

<footer>
  <p>&copy; 2024 Passive Design Tactics</p>
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
  
  footer {
    padding: 1rem;
    background-color: var(--secondary-color, #f8f9fa);
    border-top: 1px solid #dee2e6;
    text-align: center;
  }
</style>