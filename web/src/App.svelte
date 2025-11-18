<script>
  import UploadZone from './components/UploadZone.svelte';
  import ColumnMapper from './components/ColumnMapper.svelte';
  import ProcessControls from './components/ProcessControls.svelte';
  import PsychroChart from './components/PsychroChart.svelte';
  import { rawData, isMappingComplete, hasResults } from './stores/uiStore.js';

  const rowCount = $derived($rawData?.length || 0);
</script>

<header>
  <h1>Passive Design Tactics</h1>
</header>

<main>
  <UploadZone />
  
  {#if rowCount > 0}
    <ColumnMapper />
    
    <p>Status: {rowCount} rows loaded.
      {#if $isMappingComplete}
        Column mapping is complete.
        {#if $hasResults}
          Data processing is complete. Visualization is available.
        {:else}
          Ready to process data.
        {/if}
      {:else}
        Please map your CSV columns to continue.
      {/if}
    </p>
    
    {#if $isMappingComplete}
      <ProcessControls />
      
      {#if $hasResults}
        <section>
          <h2>Psychrometric Chart</h2>
          <PsychroChart />
        </section>
      {/if}
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