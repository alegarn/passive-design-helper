<script>
  import UploadZone from './components/UploadZone.svelte';
  import ProcessControls from './components/ProcessControls.svelte';
  import PsychroChart from './components/PsychroChart.svelte';
  import TimeSeriesChart from './components/TimeSeriesChart.svelte';
  import FetchOpenMeteo from './components/FetchOpenMeteo.svelte';

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
  
  // Handle datafetched event from FetchOpenMeteo
  function handleDataFetched(event) {
    // Convert fetched data to a format compatible with existing components
    const { data, filename, format } = event.detail;
    
    // Create a mock file object
    const file = new File([format === 'csv' ? jsonToCsv(data) : JSON.stringify(data, null, 2)], filename, {
      type: format === 'csv' ? 'text/csv' : 'application/json'
    });
    
    // Parse the data to extract header fields and sample rows
    let headerFields = [];
    let sampleRows = [];
    
    if (format === 'csv') {
      const lines = jsonToCsv(data).split('\n');
      if (lines.length > 0) {
        headerFields = lines[0].split(',');
        sampleRows = lines.slice(1, 6).map(line => line.split(','));
      }
    } else {
      // For JSON, extract from hourly data
      if (data.hourly) {
        headerFields = ['time', ...Object.keys(data.hourly).filter(k => k !== 'time')];
        const timeArray = data.hourly.time;
        const numSamples = Math.min(5, timeArray.length);
        for (let i = 0; i < numSamples; i++) {
          const row = [timeArray[i]];
          for (const key of headerFields.slice(1)) {
            row.push(data.hourly[key] && data.hourly[key][i] !== null ? data.hourly[key][i] : '');
          }
          sampleRows.push(row);
        }
      }
    }
    
    fileData = {
      file,
      headerFields,
      sampleRows,
      dayFirst: false, // Open-Meteo uses ISO format
      dataSpanInfo: {
        totalRows: data.hourly?.time?.length || 0,
        dateRange: data.hourly?.time ? {
          start: data.hourly.time[0],
          end: data.hourly.time[data.hourly.time.length - 1]
        } : null
      }
    };
  }
  
  // Helper function to convert JSON to CSV (same as in FetchOpenMeteo)
  function jsonToCsv(data) {
    if (!data || !data.hourly || !data.hourly.time) {
      return '';
    }
    
    const variables = Object.keys(data.hourly).filter(k => k !== 'time');
    const headers = ['time', ...variables];
    const rows = [];
    
    rows.push(headers.join(','));
    
    const timeArray = data.hourly.time;
    const numRecords = timeArray.length;
    
    for (let i = 0; i < numRecords; i++) {
      const row = [timeArray[i]];
      for (const key of variables) {
        const value = data.hourly[key] && data.hourly[key][i] !== null ? data.hourly[key][i] : '';
        row.push(value);
      }
      rows.push(row.join(','));
    }
    
    return rows.join('\n');
  }
  
</script>

<header>
  <h1>Passive Design Tactics</h1>
</header>

<main>
  <FetchOpenMeteo on:datafetched={handleDataFetched} />
  
  <UploadZone on:fileparsed={handleFileParsed} />
  
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
    
    <!-- Time Series Chart -->
    {#if fileData.aggregationResult.rowsWithDur}
      <!-- Example 1: Hourly average day with zones as threshold array -->
      <TimeSeriesChart
        timeSeriesData={fileData.aggregationResult.rowsWithDur}
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
        timeSeriesData={fileData.aggregationResult.rowsWithDur}
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