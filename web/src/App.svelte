<script>
  import UploadZone from './components/UploadZone.svelte';
  import ProcessControls from './components/ProcessControls.svelte';
  import PsychroChart from './components/PsychroChart.svelte';

  // State to hold file data from UploadZone
  let fileData = $state({
    file: null,
    headerFields: [],
    sampleRows: [],
    dayFirst: null,
    dataSpanInfo: null
  });
  
  // Handle fileparsed event from UploadZone
  function handleFileParsed(event) {
    fileData = {
      file: event.detail.file,
      headerFields: event.detail.headerFields,
      sampleRows: event.detail.sampleRows,
      dayFirst: event.detail.dayFirst,
      dataSpanInfo: event.detail.dataSpanInfo
    };
  }
  
  // Handle dataprocessed event from ProcessControls
  function handleDataProcessed(event) {
    fileData = { ...fileData, aggregationResult: event.detail.result };
  }
  
</script>

<header>
  <h1>Passive Design Tactics</h1>
</header>

<main>
  <UploadZone on:fileparsed={handleFileParsed} />
  
  <!-- Debug output to track fileData state -->
  {#if fileData.file}
    <div style="background: #f0f0f0; padding: 10px; margin: 10px 0; border-radius: 4px;">
      <h4>Debug: File Data State</h4>
      <p>File: {fileData.file.name}</p>
      <p>Header Fields Count: {fileData.headerFields.length}</p>
      <p>Sample Rows Count: {fileData.sampleRows.length}</p>
      <p>Day First: {fileData.dayFirst}</p>
      <p>Data Span Info: {fileData.dataSpanInfo ? 'Available' : 'Not Available'}</p>
    </div>
  {/if}
  
  {#if fileData.file && fileData.headerFields}
    <ProcessControls
      file={fileData.file}
      headerFields={fileData.headerFields}
      sampleRows={fileData.sampleRows}
      dayFirst={fileData.dayFirst}
      dataSpanInfo={fileData.dataSpanInfo}
      on:dataprocessed={handleDataProcessed}
    />
  {/if}
  
  {#if fileData.aggregationResult}
    <PsychroChart summaryData={fileData.aggregationResult} />
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